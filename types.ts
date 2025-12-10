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

export interface GISMetadata {
  zoneType: string; // e.g., "Urban High Density", "Rural Agricultural"
  estimatedElevation: string;
  nearbyLandmarks: string[];
  environmentalContext: string;
  coordinateSystem: string; // e.g., "WGS84"
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'PERSON' | 'LOCATION' | 'ORGANIZATION' | 'DATE' | 'CONCEPT';
  relevance: number; // 0-1
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
}

export interface DigitalAsset {
  id: string;
  imageUrl: string;
  timestamp: string;
  ocrText: string;
  location?: LocationData;
  gisMetadata?: GISMetadata;
  graphData?: GraphData;
  tokenization?: TokenizationData;
  nft?: NFTData;
  status: AssetStatus;
  processingAnalysis?: string; // Raw LLM thoughts
}
