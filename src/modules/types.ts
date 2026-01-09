/**
 * Module System Types
 * 
 * Defines interfaces for pluggable components enabling modular integration
 * of renderers, LLM providers, storage backends, and custom processors.
 */

import { GraphNode, GraphLink, GraphData, DigitalAsset, GISMetadata } from '../types';

// ============================================
// Renderer Module Interface
// ============================================

export interface IRendererModule {
  /** Unique name for this renderer */
  name: string;
  /** Display label for UI */
  displayName: string;
  /** React component to render graph data */
  component: React.FC<RendererProps>;
  /** Priority for ordering in UI (lower = higher priority) */
  priority: number;
  /** Icon component for UI display */
  icon?: React.FC<{ className?: string }>;
  /** Feature flags required for this renderer */
  requiredFeatures?: string[];
  /** Async initialization (e.g., load Three.js, WebGL context) */
  init: (config: RendererConfig) => Promise<void>;
  /** Cleanup resources */
  dispose?: () => void;
  /** Check if renderer is supported in current environment */
  isSupported: () => boolean;
}

export interface RendererProps {
  graphData: GraphData;
  selectedNodeId?: string;
  onNodeSelect?: (nodeId: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
  className?: string;
  config?: RendererConfig;
}

export interface RendererConfig {
  theme?: 'light' | 'dark' | 'system';
  enableInteraction?: boolean;
  enableLabels?: boolean;
  maxNodes?: number;
  animationDuration?: number;
  [key: string]: unknown;
}

// ============================================
// LLM Provider Interface
// ============================================

export interface ILLMProvider {
  /** Unique provider identifier */
  name: string;
  /** Display name for UI */
  displayName: string;
  /** Provider capabilities */
  capabilities: LLMCapability[];
  /** Priority for fallback chain */
  priority: number;
  /** Initialize the provider */
  init: (config: LLMConfig) => Promise<void>;
  /** Extract metadata from an image */
  extractMetadata: (image: Blob, options?: MetadataExtractionOptions) => Promise<MetadataExtractionResult>;
  /** Generate embeddings for text */
  generateEmbeddings?: (text: string) => Promise<number[]>;
  /** Perform semantic similarity check */
  checkSimilarity?: (textA: string, textB: string) => Promise<number>;
  /** Arbitrate conflicts between metadata */
  arbitrateConflict?: (options: ConflictArbitrationOptions) => Promise<ArbitrationResult>;
  /** Check if provider is available */
  isAvailable: () => Promise<boolean>;
  /** Get current usage/quota info */
  getUsageInfo?: () => Promise<UsageInfo>;
}

export type LLMCapability = 
  | 'vision'
  | 'text-generation'
  | 'embeddings'
  | 'function-calling'
  | 'structured-output';

export interface LLMConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  retryCount?: number;
  [key: string]: unknown;
}

export interface MetadataExtractionOptions {
  scanType?: 'ITEM' | 'DOCUMENT' | 'SCENERY';
  includeGIS?: boolean;
  includeEntities?: boolean;
  language?: string;
}

export interface MetadataExtractionResult {
  ocrText: string;
  entities: string[];
  keywords: string[];
  graphData: GraphData;
  gisMetadata?: GISMetadata;
  confidence: number;
  documentTitle?: string;
  documentDescription?: string;
  rawAnalysis?: string;
}

export interface ConflictArbitrationOptions {
  metadataA: Partial<MetadataExtractionResult>;
  metadataB: Partial<MetadataExtractionResult>;
  context?: string;
}

export interface ArbitrationResult {
  mergedMetadata: MetadataExtractionResult;
  confidence: number;
  reasoning: string;
}

export interface UsageInfo {
  requestsRemaining?: number;
  tokensRemaining?: number;
  quotaResetTime?: Date;
}

// ============================================
// Data Storage Interface
// ============================================

export interface IDataStorage {
  /** Provider name */
  name: string;
  /** Initialize storage connection */
  init: (config: StorageConfig) => Promise<void>;
  /** Upload an image with metadata */
  uploadImage: (file: File, metadata: UploadMetadata) => Promise<UploadResult>;
  /** Query the graph data */
  queryGraph: (query: GraphQuery) => Promise<GraphQueryResult>;
  /** Get a single asset by ID */
  getAsset: (assetId: string) => Promise<DigitalAsset | null>;
  /** Get multiple assets */
  getAssets: (options?: GetAssetsOptions) => Promise<DigitalAsset[]>;
  /** Update an asset */
  updateAsset: (assetId: string, updates: Partial<DigitalAsset>) => Promise<void>;
  /** Delete an asset */
  deleteAsset: (assetId: string) => Promise<void>;
  /** Batch operations */
  batchUpsert?: (assets: DigitalAsset[]) => Promise<BatchResult>;
  /** Check connection status */
  isConnected: () => Promise<boolean>;
  /** Get storage statistics */
  getStats?: () => Promise<StorageStats>;
}

export interface StorageConfig {
  url?: string;
  apiKey?: string;
  projectId?: string;
  bucket?: string;
  [key: string]: unknown;
}

export interface UploadMetadata {
  userId?: string;
  scanType?: string;
  collection?: string;
  tags?: string[];
  license?: string;
}

export interface UploadResult {
  assetId: string;
  imageUrl: string;
  success: boolean;
  error?: string;
}

export interface GraphQuery {
  nodeTypes?: string[];
  keywords?: string[];
  dateRange?: { start: string; end: string };
  limit?: number;
  offset?: number;
  includeRelated?: boolean;
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  links: GraphLink[];
  totalCount: number;
  hasMore: boolean;
}

