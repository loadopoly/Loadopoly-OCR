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
  ID: string;
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
  CREATED_AT: string;
  LAST_MODIFIED: string;
  PROCESSING_STATUS: AssetStatus;
  CONFIDENCE_SCORE: number;
  TOKEN_COUNT?: number; // Added for token attribution
  ENTITIES_EXTRACTED: string[]; // List of named entities
  RELATED_ASSETS: string[];
  PRESERVATION_EVENTS: PreservationEvent[];
  KEYWORDS_TAGS: string[];
  ACCESS_RESTRICTIONS: boolean;
  SCAN_TYPE: string;
  ASSOCIATIVE_ITEM_TAG?: string | null;
  IS_USER_ANNOTATED?: boolean; // Flag for user-modified data
  USER_BUNDLE_ID?: string | null; // Link to manual bundle
  COMMUNITY_ID?: string | null; // Link to community
  
  // Rich Metadata based on Scan Type
  TAXONOMY?: TaxonomyData;
  ITEM_ATTRIBUTES?: ItemAttributes;
  SCENERY_ATTRIBUTES?: SceneryAttributes;

  // Accessibility & Alt Text (WCAG AAA)
  ALT_TEXT_SHORT?: string;
  ALT_TEXT_LONG?: string;
  READING_ORDER?: ReadingOrderBlock[];
  ACCESSIBILITY_SCORE?: number;

  // Contribution Fields
  CONTRIBUTOR_ID: string | null;
  CONTRIBUTED_AT: string | null;
  DATA_LICENSE: 'CC0' | 'GEOGRAPH_CORPUS_1.0' | 'CUSTOM';
  CONTRIBUTOR_NFT_MINTED: boolean;
  IS_ENTERPRISE?: boolean; // Flag for enterprise-only corpus
  USER_ID?: string | null; // Supabase auth user ID
  ORIGINAL_IMAGE_URL?: string | null; // Public URL from Supabase Storage

  // ============================================
  // STRUCTURED CLUSTER CLASSIFICATION FIELDS
  // LLM-synchronized dimension values for corpus consistency
  // ============================================
  
  /** Structured temporal classification: era, historicalPeriod, documentAge */
  STRUCTURED_TEMPORAL?: StructuredTemporalCluster | null;
  
  /** Structured spatial classification: zone, geographicScale, placeType */
  STRUCTURED_SPATIAL?: StructuredSpatialCluster | null;
  
  /** Structured content classification: category, scanType, mediaType, subjectMatter */
  STRUCTURED_CONTENT?: StructuredContentCluster | null;
  
  /** Structured graph classification: nodeType, connectionDensity, narrativeRole */
  STRUCTURED_KNOWLEDGE_GRAPH?: StructuredKnowledgeGraphCluster | null;
  
  /** Structured provenance classification: license, confidence, verificationLevel, contested */
  STRUCTURED_PROVENANCE?: StructuredProvenanceCluster | null;
  
  /** Structured discovery classification: source, status, entityTypes, serendipityScore, researchPotential */
  STRUCTURED_DISCOVERY?: StructuredDiscoveryCluster | null;
  
  /** Name of the LLM provider that performed the structured classification */
  CLASSIFICATION_LLM?: string | null;
  
  /** Timestamp when the structured classification was performed */
  CLASSIFICATION_DATE?: string | null;
  
  /** Version of the classification schema used */
  CLASSIFICATION_VERSION?: string | null;
  
  /** Overall confidence score for the structured classification */
  CLASSIFICATION_CONFIDENCE?: number | null;
}

// ============================================
// Structured Cluster Types
// ============================================

export interface StructuredClusterBase {
  derivedFromFields: string[];
  confidence: number;
}

export interface StructuredTemporalCluster extends StructuredClusterBase {
  era: string;
  historicalPeriod: string[];
  documentAge: 'Contemporary' | 'Modern' | 'Historic' | 'Antique' | 'Unknown';
}

export interface StructuredSpatialCluster extends StructuredClusterBase {
  zone: string;
  geographicScale: 'Local' | 'Regional' | 'National' | 'International' | 'Unknown';
  placeType: 'Urban' | 'Suburban' | 'Rural' | 'Industrial' | 'Commercial' | 'Residential' | 'Sacred' | 'Natural' | 'Unknown';
}

