/**
 * Supabase Storage Adapter
 * 
 * Implements the IDataStorage interface for Supabase backend.
 * Provides full CRUD operations for assets and graph queries.
 */

import { BaseStorage } from './abstract';
import {
  StorageConfig,
  UploadMetadata,
  UploadResult,
  GraphQuery,
  GraphQueryResult,
  GetAssetsOptions,
  BatchResult,
  StorageStats,
} from '../types';
import { DigitalAsset, GraphNode, GraphLink, AssetStatus } from '../../types';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient';
import { encryptData, decryptData } from '../../lib/encryption';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../lib/logger';
import { eventEmitter } from '../events';

// ============================================
// Row to Asset Mapper
// ============================================

const mapRowToAsset = async (row: any, userId?: string): Promise<DigitalAsset> => {
  const assetId = row.ASSET_ID || row.ID;
  const docTitle = row.DOCUMENT_TITLE || 'Untitled Document';
  const dataLicense = row.DATA_LICENSE || 'GEOGRAPH_CORPUS_1.0';
  
  // Decrypt sensitive data if needed
  let ocrText = row.RAW_OCR_TRANSCRIPTION || '';
  let description = row.DOCUMENT_DESCRIPTION || '';

  if (userId) {
    if (ocrText && ocrText.length > 20 && !ocrText.includes(' ')) {
      try { ocrText = await decryptData(ocrText, userId); } catch (e) { /* Keep encrypted */ }
    }
    if (description && description.length > 20 && !description.includes(' ')) {
      try { description = await decryptData(description, userId); } catch (e) { /* Keep encrypted */ }
    }
  }

  // Parse JSONB fields
  const entities: string[] = Array.isArray(row.ENTITIES_EXTRACTED) 
    ? row.ENTITIES_EXTRACTED 
    : (typeof row.ENTITIES_EXTRACTED === 'string' ? JSON.parse(row.ENTITIES_EXTRACTED) : []);
  
  // Reconstruct Nodes
  const nodes: GraphNode[] = [
    { 
      id: assetId, 
      label: docTitle, 
      type: 'DOCUMENT', 
      relevance: 1.0,
      license: dataLicense 
    }
  ];

  // Reconstruct Links & Entity Nodes
  const links: GraphLink[] = [];
  entities.forEach(entity => {
    const entityId = `ENT_${entity.replace(/\s+/g, '_').toUpperCase()}`;
    nodes.push({
      id: entityId,
      label: entity,
      type: 'CONCEPT',
      relevance: 0.8
    });
    links.push({
      source: assetId,
      target: entityId,
      relationship: 'CONTAINS'
    });
  });

  return {
    id: assetId,
    imageUrl: row.ORIGINAL_IMAGE_URL || '', 
    timestamp: row.LOCAL_TIMESTAMP || row.CREATED_AT,
    ocrText: ocrText,
    status: (row.PROCESSING_STATUS as AssetStatus) || AssetStatus.MINTED,
    graphData: { nodes, links },
    tokenization: {
      tokenCount: row.TOKEN_COUNT || 0,
      vocabularySize: 0,
      topTokens: [],
      embeddingVectorPreview: []
    },
    gisMetadata: row.LOCAL_GIS_ZONE ? {
      zoneType: row.LOCAL_GIS_ZONE,
      estimatedElevation: row.ESTIMATED_ELEVATION || '',
      nearbyLandmarks: Array.isArray(row.NEARBY_LANDMARKS) ? row.NEARBY_LANDMARKS : [],
      environmentalContext: row.ENVIRONMENTAL_CONTEXT || '',
      coordinateSystem: row.COORDINATE_SYSTEM || 'WGS84'
    } : undefined,
    sqlRecord: {
      ...row,
      ASSET_ID: assetId,
      DOCUMENT_TITLE: docTitle,
      DOCUMENT_DESCRIPTION: description,
      RAW_OCR_TRANSCRIPTION: ocrText,
      DATA_LICENSE: dataLicense,
      ENTITIES_EXTRACTED: entities,
      KEYWORDS_TAGS: Array.isArray(row.KEYWORDS_TAGS) ? row.KEYWORDS_TAGS : [],
      PRESERVATION_EVENTS: Array.isArray(row.PRESERVATION_EVENTS) ? row.PRESERVATION_EVENTS : [],
      IS_ENTERPRISE: row.IS_ENTERPRISE || false,
      SCAN_TYPE: row.SCAN_TYPE || 'DOCUMENT',
    }
  };
};

// ============================================
// Supabase Storage Class
// ============================================

export class SupabaseStorage extends BaseStorage {
  name = 'supabase';
  private tableName = 'historical_documents_global';
  private bucketName = 'corpus-images';
  private currentUserId?: string;

