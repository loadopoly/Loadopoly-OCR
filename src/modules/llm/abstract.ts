/**
 * LLM Provider - Abstract Base
 * 
 * Defines abstract base class for LLM providers enabling
 * pluggable AI backends (Gemini, OpenAI, Claude, local models).
 */

import {
  ILLMProvider,
  LLMCapability,
  LLMConfig,
  MetadataExtractionOptions,
  MetadataExtractionResult,
  ConflictArbitrationOptions,
  ArbitrationResult,
  UsageInfo,
} from '../types';
import { GraphData, GraphNode, GraphLink, GISMetadata } from '../../types';

// ============================================
// Abstract Base LLM Provider
// ============================================

export abstract class BaseLLMProvider implements ILLMProvider {
  abstract name: string;
  abstract displayName: string;
  abstract capabilities: LLMCapability[];
  priority: number = 100;
  protected config: LLMConfig = {};
  protected initialized: boolean = false;

  abstract init(config: LLMConfig): Promise<void>;
  abstract extractMetadata(image: Blob, options?: MetadataExtractionOptions): Promise<MetadataExtractionResult>;
  abstract isAvailable(): Promise<boolean>;

  // Optional methods with default implementations
  async generateEmbeddings(_text: string): Promise<number[]> {
    throw new Error('Embeddings not supported by this provider');
  }

  async checkSimilarity(textA: string, textB: string): Promise<number> {
    // Default implementation using Jaccard similarity
    const tokensA = new Set(textA.toLowerCase().split(/\s+/));
    const tokensB = new Set(textB.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);
    
    return intersection.size / union.size;
  }

  async arbitrateConflict(options: ConflictArbitrationOptions): Promise<ArbitrationResult> {
    // Default: prefer metadata A with higher confidence
    const { metadataA, metadataB } = options;
    const confA = metadataA.confidence || 0;
    const confB = metadataB.confidence || 0;
    
    const preferred = confA >= confB ? metadataA : metadataB;
    const secondary = confA >= confB ? metadataB : metadataA;
    
    // Merge entities and keywords
    const mergedEntities = [
      ...new Set([
        ...(preferred.entities || []),
        ...(secondary.entities || [])
      ])
    ];
    
    const mergedKeywords = [
      ...new Set([
        ...(preferred.keywords || []),
        ...(secondary.keywords || [])
      ])
    ];

    return {
      mergedMetadata: {
        ocrText: preferred.ocrText || secondary.ocrText || '',
        entities: mergedEntities,
        keywords: mergedKeywords,
        graphData: preferred.graphData || secondary.graphData || { nodes: [], links: [] },
        confidence: Math.max(confA, confB),
        documentTitle: preferred.documentTitle || secondary.documentTitle,
        documentDescription: preferred.documentDescription || secondary.documentDescription,
      },
      confidence: Math.max(confA, confB) * 0.9,
      reasoning: `Merged metadata preferring ${confA >= confB ? 'A' : 'B'} based on confidence scores`,
    };
  }

  async getUsageInfo(): Promise<UsageInfo> {
    return {};
  }

  hasCapability(capability: LLMCapability): boolean {
    return this.capabilities.includes(capability);
  }

  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`LLM Provider "${this.name}" is not initialized. Call init() first.`);
    }
  }

  protected buildGraphFromEntities(
    assetId: string,
    title: string,
    entities: string[],
    license: string = 'CC0'
  ): GraphData {
    const nodes: GraphNode[] = [
      {
        id: assetId,
        label: title,
        type: 'DOCUMENT',
        relevance: 1.0,
        license,
      }
    ];

    const links: GraphLink[] = [];

    entities.forEach(entity => {
      const entityId = `ENT_${entity.replace(/\s+/g, '_').toUpperCase()}`;
      nodes.push({
        id: entityId,
        label: entity,
        type: 'CONCEPT',
        relevance: 0.8,
      });
      links.push({
        source: assetId,
        target: entityId,
        relationship: 'CONTAINS',
      });
    });

    return { nodes, links };
  }
}

// ============================================
// Mock LLM Provider (for testing/offline)
// ============================================

export class MockLLMProvider extends BaseLLMProvider {
  name = 'mock';
  displayName = 'Mock LLM (Testing)';
  capabilities: LLMCapability[] = ['vision', 'text-generation'];
  priority = 1000; // Low priority - only use as last resort

  async init(_config: LLMConfig): Promise<void> {
    this.initialized = true;
  }

  async extractMetadata(_image: Blob, options?: MetadataExtractionOptions): Promise<MetadataExtractionResult> {
    this.ensureInitialized();

    const scanType = options?.scanType || 'DOCUMENT';
    const mockEntities = ['Test Entity', 'Sample Location', 'Mock Date'];
    const mockKeywords = ['test', 'mock', 'sample'];

    return {
      ocrText: 'This is mock OCR text for testing purposes.',
      entities: mockEntities,
      keywords: mockKeywords,
      graphData: this.buildGraphFromEntities(
        `mock_${Date.now()}`,
        'Mock Document',
        mockEntities
      ),
      confidence: 0.5,
      documentTitle: `Mock ${scanType} Document`,
      documentDescription: 'A mock document generated for testing the LLM provider interface.',
      rawAnalysis: 'Mock analysis: This is a test document.',
    };
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available as fallback
  }

  async generateEmbeddings(text: string): Promise<number[]> {
    // Generate deterministic mock embeddings based on text hash
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array.from({ length: 256 }, (_, i) => Math.sin(hash + i) * 0.5);
  }
}