export interface StructuredContentCluster extends StructuredClusterBase {
  category: string;
  scanType: 'DOCUMENT' | 'ITEM' | 'SCENERY';
  mediaType: string;
  subjectMatter: 'People' | 'Places' | 'Events' | 'Commerce' | 'Religion' | 'Government' | 'Culture' | 'Nature' | 'Other';
}

export interface StructuredKnowledgeGraphCluster extends StructuredClusterBase {
  nodeType: 'DOCUMENT' | 'PERSON' | 'LOCATION' | 'ORGANIZATION' | 'DATE' | 'CONCEPT';
  connectionDensity: 'Isolated' | 'Linked' | 'Hub';
  narrativeRole: 'Protagonist' | 'Setting' | 'Evidence' | 'Context';
  graphNodeCount: number;
  graphEdgeCount: number;
}

export interface StructuredProvenanceCluster extends StructuredClusterBase {
  license: string;
  verificationLevel: 'Unverified' | 'Community' | 'Expert' | 'Institutional';
  contested: boolean;
}

export interface StructuredDiscoveryCluster extends StructuredClusterBase {
  source: string;
  status: string;
  entityTypes: string[];
  serendipityScore: 'low' | 'medium' | 'high';
  researchPotential: 'low' | 'medium' | 'high';
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
  progress?: number; // 0-100 for ingestion tracking
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
  assetIds?: string[]; // List of assets in this bundle
  timeRange: { earliest: string | null; latest: string | null };
  combinedTokens: number;
  combinedGraph?: GraphData;
  combinedRecord?: HistoricalDocumentMetadata;
  status: AssetStatus;
  isUserDefined?: boolean; // Flag for manually created bundles
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

export interface UserMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  giftAssetId?: string;
  giftBundleId?: string;
  isRead: boolean;
}

export interface Community {
  id: string;
  name: string;
  description: string;
  adminIds: string[];
  memberIds: string[];
  isPrivate: boolean;
  createdAt: string;
  shardDispersionConfig: {
    adminPercentage: number;
    memberPercentage: number;
  };
}

export interface CommunityAdmissionRequest {
  id: string;
  communityId: string;
  userId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  timestamp: string;
}

// ============================================
// GARD (SocialReturnSystem) Types
// ============================================

export interface GARDDataAsset {
  ASSET_ID: string;
  NFT_TOKEN_ID: string;
  SHARD_COUNT: number;
  SHARD_PRICE_BASE: number;
  ROYALTY_RATE: number;
  CONTRIBUTOR_WALLET: string;
  
  // Value attribution scores
  AI_QUALITY_SCORE: number;
  GIS_PRECISION_SCORE: number;
  HISTORICAL_SIGNIFICANCE: number;
  
  // Asset classification
  IS_GENESIS_ASSET: boolean;
  RETAIL_DEMAND_DRIVEN: boolean;
  
  // Timestamps
  TOKENIZED_AT: string;
  LAST_TRADED_AT?: string;
}

export interface RoyaltyTransaction {
  id: string;
  assetId: string;
  tokenId: string;
  transactionType: 'SALE' | 'LICENSE' | 'GIFT';
  salePrice: number;
  royaltyAmount: number;
  
  // Distribution breakdown
  communityShare: number;
  holderShare: number;
  maintenanceShare: number;
  
  // Participants
  sellerWallet: string;
  buyerWallet: string;
  
  // Blockchain reference
  txHash?: string;
  blockNumber?: number;
  chainId: number;
  
  timestamp: string;
}

export interface ShardHolding {
  id: string;
  userId: string;
  assetId: string;
  tokenId: string;
  shardCount: number;
  acquisitionPrice: number;
  acquisitionDate: string;
  
  // Derived values
  currentValue: number;
  unrealizedGain: number;
}

export interface CommunityFund {
  id: string;
  communityId?: string;
  balance: number;
  lastDepositAt?: string;
  lastWithdrawalAt?: string;
  totalContributed: number;
  totalWithdrawn: number;
}

export interface SocialReturnProject {
  id: string;
  title: string;
  description: string;
  requestedAmount: number;
  approvedAmount?: number;
  status: 'PROPOSED' | 'VOTING' | 'APPROVED' | 'FUNDED' | 'COMPLETED' | 'REJECTED';
  
  // Voting
  votesFor: number;
  votesAgainst: number;
  votingDeadline?: string;
  
  // References
  proposerId: string;
  communityId?: string;
  
