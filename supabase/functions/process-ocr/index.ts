
/**
 * OCR Processing Edge Function
 *
 * Supabase Edge Function for server-side image processing.
 * Triggered by:
 * - Direct HTTP invocation
 * - Database webhook on processing_queue insert
 *
 * Features:
 * - Parallel processing of multiple jobs
 * - Automatic retry with exponential backoff
 * - Progress updates via database
 * - Circuit breaker for API failures
 * - SCB route switch: redirect the auto-chain to an SCB endpoint instead of
 *   self-reinvocation (set SCB_ENABLED=true and SCB_ENDPOINT=<url>)
 * - Corpus strengthening before MINTED commit (set SCB_CORPUS_STRENGTHEN=true)
 *
 * SCB environment variables
 * ─────────────────────────
 *   SCB_ENABLED=true           activate SCB routing in the auto-chain
 *   SCB_ENDPOINT=<url>         target URL for SCB batch processing
 *   SCB_CORPUS_STRENGTHEN=true enrich knowledge graph before marking MINTED
 *   SCB_INVERSE_DERIVE=true    (spatial-coordinates) gap-fill via graph topology
 *
 * Deployment:
 * ```bash
 * supabase functions deploy process-ocr
 * ```
 *
 * @version 2.21.0
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenAI } from 'https://esm.sh/@google/genai@1';

// ============================================
// Utility: Timeout wrapper
// ============================================

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

// ============================================
// Types
// ============================================

interface ProcessingJob {
  id: string;
  asset_id: string;
  image_path: string;
  scan_type: string;
  user_id?: string;
  latitude?: number;
  longitude?: number;
  metadata?: Record<string, unknown>;
}

interface ProcessingResult {
  ocrText: string;
  documentTitle: string;
  documentDescription: string;
  entities: string[];
  keywords: string[];
  graphData: {
    nodes: Array<{ id: string; label: string; type: string }>;
    links: Array<{ source: string; target: string; relationship: string }>;
  };
  gisMetadata?: {
    zoneType: string;
    coordinates?: { lat: number; lng: number };
  };
  confidence: number;
}

// ============================================
// Configuration
// ============================================

const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_CONCURRENT_JOBS = 5;
const JOB_TIMEOUT_MS = 120000; // 2 minutes - increased from 60s for complex documents
const GEMINI_TIMEOUT_MS = 90000; // 90 seconds for Gemini API call

// ============================================
// Edge Function Handler
// ============================================

Deno.serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiKey = Deno.env.get('GEMINI_API_KEY')!;

    if (!geminiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const genAI = new GoogleGenAI({ apiKey: geminiKey });

    // Parse request
    const body = await req.json().catch(() => ({}));
    const workerId = `worker_${crypto.randomUUID().slice(0, 8)}`;
    const maxJobs = body.maxJobs ?? MAX_CONCURRENT_JOBS;

    console.log(`[${workerId}] Starting processing batch (max: ${maxJobs})`);

    // Release any stale locks before claiming new jobs
    // This unblocks jobs stuck in PROCESSING state longer than LOCK_TIMEOUT_SECONDS
    try {
      const { data: releasedCount } = await supabase.rpc('release_stale_locks');
      if (releasedCount && releasedCount > 0) {
        console.log(`[${workerId}] Released ${releasedCount} stale locks`);
      }
    } catch (releaseError) {
      console.warn(`[${workerId}] Failed to release stale locks:`, releaseError);
      // Continue anyway - this is not critical
    }

    // Claim jobs from queue
    const jobs: ProcessingJob[] = [];
    let claimError: string | null = null;
    for (let i = 0; i < maxJobs; i++) {
      const { data, error } = await supabase.rpc('claim_processing_job', {
        p_worker_id: workerId,
      });

      if (error) {
        console.error(`[${workerId}] claim_processing_job RPC error:`, error);
        claimError = error.message || 'Unknown RPC error';
        break;
      }
      if (!data?.length) break;
      // Normalize: SQL RETURNS TABLE may use 'job_id' or 'id'
      const row = data[0];
      jobs.push({
        id: row.id || row.job_id,
        asset_id: row.asset_id || row.ASSET_ID,
        image_path: row.image_path || row.IMAGE_PATH,
        scan_type: row.scan_type || row.SCAN_TYPE,
        user_id: row.user_id || row.USER_ID,
        latitude: row.latitude || row.LATITUDE,
        longitude: row.longitude || row.LONGITUDE,
        metadata: row.metadata || row.METADATA,
      });
    }

    if (jobs.length === 0) {
      // Distinguish between "no pending jobs" and "claim failed"
      const reason = claimError
        ? `claim_processing_job failed: ${claimError}`
        : 'No pending jobs in queue';
      console.log(`[${workerId}] ${reason}`);
      return new Response(
        JSON.stringify({ 
          message: reason, 
          workerId, 
          processed: 0, 
          succeeded: 0, 
          failed: 0,
          claimError: claimError || undefined,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${workerId}] Claimed ${jobs.length} jobs`);

    // Process jobs in parallel with timeout protection
    const results = await Promise.allSettled(
      jobs.map(job => withTimeout(
        processJob(supabase, genAI, job, workerId),
        JOB_TIMEOUT_MS,
        `Job ${job.id} timed out after ${JOB_TIMEOUT_MS}ms`
      ))
    );

    // Summarize results
    const summary = {
      workerId,
      processed: jobs.length,
      succeeded: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      jobs: jobs.map((job, i) => ({
        id: job.id,
        assetId: job.asset_id,
        status: results[i].status,
        error: results[i].status === 'rejected' 
          ? (results[i] as PromiseRejectedResult).reason?.message 
          : undefined,
      })),
    };

    console.log(`[${workerId}] Completed: ${summary.succeeded}/${summary.processed}`);

    // ============================================
    // Auto-Chain: Continue processing if more jobs exist
    // This enables offline/background processing without app interaction
    // ============================================
    try {
      const { count: pendingCount, error: pendingErr } = await supabase
        .from('processing_queue')
        .select('*', { count: 'exact', head: true })
        .eq('STATUS', 'PENDING');

      if (pendingErr) {
        console.warn(`[${workerId}] Failed to check pending count:`, pendingErr);
      } else if ((pendingCount ?? 0) > 0) {
        console.log(`[${workerId}] ${pendingCount} jobs remaining. Triggering next batch...`);
        
        // SCB Route Switch
        // ────────────────
        // When SCB_ENABLED=true and SCB_ENDPOINT is set, redirect the next
        // processing batch to the SCB endpoint instead of self-reinvoking
        // the Gemini route.  This is the integration point described in the
        // SCB architecture (process-ocr/index.ts:219-229).
        //
        // The SCB endpoint receives the same JSON payload as the self-invoke
        // plus extra fields (routeMode, scbSession, strengthenCorpus) that
        // enable downstream SCB processors to tune their behaviour.
        //
        // Without SCB env vars the behaviour is identical to the previous
        // self-reinvoke (backwards-compatible).
        const scbEnabled = Deno.env.get('SCB_ENABLED') === 'true';
        const scbEndpoint = Deno.env.get('SCB_ENDPOINT');

        const chainTarget = (scbEnabled && scbEndpoint)
          ? scbEndpoint
          : `${supabaseUrl}/functions/v1/process-ocr`;

        // Correlation ID persists across the full chain for distributed tracing
        const scbSession = crypto.randomUUID().slice(0, 12);
        const routeMode = (scbEnabled && scbEndpoint) ? 'scb' : 'gemini';

        const chainPayload: Record<string, unknown> = {
          maxJobs,
          routeMode,
          scbSession,
          strengthenCorpus: Deno.env.get('SCB_CORPUS_STRENGTHEN') === 'true',
        };

        console.log(`[${workerId}] Chaining to ${routeMode} (session: ${scbSession})`);

        fetch(chainTarget, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'X-SCB-Session': scbSession,
          },
          body: JSON.stringify(chainPayload),
        }).catch((chainErr) => console.error(`[${workerId}] Chain invoke failed:`, chainErr));
      } else {
        console.log(`[${workerId}] Queue empty. Processing complete.`);
      }
    } catch (chainError) {
      console.error(`[${workerId}] Chain check failed:`, chainError);
      // Don't fail the response - chaining is best-effort
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Edge function error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// ============================================
// Job Processing
// ============================================

async function processJob(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  genAI: GoogleGenAI,
  job: ProcessingJob,
  workerId: string
): Promise<void> {
  const startTime = Date.now();

  try {
    // Update progress: Fetching image
    await updateProgress(supabase, job.id, 20, 'FETCHING_IMAGE');

    // Determine which bucket to use based on the image path
    // If path starts with "corpus-images/", use that bucket; otherwise use "processing-uploads"
    let bucket = 'processing-uploads';
    let imagePath = job.image_path;
    
    if (job.image_path.startsWith('corpus-images/')) {
      bucket = 'corpus-images';
      imagePath = job.image_path.replace('corpus-images/', '');
    } else if (job.image_path.includes('corpus-images')) {
      // Handle full URL case
      bucket = 'corpus-images';
      imagePath = job.image_path.split('corpus-images/').pop() || job.image_path;
    }
    
    console.log(`[${workerId}] Fetching from bucket: ${bucket}, path: ${imagePath}`);

    // Fetch image from storage
    const { data: imageData, error: fetchError } = await supabase.storage
      .from(bucket)
      .download(imagePath);

    if (fetchError || !imageData) {
      throw new Error(`Failed to fetch image from ${bucket}/${imagePath}: ${fetchError?.message}`);
    }

    // Update progress: Processing with Gemini
    await updateProgress(supabase, job.id, 40, 'CALLING_GEMINI');

    // Convert to base64 using chunked approach to avoid stack overflow
    const buffer = await imageData.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // Chunked base64 encoding to avoid "Maximum call stack size exceeded"
    let base64 = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      base64 += String.fromCharCode.apply(null, Array.from(chunk));
    }
    base64 = btoa(base64);

    // Call Gemini
    const result = await callGemini(genAI, base64, imageData.type, job);

    // Update progress: Saving results
    await updateProgress(supabase, job.id, 80, 'SAVING_RESULTS');

    // Save to historical_documents_global
    await saveAsset(supabase, job, result);

    // Corpus strengthening: enrich the knowledge graph and record fixity
    // before the job is committed as MINTED.  Enabled via the environment
    // variable SCB_CORPUS_STRENGTHEN=true.  Failures are non-fatal — the job
    // will complete regardless.
    let corpusStrengthened = false;
    let strengtheningMeta: Record<string, unknown> | null = null;

    if (Deno.env.get('SCB_CORPUS_STRENGTHEN') === 'true') {
      await updateProgress(supabase, job.id, 85, 'STRENGTHENING_CORPUS');
      try {
        strengtheningMeta = await strengthenCorpus(supabase, job, result, workerId);
        corpusStrengthened = true;
      } catch (strengthenErr) {
        console.warn(`[${workerId}] Corpus strengthening failed (non-fatal):`, strengthenErr);
      }
    }

    // Mark job complete WITH result data serialized as JSON
    const resultDataJson = {
      ocrText: result.ocrText,
      documentTitle: result.documentTitle,
      documentDescription: result.documentDescription,
      entities: result.entities,
      keywords: result.keywords,
      graphData: result.graphData,
      gisMetadata: result.gisMetadata,
      confidence: result.confidence,
      processingTime: Date.now() - startTime,
      completedAt: new Date().toISOString(),
      corpusStrengthened,
      ...(strengtheningMeta ? { strengtheningMeta } : {}),
    };

    await supabase.rpc('complete_processing_job', {
      p_job_id: job.id,
      p_result_data: resultDataJson,
    });

    const processingTime = Date.now() - startTime;
    console.log(`[${workerId}] Job ${job.id} completed in ${processingTime}ms`);
  } catch (error: unknown) {
    console.error(`[${workerId}] Job ${job.id} failed:`, error);
    const errMsg = error instanceof Error ? error.message : String(error);
    const errCode = (error as Record<string, unknown>)?.code ?? 'PROCESSING_ERROR';

    await supabase.rpc('fail_processing_job', {
      p_job_id: job.id,
      p_error_message: errMsg,
      p_error_code: errCode,
    });

    throw error;
  }
}

async function updateProgress(
  supabase: any,
  jobId: string,
  progress: number,
  stage: string
): Promise<void> {
  await supabase.rpc('update_job_progress', {
    p_job_id: jobId,
    p_progress: progress,
    p_stage: stage,
  });
}

// ============================================
// Gemini Integration
// ============================================

async function callGemini(
  genAI: GoogleGenAI,
  imageBase64: string,
  mimeType: string,
  job: ProcessingJob
): Promise<ProcessingResult> {
  const locationContext = job.latitude && job.longitude
    ? `Image was captured at Latitude: ${job.latitude}, Longitude: ${job.longitude}.`
    : 'No geolocation data available.';

  const prompt = `
    You are an expert OCR and knowledge graph specialist.
    Analyze this ${job.scan_type} image and extract:
    
    1. **OCR Text**: Complete text transcription
    2. **Document Title**: Descriptive title
    3. **Document Description**: 2-3 sentence summary
    4. **Entities**: Names, places, dates, organizations
    5. **Keywords**: Key topics and themes
    6. **Graph Data**: Entity relationships as nodes/links
    7. **Confidence Score**: 0.0-1.0 rating of extraction quality
    
    ${locationContext}
    
    Return JSON matching this schema:
    {
      "ocrText": "string",
      "documentTitle": "string",
      "documentDescription": "string",
      "entities": ["string"],
      "keywords": ["string"],
      "graphData": {
        "nodes": [{"id": "string", "label": "string", "type": "DOCUMENT|PERSON|PLACE|DATE|CONCEPT"}],
        "links": [{"source": "string", "target": "string", "relationship": "string"}]
      },
      "gisMetadata": {
        "zoneType": "string",
        "environmentalContext": "string"
      },
      "confidence": 0.0-1.0
    }
  `;

  // Wrap Gemini call with timeout to prevent indefinite hangs
  const result = await withTimeout(
    genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: imageBase64,
              },
            },
          ],
        },
      ],
    }),
    GEMINI_TIMEOUT_MS,
    'Gemini API call timed out'
  );

  const text = result.text ?? '';

  // Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse Gemini response as JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate required fields
  if (!parsed.ocrText || !parsed.documentTitle) {
    throw new Error('Invalid Gemini response: missing required fields');
  }

  return {
    ocrText: parsed.ocrText || '',
    documentTitle: parsed.documentTitle || 'Untitled',
    documentDescription: parsed.documentDescription || '',
    entities: parsed.entities || [],
    keywords: parsed.keywords || [],
    graphData: parsed.graphData || { nodes: [], links: [] },
    gisMetadata: parsed.gisMetadata,
    confidence: parsed.confidence || 0.7,
  };
}

// ============================================
// Asset Storage
// ============================================

async function saveAsset(
  supabase: any,
  job: ProcessingJob,
  result: ProcessingResult
): Promise<void> {
  // Get public URL for image
  const { data: urlData } = supabase.storage
    .from('processing-uploads')
    .getPublicUrl(job.image_path);

  const assetRecord = {
    ASSET_ID: job.asset_id,
    USER_ID: job.user_id || null,
    ORIGINAL_IMAGE_URL: urlData?.publicUrl || '',
    RAW_OCR_TRANSCRIPTION: result.ocrText,
    DOCUMENT_TITLE: result.documentTitle,
    DOCUMENT_DESCRIPTION: result.documentDescription,
    ENTITIES_EXTRACTED: result.entities,
    KEYWORDS_TAGS: result.keywords,
    NLP_NODE_CATEGORIZATION: result.graphData.nodes[0]?.type || 'DOCUMENT',
    NODE_COUNT: result.graphData.nodes.length,
    // #6: TOKEN_COUNT — approximate from word count (1 token ≈ 0.75 words)
    TOKEN_COUNT: Math.round((result.ocrText.trim().split(/\s+/).filter((w: string) => w.length > 0).length) / 0.75),
    CONFIDENCE_SCORE: result.confidence,
    PROCESSING_STATUS: 'MINTED',
    SCAN_TYPE: job.scan_type,
    LOCAL_GIS_ZONE: result.gisMetadata?.zoneType || 'UNKNOWN',
    LOCAL_TIMESTAMP: new Date().toISOString(),
    CREATED_AT: new Date().toISOString(),
    // Store graph data in the correct JSONB column
    STRUCTURED_KNOWLEDGE_GRAPH: {
      nodes: result.graphData.nodes,
      links: result.graphData.links,
      generatedAt: new Date().toISOString(),
    },
    // #7: STRUCTURED_* JSONB fields — set based on what was successfully extracted.
    // These gate the "Fully Structured" count in Curator Mode.
    STRUCTURED_CONTENT: result.ocrText.trim().length > 0 ? {
      detected: true,
      wordCount: result.ocrText.trim().split(/\s+/).filter((w: string) => w.length > 0).length,
      paragraphCount: result.ocrText.split(/\n{2,}/).filter((p: string) => p.length > 0).length,
    } : null,
    STRUCTURED_TEMPORAL: result.graphData.nodes.some((n: any) => n.type === 'DATE' || n.type === 'TIME') ? {
      detected: true,
      temporalEntities: result.entities.filter((e: string) =>
        /\b(19|20)\d{2}\b|\bjanuary|february|march|april|may|june|july|august|september|october|november|december\b/i.test(e)
      ),
    } : null,
    STRUCTURED_SPATIAL: (result.gisMetadata?.zoneType && result.gisMetadata.zoneType !== 'UNKNOWN') ? {
      detected: true,
      zone: result.gisMetadata.zoneType,
      coordinates: result.gisMetadata.coordinates || null,
      deviceLat: job.latitude || null,
      deviceLng: job.longitude || null,
    } : null,
    STRUCTURED_PROVENANCE: {
      recorded: true,
      capturedAt: new Date().toISOString(),
      scanType: job.scan_type,
      sourceAssetId: job.asset_id,
      processingVersion: '1.0',
    },
    STRUCTURED_DISCOVERY: result.entities.length > 0 || result.keywords.length > 0 ? {
      recorded: true,
      entityCount: result.entities.length,
      keywordCount: result.keywords.length,
      nodeCount: result.graphData.nodes.length,
      linkCount: result.graphData.links.length,
    } : null,
  };

  // Check if asset already exists
  const { data: existing } = await supabase
    .from('historical_documents_global')
    .select('ID')
    .eq('ASSET_ID', job.asset_id)
    .single();

  if (existing) {
    // Update existing record
    const { error } = await supabase
      .from('historical_documents_global')
      .update(assetRecord)
      .eq('ASSET_ID', job.asset_id);

    if (error) throw error;
  } else {
    // Insert new record
    const { error } = await supabase
      .from('historical_documents_global')
      .insert(assetRecord);

    if (error) throw error;
  }
}

// ============================================
// SCB: Corpus Strengthening
// ============================================

/**
 * Enrich the knowledge graph and persist the fixity checksum before an asset
 * is committed as MINTED.  Called when `SCB_CORPUS_STRENGTHEN=true`.
 *
 * Steps
 * ─────
 *   1. Compute SHA-256 fixity checksum of OCR text + document title
 *   2. Persist the checksum to `historical_documents_global.FIXITY_CHECKSUM`
 *   3. Resolve graph_node IDs for the entities extracted in this job
 *   4. Upsert `ENTITY_CO_OCCURS` edges for every entity pair (document-scoped
 *      co-occurrence), strengthening knowledge-graph density before release
 *
 * All individual steps are wrapped in try/catch so a partial failure (e.g.
 * FIXITY_CHECKSUM column not yet migrated) never fails the parent job.
 *
 * @param supabase   Supabase client with service-role key
 * @param job        The processing job being completed
 * @param result     Gemini extraction result for this job
 * @param workerId   Worker identifier for log correlation
 */
