/**
 * Download Service
 * 
 * Handles downloading assets from Supabase Storage with:
 * - Signed URL generation
 * - Progress tracking
 * - Batch downloads
 * - ZIP archive creation for multiple files
 * - Queue management
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { logger } from '../lib/logger';
import { DigitalAsset } from '../types';

// ============================================
// Types
// ============================================

export interface DownloadOptions {
  /** Custom filename for the download */
  filename?: string;
  /** Progress callback */
  onProgress?: (loaded: number, total: number) => void;
  /** Completion callback */
  onComplete?: () => void;
  /** Error callback */
  onError?: (error: Error) => void;
}

export interface BatchDownloadOptions {
  /** Format for batch download */
  format?: 'zip' | 'individual';
  /** ZIP filename */
  zipFilename?: string;
  /** Progress callback for batch */
  onProgress?: (current: number, total: number, currentAssetId: string) => void;
  /** Completion callback */
  onComplete?: (downloadedCount: number) => void;
  /** Error callback */
  onError?: (errors: Array<{ assetId: string; error: string }>) => void;
}

export interface DownloadQueueItem {
  assetId: string;
  filename: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
}

type DownloadQueueListener = (items: DownloadQueueItem[]) => void;

// ============================================
// Download Service Class
// ============================================

class DownloadService {
  private downloadQueue: Map<string, DownloadQueueItem> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private queueListeners: Set<DownloadQueueListener> = new Set();
  private edgeFunctionUrl: string = '';
  private readonly storageBuckets: string[] = ['corpus-images', 'processing-uploads'];
  private readonly storageBucket: string = 'corpus-images';