  async init(config: StorageConfig): Promise<void> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured. Check environment variables.');
    }
    
    this.config = config;
    this.currentUserId = config.userId as string | undefined;
    this.initialized = true;
    
    logger.info('Supabase storage adapter initialized');
  }

  async uploadImage(file: File, metadata: UploadMetadata): Promise<UploadResult> {
    this.ensureInitialized();
    
    if (!supabase) {
      return { assetId: '', imageUrl: '', success: false, error: 'Supabase not available' };
    }

    const assetId = `asset_${uuidv4()}`;
    
    try {
      // Upload to storage
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${assetId}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(this.bucketName)
        .upload(fileName, file, {
          upsert: true,
          contentType: file.type
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from(this.bucketName)
        .getPublicUrl(fileName);

      const publicUrl = publicUrlData.publicUrl;

      // Create initial database record
      const record = {
        ASSET_ID: assetId,
        ID: assetId,
        LOCAL_TIMESTAMP: new Date().toISOString(),
        CREATED_AT: new Date().toISOString(),
        PROCESSING_STATUS: 'PENDING',
        SOURCE_COLLECTION: metadata.collection || 'default',
        SCAN_TYPE: metadata.scanType || 'DOCUMENT',
        DATA_LICENSE: metadata.license || 'GEOGRAPH_CORPUS_1.0',
        KEYWORDS_TAGS: metadata.tags || [],
        CONTRIBUTOR_ID: metadata.userId || null,
        USER_ID: metadata.userId || null,
        ORIGINAL_IMAGE_URL: publicUrl,
        FILE_FORMAT: file.type,
        FILE_SIZE_BYTES: file.size,
      };

      const { error: insertError } = await supabase
        .from(this.tableName)
        .insert(record as any);

      if (insertError) throw insertError;

      eventEmitter.emit('asset:created', { assetId, imageUrl: publicUrl });
      
      return { assetId, imageUrl: publicUrl, success: true };
    } catch (error) {
      logger.error('Upload failed', error);
      return {
        assetId,
        imageUrl: '',
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      };
    }
  }

  async queryGraph(query: GraphQuery): Promise<GraphQueryResult> {
    this.ensureInitialized();
    
    if (!supabase) {
      return { nodes: [], links: [], totalCount: 0, hasMore: false };
    }

    try {
      let dbQuery = supabase
        .from(this.tableName)
        .select('*', { count: 'exact' });

      if (query.keywords && query.keywords.length > 0) {
        // Search in entities and keywords
        dbQuery = dbQuery.or(
          query.keywords.map(k => `ENTITIES_EXTRACTED.cs.{${k}}`).join(',')
        );
      }

      if (query.dateRange) {
        dbQuery = dbQuery
          .gte('CREATED_AT', query.dateRange.start)
          .lte('CREATED_AT', query.dateRange.end);
      }

      const limit = query.limit || 100;
      const offset = query.offset || 0;

      dbQuery = dbQuery.range(offset, offset + limit - 1);

      const { data, error, count } = await dbQuery;

      if (error) throw error;

      // Build combined graph from all assets
      const nodes: GraphNode[] = [];
      const links: GraphLink[] = [];
      const nodeIds = new Set<string>();

      if (data) {
        for (const row of data) {
          const asset = await mapRowToAsset(row, this.currentUserId);
          if (asset.graphData) {
            for (const node of asset.graphData.nodes) {
              if (!nodeIds.has(node.id)) {
                nodes.push(node);
                nodeIds.add(node.id);
              }
            }
            links.push(...asset.graphData.links);
          }
        }
      }

      // Filter by node types if specified
      let filteredNodes = nodes;
      if (query.nodeTypes && query.nodeTypes.length > 0) {
        filteredNodes = nodes.filter(n => query.nodeTypes!.includes(n.type));
      }

      return {
        nodes: filteredNodes,
        links: links.filter(l => 
          nodeIds.has(l.source) && nodeIds.has(l.target)
        ),
        totalCount: count || 0,
        hasMore: offset + limit < (count || 0),
      };
    } catch (error) {
      logger.error('Graph query failed', error);
      return { nodes: [], links: [], totalCount: 0, hasMore: false };
    }
  }

  async getAsset(assetId: string): Promise<DigitalAsset | null> {
    this.ensureInitialized();
    
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('ASSET_ID', assetId)
        .single();

      if (error || !data) return null;

      return mapRowToAsset(data, this.currentUserId);
    } catch (error) {
      logger.error('Get asset failed', error);
      return null;
    }
  }

  async getAssets(options?: GetAssetsOptions): Promise<DigitalAsset[]> {
    this.ensureInitialized();
    
    if (!supabase) return [];

    try {
      let query = supabase
        .from(this.tableName)
        .select('*');

      if (options?.userId) {
        query = query.eq('USER_ID', options.userId);
      }

      if (options?.status) {
        query = query.eq('PROCESSING_STATUS', options.status);
      }

      if (options?.scanType) {
        query = query.eq('SCAN_TYPE', options.scanType);
      }

      if (options?.collection) {
        query = query.eq('SOURCE_COLLECTION', options.collection);
      }

      const orderBy = options?.orderBy || 'CREATED_AT';
      const orderDirection = options?.orderDirection || 'desc';
      query = query.order(orderBy, { ascending: orderDirection === 'asc' });

      const limit = options?.limit || 100;
      const offset = options?.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) throw error;

      if (!data) return [];

      return Promise.all(data.map(row => mapRowToAsset(row, this.currentUserId)));
    } catch (error) {
      logger.error('Get assets failed', error);
      return [];
    }
  }

  async updateAsset(assetId: string, updates: Partial<DigitalAsset>): Promise<void> {
    this.ensureInitialized();
    
    if (!supabase) {
      throw new Error('Supabase not available');
    }

    try {
      const record: any = {
        LAST_MODIFIED: new Date().toISOString(),
      };

      if (updates.ocrText !== undefined) {
        record.RAW_OCR_TRANSCRIPTION = this.currentUserId
          ? await encryptData(updates.ocrText, this.currentUserId)
          : updates.ocrText;
      }

      if (updates.status !== undefined) {
        record.PROCESSING_STATUS = updates.status;
      }

      if (updates.graphData) {
        const entities = updates.graphData.nodes
          .filter(n => n.type === 'CONCEPT')
          .map(n => n.label);
        record.ENTITIES_EXTRACTED = entities;
        record.NODE_COUNT = updates.graphData.nodes.length;
      }

      if (updates.sqlRecord) {
        Object.assign(record, updates.sqlRecord);
      }

      // Use type-flexible update pattern for dynamic record structure
      const client = supabase as any;
      const { error } = await client
        .from(this.tableName)
        .update(record)
        .eq('ASSET_ID', assetId);

      if (error) throw error;

      eventEmitter.emit('asset:updated', { assetId, changes: updates });
    } catch (error) {
      logger.error('Update asset failed');
      throw error;
    }
  }

  async deleteAsset(assetId: string): Promise<void> {
    this.ensureInitialized();
    
    if (!supabase) {
      throw new Error('Supabase not available');
    }

    try {
      const { error } = await supabase
        .from(this.tableName)
        .delete()
        .eq('ASSET_ID', assetId);

      if (error) throw error;

      eventEmitter.emit('asset:deleted', { assetId });
    } catch (error) {
      logger.error('Delete asset failed', error);
      throw error;
    }
  }

  async batchUpsert(assets: DigitalAsset[]): Promise<BatchResult> {
    this.ensureInitialized();
    
    if (!supabase) {
      return { succeeded: 0, failed: assets.length, errors: [{ assetId: '', error: 'Supabase not available' }] };
    }

    const result: BatchResult = { succeeded: 0, failed: 0, errors: [] };

    // Process in batches of 100
    const batchSize = 100;
    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      const records = await Promise.all(
        batch.map(async (asset) => ({
          ...asset.sqlRecord,
          LAST_MODIFIED: new Date().toISOString(),
        }))
      );

      try {
        const { error } = await supabase
          .from(this.tableName)
          .upsert(records as any);

        if (error) throw error;

        result.succeeded += batch.length;
      } catch (error) {
        result.failed += batch.length;
        result.errors.push({
          assetId: batch.map(a => a.id).join(','),
          error: error instanceof Error ? error.message : 'Batch upsert failed'
        });
      }
    }

    return result;
  }

  async isConnected(): Promise<boolean> {
    if (!supabase) return false;

    try {
      const { error } = await supabase
        .from(this.tableName)
        .select('count', { count: 'exact', head: true });

      return !error;
    } catch {
      return false;
    }
  }

  async getStats(): Promise<StorageStats> {
    if (!supabase) {
      return { totalAssets: 0, totalNodes: 0, totalEdges: 0, storageUsedBytes: 0 };
    }

    try {
      const { count } = await supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      // Estimate nodes/edges based on average per asset
      const avgNodesPerAsset = 5;
      const avgEdgesPerAsset = 4;

      return {
        totalAssets: count || 0,
        totalNodes: (count || 0) * avgNodesPerAsset,
        totalEdges: (count || 0) * avgEdgesPerAsset,
        storageUsedBytes: 0, // Would need storage API to get this
      };
    } catch (error) {
      logger.error('Get stats failed', error);
      return { totalAssets: 0, totalNodes: 0, totalEdges: 0, storageUsedBytes: 0 };
    }
  }

  setUserId(userId: string): void {
    this.currentUserId = userId;
  }
}

// ============================================
// Singleton Export
// ============================================

export const supabaseStorage = new SupabaseStorage();
