/**
 * Abstract Storage Interface
 * 
 * Defines the contract for storage backends supporting multiple
 * implementations (Supabase, Firebase, IndexedDB, etc.)
 */

import {
  IDataStorage,
  StorageConfig,
  UploadMetadata,
  UploadResult,
  GraphQuery,
  GraphQueryResult,
  GetAssetsOptions,
  BatchResult,
  StorageStats,
} from '../types';
import { DigitalAsset, GraphNode, GraphLink } from '../../types';

// ============================================
// Abstract Base Storage Class
// ============================================

export abstract class BaseStorage implements IDataStorage {
  abstract name: string;
  protected config: StorageConfig = {};
  protected initialized: boolean = false;

  abstract init(config: StorageConfig): Promise<void>;
  abstract uploadImage(file: File, metadata: UploadMetadata): Promise<UploadResult>;
  abstract queryGraph(query: GraphQuery): Promise<GraphQueryResult>;
  abstract getAsset(assetId: string): Promise<DigitalAsset | null>;
  abstract getAssets(options?: GetAssetsOptions): Promise<DigitalAsset[]>;
  abstract updateAsset(assetId: string, updates: Partial<DigitalAsset>): Promise<void>;
  abstract deleteAsset(assetId: string): Promise<void>;
  abstract isConnected(): Promise<boolean>;

  // Optional methods with default implementations
  async batchUpsert(assets: DigitalAsset[]): Promise<BatchResult> {
    const result: BatchResult = { succeeded: 0, failed: 0, errors: [] };
    
    for (const asset of assets) {
      try {
        await this.updateAsset(asset.id, asset);
        result.succeeded++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          assetId: asset.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    return result;
  }

  async getStats(): Promise<StorageStats> {
    return {
      totalAssets: 0,
      totalNodes: 0,
      totalEdges: 0,
      storageUsedBytes: 0,
    };
  }

  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`Storage adapter "${this.name}" is not initialized. Call init() first.`);
    }
  }
}

// ============================================
// In-Memory Storage (for testing/offline)
// ============================================

export class InMemoryStorage extends BaseStorage {
  name = 'in-memory';
  private assets: Map<string, DigitalAsset> = new Map();
  private nodes: Map<string, GraphNode> = new Map();
  private links: GraphLink[] = [];

  async init(_config: StorageConfig): Promise<void> {
    this.initialized = true;
  }

  async uploadImage(file: File, metadata: UploadMetadata): Promise<UploadResult> {
    this.ensureInitialized();
    
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const imageUrl = URL.createObjectURL(file);
    
    const asset: DigitalAsset = {
      id: assetId,
      imageUrl,
      timestamp: new Date().toISOString(),
      ocrText: '',
      status: 'PENDING' as any,
      sqlRecord: {
        ID: assetId,
        ASSET_ID: assetId,
        LOCAL_TIMESTAMP: new Date().toISOString(),
        SOURCE_COLLECTION: metadata.collection || 'default',
        SCAN_TYPE: metadata.scanType || 'DOCUMENT',
        DATA_LICENSE: (metadata.license as any) || 'CC0',
        KEYWORDS_TAGS: metadata.tags || [],
        CONTRIBUTOR_ID: metadata.userId || null,
      } as any,
    };
    
    this.assets.set(assetId, asset);
    
    return { assetId, imageUrl, success: true };
  }

  async queryGraph(query: GraphQuery): Promise<GraphQueryResult> {
    this.ensureInitialized();
    
    let filteredNodes = Array.from(this.nodes.values());
    
    if (query.nodeTypes && query.nodeTypes.length > 0) {
      filteredNodes = filteredNodes.filter(n => query.nodeTypes!.includes(n.type));
    }
    
    if (query.keywords && query.keywords.length > 0) {
      filteredNodes = filteredNodes.filter(n =>
        query.keywords!.some(k => n.label.toLowerCase().includes(k.toLowerCase()))
      );
    }
    
    const limit = query.limit || 100;
    const offset = query.offset || 0;
    const totalCount = filteredNodes.length;
    
    filteredNodes = filteredNodes.slice(offset, offset + limit);
    
    // Get links for filtered nodes
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = this.links.filter(
      l => nodeIds.has(l.source) && nodeIds.has(l.target)
    );
    
    return {
      nodes: filteredNodes,
      links: filteredLinks,
      totalCount,
      hasMore: offset + limit < totalCount,
    };
  }

  async getAsset(assetId: string): Promise<DigitalAsset | null> {
    this.ensureInitialized();
    return this.assets.get(assetId) || null;
  }

  async getAssets(options?: GetAssetsOptions): Promise<DigitalAsset[]> {
    this.ensureInitialized();
    
    let assets = Array.from(this.assets.values());
    
    if (options?.status) {
      assets = assets.filter(a => a.status === options.status);
    }
    
    if (options?.scanType) {
      assets = assets.filter(a => a.sqlRecord?.SCAN_TYPE === options.scanType);
    }
    
    if (options?.userId) {
      assets = assets.filter(a => a.sqlRecord?.CONTRIBUTOR_ID === options.userId);
    }
    
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    
    return assets.slice(offset, offset + limit);
  }

  async updateAsset(assetId: string, updates: Partial<DigitalAsset>): Promise<void> {
    this.ensureInitialized();
    
    const existing = this.assets.get(assetId);
    if (!existing) {
      throw new Error(`Asset "${assetId}" not found`);
    }
    
    this.assets.set(assetId, { ...existing, ...updates });
    
    // Update graph data if present
    if (updates.graphData) {
      for (const node of updates.graphData.nodes) {
        this.nodes.set(node.id, node);
      }
      this.links.push(...updates.graphData.links);
    }
  }

  async deleteAsset(assetId: string): Promise<void> {
    this.ensureInitialized();
    this.assets.delete(assetId);
  }

  async isConnected(): Promise<boolean> {
    return this.initialized;
  }

  async getStats(): Promise<StorageStats> {
    return {
      totalAssets: this.assets.size,
      totalNodes: this.nodes.size,
      totalEdges: this.links.length,
      storageUsedBytes: 0,
    };
  }

  // Helper for adding nodes/links directly
  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  addLink(link: GraphLink): void {
    this.links.push(link);
  }

  clear(): void {
    this.assets.clear();
    this.nodes.clear();
    this.links = [];
  }
}