  constructor() {
    if (isSupabaseConfigured() && supabase) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      this.edgeFunctionUrl = `${supabaseUrl}/functions/v1/download-asset`;
    }
  }

  private notifyQueueListeners(): void {
    const snapshot = Array.from(this.downloadQueue.values());
    this.queueListeners.forEach(listener => listener(snapshot));
  }

  subscribeToQueue(listener: DownloadQueueListener): () => void {
    this.queueListeners.add(listener);
    listener(this.getQueueStatus());

    return () => {
      this.queueListeners.delete(listener);
    };
  }

  /**
   * Download a single asset
   */
  async downloadAsset(
    asset: DigitalAsset,
    options?: DownloadOptions
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) {
      logger.error('Cannot download: Supabase not configured');
      options?.onError?.(new Error('Supabase not configured'));
      return false;
    }

    try {
      // Add to queue
      const queueItem: DownloadQueueItem = {
        assetId: asset.id,
        filename: options?.filename || this.getDefaultFilename(asset),
        status: 'downloading',
        progress: 0,
      };
      this.downloadQueue.set(asset.id, queueItem);
      this.notifyQueueListeners();

      const abortController = new AbortController();
      this.abortControllers.set(asset.id, abortController);

      // Get signed URL
      const signedUrl = await this.getSignedUrl(asset.id);
      if (!signedUrl) {
        throw new Error('Failed to generate download URL');
      }

      // Download the file
      const blob = await this.downloadWithProgress(
        signedUrl,
        (loaded, total) => {
          queueItem.progress = total > 0 ? (loaded / total) * 100 : 0;
          this.downloadQueue.set(asset.id, queueItem);
          this.notifyQueueListeners();
          options?.onProgress?.(loaded, total);
        },
        abortController.signal
      );

      // Trigger browser download
      this.triggerBrowserDownload(blob, queueItem.filename);

      // Update queue
      queueItem.status = 'completed';
      queueItem.progress = 100;
      this.downloadQueue.set(asset.id, queueItem);
      this.abortControllers.delete(asset.id);
      this.notifyQueueListeners();

      options?.onComplete?.();
      logger.info(`Successfully downloaded asset ${asset.id}`);
      return true;
    } catch (error) {
      logger.error(`Failed to download asset ${asset.id}`, error);
      
      const queueItem = this.downloadQueue.get(asset.id);
      if (queueItem) {
        const isCancelled = error instanceof Error && error.name === 'AbortError';
        queueItem.status = isCancelled ? 'cancelled' : 'failed';
        queueItem.error = isCancelled ? 'Cancelled by user' : (error instanceof Error ? error.message : 'Unknown error');
        this.downloadQueue.set(asset.id, queueItem);
        this.notifyQueueListeners();
      }

      this.abortControllers.delete(asset.id);

      options?.onError?.(error instanceof Error ? error : new Error('Download failed'));
      return false;
    }
  }

  /**
   * Download multiple assets
   */
  async downloadBatch(
    assets: DigitalAsset[],
    options?: BatchDownloadOptions
  ): Promise<number> {
    if (!isSupabaseConfigured()) {
      logger.error('Cannot download batch: Supabase not configured');
      options?.onError?.([{ assetId: 'all', error: 'Supabase not configured' }]);
      return 0;
    }

    const format = options?.format || 'individual';
    let successCount = 0;
    const errors: Array<{ assetId: string; error: string }> = [];

    if (format === 'individual') {
      // Download each asset individually
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        options?.onProgress?.(i + 1, assets.length, asset.id);

        const success = await this.downloadAsset(asset);
        if (success) {
          successCount++;
        } else {
          errors.push({
            assetId: asset.id,
            error: 'Download failed',
          });
        }
      }
    } else if (format === 'zip') {
      // Download all as ZIP
      try {
        successCount = await this.downloadAsZip(assets, options);
      } catch (error) {
        errors.push({
          assetId: 'batch',
          error: error instanceof Error ? error.message : 'ZIP creation failed',
        });
      }
    }

    if (errors.length > 0) {
      options?.onError?.(errors);
    }

    options?.onComplete?.(successCount);
    return successCount;
  }

  /**
   * Download multiple assets as a ZIP file
   */
  private async downloadAsZip(
    assets: DigitalAsset[],
    options?: BatchDownloadOptions
  ): Promise<number> {
    // Get signed URLs for all assets
    const assetIds = assets.map(a => a.id);
    const signedUrls = await this.getSignedUrls(assetIds);

    if (Object.keys(signedUrls).length === 0) {
      throw new Error('No signed URLs generated');
    }

    // Download all files
    const files: Array<{ name: string; blob: Blob }> = [];
    let downloadedCount = 0;

    for (const asset of assets) {
      const url = signedUrls[asset.id];
      if (!url) continue;

      options?.onProgress?.(downloadedCount + 1, assets.length, asset.id);

      try {
        const blob = await this.downloadWithProgress(url);
        files.push({
          name: this.getDefaultFilename(asset),
          blob,
        });
        downloadedCount++;
      } catch (error) {
        logger.warn(`Failed to download ${asset.id} for ZIP`, { error });
      }
    }

    if (files.length === 0) {
      throw new Error('No files downloaded');
    }

    // Create ZIP (using JSZip if available, otherwise download individually)
    // Check if JSZip is loaded globally (via CDN or module)
    const JSZip = (window as any).JSZip;
    
    if (typeof JSZip !== 'undefined') {
      const zip = new JSZip();

      files.forEach(file => {
        zip.file(file.name, file.blob);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFilename = options?.zipFilename || `geograph-assets-${Date.now()}.zip`;
      this.triggerBrowserDownload(zipBlob, zipFilename);
    } else {
      // Fallback: download individually
      logger.warn('JSZip not available, downloading files individually');
      files.forEach(file => {
        this.triggerBrowserDownload(file.blob, file.name);
      });
    }

    return files.length;
  }

  /**
   * Get signed URL for a single asset
   */
  private async getSignedUrl(assetId: string): Promise<string | null> {
    if (!supabase) return null;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      if (this.edgeFunctionUrl) {
        try {
          const response = await fetch(this.edgeFunctionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ assetId }),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();
          if (!result.success || !result.signedUrl) {
            throw new Error(result.error || 'Failed to generate signed URL');
          }

          return result.signedUrl;
        } catch (edgeError) {
          logger.warn(`Edge signed URL failed for ${assetId}, trying direct storage fallback`, { edgeError });
        }
      }

      return await this.getDirectSignedUrl(assetId, session.user.id);
    } catch (error) {
      logger.error(`Failed to get signed URL for ${assetId}`, error);
      return null;
    }
  }

  /**
   * Get signed URLs for multiple assets
   */
  private async getSignedUrls(assetIds: string[]): Promise<Record<string, string>> {
    if (!supabase) return {};

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      if (this.edgeFunctionUrl) {
        try {
          const response = await fetch(this.edgeFunctionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ assetIds }),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();
          if (!result.success || !result.signedUrls) {
            throw new Error(result.error || 'Failed to generate signed URLs');
          }

          return result.signedUrls;
        } catch (edgeError) {
          logger.warn('Edge signed URL batch failed, trying direct storage fallback', { edgeError });
        }
      }

      const signedUrls: Record<string, string> = {};
      await Promise.all(assetIds.map(async (assetId) => {
        const signedUrl = await this.getDirectSignedUrl(assetId, session.user.id);
        if (signedUrl) signedUrls[assetId] = signedUrl;
      }));

      return signedUrls;
    } catch (error) {
      logger.error('Failed to get signed URLs', error);
      return {};
    }
  }

  /**
   * Resolve a signed preview URL for a single asset (for UI thumbnails/previews).
   */
  async getPreviewUrl(assetId: string): Promise<string | null> {
    return this.getSignedUrl(assetId);
  }

  /**
   * Resolve signed preview URLs for multiple assets.
   */
  async getPreviewUrls(assetIds: string[]): Promise<Record<string, string>> {
    return this.getSignedUrls(assetIds);
  }

  private async getDirectSignedUrl(assetId: string, userId: string): Promise<string | null> {
    if (!supabase) return null;

    // Try each bucket in order (corpus-images first, then processing-uploads)
    for (const bucket of this.storageBuckets) {
      const storagePath = await this.resolveStoragePath(assetId, userId, bucket);
      if (!storagePath) continue;

      const { data, error } = await (supabase as any).storage
        .from(bucket)
        .createSignedUrl(storagePath, 3600);

      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
      logger.warn(`Direct signed URL failed for ${assetId} in bucket ${bucket}`, { error });
    }

    return null;
  }

  private async resolveStoragePath(assetId: string, userId: string, bucket: string): Promise<string | null> {
    if (!supabase) return null;

    // Strategy 1: Check if image is stored at root level (contributed assets)
    // These use the format: {assetId}_{timestamp}.{ext}
    const { data: rootData } = await (supabase as any).storage
      .from(bucket)
      .list('', { limit: 100, offset: 0, search: assetId });

    if (Array.isArray(rootData)) {
      const match = rootData.find((f: { name: string }) => f.name.startsWith(assetId));
      if (match) return match.name;
    }

    // Strategy 2: Check in user folder
    const folder = `${userId}/${assetId}`;
    const { data, error } = await (supabase as any).storage
      .from(bucket)
      .list(folder, { limit: 10, offset: 0, sortBy: { column: 'name', order: 'asc' } });

    if (!error && Array.isArray(data) && data.length > 0) {
      return `${folder}/${data[0].name}`;
    }

    // Strategy 3: Try direct path candidates
    const fallbackCandidates = [
      `${assetId}.jpg`,
      `${assetId}.jpeg`,
      `${assetId}.png`,
      `${assetId}.webp`,
      `${userId}/${assetId}.jpg`,
      `${userId}/${assetId}.jpeg`,
      `${userId}/${assetId}.png`,
      `${userId}/${assetId}.webp`,
      `${userId}/${assetId}`,
    ];

    for (const candidate of fallbackCandidates) {
      const { data: signedData, error: signedError } = await (supabase as any).storage
        .from(bucket)
        .createSignedUrl(candidate, 60);

      if (!signedError && signedData?.signedUrl) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Download a file with progress tracking
   */
  private async downloadWithProgress(
    url: string,
    onProgress?: (loaded: number, total: number) => void,
    signal?: AbortSignal
  ): Promise<Blob> {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loaded += value.length;
      onProgress?.(loaded, total);
    }

    // Type assertion needed: Uint8Array<ArrayBufferLike> is not directly assignable to BlobPart
    // but is compatible at runtime
    return new Blob(chunks as BlobPart[]);
  }

  /**
   * Trigger browser download
   */
  private triggerBrowserDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Get default filename for an asset
   */
  private getDefaultFilename(asset: DigitalAsset): string {
    // Try to extract extension from imageUrl
    let extension = 'jpg';
    if (asset.imageUrl) {
      const match = asset.imageUrl.match(/\.([a-z0-9]+)(?:\?|$)/i);
      if (match) {
        extension = match[1];
      }
    }

    return `GEOGRAPH_${asset.id}.${extension}`;
  }

  /**
   * Get current download queue status
   */
  getQueueStatus(): DownloadQueueItem[] {
    return Array.from(this.downloadQueue.values());
  }

  cancelDownload(assetId: string): boolean {
    const controller = this.abortControllers.get(assetId);
    const queueItem = this.downloadQueue.get(assetId);

    if (!controller || !queueItem || queueItem.status !== 'downloading') {
      return false;
    }

    controller.abort();
    this.abortControllers.delete(assetId);

    queueItem.status = 'cancelled';
    queueItem.error = 'Cancelled by user';
    this.downloadQueue.set(assetId, queueItem);
    this.notifyQueueListeners();
    return true;
  }

  /**
   * Clear completed downloads from queue
   */
  clearCompleted(): void {
    for (const [assetId, item] of this.downloadQueue.entries()) {
      if (item.status === 'completed' || item.status === 'cancelled') {
        this.downloadQueue.delete(assetId);
      }
    }
    this.notifyQueueListeners();
  }

  /**
   * Cancel all pending downloads
   */
  cancelAll(): void {
    this.abortControllers.forEach(controller => controller.abort());
    this.abortControllers.clear();

    for (const [assetId, item] of this.downloadQueue.entries()) {
      if (item.status === 'downloading' || item.status === 'pending') {
        this.downloadQueue.set(assetId, {
          ...item,
          status: 'cancelled',
          error: 'Cancelled by user',
        });
      }
    }

    this.notifyQueueListeners();
  }
}

// ============================================
// Singleton Export
// ============================================

export const downloadService = new DownloadService();
export default downloadService;