  // Timestamps
  createdAt: string;
  fundedAt?: string;
  completedAt?: string;
}

export interface GovernanceVote {
  id: string;
  projectId: string;
  voterId: string;
  voteWeight: number;
  voteDirection: boolean; // true = for, false = against
  votedAt: string;
}

export interface RoyaltyDistribution {
  communityFund: number;
  shardHolderRewards: number;
  systemMaintenance: number;
}

export interface GARDSystemStats {
  totalRoyaltiesGenerated: number;
  communityFundBalance: number;
  holderRewardsPool: number;
  pendingUserRewards: number;
  transactionCount: number;
  activeShardHolders: number;
  selfSustainabilityRatio: number;
  totalAssetsTokenized: number;
}

// GARD Configuration Constants
export const GARD_CONFIG = {
  ROYALTY_RATE: 0.10,           // 10%
  LTV_RATIO: 0.70,              // 70% DeFi loan-to-value
  COMMUNITY_ALLOCATION: 0.50,   // 50%
  HOLDER_ALLOCATION: 0.30,      // 30%
  MAINTENANCE_ALLOCATION: 0.20, // 20%
  SHARDS_PER_ASSET: 1000,
  GENESIS_MULTIPLIER: 1.5,
  POLYGON_CHAIN_ID: 137,
} as const;

// ============================================
// Avatar & Metaverse Types
// ============================================

export interface AvatarBadge {
  id: string;
  name: string;
  description: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
  earnedAt: string;
  category: 'CONTRIBUTION' | 'EXPLORATION' | 'COLLABORATION' | 'GOVERNANCE';
}

export interface UserAvatar {
  id: string;
  userId: string;
  displayName: string;
  avatarModel: string;
  avatarColor: string;
  lastPosition: [number, number, number];
  lastRotation: [number, number, number, number];
  lastSector: string;
  contributionLevel: number;
  totalNodesCreated: number;
  totalShardsEarned: number;
  explorationPoints: number;
  badges: AvatarBadge[];
  lastSeen: string;
}

export interface PresenceSession {
  userId: string;
  sessionId: string;
  sector: string;
  position: [number, number, number];
  status: 'ACTIVE' | 'IDLE' | 'AWAY';
  displayName?: string;
  avatarColor?: string;
}

export interface WorldSector {
  id: string;
  sectorCode: string;
  center: [number, number, number];
  radius: number;
  aestheticTheme: AestheticTheme;
  zoneType: WorldZoneType;
  nodeCount: number;
  assetCount: number;
}

export type WorldZoneType = 
  | 'URBAN_CORE'
  | 'KNOWLEDGE_DISTRICT'
  | 'DATA_SUBURBS'
  | 'FRONTIER_ZONE'
  | 'ARCHIVE_RUINS'
  | 'INSTITUTIONAL_HQ'
  | 'MARKETPLACE'
  | 'COMMUNITY_PLAZA';

export type AestheticTheme =
  | 'VICTORIAN_LIBRARY'
  | 'BRUTALIST_ARCHIVE'
  | 'DIGITAL_NEON'
  | 'ORGANIC_GROWTH'
  | 'INDUSTRIAL_HERITAGE'
  | 'ACADEMIC_QUADRANGLE'
  | 'SACRED_GEOMETRY'
  | 'CYBERPUNK_FRONTIER';

export interface ArchivePartnership {
  id: string;
  partnerName: string;
  partnerType: 'LIBRARY' | 'MUSEUM' | 'UNIVERSITY' | 'GOVERNMENT' | 'PRIVATE';
  aestheticTheme: AestheticTheme;
  districtSectorCode?: string;
  assetCount: number;
  signedAt: string;
  isActive: boolean;
  logoUrl?: string;
  description?: string;
  websiteUrl?: string;
}

// Metaverse Configuration
export const METAVERSE_CONFIG = {
  // Spatial settings
  DEFAULT_SECTOR: 'ORIGIN',
  SECTOR_RADIUS: 100,
  MAX_RENDER_DISTANCE: 500,
  
  // Presence settings
  HEARTBEAT_INTERVAL_MS: 30000,
  IDLE_TIMEOUT_MS: 120000,
  PRESENCE_EXPIRY_MS: 300000,
  
  // Progression
  EXPLORATION_POINTS_PER_SECTOR: 10,
  CONTRIBUTION_XP_PER_NODE: 1,
  LEVEL_SCALING_BASE: 2,
} as const;