export interface GetAssetsOptions {
  userId?: string;
  status?: string;
  scanType?: string;
  collection?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export interface BatchResult {
  succeeded: number;
  failed: number;
  errors: Array<{ assetId: string; error: string }>;
}

export interface StorageStats {
  totalAssets: number;
  totalNodes: number;
  totalEdges: number;
  storageUsedBytes: number;
}

// ============================================
// Plugin System Interface
// ============================================

export interface IPlugin {
  /** Unique plugin identifier */
  id: string;
  /** Plugin name for display */
  name: string;
  /** Version string */
  version: string;
  /** Plugin description */
  description?: string;
  /** Author information */
  author?: string;
  /** Plugin dependencies */
  dependencies?: string[];
  /** Required feature flags */
  requiredFeatures?: string[];
  /** Plugin lifecycle hooks */
  onLoad?: () => Promise<void>;
  onUnload?: () => void;
  /** Modules this plugin provides */
  modules?: {
    renderers?: IRendererModule[];
    llmProviders?: ILLMProvider[];
    storageAdapters?: IDataStorage[];
    processors?: IProcessor[];
  };
}

export interface IProcessor {
  /** Processor name */
  name: string;
  /** Processing stage */
  stage: 'pre-ocr' | 'post-ocr' | 'pre-graph' | 'post-graph' | 'healing';
  /** Priority in processing chain */
  priority: number;
  /** Process function */
  process: (data: ProcessorInput) => Promise<ProcessorOutput>;
}

export interface ProcessorInput {
  asset?: DigitalAsset;
  graphData?: GraphData;
  metadata?: Record<string, unknown>;
}

export interface ProcessorOutput {
  asset?: DigitalAsset;
  graphData?: GraphData;
  metadata?: Record<string, unknown>;
  shouldContinue: boolean;
}

// ============================================
// Event System Types
// ============================================

export type ModuleEventType =
  | 'module:registered'
  | 'module:unregistered'
  | 'asset:created'
  | 'asset:updated'
  | 'asset:deleted'
  | 'graph:nodeAdded'
  | 'graph:nodeRemoved'
  | 'graph:edgeAdded'
  | 'graph:edgeRemoved'
  | 'graph:healed'
  | 'plugin:loaded'
  | 'plugin:unloaded'
  | 'sync:started'
  | 'sync:completed'
  | 'error:occurred';

export interface ModuleEvent<T = unknown> {
  type: ModuleEventType;
  timestamp: Date;
  payload: T;
  source?: string;
}

export type EventHandler<T = unknown> = (event: ModuleEvent<T>) => void | Promise<void>;

// ============================================
// Feature Flags
// ============================================

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
  variants?: Record<string, unknown>;
  rolloutPercentage?: number;
}

export interface IFeatureFlagProvider {
  /** Provider name */
  name: string;
  /** Initialize provider */
  init: (config: Record<string, unknown>) => Promise<void>;
  /** Check if a feature is enabled */
  isEnabled: (flagName: string, context?: FeatureFlagContext) => boolean;
  /** Get flag value with variants */
  getValue: <T>(flagName: string, defaultValue: T, context?: FeatureFlagContext) => T;
  /** Subscribe to flag changes */
  subscribe: (flagName: string, callback: (enabled: boolean) => void) => () => void;
  /** Get all flags */
  getAllFlags: () => FeatureFlag[];
}

export interface FeatureFlagContext {
  userId?: string;
  userTier?: 'novice' | 'intermediate' | 'expert';
  environment?: string;
  [key: string]: unknown;
}

// ============================================
// Graph Healer Types
// ============================================

export interface HealingStrategy {
  name: string;
  description: string;
  execute: (graph: GraphData, options?: HealingOptions) => Promise<HealingResult>;
}

export interface HealingOptions {
  similarityThreshold?: number;
  maxNodesToProcess?: number;
  enableLLMArbitration?: boolean;
  dryRun?: boolean;
}

export interface HealingResult {
  nodesHealed: number;
  edgesAdded: number;
  edgesRemoved: number;
  duplicatesMerged: number;
  orphansLinked: number;
  healingEvents: HealingEvent[];
}

export interface HealingEvent {
  type: 'merge' | 'link' | 'remove' | 'infer';
  nodeIds: string[];
  description: string;
  confidence: number;
  timestamp: Date;
}

// ============================================
// User Tier Types
// ============================================

export type UserTier = 'novice' | 'intermediate' | 'expert';

export interface UserTierConfig {
  tier: UserTier;
  features: {
    showAdvancedControls: boolean;
    enableAPIAccess: boolean;
    enableRawDataExport: boolean;
    maxConcurrentUploads: number;
    graphComplexityLimit: number;
  };
}

export const DEFAULT_TIER_CONFIGS: Record<UserTier, UserTierConfig> = {
  novice: {
    tier: 'novice',
    features: {
      showAdvancedControls: false,
      enableAPIAccess: false,
      enableRawDataExport: false,
      maxConcurrentUploads: 3,
      graphComplexityLimit: 100,
    },
  },
  intermediate: {
    tier: 'intermediate',
    features: {
      showAdvancedControls: true,
      enableAPIAccess: false,
      enableRawDataExport: true,
      maxConcurrentUploads: 10,
      graphComplexityLimit: 500,
    },
  },
  expert: {
    tier: 'expert',
    features: {
      showAdvancedControls: true,
      enableAPIAccess: true,
      enableRawDataExport: true,
      maxConcurrentUploads: 50,
      graphComplexityLimit: 5000,
    },
  },
};
