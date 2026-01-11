/**
 * Cluster Synchronizer - Curator Tool
 * 
 * LLM-powered tool for synchronizing and structuring filter dimension values
 * across the 6 thematic clusters. Enables corpus improvement through:
 * - Structured classification of raw/derived dimension values
 * - Learning correlations between unstructured and structured values
 * - Proxy classification for new data based on accumulated mappings
 * 
 * Designed for Digital Transformation Public Historians to maintain
 * scholarly rigor while enabling creative discovery.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Tag,
  Network,
  ShieldCheck,
  Search,
  Play,
  Pause,
  SkipForward,
  Save,
  Download,
  Upload,
  Brain,
  Layers,
  Filter,
  Database,
  ArrowRight,
  CheckCircle,
  XCircle,
  Info,
  Settings,
  Zap,
  BarChart2,
  GitMerge,
  BookOpen,
  History,
} from 'lucide-react';
import { useModuleContext } from '../contexts/ModuleContext';
import { useFilterContext, FilterDimension } from '../contexts/FilterContext';
import { DigitalAsset, HistoricalDocumentMetadata } from '../types';

// ============================================
// Types
// ============================================

export type ClusterType = 
  | 'TEMPORAL' 
  | 'SPATIAL' 
  | 'CONTENT' 
  | 'KNOWLEDGE_GRAPH' 
  | 'PROVENANCE' 
  | 'DISCOVERY';

export interface StructuredClusterValue {
  [key: string]: string | string[] | number | boolean;
  derivedFromFields: string[];
  confidence: number;
}

export interface StructuredTemporal extends StructuredClusterValue {
  era: string;
  historicalPeriod: string[];
  documentAge: string;
}

export interface StructuredSpatial extends StructuredClusterValue {
  zone: string;
  geographicScale: string;
  placeType: string;
}

export interface StructuredContent extends StructuredClusterValue {
  category: string;
  scanType: string;
  mediaType: string;
  subjectMatter: string;
}

export interface StructuredKnowledgeGraph extends StructuredClusterValue {
  nodeType: string;
  connectionDensity: string;
  narrativeRole: string;
  graphNodeCount: number;
  graphEdgeCount: number;
}

export interface StructuredProvenance extends StructuredClusterValue {
  license: string;
  confidence: number;
  verificationLevel: string;
  contested: boolean;
}

export interface StructuredDiscovery extends StructuredClusterValue {
  source: string;
  status: string;
  entityTypes: string[];
  serendipityScore: string;
  researchPotential: string;
}

export interface ClassificationResult {
  assetId: string;
  structuredTemporal: StructuredTemporal | null;
  structuredSpatial: StructuredSpatial | null;
  structuredContent: StructuredContent | null;
  structuredKnowledgeGraph: StructuredKnowledgeGraph | null;
  structuredProvenance: StructuredProvenance | null;
  structuredDiscovery: StructuredDiscovery | null;
  llmUsed: string;
  classificationDate: string;
  classificationVersion: string;
  overallConfidence: number;
}

export interface ClassificationMapping {
  clusterType: ClusterType;
  dimensionName: string;
  rawValue: string;
  structuredValue: string;
  confidence: number;
  mappingType: 'EXACT' | 'SYNONYM' | 'PARENT' | 'CHILD' | 'RELATED' | 'LEARNED';
  occurrenceCount: number;
}

export interface SyncProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  currentAssetId: string | null;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  errors: Array<{ assetId: string; error: string }>;
}

export interface ClusterSynchronizerProps {
  assets: DigitalAsset[];
  selectedAssetIds?: string[];
  onClassificationComplete?: (results: ClassificationResult[]) => void;
  onMappingLearned?: (mapping: ClassificationMapping) => void;
}

// ============================================
// Constants
// ============================================

const CLUSTER_CONFIG: Record<ClusterType, {
  label: string;
  icon: React.ReactNode;
  dimensions: FilterDimension[];
  color: string;
  description: string;
}> = {
  TEMPORAL: {
    label: 'Temporal',
    icon: <Clock size={16} />,
    dimensions: ['era', 'historicalPeriod', 'documentAge'],
    color: 'amber',
    description: 'Time periods, historical eras, and document age classification',
  },
  SPATIAL: {
    label: 'Spatial',
    icon: <MapPin size={16} />,
    dimensions: ['zone', 'geographicScale', 'placeType'],
    color: 'emerald',
    description: 'Geographic zones, scale, and place type categorization',
  },
  CONTENT: {
    label: 'Content',
    icon: <Tag size={16} />,
    dimensions: ['category', 'scanType', 'mediaType', 'subjectMatter'],
    color: 'blue',
    description: 'Document categorization, media types, and subject matter',
  },
  KNOWLEDGE_GRAPH: {
    label: 'Knowledge Graph',
    icon: <Network size={16} />,
    dimensions: ['nodeType', 'connectionDensity', 'narrativeRole'],
    color: 'violet',
    description: 'Graph structure, connectivity, and narrative function',
  },
  PROVENANCE: {
    label: 'Provenance',
    icon: <ShieldCheck size={16} />,
    dimensions: ['license', 'confidence', 'verificationLevel', 'contested'],
    color: 'rose',
    description: 'Licensing, verification, and trust classification',
  },
  DISCOVERY: {
    label: 'Discovery',
    icon: <Search size={16} />,
    dimensions: ['source', 'status', 'entities', 'serendipityScore', 'researchPotential'],
    color: 'cyan',
    description: 'Source, entity extraction, and research potential scoring',
  },
};

const CLASSIFICATION_VERSION = 'v1.0.0';

// ============================================
// Utility Functions
// ============================================

function buildClassificationPrompt(
  asset: DigitalAsset,
  clusterType: ClusterType,
  existingMappings: ClassificationMapping[]
): string {
  const config = CLUSTER_CONFIG[clusterType];
  const sqlRecord = asset.sqlRecord;
  
  // Build context from asset
  const context = {
    ocrText: asset.ocrText?.substring(0, 500) || '',
    category: sqlRecord?.NLP_NODE_CATEGORIZATION || '',
    timestamp: sqlRecord?.OCR_DERIVED_TIMESTAMP || sqlRecord?.LOCAL_TIMESTAMP || '',
    gisZone: sqlRecord?.LOCAL_GIS_ZONE || sqlRecord?.OCR_DERIVED_GIS_ZONE || '',
    scanType: sqlRecord?.SCAN_TYPE || '',
    license: sqlRecord?.DATA_LICENSE || '',
    confidence: sqlRecord?.CONFIDENCE_SCORE || 0,
    nodeCount: sqlRecord?.NODE_COUNT || 0,
    entities: sqlRecord?.ENTITIES_EXTRACTED || [],
    accessRestrictions: sqlRecord?.ACCESS_RESTRICTIONS || false,
    source: sqlRecord?.SOURCE_COLLECTION || '',
  };
  
  // Include learned mappings for consistency
  const relevantMappings = existingMappings
    .filter(m => m.clusterType === clusterType)
    .slice(0, 10)
    .map(m => `${m.rawValue} → ${m.structuredValue} (${m.mappingType}, conf: ${m.confidence.toFixed(2)})`)
    .join('\n');

  const prompts: Record<ClusterType, string> = {
    TEMPORAL: `Analyze this historical document and classify its TEMPORAL dimensions:

Document Context:
- OCR Text Excerpt: "${context.ocrText}"
- Derived Timestamp: ${context.timestamp}
- Current Category: ${context.category}

Required Classifications:
1. era: Decade (e.g., "1920s", "1950s", "Unknown")
2. historicalPeriod: Named periods that apply (e.g., ["Roaring Twenties", "Jazz Age"])
3. documentAge: One of: Contemporary (0-25yr), Modern (25-75yr), Historic (75-150yr), Antique (150+yr), Unknown

Existing Mappings for Consistency:
${relevantMappings || 'None yet'}

Respond with JSON only:
{
  "era": "...",
  "historicalPeriod": ["..."],
  "documentAge": "...",
  "derivedFromFields": ["..."],
  "confidence": 0.0-1.0
}`,

    SPATIAL: `Analyze this historical document and classify its SPATIAL dimensions:

Document Context:
- OCR Text Excerpt: "${context.ocrText}"
- GIS Zone: ${context.gisZone}
- Current Category: ${context.category}

Required Classifications:
1. zone: Geographic zone type (e.g., "Urban Core", "Rural Agricultural", "Suburban Residential")
2. geographicScale: One of: Local, Regional, National, International, Unknown
3. placeType: One of: Urban, Suburban, Rural, Industrial, Commercial, Residential, Sacred, Natural, Unknown

Existing Mappings for Consistency:
${relevantMappings || 'None yet'}

Respond with JSON only:
{
  "zone": "...",
  "geographicScale": "...",
  "placeType": "...",
  "derivedFromFields": ["..."],
  "confidence": 0.0-1.0
}`,

    CONTENT: `Analyze this historical document and classify its CONTENT dimensions:

Document Context:
- OCR Text Excerpt: "${context.ocrText}"
- Current Category: ${context.category}
- Scan Type: ${context.scanType}

Required Classifications:
1. category: Document category (e.g., "Commercial Document", "Personal Correspondence", "Official Record")
2. scanType: One of: DOCUMENT, ITEM, SCENERY
3. mediaType: Format type (e.g., "Photograph", "Letter", "Map", "Newspaper", "Receipt", "Postcard", "Ephemera")
4. subjectMatter: Primary focus (e.g., "People", "Places", "Events", "Commerce", "Religion", "Government")

Existing Mappings for Consistency:
${relevantMappings || 'None yet'}

Respond with JSON only:
{
  "category": "...",
  "scanType": "...",
  "mediaType": "...",
  "subjectMatter": "...",
  "derivedFromFields": ["..."],
  "confidence": 0.0-1.0
}`,

    KNOWLEDGE_GRAPH: `Analyze this historical document and classify its KNOWLEDGE GRAPH dimensions:

Document Context:
- OCR Text Excerpt: "${context.ocrText}"
- Current Category: ${context.category}
- Node Count: ${context.nodeCount}
- Entities Extracted: ${JSON.stringify(context.entities)}

Required Classifications:
1. nodeType: Primary graph node type (DOCUMENT, PERSON, LOCATION, ORGANIZATION, DATE, CONCEPT)
2. connectionDensity: Based on node count - Isolated (0-2), Linked (3-10), Hub (11+)
3. narrativeRole: Story function - Protagonist (person-focused), Setting (place-focused), Evidence (supports claims), Context (background)
4. graphNodeCount: Number from entities
5. graphEdgeCount: Estimated connections

Existing Mappings for Consistency:
${relevantMappings || 'None yet'}

Respond with JSON only:
{
  "nodeType": "...",
  "connectionDensity": "...",
  "narrativeRole": "...",
  "graphNodeCount": 0,
  "graphEdgeCount": 0,
  "derivedFromFields": ["..."],
  "confidence": 0.0-1.0
}`,

    PROVENANCE: `Analyze this historical document and classify its PROVENANCE dimensions:

Document Context:
- License: ${context.license}
- Confidence Score: ${context.confidence}
- Access Restrictions: ${context.accessRestrictions}
- Source Collection: ${context.source}

Required Classifications:
1. license: License type (CC0, GEOGRAPH_CORPUS_1.0, CUSTOM, Unknown)
2. confidence: Numerical score 0.0-1.0
3. verificationLevel: One of: Unverified, Community, Expert, Institutional
4. contested: Boolean - has access restrictions or controversial content

Existing Mappings for Consistency:
${relevantMappings || 'None yet'}

Respond with JSON only:
{
  "license": "...",
  "confidence": 0.0-1.0,
  "verificationLevel": "...",
  "contested": false,
  "derivedFromFields": ["..."],
  "confidence": 0.0-1.0
}`,

    DISCOVERY: `Analyze this historical document and classify its DISCOVERY dimensions:

Document Context:
- OCR Text Excerpt: "${context.ocrText}"
- Source Collection: ${context.source}
- Entities: ${JSON.stringify(context.entities)}
- Node Count: ${context.nodeCount}
- Confidence: ${context.confidence}

Required Classifications:
1. source: Source collection name
2. status: Processing status (PENDING, PROCESSING, MINTED, FAILED)
3. entityTypes: Array of entity types found ["PERSON", "LOCATION", "DATE", etc.]
4. serendipityScore: Surprise potential - low, medium, high (based on rare entities, cross-domain connections)
5. researchPotential: Scholarly value - low, medium, high (based on entity richness, connectivity)

Existing Mappings for Consistency:
${relevantMappings || 'None yet'}

Respond with JSON only:
{
  "source": "...",
  "status": "...",
  "entityTypes": ["..."],
  "serendipityScore": "...",
  "researchPotential": "...",
  "derivedFromFields": ["..."],
  "confidence": 0.0-1.0
}`,
  };

  return prompts[clusterType];
}

function parseClassificationResponse(
  response: string,
  clusterType: ClusterType
): StructuredClusterValue | null {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate required fields based on cluster type
    const requiredFields: Record<ClusterType, string[]> = {
      TEMPORAL: ['era', 'historicalPeriod', 'documentAge'],
      SPATIAL: ['zone', 'geographicScale', 'placeType'],
      CONTENT: ['category', 'scanType', 'mediaType', 'subjectMatter'],
      KNOWLEDGE_GRAPH: ['nodeType', 'connectionDensity', 'narrativeRole'],
      PROVENANCE: ['license', 'verificationLevel', 'contested'],
      DISCOVERY: ['source', 'status', 'entityTypes', 'serendipityScore', 'researchPotential'],
    };
    
    const required = requiredFields[clusterType];
    for (const field of required) {
      if (!(field in parsed)) {
        console.warn(`Missing required field: ${field}`);
        return null;
      }
    }
    
    // Ensure derivedFromFields and confidence exist
    if (!parsed.derivedFromFields) parsed.derivedFromFields = [];
    if (!parsed.confidence || typeof parsed.confidence !== 'number') {
      parsed.confidence = 0.5;
    }
    
    return parsed as StructuredClusterValue;
  } catch (e) {
    console.error('Failed to parse classification response:', e);
    return null;
  }
}

// ============================================
// Sub-Components
// ============================================

interface ClusterCardProps {
  clusterType: ClusterType;
  isExpanded: boolean;
  onToggle: () => void;
  structuredValue: StructuredClusterValue | null;
  isProcessing: boolean;
  onClassify: () => void;
}

function ClusterCard({
  clusterType,
  isExpanded,
  onToggle,
  structuredValue,
  isProcessing,
  onClassify,
}: ClusterCardProps) {
  const config = CLUSTER_CONFIG[clusterType];
  const hasValue = structuredValue !== null;
  
  return (
    <div className={`
      rounded-lg border transition-all duration-200
      ${hasValue 
        ? `border-${config.color}-500/30 bg-${config.color}-500/5` 
        : 'border-slate-700/50 bg-slate-800/30'
      }
    `}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`text-${config.color}-400`}>{config.icon}</span>
          <span className="font-medium text-slate-200">{config.label}</span>
          {hasValue && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400">
              Classified
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {structuredValue && (
            <span className="text-xs text-slate-400">
              {Math.round((structuredValue.confidence || 0) * 100)}% conf
            </span>
          )}
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>
      
      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-xs text-slate-400">{config.description}</p>
          
          {/* Dimensions */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-300">Dimensions:</div>
            <div className="flex flex-wrap gap-1">
              {config.dimensions.map(dim => (
                <span
                  key={dim}
                  className={`
                    px-2 py-0.5 rounded text-xs
                    ${structuredValue && (structuredValue as any)[dim] !== undefined
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-slate-700/50 text-slate-400'
                    }
                  `}
                >
                  {dim}
                </span>
              ))}
            </div>
          </div>
          
          {/* Classified Values */}
          {structuredValue && (
            <div className="space-y-2 p-2 rounded bg-slate-800/50">
              <div className="text-xs font-medium text-slate-300">Structured Values:</div>
              <div className="grid gap-1 text-xs">
                {Object.entries(structuredValue)
                  .filter(([key]) => !['derivedFromFields', 'confidence'].includes(key))
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-slate-400">{key}:</span>
                      <span className="text-slate-200">
                        {Array.isArray(value) ? value.join(', ') : String(value)}
                      </span>
                    </div>
                  ))
                }
              </div>
              <div className="mt-2 pt-2 border-t border-slate-700/50 text-xs text-slate-500">
                Derived from: {structuredValue.derivedFromFields?.join(', ') || 'N/A'}
              </div>
            </div>
          )}
          
          {/* Action Button */}
          <button
            onClick={onClassify}
            disabled={isProcessing}
            className={`
              w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm
              transition-all duration-200
              ${isProcessing
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : `bg-${config.color}-500/20 text-${config.color}-400 hover:bg-${config.color}-500/30`
              }
            `}
          >
            {isProcessing ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Classifying...
              </>
            ) : (
              <>
                <Brain size={14} />
                {hasValue ? 'Re-classify' : 'Classify with LLM'}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

interface ProgressBarProps {
  progress: SyncProgress;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
}

function SyncProgressBar({ progress, onPause, onResume, onSkip }: ProgressBarProps) {
  const percentage = progress.total > 0 
    ? Math.round((progress.processed / progress.total) * 100) 
    : 0;
  
  return (
    <div className="space-y-2">
      {/* Progress Bar */}
      <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      {/* Stats */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-slate-400">
            {progress.processed} / {progress.total}
          </span>
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle size={12} />
            {progress.succeeded}
          </span>
          {progress.failed > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <XCircle size={12} />
              {progress.failed}
            </span>
          )}
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-1">
          {progress.status === 'running' ? (
            <button
              onClick={onPause}
              className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white"
              title="Pause"
            >
              <Pause size={14} />
            </button>
          ) : progress.status === 'paused' ? (
            <button
              onClick={onResume}
              className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white"
              title="Resume"
            >
              <Play size={14} />
            </button>
          ) : null}
          
          {(progress.status === 'running' || progress.status === 'paused') && (
            <button
              onClick={onSkip}
              className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white"
              title="Skip Current"
            >
              <SkipForward size={14} />
            </button>
          )}
        </div>
      </div>
      
      {/* Current Asset */}
      {progress.currentAssetId && (
        <div className="text-xs text-slate-500 truncate">
          Processing: {progress.currentAssetId}
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function ClusterSynchronizer({
  assets,
  selectedAssetIds,
  onClassificationComplete,
  onMappingLearned,
}: ClusterSynchronizerProps) {
  const { activeLLM } = useModuleContext();
  const { filteredAssets } = useFilterContext();
  
  // State
  const [expandedClusters, setExpandedClusters] = useState<Set<ClusterType>>(new Set(['TEMPORAL']));
  const [selectedAsset, setSelectedAsset] = useState<DigitalAsset | null>(null);
  const [classificationResults, setClassificationResults] = useState<Map<string, ClassificationResult>>(new Map());
  const [processingCluster, setProcessingCluster] = useState<ClusterType | null>(null);
  const [learnedMappings, setLearnedMappings] = useState<ClassificationMapping[]>([]);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    currentAssetId: null,
    status: 'idle',
    errors: [],
  });
  const [filterMode, setFilterMode] = useState<'all' | 'unclassified' | 'classified'>('all');
  const [showSimilarityMatching, setShowSimilarityMatching] = useState(true);
  
  // Computed
  const targetAssets = useMemo(() => {
    let targets = selectedAssetIds?.length 
      ? assets.filter(a => selectedAssetIds.includes(a.id))
      : assets;
    
    if (filterMode === 'unclassified') {
      targets = targets.filter(a => !classificationResults.has(a.id));
    } else if (filterMode === 'classified') {
      targets = targets.filter(a => classificationResults.has(a.id));
    }
    
    return targets;
  }, [assets, selectedAssetIds, filterMode, classificationResults]);

  const llmDisplayName = activeLLM?.displayName || 'No LLM Selected';
  const llmAvailable = !!activeLLM;

  // Toggle cluster expansion
  const toggleCluster = useCallback((cluster: ClusterType) => {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(cluster)) {
        next.delete(cluster);
      } else {
        next.add(cluster);
      }
      return next;
    });
  }, []);

  // Classify single cluster for selected asset
  const classifyCluster = useCallback(async (clusterType: ClusterType) => {
    if (!selectedAsset || !activeLLM) return;
    
    setProcessingCluster(clusterType);
    
    try {
      const prompt = buildClassificationPrompt(selectedAsset, clusterType, learnedMappings);
      
      // Use extractMetadata with custom options to send classification prompt
      const result = await activeLLM.extractMetadata(
        new Blob([prompt], { type: 'text/plain' }),
        { 
          scanType: 'DOCUMENT',
          customPrompt: prompt,
        } as any
      );
      
      // Parse the analysis field which contains the LLM response
      const structuredValue = parseClassificationResponse(
        result.rawAnalysis || JSON.stringify(result),
        clusterType
      );
      
      if (structuredValue) {
        // Update classification result
        setClassificationResults(prev => {
          const existing = prev.get(selectedAsset.id) || {
            assetId: selectedAsset.id,
            structuredTemporal: null,
            structuredSpatial: null,
            structuredContent: null,
            structuredKnowledgeGraph: null,
            structuredProvenance: null,
            structuredDiscovery: null,
            llmUsed: activeLLM.name,
            classificationDate: new Date().toISOString(),
            classificationVersion: CLASSIFICATION_VERSION,
            overallConfidence: 0,
          };
          
          const clusterKey = `structured${clusterType.charAt(0) + clusterType.slice(1).toLowerCase().replace(/_/g, '')}` as keyof ClassificationResult;
          const updated = {
            ...existing,
            [clusterKey]: structuredValue,
            llmUsed: activeLLM.name,
            classificationDate: new Date().toISOString(),
          };
          
          // Recalculate overall confidence
          const confidences = [
            updated.structuredTemporal?.confidence,
            updated.structuredSpatial?.confidence,
            updated.structuredContent?.confidence,
            updated.structuredKnowledgeGraph?.confidence,
            updated.structuredProvenance?.confidence,
            updated.structuredDiscovery?.confidence,
          ].filter(c => c !== undefined && c !== null) as number[];
          
          updated.overallConfidence = confidences.length > 0
            ? confidences.reduce((a, b) => a + b, 0) / confidences.length
            : 0;
          
          const next = new Map(prev);
          next.set(selectedAsset.id, updated);
          return next;
        });
        
        // Learn mappings from this classification
        const config = CLUSTER_CONFIG[clusterType];
        for (const dim of config.dimensions) {
          const rawValue = getRawValueForDimension(selectedAsset, dim);
          const structuredVal = (structuredValue as any)[dim];
          
          if (rawValue && structuredVal) {
            const mapping: ClassificationMapping = {
              clusterType,
              dimensionName: dim,
              rawValue: String(rawValue),
              structuredValue: Array.isArray(structuredVal) ? structuredVal[0] : String(structuredVal),
              confidence: structuredValue.confidence,
              mappingType: 'LEARNED',
              occurrenceCount: 1,
            };
            
            setLearnedMappings(prev => [...prev, mapping]);
            onMappingLearned?.(mapping);
          }
        }
      }
    } catch (error) {
      console.error(`Classification failed for cluster ${clusterType}:`, error);
    } finally {
      setProcessingCluster(null);
    }
  }, [selectedAsset, activeLLM, learnedMappings, onMappingLearned]);

  // Get raw value for a dimension from asset
  function getRawValueForDimension(asset: DigitalAsset, dimension: FilterDimension): string | null {
    const record = asset.sqlRecord;
    if (!record) return null;
    
    const dimensionToField: Record<string, keyof HistoricalDocumentMetadata | string> = {
      era: 'OCR_DERIVED_TIMESTAMP',
      zone: 'LOCAL_GIS_ZONE',
      category: 'NLP_NODE_CATEGORIZATION',
      scanType: 'SCAN_TYPE',
      license: 'DATA_LICENSE',
      source: 'SOURCE_COLLECTION',
      status: 'PROCESSING_STATUS',
      confidence: 'CONFIDENCE_SCORE',
    };
    
    const field = dimensionToField[dimension];
    if (field && record[field as keyof HistoricalDocumentMetadata]) {
      return String(record[field as keyof HistoricalDocumentMetadata]);
    }
    
    return null;
  }

  // Classify all clusters for selected asset
  const classifyAllClusters = useCallback(async () => {
    if (!selectedAsset || !activeLLM) return;
    
    const clusters: ClusterType[] = ['TEMPORAL', 'SPATIAL', 'CONTENT', 'KNOWLEDGE_GRAPH', 'PROVENANCE', 'DISCOVERY'];
    
    for (const cluster of clusters) {
      await classifyCluster(cluster);
    }
  }, [selectedAsset, activeLLM, classifyCluster]);

  // Bulk sync all assets
  const startBulkSync = useCallback(async () => {
    if (!activeLLM || targetAssets.length === 0) return;
    
    setSyncProgress({
      total: targetAssets.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      currentAssetId: null,
      status: 'running',
      errors: [],
    });
    
    const clusters: ClusterType[] = ['TEMPORAL', 'SPATIAL', 'CONTENT', 'KNOWLEDGE_GRAPH', 'PROVENANCE', 'DISCOVERY'];
    
    for (let i = 0; i < targetAssets.length; i++) {
      // Check if paused
      if (syncProgress.status === 'paused') {
        await new Promise<void>(resolve => {
          const checkResume = setInterval(() => {
            if (syncProgress.status !== 'paused') {
              clearInterval(checkResume);
              resolve();
            }
          }, 100);
        });
      }
      
      const asset = targetAssets[i];
      setSyncProgress(prev => ({ ...prev, currentAssetId: asset.id }));
      
      try {
        // Temporarily set selected asset for classification
        setSelectedAsset(asset);
        
        for (const cluster of clusters) {
          await classifyCluster(cluster);
        }
        
        setSyncProgress(prev => ({
          ...prev,
          processed: prev.processed + 1,
          succeeded: prev.succeeded + 1,
        }));
      } catch (error) {
        setSyncProgress(prev => ({
          ...prev,
          processed: prev.processed + 1,
          failed: prev.failed + 1,
          errors: [...prev.errors, { assetId: asset.id, error: String(error) }],
        }));
      }
    }
    
    setSyncProgress(prev => ({ ...prev, status: 'completed', currentAssetId: null }));
    
    // Notify completion
    const results = Array.from(classificationResults.values());
    onClassificationComplete?.(results);
  }, [activeLLM, targetAssets, classifyCluster, classificationResults, onClassificationComplete, syncProgress.status]);

  // Export results
  const exportResults = useCallback(() => {
    const data = {
      version: CLASSIFICATION_VERSION,
      exportDate: new Date().toISOString(),
      llmUsed: activeLLM?.name,
      results: Array.from(classificationResults.values()),
      learnedMappings,
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cluster-classifications-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [classificationResults, learnedMappings, activeLLM]);

  // Get current result for selected asset
  const currentResult = selectedAsset ? classificationResults.get(selectedAsset.id) : null;

  return (
    <div className="flex flex-col h-full bg-slate-900/50 rounded-xl border border-slate-700/50">
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GitMerge className="text-primary-400" size={20} />
            <h2 className="text-lg font-semibold text-white">Cluster Synchronizer</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className={`
              px-2 py-1 rounded text-xs flex items-center gap-1
              ${llmAvailable ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}
            `}>
              <Brain size={12} />
              {llmDisplayName}
            </span>
          </div>
        </div>
        
        <p className="text-sm text-slate-400">
          Synchronize dimension values across thematic clusters using LLM classification.
          Structured values improve corpus consistency and enable similarity-based proxy classification.
        </p>
      </div>
      
      {/* Toolbar */}
      <div className="p-3 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Filter Mode */}
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as any)}
            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm text-slate-300"
          >
            <option value="all">All Assets ({assets.length})</option>
            <option value="unclassified">Unclassified ({assets.length - classificationResults.size})</option>
            <option value="classified">Classified ({classificationResults.size})</option>
          </select>
          
          {/* Similarity Matching Toggle */}
          <button
            onClick={() => setShowSimilarityMatching(!showSimilarityMatching)}
            className={`
              flex items-center gap-1 px-2 py-1 rounded text-xs
              ${showSimilarityMatching 
                ? 'bg-cyan-500/20 text-cyan-400' 
                : 'bg-slate-700/50 text-slate-400'
              }
            `}
            title="Use learned mappings for proxy classification"
          >
            <Zap size={12} />
            Similarity Matching
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={exportResults}
            disabled={classificationResults.size === 0}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-slate-700/50 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          >
            <Download size={12} />
            Export
          </button>
          
          <button
            onClick={startBulkSync}
            disabled={!llmAvailable || syncProgress.status === 'running'}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50"
          >
            {syncProgress.status === 'running' ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Sync All ({targetAssets.length})
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Progress Bar (when syncing) */}
      {syncProgress.status !== 'idle' && (
        <div className="p-3 border-b border-slate-700/50">
          <SyncProgressBar
            progress={syncProgress}
            onPause={() => setSyncProgress(prev => ({ ...prev, status: 'paused' }))}
            onResume={() => setSyncProgress(prev => ({ ...prev, status: 'running' }))}
            onSkip={() => setSyncProgress(prev => ({ ...prev, processed: prev.processed + 1 }))}
          />
        </div>
      )}
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Asset List */}
        <div className="w-64 border-r border-slate-700/50 overflow-y-auto">
          <div className="p-2">
            <div className="text-xs font-medium text-slate-400 px-2 py-1">
              Select Asset ({targetAssets.length})
            </div>
            <div className="space-y-1">
              {targetAssets.slice(0, 50).map(asset => {
                const hasClassification = classificationResults.has(asset.id);
                const isSelected = selectedAsset?.id === asset.id;
                
                return (
                  <button
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className={`
                      w-full text-left p-2 rounded text-sm transition-colors
                      ${isSelected 
                        ? 'bg-primary-600/20 border border-primary-500/30' 
                        : 'hover:bg-slate-800/50'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300 truncate flex-1">
                        {asset.sqlRecord?.DOCUMENT_TITLE || asset.id.slice(0, 12)}
                      </span>
                      {hasClassification && (
                        <CheckCircle size={12} className="text-emerald-400 flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">
                      {asset.sqlRecord?.NLP_NODE_CATEGORIZATION || 'Uncategorized'}
                    </div>
                  </button>
                );
              })}
              {targetAssets.length > 50 && (
                <div className="text-xs text-slate-500 text-center py-2">
                  +{targetAssets.length - 50} more
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Classification Panel */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedAsset ? (
            <div className="space-y-4">
              {/* Asset Info */}
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-slate-200">
                    {selectedAsset.sqlRecord?.DOCUMENT_TITLE || 'Untitled Asset'}
                  </h3>
                  <button
                    onClick={classifyAllClusters}
                    disabled={!llmAvailable || processingCluster !== null}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary-600/20 text-primary-400 hover:bg-primary-600/30 disabled:opacity-50"
                  >
                    <Sparkles size={12} />
                    Classify All
                  </button>
                </div>
                <div className="text-xs text-slate-400 space-y-1">
                  <div>ID: {selectedAsset.id}</div>
                  <div>Category: {selectedAsset.sqlRecord?.NLP_NODE_CATEGORIZATION || 'N/A'}</div>
                  <div>Era: {selectedAsset.sqlRecord?.OCR_DERIVED_TIMESTAMP || 'Unknown'}</div>
                </div>
                
                {currentResult && (
                  <div className="mt-2 pt-2 border-t border-slate-700/50 text-xs">
                    <div className="flex items-center gap-2 text-slate-400">
                      <History size={12} />
                      <span>Classified by {currentResult.llmUsed}</span>
                      <span>•</span>
                      <span>{new Date(currentResult.classificationDate).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{Math.round(currentResult.overallConfidence * 100)}% overall confidence</span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Cluster Cards */}
              <div className="grid gap-3">
                {(Object.keys(CLUSTER_CONFIG) as ClusterType[]).map(clusterType => {
                  const clusterKey = `structured${clusterType.charAt(0) + clusterType.slice(1).toLowerCase().replace(/_/g, '')}` as keyof ClassificationResult;
                  const structuredValue = currentResult?.[clusterKey] as StructuredClusterValue | null;
                  
                  return (
                    <ClusterCard
                      key={clusterType}
                      clusterType={clusterType}
                      isExpanded={expandedClusters.has(clusterType)}
                      onToggle={() => toggleCluster(clusterType)}
                      structuredValue={structuredValue}
                      isProcessing={processingCluster === clusterType}
                      onClassify={() => classifyCluster(clusterType)}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <Database size={48} className="mb-4 opacity-50" />
              <p>Select an asset to classify</p>
              <p className="text-sm mt-1">Or use "Sync All" to batch process</p>
            </div>
          )}
        </div>
        
        {/* Mappings Panel */}
        {showSimilarityMatching && learnedMappings.length > 0 && (
          <div className="w-72 border-l border-slate-700/50 overflow-y-auto p-3">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={14} className="text-cyan-400" />
              <h4 className="text-sm font-medium text-slate-200">Learned Mappings</h4>
              <span className="text-xs text-slate-500">({learnedMappings.length})</span>
            </div>
            
            <div className="space-y-2">
              {learnedMappings.slice(-20).reverse().map((mapping, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-slate-800/50 text-xs"
                >
                  <div className="flex items-center gap-1 text-slate-400 mb-1">
                    <span className={`text-${CLUSTER_CONFIG[mapping.clusterType].color}-400`}>
                      {CLUSTER_CONFIG[mapping.clusterType].icon}
                    </span>
                    <span>{mapping.dimensionName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500 truncate">{mapping.rawValue}</span>
                    <ArrowRight size={10} className="text-slate-600 flex-shrink-0" />
                    <span className="text-emerald-400 truncate">{mapping.structuredValue}</span>
                  </div>
                  <div className="text-slate-600 mt-1">
                    {Math.round(mapping.confidence * 100)}% • {mapping.mappingType}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ClusterSynchronizer;
