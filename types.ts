import { Package, FileText, Mountain } from 'lucide-react';

// Domain Models

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export enum AssetStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  MINTED = 'MINTED',
  FAILED = 'FAILED'
}

export enum ScanType {
  ITEM = 'ITEM',
  DOCUMENT = 'DOCUMENT',
  SCENERY = 'SCENERY'
}

export const SCAN_TYPE_CONFIG = {
  [ScanType.ITEM]:     { label: 'Scanned Items',     color: 'amber',   icon: Package },
  [ScanType.DOCUMENT]: { label: 'Scanned Documents', color: 'blue',    icon: FileText },
  [ScanType.SCENERY]:  { label: 'Scanned Scenery',   color: 'emerald', icon: Mountain },
};

export interface GISMetadata {
  zoneType: string; // e.g., "Urban High Density", "Rural Agricultural"
  estimatedElevation: string;
  nearbyLandmarks: string[];
  environmentalContext: string;
  coordinateSystem: string; // e.g., "WGS84"
}

export interface TaxonomyData {
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
  common_name?: string;
  inaturalist_taxon_id?: number;
}

export interface ItemAttributes {
  common_name?: string;
  confidence_score?: number;
  material?: string[];
  technique?: string[];
  production_date?: string;
  period_or_style?: string;
  dimensions?: { height_cm?: number; width_cm?: number; depth_cm?: number };
  condition?: string;
  inscriptions_or_marks?: string[];
}

export interface SceneryAttributes {
  architectural_style?: string[];
  construction_date?: string;
  architect_or_builder?: string;
  site_type?: string;
  common_name?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'PERSON' | 'LOCATION' | 'ORGANIZATION' | 'DATE' | 'CONCEPT' | 'CLUSTER' | 'DOCUMENT';
  relevance: number; // 0-1
  license?: string; // e.g., 'CC0' or 'COMMERCIAL'
}

export interface GraphLink {
  source: string;
  target: string;
  relationship: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface TokenizationData {
  tokenCount: number;
  vocabularySize: number;
  topTokens: { token: string; frequency: number }[];
  embeddingVectorPreview: number[]; // Simulation of vector embedding
}

export interface NFTData {
  contractAddress: string;
  tokenId: string;
  totalShards: number;
  availableShards: number;
  pricePerShard: number;
  ownership: Array<{ holder: string; percentage: number }>;
  // DCC1 Phygital Data
  dcc1?: {
    shardsCollected: number;
    shardsRequired: number;
    isRedeemable: boolean;
    certificateTokenId?: string;
  }
}

export interface PreservationEvent {
  eventType: string; // e.g., "ingestion", "cleaning", "tokenization"
  timestamp: string;
  agent: string;
  outcome: "SUCCESS" | "FAILURE";
}

export interface ReadingOrderBlock {
    text: string;
    position: string;
}

// Strictly typed SQL-like Schema for Historical Documents
export interface HistoricalDocumentMetadata {
  ASSET_ID: string;
  LOCAL_TIMESTAMP: string;
  OCR_DERIVED_TIMESTAMP: string | null;
  NLP_DERIVED_TIMESTAMP: string | null;
  LOCAL_GIS_ZONE: string;
  OCR_DERIVED_GIS_ZONE: string | null;
  NLP_DERIVED_GIS_ZONE: string | null;
  NODE_COUNT: number;
  NLP_NODE_CATEGORIZATION: string;
  RAW_OCR_TRANSCRIPTION: string;
  PREPROCESS_OCR_TRANSCRIPTION: string;
  SOURCE_COLLECTION: string;
  DOCUMENT_TITLE: string;
  DOCUMENT_DESCRIPTION: string;
  FILE_FORMAT: string;
  FILE_SIZE_BYTES: number;
  RESOLUTION_DPI: number;
  COLOR_MODE: string;
  CREATOR_AGENT: string | null;
  RIGHTS_STATEMENT: string;
  LANGUAGE_CODE: string;
  FIXITY_CHECKSUM: string; // SHA-256
  INGEST_DATE: string;
  LAST_MODIFIED: string;
  PROCESSING_STATUS: AssetStatus;
  CONFIDENCE_SCORE: number;
  ENTITIES_EXTRACTED: string[]; // List of named entities
  RELATED_ASSETS: string[];
  PRESERVATION_EVENTS: PreservationEvent[];
  KEYWORDS_TAGS: string[];
  ACCESS_RESTRICTIONS: boolean;
  scan_type: string;
  
  // Rich Metadata based on Scan Type
  TAXONOMY?: TaxonomyData;
  ITEM_ATTRIBUTES?: ItemAttributes;
  SCENERY_ATTRIBUTES?: SceneryAttributes;

  // Accessibility & Alt Text (WCAG AAA)
  alt_text_short?: string;
  alt_text_long?: string;
  reading_order?: ReadingOrderBlock[];
  accessibility_score?: number;

  // Contribution Fields
  CONTRIBUTOR_ID: string | null;
  CONTRIBUTED_AT: string | null;
  DATA_LICENSE: 'CC0' | 'GEOGRAPH_CORPUS_1.0' | 'CUSTOM';
  CONTRIBUTOR_NFT_MINTED: boolean;
}

export interface DigitalAsset {
  id: string;
  imageUrl: string;
  imageBlob?: Blob; // For IndexedDB persistence
  timestamp: string;
  ocrText: string;
  location?: LocationData;
  gisMetadata?: GISMetadata;
  graphData?: GraphData;
  tokenization?: TokenizationData;
  nft?: NFTData;
  status: AssetStatus;
  processingAnalysis?: string; // Raw LLM thoughts
  errorMessage?: string; // Captured error during processing
  
  // The structured DB record
  sqlRecord?: HistoricalDocumentMetadata;
}

export interface ImageBundle {
  bundleId: string;
  title: string;
  primaryImageUrl: string;
  imageUrls: string[];
  timeRange: { earliest: string | null; latest: string | null };
  combinedTokens: number;
  combinedGraph?: GraphData;
  combinedRecord?: HistoricalDocumentMetadata;
  status: AssetStatus;
}

export interface BatchItem {
  id: string;
  file: File;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  progress: number; // 0-100
  errorMsg?: string;
  assetId?: string; // Link to the created asset
  scanType?: ScanType;
}