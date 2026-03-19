/**
 * Download Asset Edge Function
 * 
 * Generates signed URLs for downloading assets from Supabase Storage.
 * Supports both single file downloads and batch downloads.
 * 
 * Endpoints:
 * - POST /download-asset?assetId=xxx - Generate signed URL for single asset
 * - POST /download-asset/batch - Generate signed URLs for multiple assets
 * 
 * Security:
 * - Requires authentication
 * - Validates user has access to requested assets
 * - Signed URLs expire after configurable time (default: 1 hour)
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour
const STORAGE_BUCKETS = ['processing-uploads', 'corpus-images'];

interface DownloadRequest {
  assetId?: string;
  assetIds?: string[];
  expiresIn?: number;
}

interface DownloadResponse {
  success: boolean;
  signedUrl?: string;
  signedUrls?: Record<string, string>;
  expiresAt?: string;
  error?: string;
}

Deno.serve(async (req: Request) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    // Get Supabase client with user context
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Extract JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: DownloadRequest = await req.json();
    const expiresIn = body.expiresIn || SIGNED_URL_EXPIRY_SECONDS;

    // Handle batch download
    if (body.assetIds && body.assetIds.length > 0) {
      const signedUrls: Record<string, string> = {};
      const errors: string[] = [];

      const batchResults = await Promise.allSettled(
        body.assetIds.map(assetId => getSignedUrlForAsset(supabase, user.id, assetId, expiresIn))
      );
      for (let i = 0; i < body.assetIds.length; i++) {
        const assetId = body.assetIds[i];
        const result = batchResults[i];
        if (result.status === 'fulfilled' && result.value) {
          signedUrls[assetId] = result.value;
        } else if (result.status === 'rejected') {
          const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
          errors.push(`Failed to get URL for ${assetId}: ${reason}`);
        } else {
          errors.push(`Asset ${assetId} not found`);
        }
      }

      const response: DownloadResponse = {
        success: Object.keys(signedUrls).length > 0,
        signedUrls,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        error: errors.length > 0 ? errors.join('; ') : undefined,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Handle single download
    if (body.assetId) {
      const signedUrl = await getSignedUrlForAsset(supabase, user.id, body.assetId, expiresIn);

      if (!signedUrl) {
        return new Response(
          JSON.stringify({ success: false, error: 'Asset not found or access denied' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const response: DownloadResponse = {
        success: true,
        signedUrl,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Missing assetId or assetIds' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Download asset error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Get signed URL for an asset
 * Checks both storage buckets and verifies user access
 */
async function getSignedUrlForAsset(
  supabase: SupabaseClient,
  userId: string,
  assetId: string,
  expiresIn: number
): Promise<string | null> {
  // First, verify the user has access to this asset
  const { data: asset, error: assetError } = await supabase
    .from('historical_documents_global')
    .select('ASSET_ID, ORIGINAL_IMAGE_URL, USER_ID')
    .eq('ASSET_ID', assetId)
    .single();

  if (assetError || !asset) {
    console.warn(`Asset ${assetId} not found in database`);
    return null;
  }

  // Check if user owns the asset or it's a public asset
  if (asset.USER_ID && asset.USER_ID !== userId) {
    console.warn(`User ${userId} does not have access to asset ${assetId}`);
    return null;
  }

  // Try to extract the storage path from the image URL
  let storagePath: string | null = null;

  if (asset.ORIGINAL_IMAGE_URL) {
    // Parse the storage path from the URL
    // Format: https://xxx.supabase.co/storage/v1/object/public/bucket/path
    // or: https://xxx.supabase.co/storage/v1/object/sign/bucket/path
    const match = asset.ORIGINAL_IMAGE_URL.match(/\/storage\/v1\/object\/[^/]+\/([^/]+)\/(.+)/);
    if (match) {
      const bucket = match[1];
      const path = match[2];
      storagePath = `${bucket}/${path}`;
    }
  }

  // If no storage path found, try default locations
  if (!storagePath) {
    // Try common patterns
    const patterns = [
      `processing-uploads/${userId}/${assetId}`,
      `corpus-images/${userId}/${assetId}`,
      `processing-uploads/${assetId}`,
      `corpus-images/${assetId}`,
    ];

    for (const pattern of patterns) {
      const [bucket, ...pathParts] = pattern.split('/');
      const path = pathParts.join('/');

      try {
        const { data: files } = await supabase.storage
          .from(bucket)
          .list(pathParts.slice(0, -1).join('/'), {
            search: pathParts[pathParts.length - 1],
          });

        if (files && files.length > 0) {
          storagePath = `${bucket}/${path}`;
          break;
        }
      } catch (error) {
        // Continue to next pattern
        continue;
      }
    }
  }

  if (!storagePath) {
    console.warn(`No storage path found for asset ${assetId}`);
    return null;
  }

  // Generate signed URL
  const [bucket, ...pathParts] = storagePath.split('/');
  const path = pathParts.join('/');

  const { data: signedData, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (signError || !signedData) {
    console.error(`Failed to create signed URL for ${storagePath}:`, signError);
    return null;
  }

  return signedData.signedUrl;
}
