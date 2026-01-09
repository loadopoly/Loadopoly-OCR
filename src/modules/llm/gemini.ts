/**
 * Gemini LLM Provider
 * 
 * Implements the ILLMProvider interface for Google's Gemini AI.
 * Wraps the existing geminiService with the pluggable module architecture.
 */

import { BaseLLMProvider } from './abstract';
import {
  LLMCapability,
  LLMConfig,
  MetadataExtractionOptions,
  MetadataExtractionResult,
  ConflictArbitrationOptions,
  ArbitrationResult,
  UsageInfo,
} from '../types';
import { GraphData, GraphNode, GraphLink, GISMetadata, ScanType } from '../../types';
import { processImageWithGemini, fileToGenerativePart } from '../../services/geminiService';
import { logger } from '../../lib/logger';

// ============================================
// Gemini Provider Configuration
// ============================================

interface GeminiConfig extends LLMConfig {
  apiKey?: string;
  model?: string;
}

// ============================================
// Gemini LLM Provider Implementation
// ============================================

export class GeminiProvider extends BaseLLMProvider {
  name = 'gemini';
  displayName = 'Google Gemini';
  capabilities: LLMCapability[] = ['vision', 'text-generation', 'structured-output'];
  priority = 10; // High priority - primary provider

  private apiKey: string = '';
  private model: string = 'gemini-2.5-flash';

  async init(config: GeminiConfig): Promise<void> {
    this.config = config;
    
    // Get API key from config or environment
    this.apiKey = config.apiKey || this.getApiKeyFromEnv();
    
    if (config.model) {
      this.model = config.model;
    }

    if (!this.apiKey) {
      logger.warn('Gemini API key not configured - provider will be unavailable');
    }

    this.initialized = true;
    logger.info(`Gemini provider initialized with model: ${this.model}`);
  }

  private getApiKeyFromEnv(): string {
    // @ts-ignore - Vite's import.meta.env
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      if (import.meta.env.VITE_GEMINI_API_KEY) return import.meta.env.VITE_GEMINI_API_KEY;
      // @ts-ignore
      if (import.meta.env.API_KEY) return import.meta.env.API_KEY;
    }
    
    if (typeof process !== 'undefined' && process.env?.API_KEY) {
      return process.env.API_KEY;
    }
    
    return '';
  }

  async extractMetadata(
    image: Blob,
    options?: MetadataExtractionOptions
  ): Promise<MetadataExtractionResult> {
    this.ensureInitialized();

    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    try {
      // Convert blob to File for compatibility with existing service
      const file = new File([image], 'image.jpg', { type: image.type || 'image/jpeg' });
      
      // Map scan type
      const scanType = this.mapScanType(options?.scanType);
      
      // Use existing service
      const result = await processImageWithGemini(file, null, scanType, false);

      // Build graph from extracted entities
      const assetId = `asset_${Date.now()}`;
      const graphData = this.buildEnhancedGraph(
        assetId,
        result.documentTitle,
        result.graphData?.nodes || [],
        result.graphData?.links || []
      );

      return {
        ocrText: result.ocrText,
        entities: this.extractEntities(result),
        keywords: result.keywordsTags || [],
        graphData,
        gisMetadata: result.gisMetadata,
        confidence: result.confidenceScore || 0.8,
        documentTitle: result.documentTitle,
        documentDescription: result.documentDescription,
        rawAnalysis: result.analysis,
      };
    } catch (error) {
      logger.error('Gemini extraction failed', error);
      throw error;
    }
  }

  private mapScanType(type?: string): ScanType {
    switch (type?.toUpperCase()) {
      case 'ITEM':
        return ScanType.ITEM;
      case 'SCENERY':
        return ScanType.SCENERY;
      case 'DOCUMENT':
      default:
        return ScanType.DOCUMENT;
    }
  }

  private extractEntities(result: any): string[] {
    const entities: string[] = [];
    
    // Extract from graph nodes
    if (result.graphData?.nodes) {
      for (const node of result.graphData.nodes) {
        if (node.type !== 'DOCUMENT' && node.label) {
          entities.push(node.label);
        }
      }
    }

    return [...new Set(entities)];
  }

  private buildEnhancedGraph(
    assetId: string,
    title: string,
    existingNodes: GraphNode[],
    existingLinks: GraphLink[]
  ): GraphData {
    // If we already have nodes, use them
    if (existingNodes.length > 0) {
      return { nodes: existingNodes, links: existingLinks };
    }

    // Otherwise build basic graph
    return this.buildGraphFromEntities(assetId, title, [], 'CC0');
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async arbitrateConflict(options: ConflictArbitrationOptions): Promise<ArbitrationResult> {
    this.ensureInitialized();

    if (!this.apiKey) {
      // Fall back to default implementation
      return super.arbitrateConflict(options);
    }

    try {
      // Use Gemini to intelligently merge metadata
      const { metadataA, metadataB, context } = options;

      // For now, use enhanced default logic
      // TODO: Implement actual Gemini-based arbitration
      const baseResult = await super.arbitrateConflict(options);

      // Enhance with confidence-weighted entity merging
      const allEntities = [
        ...(metadataA.entities || []).map(e => ({ entity: e, confidence: metadataA.confidence || 0.5 })),
        ...(metadataB.entities || []).map(e => ({ entity: e, confidence: metadataB.confidence || 0.5 })),
      ];

      // Deduplicate by keeping highest confidence version
      const entityMap = new Map<string, number>();
      for (const { entity, confidence } of allEntities) {
        const normalized = entity.toLowerCase();
        if (!entityMap.has(normalized) || entityMap.get(normalized)! < confidence) {
          entityMap.set(normalized, confidence);
        }
      }

      const mergedEntities = Array.from(entityMap.keys());

      return {
        ...baseResult,
        mergedMetadata: {
          ...baseResult.mergedMetadata,
          entities: mergedEntities,
        },
        reasoning: `Gemini-enhanced merge: Combined ${allEntities.length} entities to ${mergedEntities.length} unique entries`,
      };
    } catch (error) {
      logger.warn('Gemini arbitration failed, falling back to default');
      return super.arbitrateConflict(options);
    }
  }

  async getUsageInfo(): Promise<UsageInfo> {
    // Gemini doesn't expose quota info directly via API
    return {
      requestsRemaining: undefined,
      tokensRemaining: undefined,
    };
  }
}

// ============================================
// Singleton Export
// ============================================

export const geminiProvider = new GeminiProvider();
