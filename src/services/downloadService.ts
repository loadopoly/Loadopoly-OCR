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
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

// ============================================
// Download Service Class
// ============================================

class DownloadService {
  private downloadQueue: Map<string, DownloadQueueItem> = new Map();
  private edgeFunctionUrl: string = '';

  constructor() {
    if (isSupabaseConfigured() && supabase) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      this.edgeFunctionUrl = `${supabaseUrl}/functions/v1/download-asset`;
    }
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
          options?.onProgress?.(loaded, total);
        }
      );

      // Trigger browser download
      this.triggerBrowserDownload(blob, queueItem.filename);

      // Update queue
      queueItem.status = 'completed';
      queueItem.progress = 100;
      this.downloadQueue.set(asset.id, queueItem);

      options?.onComplete?.();
      logger.info(`Successfully downloaded asset ${asset.id}`);
      return true;
    } catch (error) {
      logger.error(`Failed to download asset ${asset.id}`, error);
      
      const queueItem = this.downloadQueue.get(asset.id);
      if (queueItem) {
        queueItem.status = 'failed';
        queueItem.error = error instanceof Error ? error.message : 'Unknown error';
        this.downloadQueue.set(asset.id, queueItem);
      }

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
    if (typeof window !== 'undefined' && (window as any).JSZip) {
      const JSZip = (window as any).JSZip;
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
    } catch (error) {
      logger.error('Failed to get signed URLs', error);
      return {};
    }
  }

  /**
   * Download a file with progress tracking
   */
  private async downloadWithProgress(
    url: string,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<Blob> {
    const response = await fetch(url);
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

  /**
   * Clear completed downloads from queue
   */
  clearCompleted(): void {
    for (const [assetId, item] of this.downloadQueue.entries()) {
      if (item.status === 'completed') {
        this.downloadQueue.delete(assetId);
      }
    }
  }

  /**
   * Cancel all pending downloads
   */
  cancelAll(): void {
    this.downloadQueue.clear();
  }
}

// ============================================
// Singleton Export
// ============================================

export const downloadService = new DownloadService();
export default downloadService;
