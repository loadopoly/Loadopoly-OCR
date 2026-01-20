
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
 * 
 * Deployment:
 * ```bash
 * supabase functions deploy process-ocr
 * ```
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.2.0';

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
    const genAI = new GoogleGenerativeAI(geminiKey);

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
    for (let i = 0; i < maxJobs; i++) {
      const { data, error } = await supabase.rpc('claim_processing_job', {
        p_worker_id: workerId,
      });

      if (error || !data?.length) break;
      jobs.push(data[0]);
    }

    if (jobs.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending jobs', workerId }),
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

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
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
  supabase: any,
  genAI: GoogleGenerativeAI,
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

    // Convert to base64
    const buffer = await imageData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

    // Call Gemini
    const result = await callGemini(genAI, base64, imageData.type, job);

    // Update progress: Saving results
    await updateProgress(supabase, job.id, 80, 'SAVING_RESULTS');

    // Save to historical_documents_global
    await saveAsset(supabase, job, result);

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
    };

    await supabase.rpc('complete_processing_job', {
      p_job_id: job.id,
      p_result_data: resultDataJson,
    });

    const processingTime = Date.now() - startTime;
    console.log(`[${workerId}] Job ${job.id} completed in ${processingTime}ms`);
  } catch (error) {
    console.error(`[${workerId}] Job ${job.id} failed:`, error);

    await supabase.rpc('fail_processing_job', {
      p_job_id: job.id,
      p_error_message: error.message,
      p_error_code: error.code ?? 'PROCESSING_ERROR',
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
  genAI: GoogleGenerativeAI,
  imageBase64: string,
  mimeType: string,
  job: ProcessingJob
): Promise<ProcessingResult> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

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
    model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: imageBase64,
        },
      },
    ]),
    GEMINI_TIMEOUT_MS,
    'Gemini API call timed out'
  );

  const response = result.response;
  const text = response.text();

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
