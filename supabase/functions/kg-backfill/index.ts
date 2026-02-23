/**
 * Knowledge Graph Backfill Edge Function
 * 
 * Retroactively processes existing assets to extract named entities and
 * populate graph_nodes + graph_edges + asset_graph_nodes.
 * 
 * Design:
 *   - Processes assets in batches of 50 (default)
 *   - Only processes assets where GRAPH_PROCESSED = false in graph_nodes,
 *     or assets that have no entry in asset_graph_nodes at all
 *   - Uses Gemini Flash for efficient entity extraction (cheap + fast)
 *   - Idempotent: safe to run multiple times (upserts, not inserts)
 *   - Intended to be scheduled via pg_cron or triggered manually
 * 
 * Trigger manually:
 *   POST /functions/v1/kg-backfill
 *   Body: { "batchSize": 50, "onlyUnprocessed": true }
 * 
 * Deployment:
 * ```bash
 * supabase functions deploy kg-backfill
 * ```
 * 
 * pg_cron (run in Supabase SQL Editor to schedule hourly):
 * ```sql
 * SELECT cron.schedule(
 *   'kg-backfill-hourly',
 *   '0 * * * *',
 *   $$SELECT net.http_post(
 *     url := current_setting('app.supabase_url') || '/functions/v1/kg-backfill',
 *     headers := jsonb_build_object(
 *       'Content-Type', 'application/json',
 *       'Authorization', 'Bearer ' || current_setting('app.service_role_key')
 *     ),
 *     body := '{"batchSize":50,"onlyUnprocessed":true}'::jsonb
 *   )$$
 * );
 * ```
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenAI } from 'https://esm.sh/@google/genai@1';

// ============================================
// Types
// ============================================

interface BackfillRequest {
  batchSize?: number;
  onlyUnprocessed?: boolean;
  // Optional: limit to a specific user's assets
  userId?: string;
}

interface ExtractedEntity {
  label: string;
  type: 'location' | 'person' | 'organization' | 'concept' | 'entity';
  aliases?: string[];
  contextSnippet?: string;
  confidence: number;
}

interface ExtractedRelationship {
  fromLabel: string;
  toLabel: string;
  relationship: string;
  confidence: number;
}

interface ExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
}

// ============================================
// Gemini entity extraction
// ============================================

const EXTRACTION_PROMPT = `
You are an entity extraction engine for a historical document corpus.
Extract ALL named entities and their relationships from the following text.

Return a JSON object with this exact structure:
{
  "entities": [
    {
      "label": "exact entity name",
      "type": "location|person|organization|concept|entity",
      "aliases": ["alternate spellings or abbreviations"],
      "contextSnippet": "short quote from text that establishes this entity",
      "confidence": 0.0-1.0
    }
  ],
  "relationships": [
    {
      "fromLabel": "entity A label",
      "toLabel": "entity B label",
      "relationship": "mentions|located_at|part_of|created_by|related_to|refers_to",
      "confidence": 0.0-1.0
    }
  ]
}

Rules:
- Only include entities actually present in the text
- For locations, use the most specific form (e.g. "Hoover Dam" not just "dam")
- relationship must be one of: mentions, located_at, part_of, created_by, related_to, refers_to
- Confidence 0.9+ = explicitly named, 0.7+ = strongly implied, 0.5+ = inferred
- Return ONLY the JSON object, no markdown, no explanation

TEXT:
`;

async function extractEntities(
  genAI: GoogleGenAI,
  text: string
): Promise<ExtractionResult> {
  const prompt = EXTRACTION_PROMPT + text.slice(0, 8000); // limit to avoid token overflow
  
  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    const raw = (response.text ?? '').trim();
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(cleaned) as ExtractionResult;
  } catch {
    return { entities: [], relationships: [] };
  }
}

// ============================================
// Upsert helpers
// ============================================

async function upsertGraphNode(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  entity: ExtractedEntity,
  userId: string
): Promise<string | null> {
  // Try to find existing node by exact label match
  const { data: existing } = await supabase
    .from('graph_nodes')
    .select('ID')
    .eq('LABEL', entity.label)
    .eq('NODE_TYPE', entity.type)
    .maybeSingle();

  if (existing) return existing.ID;

  const { data: inserted, error } = await supabase
    .from('graph_nodes')
    .insert({
      LABEL: entity.label,
      NODE_TYPE: entity.type,
      ALIASES: entity.aliases ?? [],
      USER_ID: userId,
      GRAPH_PROCESSED: true,
    })
    .select('ID')
    .single();

  if (error) {
    // Handle race condition — another concurrent job inserted the same node
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('graph_nodes')
        .select('ID')
        .eq('LABEL', entity.label)
        .eq('NODE_TYPE', entity.type)
        .maybeSingle();
      return retry?.ID ?? null;
    }
    console.error('Node upsert error:', error.message);
    return null;
  }

  return inserted?.ID ?? null;
}

async function upsertGraphEdge(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  fromNodeId: string,
  toNodeId: string,
  relationship: string,
  confidence: number,
  assetId: string
): Promise<void> {
  const { error } = await supabase
    .from('graph_edges')
    .upsert(
      {
        FROM_NODE_ID: fromNodeId,
        TO_NODE_ID: toNodeId,
        RELATIONSHIP: relationship,
        CONFIDENCE: confidence,
        WEIGHT: 1.0,
        ASSET_IDS: [assetId],
      },
      {
        onConflict: 'FROM_NODE_ID,TO_NODE_ID,RELATIONSHIP',
        ignoreDuplicates: false,
      }
    );

  if (error && error.code !== '23505') {
    console.error('Edge upsert error:', error.message);
  }
}

// ============================================
// Main handler
// ============================================

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY')!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

  let body: BackfillRequest = {};
  try {
    if (req.headers.get('Content-Type')?.includes('application/json')) {
      body = await req.json();
    }
  } catch { /* empty body is fine */ }

  const {
    batchSize = 50,
    onlyUnprocessed = true,
    userId,
  } = body;

  // ---- Fetch unprocessed assets ----
  // "Unprocessed" = assets that have no rows in asset_graph_nodes
  // We find them via a NOT EXISTS subquery on asset_graph_nodes.
  // Assets store their processed OCR results in processing_queue.result_data
  // We query processing_queue for assets with STATUS='COMPLETED'.

  let query = supabase
    .from('processing_queue')
    .select('id, asset_id, user_id, result_data')
    .eq('STATUS', 'COMPLETED')
    .not('result_data', 'is', null)
    .limit(batchSize);

  if (userId) {
    query = query.eq('USER_ID', userId);
  }

  // Filter to only assets not yet in asset_graph_nodes
  // (Supabase JS v2 doesn't support NOT EXISTS natively; we pull IDs and filter)
  const { data: jobs, error: fetchError } = await query;

  if (fetchError) {
    return new Response(
      JSON.stringify({ error: fetchError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!jobs || jobs.length === 0) {
    return new Response(
      JSON.stringify({ success: true, processed: 0, message: 'No assets pending backfill' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Filter to only those with no existing asset_graph_nodes entries
  if (onlyUnprocessed) {
    const assetIds = jobs.map((j: { asset_id: string }) => j.asset_id).filter(Boolean);
    const { data: existing } = await supabase
      .from('asset_graph_nodes')
      .select('ASSET_ID')
      .in('ASSET_ID', assetIds);

    const processedSet = new Set((existing ?? []).map((r: { ASSET_ID: string }) => r.ASSET_ID));
    const unprocessedJobs = jobs.filter((j: { asset_id: string }) => !processedSet.has(j.asset_id));

    if (unprocessedJobs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'All assets already backfilled' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Reassign jobs to only unprocessed
    jobs.splice(0, jobs.length, ...unprocessedJobs);
  }

  // ---- Process each asset (parallelised) ----
  const processAllJobs = async (): Promise<{ processed: number; skipped: number; errors: number }> => {
    const jobResults = await Promise.allSettled(
      jobs.map(async (job): Promise<boolean> => {
        const resultData = job.result_data as Record<string, unknown> | null;
        if (!resultData) return false;

        // Gather text from the OCR result stored by process-ocr function
        const rawText = [
          resultData['ocrText'],
          resultData['documentTitle'],
          resultData['documentDescription'],
          resultData['entities'] ? JSON.stringify(resultData['entities']) : null,
        ]
          .filter(Boolean)
          .join('\n\n');

        if (!rawText.trim()) return false;

        const ownerUserId = job.user_id ?? userId ?? 'system';

        // Extract entities with Gemini
        const { entities, relationships } = await extractEntities(genAI, rawText);

        // Build a map of label → nodeId for this asset
        const labelToNodeId = new Map<string, string>();

        for (const entity of entities) {
          if (entity.confidence < 0.5) continue;
          const nodeId = await upsertGraphNode(supabase, entity, ownerUserId);
          if (nodeId) {
            labelToNodeId.set(entity.label, nodeId);

            // Link asset → node
            await supabase
              .from('asset_graph_nodes')
              .upsert(
                {
                  ASSET_ID: job.asset_id,
                  NODE_ID: nodeId,
                  CONFIDENCE: entity.confidence,
                  CONTEXT_SNIPPET: entity.contextSnippet ?? null,
                },
                { onConflict: 'ASSET_ID,NODE_ID', ignoreDuplicates: true }
              );
          }
        }

        // Create edges
        for (const rel of relationships) {
          const fromId = labelToNodeId.get(rel.fromLabel);
          const toId = labelToNodeId.get(rel.toLabel);
          if (!fromId || !toId || fromId === toId) continue;
          await upsertGraphEdge(
            supabase,
            fromId,
            toId,
            rel.relationship,
            rel.confidence,
            job.asset_id
          );
        }
        return true;
      })
    );

    return {
      processed: jobResults.filter(r => r.status === 'fulfilled' && r.value === true).length,
      skipped: jobResults.filter(r => r.status === 'fulfilled' && r.value === false).length,
      errors: jobResults.filter(r => r.status === 'rejected').length,
    };
  };

  // Use EdgeRuntime.waitUntil for instantaneous response — processing continues
  // in the background after the HTTP response is returned.
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(processAllJobs());
    return new Response(
      JSON.stringify({ success: true, queued: jobs.length, message: 'Processing started in background' }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  // Fallback: synchronous processing for local/non-edge environments
  const { processed, skipped, errors } = await processAllJobs();

  return new Response(
    JSON.stringify({
      success: true,
      processed,
      skipped,
      errors,
      total: jobs.length,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
});