async function strengthenCorpus(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  job: ProcessingJob,
  result: ProcessingResult,
  workerId: string
): Promise<Record<string, unknown>> {
  // 1. Compute fixity checksum (SHA-256 of title + OCR text)
  const payload = `${result.documentTitle}\n${result.ocrText}`;
  const encoded = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const fixityChecksum = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // 2. Persist fixity checksum back to the document record
  try {
    await supabase
      .from('historical_documents_global')
      .update({ FIXITY_CHECKSUM: fixityChecksum })
      .eq('ASSET_ID', job.asset_id);
  } catch {
    console.warn(`[${workerId}] FIXITY_CHECKSUM update skipped (column may not exist yet)`);
  }

  // 3. Resolve graph_node IDs for extracted entities (cap at 20 to avoid N² explosion)
  const entityNodeIds: string[] = [];
  const entityList = result.entities.slice(0, 20);

  for (const entityLabel of entityList) {
    if (!entityLabel?.trim()) continue;
    const { data: node } = await supabase
      .from('graph_nodes')
      .select('ID')
      .eq('LABEL', entityLabel.trim())
      .maybeSingle();
    if (node?.ID) entityNodeIds.push(node.ID as string);
  }

  // 4. Upsert ENTITY_CO_OCCURS edges for every entity pair
  let edgesAdded = 0;
  for (let i = 0; i < entityNodeIds.length; i++) {
    for (let j = i + 1; j < entityNodeIds.length; j++) {
      const { error } = await supabase
        .from('graph_edges')
        .upsert(
          {
            FROM_NODE_ID: entityNodeIds[i],
            TO_NODE_ID: entityNodeIds[j],
            RELATIONSHIP: 'ENTITY_CO_OCCURS',
            CONFIDENCE: result.confidence,
            WEIGHT: 0.5,
            ASSET_IDS: [job.asset_id],
          },
          { onConflict: 'FROM_NODE_ID,TO_NODE_ID,RELATIONSHIP', ignoreDuplicates: true }
        );
      if (!error) edgesAdded++;
    }
  }

  const strengthenedAt = new Date().toISOString();
  console.log(
    `[${workerId}] Corpus strengthened: ` +
    `fixity=${fixityChecksum.slice(0, 8)}, ` +
    `entities=${entityNodeIds.length}, edges=${edgesAdded}`
  );

  return {
    fixityChecksum,
    entitiesLinked: entityNodeIds.length,
    edgesAdded,
    strengthenedAt,
  };
}
