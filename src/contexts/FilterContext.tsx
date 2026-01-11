/**
 * Unified Filter Context
 * 
 * Provides dynamic, interdependent filtering across Knowledge Graph, 3D World,
 * Structure DB, and Curator Mode views. Implements a dependency graph for
 * qualitative modeling of complex quantitative structures.
 * 
 * Designed by Digital Transformation Public Historians to enable:
 * - Serendipitous discovery through creative associations
 * - Scholarly rigor with provenance guardrails
 * - Narrative exploration across temporal and spatial dimensions
 * - Contextual relationship preservation
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { DigitalAsset, GraphNode, GraphData } from '../types';

// ============================================
// Filter Dimension Types
// ============================================

export type FilterDimension = 
  // === TEMPORAL DIMENSIONS ===
  | 'era'              // Decade-level time period (1920s, 1930s, etc.)
  | 'historicalPeriod' // Named historical periods (Victorian, Gilded Age, etc.)
  | 'documentAge'      // Age classification (Contemporary, Modern, Historic, Antique)
  
  // === SPATIAL DIMENSIONS ===
  | 'zone'             // GIS zone classification
  | 'geographicScale'  // Local, Regional, National, International
  | 'placeType'        // Urban, Suburban, Rural, Industrial, Sacred
  
  // === CONTENT CLASSIFICATION ===
  | 'category'         // NLP categorization
  | 'scanType'         // Document/Item/Scenery
  | 'mediaType'        // Photograph, Map, Letter, Newspaper, Ephemera
  | 'subjectMatter'    // People, Places, Events, Objects, Ideas
  
  // === KNOWLEDGE GRAPH ===
  | 'nodeType'         // Graph node type (PERSON, LOCATION, etc.)
  | 'connectionDensity'// How connected the asset is (Isolated, Linked, Hub)
  | 'narrativeRole'    // Protagonist, Setting, Evidence, Context
  
  // === PROVENANCE & TRUST ===
  | 'license'          // Data license type
  | 'confidence'       // Confidence score threshold
  | 'verificationLevel'// Unverified, Community, Expert, Institutional
  | 'contested'        // Contested/restricted items
  
  // === DISCOVERY MODES ===
  | 'source'           // Source collection
  | 'status'           // Processing status
  | 'entities'         // Entity types
  | 'relevance'        // Relevance score threshold
  | 'serendipityScore' // Likelihood of surprising connections
  | 'researchPotential'// Potential for new discoveries
  
  // === CLASSIFICATION STATUS ===
  | 'classificationStatus' // Structured vs unstructured classification state

export type ViewMode = 'graph' | 'world' | 'database' | 'curator';

export interface FilterValue {
  dimension: FilterDimension;
  value: string | number | boolean | string[];
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
}

export interface FilterDependency {
  source: FilterDimension;
  target: FilterDimension;
  type: 'constrains' | 'suggests' | 'excludes' | 'requires';
  weight: number; // 0-1, strength of dependency
  transformer?: (sourceValue: any, assets: DigitalAsset[]) => any[];
}

export interface DimensionMetadata {
  dimension: FilterDimension;
  label: string;
  description: string;
  dataType: 'string' | 'number' | 'boolean' | 'array';
  availableValues: any[];
  filteredValues: any[];
  isActive: boolean;
  dependsOn: FilterDimension[];
  affects: FilterDimension[];
}

export interface FilterState {
  // Active filters per dimension
  activeFilters: Map<FilterDimension, FilterValue>;
  
  // Dimension metadata with available/filtered values
  dimensions: Map<FilterDimension, DimensionMetadata>;
  
  // Cross-view sync settings
  syncedViews: Set<ViewMode>;
  
  // View-specific overrides
  viewOverrides: Map<ViewMode, Map<FilterDimension, FilterValue>>;
}

export interface FilterAnalytics {
  totalAssets: number;
  filteredAssets: number;
  filterEfficiency: number; // 0-1, how much the filter reduces
  dimensionImpact: Map<FilterDimension, number>; // Impact per dimension
  suggestedFilters: FilterValue[];
}

// ============================================
// Filter Dependencies Definition
// Enhanced with historian-informed relationships
// ============================================

const FILTER_DEPENDENCIES: FilterDependency[] = [
  // === TEMPORAL CASCADES ===
  // Era strongly determines historical period naming
  { source: 'era', target: 'historicalPeriod', type: 'constrains', weight: 0.95 },
  // Historical period suggests likely subject matter
  { source: 'historicalPeriod', target: 'subjectMatter', type: 'suggests', weight: 0.7 },
  // Document age affects confidence (older = potentially lower OCR quality)
  { source: 'documentAge', target: 'confidence', type: 'suggests', weight: 0.6 },
  // Era suggests likely media types (daguerreotypes vs digital photos)
  { source: 'era', target: 'mediaType', type: 'suggests', weight: 0.75 },
  
  // === SPATIAL RELATIONSHIPS ===
  // Zone constrains place type (urban zones have urban places)
  { source: 'zone', target: 'placeType', type: 'constrains', weight: 0.85 },
  // Geographic scale affects subject matter scope
  { source: 'geographicScale', target: 'subjectMatter', type: 'suggests', weight: 0.5 },
  // Place type influences category of documents found there
  { source: 'placeType', target: 'category', type: 'suggests', weight: 0.65 },
  
  // === CONTENT CLASSIFICATION CHAINS ===
  // Category constrains entities (certain categories have specific entity types)
  { source: 'category', target: 'entities', type: 'constrains', weight: 0.8 },
  // Scan type determines available entity types
  { source: 'scanType', target: 'entities', type: 'constrains', weight: 0.9 },
  // Media type suggests likely narrative role
  { source: 'mediaType', target: 'narrativeRole', type: 'suggests', weight: 0.55 },
  // Subject matter influences node types in graph
  { source: 'subjectMatter', target: 'nodeType', type: 'suggests', weight: 0.7 },
  
  // === KNOWLEDGE GRAPH DEPENDENCIES ===
  // Category bi-directionally linked with nodeType for graph coherence
  { source: 'category', target: 'nodeType', type: 'suggests', weight: 0.6 },
  { source: 'nodeType', target: 'category', type: 'suggests', weight: 0.5 },
  // Connection density affects serendipity score (hubs = more surprise)
  { source: 'connectionDensity', target: 'serendipityScore', type: 'suggests', weight: 0.8 },
  // Narrative role influences research potential
  { source: 'narrativeRole', target: 'researchPotential', type: 'suggests', weight: 0.6 },
  
  // === PROVENANCE GUARDRAILS ===
  // License affects nodeType visibility
  { source: 'license', target: 'nodeType', type: 'constrains', weight: 0.5 },
  // Confidence threshold affects relevance display
  { source: 'confidence', target: 'relevance', type: 'constrains', weight: 0.7 },
  // Verification level constrains research potential (higher trust = more reliable research)
  { source: 'verificationLevel', target: 'researchPotential', type: 'constrains', weight: 0.75 },
  // Contested flag affects license interpretation and visibility
  { source: 'contested', target: 'license', type: 'constrains', weight: 0.4 },
  // Contested items have higher serendipity (controversial = interesting)
  { source: 'contested', target: 'serendipityScore', type: 'suggests', weight: 0.5 },
  
  // === DISCOVERY FACILITATORS ===
  // Status filters affect what's visible in curator
  { source: 'status', target: 'category', type: 'constrains', weight: 0.3 },
  // Source collection determines era distribution
  { source: 'source', target: 'era', type: 'suggests', weight: 0.5 },
  // Serendipity inversely affects confidence (surprises may be uncertain)
  { source: 'serendipityScore', target: 'confidence', type: 'suggests', weight: 0.35 },
  // Research potential enhanced by entity richness
  { source: 'entities', target: 'researchPotential', type: 'suggests', weight: 0.65 },
];

// ============================================
// Context Types
// ============================================

interface FilterContextValue {
  // State
  state: FilterState;
  analytics: FilterAnalytics;
  
  // Filtered data
  filteredAssets: DigitalAsset[];
  filteredGraphData: GraphData;
  
  // Actions
  setFilter: (dimension: FilterDimension, value: FilterValue | null) => void;
  setFilters: (filters: Map<FilterDimension, FilterValue>) => void;
  clearFilter: (dimension: FilterDimension) => void;
  clearAllFilters: () => void;
  
  // View management
  toggleViewSync: (view: ViewMode) => void;
  setViewOverride: (view: ViewMode, dimension: FilterDimension, value: FilterValue | null) => void;
  getFiltersForView: (view: ViewMode) => Map<FilterDimension, FilterValue>;
  
  // Dependency analysis
  getDependentDimensions: (dimension: FilterDimension) => FilterDimension[];
  getSuggestedValues: (dimension: FilterDimension) => any[];
  getConstrainedValues: (dimension: FilterDimension) => any[];
  
  // Data binding
  bindAssets: (assets: DigitalAsset[]) => void;
  bindGraphData: (graphData: GraphData) => void;
  
  // Quick filters
  applyQuickFilter: (preset: QuickFilterPreset) => void;
  
  // Utilities
  getActiveFilterCount: () => number;
  exportFilterState: () => string;
  importFilterState: (stateJson: string) => void;
}

export type QuickFilterPreset = 
  // === PROVENANCE & TRUST ===
  | 'public_domain'       // CC0 licensed items - safe for reuse
  | 'high_confidence'     // Confidence > 0.8 - scholarly reliable
  | 'expert_verified'     // Institutional/Expert verification
  | 'community_curated'   // Community-verified materials
  
  // === TEMPORAL EXPLORATION ===
  | 'recent_era'          // 2000s onwards - living memory
  | 'historic_era'        // Pre-1950s - historical distance
  | 'turn_of_century'     // 1890-1920 - industrial transformation
  | 'interwar_period'     // 1918-1939 - between the wars
  | 'postwar_modern'      // 1945-1975 - postwar modernization
  
  // === DISCOVERY MODES ===
  | 'serendipity_high'    // High surprise potential
  | 'research_goldmine'   // High research potential
  | 'hidden_connections'  // Hub nodes with many links
  | 'lonely_artifacts'    // Isolated items needing connections
  
  // === CONTENT FOCUS ===
  | 'documents_only'      // Document scan types
  | 'items_only'          // Item scan types
  | 'people_stories'      // Person-centric narratives
  | 'place_histories'     // Location-focused materials
  | 'ephemera_treasures'  // Tickets, postcards, pamphlets
  
  // === CURATION WORKFLOW ===
  | 'needs_review'        // Low confidence or contested
  | 'graph_ready'         // Assets with graph data
  | 'narrative_anchors'   // Strong protagonist/evidence roles
  | 'context_builders'    // Setting/context materials
  
  // === CLASSIFICATION STATUS ===
  | 'structured_only'     // Only fully structured/classified assets
  | 'unstructured_only'   // Assets needing structured classification
  | 'partially_classified' // Assets with some but not all clusters classified
  
  | 'clear_all';

const QUICK_FILTER_DEFINITIONS: Record<QuickFilterPreset, FilterValue[]> = {
  // === PROVENANCE & TRUST ===
  public_domain: [
    { dimension: 'license', value: 'CC0', operator: 'eq' },
  ],
  high_confidence: [
    { dimension: 'confidence', value: 0.8, operator: 'gte' },
  ],
  expert_verified: [
    { dimension: 'verificationLevel', value: ['Expert', 'Institutional'], operator: 'in' },
  ],
  community_curated: [
    { dimension: 'verificationLevel', value: 'Community', operator: 'eq' },
  ],
  
  // === TEMPORAL EXPLORATION ===
  recent_era: [
    { dimension: 'era', value: ['2000s', '2010s', '2020s'], operator: 'in' },
  ],
  historic_era: [
    { dimension: 'era', value: ['1800s', '1850s', '1900s', '1920s', '1930s', '1940s'], operator: 'in' },
  ],
  turn_of_century: [
    { dimension: 'era', value: ['1890s', '1900s', '1910s', '1920s'], operator: 'in' },
    { dimension: 'historicalPeriod', value: ['Gilded Age', 'Progressive Era', 'Edwardian'], operator: 'in' },
  ],
  interwar_period: [
    { dimension: 'era', value: ['1920s', '1930s'], operator: 'in' },
    { dimension: 'historicalPeriod', value: ['Roaring Twenties', 'Great Depression', 'Art Deco'], operator: 'in' },
  ],
  postwar_modern: [
    { dimension: 'era', value: ['1940s', '1950s', '1960s', '1970s'], operator: 'in' },
    { dimension: 'historicalPeriod', value: ['Postwar', 'Mid-Century Modern', 'Civil Rights Era'], operator: 'in' },
  ],
  
  // === DISCOVERY MODES ===
  serendipity_high: [
    { dimension: 'serendipityScore', value: 'high', operator: 'eq' },
  ],
  research_goldmine: [
    { dimension: 'researchPotential', value: 'high', operator: 'eq' },
    { dimension: 'confidence', value: 0.6, operator: 'gte' },
  ],
  hidden_connections: [
    { dimension: 'connectionDensity', value: 'Hub', operator: 'eq' },
  ],
  lonely_artifacts: [
    { dimension: 'connectionDensity', value: 'Isolated', operator: 'eq' },
    { dimension: 'researchPotential', value: ['medium', 'high'], operator: 'in' },
  ],
  
  // === CONTENT FOCUS ===
  documents_only: [
    { dimension: 'scanType', value: 'DOCUMENT', operator: 'eq' },
  ],
  items_only: [
    { dimension: 'scanType', value: 'ITEM', operator: 'eq' },
  ],
  people_stories: [
    { dimension: 'subjectMatter', value: 'People', operator: 'eq' },
    { dimension: 'nodeType', value: 'PERSON', operator: 'eq' },
  ],
  place_histories: [
    { dimension: 'subjectMatter', value: 'Places', operator: 'eq' },
    { dimension: 'nodeType', value: 'LOCATION', operator: 'eq' },
  ],
  ephemera_treasures: [
    { dimension: 'mediaType', value: ['Ephemera', 'Postcard', 'Ticket', 'Pamphlet', 'Advertisement'], operator: 'in' },
  ],
  
  // === CURATION WORKFLOW ===
  needs_review: [
    { dimension: 'confidence', value: 0.5, operator: 'lt' },
  ],
  graph_ready: [
    { dimension: 'nodeType', value: ['DOCUMENT', 'PERSON', 'LOCATION', 'ORGANIZATION'], operator: 'in' },
  ],
  narrative_anchors: [
    { dimension: 'narrativeRole', value: ['Protagonist', 'Evidence'], operator: 'in' },
    { dimension: 'confidence', value: 0.7, operator: 'gte' },
  ],
  context_builders: [
    { dimension: 'narrativeRole', value: ['Setting', 'Context'], operator: 'in' },
  ],
  
  // === CLASSIFICATION STATUS ===
  structured_only: [
    { dimension: 'classificationStatus', value: 'structured', operator: 'eq' },
  ],
  unstructured_only: [
    { dimension: 'classificationStatus', value: 'unstructured', operator: 'eq' },
  ],
  partially_classified: [
    { dimension: 'classificationStatus', value: 'partial', operator: 'eq' },
  ],
  
  clear_all: [],
};

// ============================================
// Default Values
// ============================================

const createInitialState = (): FilterState => ({
  activeFilters: new Map(),
  dimensions: new Map(),
  syncedViews: new Set(['graph', 'world', 'database', 'curator']),
  viewOverrides: new Map(),
});

const createInitialAnalytics = (): FilterAnalytics => ({
  totalAssets: 0,
  filteredAssets: 0,
  filterEfficiency: 1,
  dimensionImpact: new Map(),
  suggestedFilters: [],
});

// ============================================
// Context Creation
// ============================================

const FilterContext = createContext<FilterContextValue | null>(null);

// ============================================
// Utility Functions
// ============================================

// Historical period mapping based on era
const ERA_TO_HISTORICAL_PERIOD: Record<string, string[]> = {
  '1840s': ['Victorian', 'Antebellum'],
  '1850s': ['Victorian', 'Antebellum'],
  '1860s': ['Victorian', 'Civil War'],
  '1870s': ['Victorian', 'Reconstruction'],
  '1880s': ['Victorian', 'Gilded Age'],
  '1890s': ['Victorian', 'Gilded Age'],
  '1900s': ['Edwardian', 'Progressive Era'],
  '1910s': ['Edwardian', 'Progressive Era', 'WWI'],
  '1920s': ['Roaring Twenties', 'Jazz Age', 'Art Deco'],
  '1930s': ['Great Depression', 'Art Deco'],
  '1940s': ['WWII', 'Postwar'],
  '1950s': ['Mid-Century Modern', 'Cold War'],
  '1960s': ['Civil Rights Era', 'Space Age'],
  '1970s': ['Postwar', 'Disco Era'],
  '1980s': ['Digital Revolution', 'Reagan Era'],
  '1990s': ['Digital Revolution', 'Post-Cold War'],
  '2000s': ['Digital Age', 'Post-9/11'],
  '2010s': ['Social Media Era', 'Digital Age'],
  '2020s': ['Pandemic Era', 'AI Era'],
};

// Derive document age classification
function getDocumentAge(timestamp: string | null): string {
  if (!timestamp) return 'Unknown';
  const year = parseInt(timestamp.match(/\d{4}/)?.[0] || '0');
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;
  
  if (age <= 25) return 'Contemporary';
  if (age <= 75) return 'Modern';
  if (age <= 150) return 'Historic';
  return 'Antique';
}

// Derive media type from document characteristics
function deriveMediaType(record: any): string {
  const description = (record.DOCUMENT_DESCRIPTION || '').toLowerCase();
  const title = (record.DOCUMENT_TITLE || '').toLowerCase();
  const combined = `${description} ${title}`;
  
  if (/photograph|photo|daguerreotype|tintype|carte.de.visite|snapshot/i.test(combined)) return 'Photograph';
  if (/map|cartograph|atlas|survey|plat/i.test(combined)) return 'Map';
  if (/letter|correspondence|epistle/i.test(combined)) return 'Letter';
  if (/newspaper|gazette|herald|tribune|times|journal|periodical/i.test(combined)) return 'Newspaper';
  if (/postcard|post.card/i.test(combined)) return 'Postcard';
  if (/ticket|stub|admission/i.test(combined)) return 'Ticket';
  if (/pamphlet|brochure|leaflet|flyer/i.test(combined)) return 'Pamphlet';
  if (/advertis|ad\b|commercial/i.test(combined)) return 'Advertisement';
  if (/certificate|diploma|award|license/i.test(combined)) return 'Certificate';
  if (/manuscript|handwritten/i.test(combined)) return 'Manuscript';
  if (/book|volume|tome/i.test(combined)) return 'Book';
  if (/ledger|account|receipt|invoice/i.test(combined)) return 'Financial Record';
  if (/menu|bill.of.fare/i.test(combined)) return 'Menu';
  if (/program|playbill|theatre/i.test(combined)) return 'Program';
  return 'Ephemera';
}

// Derive subject matter from entities and description
function deriveSubjectMatter(record: any, graphNodes: GraphNode[]): string {
  const entities = record.ENTITIES_EXTRACTED || [];
  const nodeTypes = graphNodes.map(n => n.type);
  
  // Count dominant entity types
  const personCount = nodeTypes.filter(t => t === 'PERSON').length;
  const locationCount = nodeTypes.filter(t => t === 'LOCATION').length;
  const orgCount = nodeTypes.filter(t => t === 'ORGANIZATION').length;
  const dateCount = nodeTypes.filter(t => t === 'DATE').length;
  
  if (personCount > locationCount && personCount > orgCount) return 'People';
  if (locationCount > personCount && locationCount > orgCount) return 'Places';
  if (orgCount > personCount && orgCount > locationCount) return 'Organizations';
  if (dateCount > 2) return 'Events';
  
  // Fallback to description analysis
  const description = (record.DOCUMENT_DESCRIPTION || '').toLowerCase();
  if (/portrait|family|biography|genealog/i.test(description)) return 'People';
  if (/building|street|city|town|neighborhood|landscape/i.test(description)) return 'Places';
  if (/event|ceremony|celebration|meeting|gathering/i.test(description)) return 'Events';
  if (/object|artifact|item|tool|equipment/i.test(description)) return 'Objects';
  
  return 'Ideas';
}

// Derive place type from GIS zone
function derivePlaceType(zone: string): string {
  const z = zone.toLowerCase();
  if (/urban|downtown|metropolitan|city.center/i.test(z)) return 'Urban';
  if (/suburban|residential/i.test(z)) return 'Suburban';
  if (/rural|agricultural|farm/i.test(z)) return 'Rural';
  if (/industrial|factory|manufacturing/i.test(z)) return 'Industrial';
  if (/church|temple|mosque|sacred|cemetery/i.test(z)) return 'Sacred';
  if (/commercial|business|retail/i.test(z)) return 'Commercial';
  if (/park|recreation|nature/i.test(z)) return 'Recreational';
  return 'Mixed';
}

// Calculate connection density
function getConnectionDensity(asset: DigitalAsset, allAssets: DigitalAsset[]): string {
  const nodeCount = asset.graphData?.nodes?.length || 0;
  const linkCount = asset.graphData?.links?.length || 0;
  const relatedCount = asset.sqlRecord?.RELATED_ASSETS?.length || 0;
  
  const totalConnections = linkCount + relatedCount;
  
  if (totalConnections === 0 && nodeCount <= 1) return 'Isolated';
  if (totalConnections >= 10 || nodeCount >= 8) return 'Hub';
  return 'Linked';
}

// Derive narrative role from content characteristics
function deriveNarrativeRole(asset: DigitalAsset): string {
  const record = asset.sqlRecord;
  if (!record) return 'Context';
  
  const description = (record.DOCUMENT_DESCRIPTION || '').toLowerCase();
  const nodeTypes = asset.graphData?.nodes?.map(n => n.type) || [];
  const hasPersons = nodeTypes.includes('PERSON');
  const hasLocations = nodeTypes.includes('LOCATION');
  
  // Protagonist: Strong person focus, high relevance
  if (hasPersons && /portrait|biography|personal|diary|memoir/i.test(description)) return 'Protagonist';
  
  // Evidence: Documentation, records, proof
  if (/certificate|record|document|proof|evidence|contract|deed|will/i.test(description)) return 'Evidence';
  
  // Setting: Location-focused, environmental
  if (hasLocations && /street|building|landscape|cityscape|view|scene/i.test(description)) return 'Setting';
  
  return 'Context';
}

// Calculate serendipity score (potential for surprising connections)
function calculateSerendipityScore(asset: DigitalAsset, allAssets: DigitalAsset[]): string {
  const record = asset.sqlRecord;
  if (!record) return 'low';
  
  let score = 0;
  
  // Unusual entities boost serendipity
  const entities = record.ENTITIES_EXTRACTED || [];
  const allEntities = allAssets.flatMap(a => a.sqlRecord?.ENTITIES_EXTRACTED || []);
  const entityFrequency = entities.filter(e => 
    allEntities.filter(ae => ae === e).length <= 3
  ).length;
  score += entityFrequency * 2;
  
  // Contested items are interesting
  if (record.ACCESS_RESTRICTIONS) score += 3;
  
  // Cross-category connections
  const category = record.NLP_NODE_CATEGORIZATION;
  const relatedCategories = asset.sqlRecord?.RELATED_ASSETS?.map(id => 
    allAssets.find(a => a.id === id)?.sqlRecord?.NLP_NODE_CATEGORIZATION
  ).filter(c => c && c !== category).length || 0;
  score += relatedCategories * 2;
  
  // Lower confidence can mean uncertainty = potential discovery
  if ((record.CONFIDENCE_SCORE || 0) < 0.7 && (record.CONFIDENCE_SCORE || 0) > 0.4) score += 2;
  
  if (score >= 8) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

// Calculate research potential
function calculateResearchPotential(asset: DigitalAsset): string {
  const record = asset.sqlRecord;
  if (!record) return 'low';
  
  let score = 0;
  
  // Rich entity extraction
  const entityCount = record.ENTITIES_EXTRACTED?.length || 0;
  score += Math.min(entityCount, 5);
  
  // Graph connectivity
  const nodeCount = asset.graphData?.nodes?.length || 0;
  score += Math.min(nodeCount, 4);
  
  // Good confidence enables reliable research
  const conf = record.CONFIDENCE_SCORE || 0;
  if (conf >= 0.8) score += 3;
  else if (conf >= 0.6) score += 2;
  
  // Rich description
  const descLength = (record.DOCUMENT_DESCRIPTION || '').length;
  if (descLength > 500) score += 2;
  else if (descLength > 200) score += 1;
  
  // Verified = more trustworthy for research
  if (record.IS_USER_ANNOTATED) score += 2;
  
  if (score >= 10) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

// Get verification level
function getVerificationLevel(record: any): string {
  if (!record) return 'Unverified';
  
  // User annotation indicates some review
  if (record.IS_USER_ANNOTATED) {
    // Check if part of a community
    if (record.COMMUNITY_ID) return 'Community';
  }
  
  // High confidence + annotation = expert
  if (record.CONFIDENCE_SCORE >= 0.9 && record.IS_USER_ANNOTATED) return 'Expert';
  
  // Enterprise flag suggests institutional
  if (record.IS_ENTERPRISE) return 'Institutional';
  
  return 'Unverified';
}

// Derive geographic scale from zone characteristics
function deriveGeographicScale(record: any): string {
  if (!record) return 'Local';
  
  const description = (record.DOCUMENT_DESCRIPTION || '').toLowerCase();
  const zone = (record.LOCAL_GIS_ZONE || '').toLowerCase();
  
  if (/international|world|global|foreign|abroad/i.test(description)) return 'International';
  if (/national|country|federal|state/i.test(description)) return 'National';
  if (/regional|county|district|province/i.test(description)) return 'Regional';
  return 'Local';
}

// Determine classification status (structured vs unstructured)
function getClassificationStatus(record: any): 'structured' | 'partial' | 'unstructured' {
  if (!record) return 'unstructured';
  
  const clusters = [
    record.STRUCTURED_TEMPORAL,
    record.STRUCTURED_SPATIAL,
    record.STRUCTURED_CONTENT,
    record.STRUCTURED_KNOWLEDGE_GRAPH,
    record.STRUCTURED_PROVENANCE,
    record.STRUCTURED_DISCOVERY,
  ];
  
  const classifiedCount = clusters.filter(c => c !== null && c !== undefined).length;
  
  if (classifiedCount === 6) return 'structured';
  if (classifiedCount > 0) return 'partial';
  return 'unstructured';
}

// Get similarity score for proxy classification
function getSimilarityBasedValue(
  rawValue: string,
  dimension: FilterDimension,
  mappings: Array<{ rawValue: string; structuredValue: string; confidence: number }>
): string | null {
  // Exact match first
  const exactMatch = mappings.find(m => m.rawValue.toLowerCase() === rawValue.toLowerCase());
  if (exactMatch && exactMatch.confidence >= 0.8) {
    return exactMatch.structuredValue;
  }
  
  // Partial match - check if raw value contains or is contained by mapping
  const partialMatch = mappings.find(m => 
    m.rawValue.toLowerCase().includes(rawValue.toLowerCase()) ||
    rawValue.toLowerCase().includes(m.rawValue.toLowerCase())
  );
  if (partialMatch && partialMatch.confidence >= 0.6) {
    return partialMatch.structuredValue;
  }
  
  return null;
}

function extractDimensionValues(assets: DigitalAsset[], dimension: FilterDimension): any[] {
  const values = new Set<any>();
  
  assets.forEach(asset => {
    const record = asset.sqlRecord;
    if (!record) return;
    
    switch (dimension) {
      // === CORE DIMENSIONS ===
      case 'category':
        if (record.NLP_NODE_CATEGORIZATION) values.add(record.NLP_NODE_CATEGORIZATION);
        break;
      case 'era':
        const year = record.NLP_DERIVED_TIMESTAMP?.match(/\d{4}/)?.[0];
        if (year) values.add(year.slice(0, 3) + '0s');
        break;
      case 'license':
        if (record.DATA_LICENSE) values.add(record.DATA_LICENSE);
        break;
      case 'zone':
        if (record.LOCAL_GIS_ZONE && record.LOCAL_GIS_ZONE !== 'PENDING') values.add(record.LOCAL_GIS_ZONE);
        break;
      case 'scanType':
        if (record.SCAN_TYPE) values.add(record.SCAN_TYPE);
        break;
      case 'status':
        if (record.PROCESSING_STATUS) values.add(record.PROCESSING_STATUS);
        break;
      case 'source':
        if (record.SOURCE_COLLECTION) values.add(record.SOURCE_COLLECTION);
        break;
      case 'confidence':
        const conf = record.CONFIDENCE_SCORE || 0;
        if (conf >= 0.9) values.add('excellent');
        else if (conf >= 0.7) values.add('good');
        else if (conf >= 0.5) values.add('fair');
        else values.add('low');
        break;
      case 'contested':
        const isContested = record.ACCESS_RESTRICTIONS || 
          /controversy|removed|relocated/i.test(record.DOCUMENT_DESCRIPTION);
        values.add(isContested);
        break;
      case 'entities':
        record.ENTITIES_EXTRACTED?.forEach(e => values.add(e));
        break;
        
      // === NEW TEMPORAL DIMENSIONS ===
      case 'historicalPeriod':
        const eraYear = record.NLP_DERIVED_TIMESTAMP?.match(/\d{4}/)?.[0];
        if (eraYear) {
          const era = eraYear.slice(0, 3) + '0s';
          const periods = ERA_TO_HISTORICAL_PERIOD[era] || ['Modern'];
          periods.forEach(p => values.add(p));
        }
        break;
      case 'documentAge':
        values.add(getDocumentAge(record.NLP_DERIVED_TIMESTAMP));
        break;
        
      // === NEW SPATIAL DIMENSIONS ===
      case 'geographicScale':
        values.add(deriveGeographicScale(record));
        break;
      case 'placeType':
        if (record.LOCAL_GIS_ZONE) values.add(derivePlaceType(record.LOCAL_GIS_ZONE));
        break;
        
      // === NEW CONTENT DIMENSIONS ===
      case 'mediaType':
        values.add(deriveMediaType(record));
        break;
      case 'subjectMatter':
        values.add(deriveSubjectMatter(record, asset.graphData?.nodes || []));
        break;
        
      // === NEW GRAPH DIMENSIONS ===
      case 'connectionDensity':
        values.add(getConnectionDensity(asset, assets));
        break;
      case 'narrativeRole':
        values.add(deriveNarrativeRole(asset));
        break;
        
      // === NEW PROVENANCE DIMENSIONS ===
      case 'verificationLevel':
        values.add(getVerificationLevel(record));
        break;
        
      // === NEW DISCOVERY DIMENSIONS ===
      case 'serendipityScore':
        values.add(calculateSerendipityScore(asset, assets));
        break;
      case 'researchPotential':
        values.add(calculateResearchPotential(asset));
        break;
        
      // === CLASSIFICATION STATUS ===
      case 'classificationStatus':
        values.add(getClassificationStatus(record));
        break;
    }
  });
  
  return Array.from(values).sort();
}

function extractNodeTypes(graphData: GraphData): string[] {
  const types = new Set<string>();
  graphData.nodes.forEach(node => types.add(node.type));
  return Array.from(types).sort();
}

function applyFilterToAsset(asset: DigitalAsset, filter: FilterValue, allAssets: DigitalAsset[] = []): boolean {
  const record = asset.sqlRecord;
  if (!record) return false;
  
  let actualValue: any;
  
  switch (filter.dimension) {
    // === CORE DIMENSIONS ===
    case 'category':
      actualValue = record.NLP_NODE_CATEGORIZATION;
      break;
    case 'era':
      const year = record.NLP_DERIVED_TIMESTAMP?.match(/\d{4}/)?.[0];
      actualValue = year ? year.slice(0, 3) + '0s' : 'Unknown';
      break;
    case 'license':
      actualValue = record.DATA_LICENSE;
      break;
    case 'zone':
      actualValue = record.LOCAL_GIS_ZONE;
      break;
    case 'scanType':
      actualValue = record.SCAN_TYPE;
      break;
    case 'status':
      actualValue = record.PROCESSING_STATUS;
      break;
    case 'source':
      actualValue = record.SOURCE_COLLECTION;
      break;
    case 'confidence':
      actualValue = record.CONFIDENCE_SCORE || 0;
      break;
    case 'contested':
      actualValue = record.ACCESS_RESTRICTIONS || 
        /controversy|removed|relocated/i.test(record.DOCUMENT_DESCRIPTION);
      break;
    case 'relevance':
      actualValue = asset.graphData?.nodes?.[0]?.relevance || 0;
      break;
    case 'entities':
      actualValue = record.ENTITIES_EXTRACTED || [];
      break;
      
    // === TEMPORAL DIMENSIONS ===
    case 'historicalPeriod':
      const eraYear = record.NLP_DERIVED_TIMESTAMP?.match(/\d{4}/)?.[0];
      if (eraYear) {
        const era = eraYear.slice(0, 3) + '0s';
        actualValue = ERA_TO_HISTORICAL_PERIOD[era] || ['Modern'];
      } else {
        actualValue = ['Unknown'];
      }
      break;
    case 'documentAge':
      actualValue = getDocumentAge(record.NLP_DERIVED_TIMESTAMP);
      break;
      
    // === SPATIAL DIMENSIONS ===
    case 'geographicScale':
      actualValue = deriveGeographicScale(record);
      break;
    case 'placeType':
      actualValue = derivePlaceType(record.LOCAL_GIS_ZONE || '');
      break;
      
    // === CONTENT DIMENSIONS ===
    case 'mediaType':
      actualValue = deriveMediaType(record);
      break;
    case 'subjectMatter':
      actualValue = deriveSubjectMatter(record, asset.graphData?.nodes || []);
      break;
      
    // === GRAPH DIMENSIONS ===
    case 'connectionDensity':
      actualValue = getConnectionDensity(asset, allAssets);
      break;
    case 'narrativeRole':
      actualValue = deriveNarrativeRole(asset);
      break;
      
    // === PROVENANCE DIMENSIONS ===
    case 'verificationLevel':
      actualValue = getVerificationLevel(record);
      break;
      
    // === DISCOVERY DIMENSIONS ===
    case 'serendipityScore':
      actualValue = calculateSerendipityScore(asset, allAssets);
      break;
    case 'researchPotential':
      actualValue = calculateResearchPotential(asset);
      break;
      
    // === CLASSIFICATION STATUS ===
    case 'classificationStatus':
      actualValue = getClassificationStatus(record);
      break;
      
    default:
      return true;
  }
  
  switch (filter.operator) {
    case 'eq':
      // Handle array values (like historicalPeriod) - check if any match
      if (Array.isArray(actualValue)) {
        return actualValue.includes(filter.value);
      }
      return actualValue === filter.value;
    case 'neq':
      if (Array.isArray(actualValue)) {
        return !actualValue.includes(filter.value);
      }
      return actualValue !== filter.value;
    case 'gt':
      return actualValue > filter.value;
    case 'lt':
      return actualValue < filter.value;
    case 'gte':
      return actualValue >= filter.value;
    case 'lte':
      return actualValue <= filter.value;
    case 'contains':
      if (Array.isArray(actualValue)) {
        return actualValue.some(v => String(v).toLowerCase().includes(String(filter.value).toLowerCase()));
      }
      return String(actualValue).toLowerCase().includes(String(filter.value).toLowerCase());
    case 'in':
      if (Array.isArray(filter.value)) {
        // If actualValue is also an array, check for any overlap
        if (Array.isArray(actualValue)) {
          return actualValue.some(av => (filter.value as string[]).includes(av));
        }
        return filter.value.includes(actualValue);
      }
      return actualValue === filter.value;
    default:
      return true;
  }
}

function applyFilterToNode(node: GraphNode, filter: FilterValue): boolean {
  switch (filter.dimension) {
    case 'nodeType':
      if (filter.operator === 'eq') return node.type === filter.value;
      if (filter.operator === 'in' && Array.isArray(filter.value)) return filter.value.includes(node.type);
      return true;
    case 'relevance':
      if (filter.operator === 'gte') return node.relevance >= (filter.value as number);
      if (filter.operator === 'lte') return node.relevance <= (filter.value as number);
      return true;
    case 'license':
      if (node.license) {
        if (filter.operator === 'eq') return node.license === filter.value;
        if (filter.operator === 'in' && Array.isArray(filter.value)) return filter.value.includes(node.license);
      }
      return true;
    default:
      return true;
  }
}

// ============================================
// Provider Component
// ============================================

interface FilterProviderProps {
  children: ReactNode;
  initialAssets?: DigitalAsset[];
  initialGraphData?: GraphData;
}

export function FilterProvider({ children, initialAssets = [], initialGraphData }: FilterProviderProps) {
  const [state, setState] = useState<FilterState>(createInitialState);
  const [boundAssets, setBoundAssets] = useState<DigitalAsset[]>(initialAssets);
  const [boundGraphData, setBoundGraphData] = useState<GraphData>(initialGraphData || { nodes: [], links: [] });

  // Compute dimension metadata when assets change
  useEffect(() => {
    const newDimensions = new Map<FilterDimension, DimensionMetadata>();
    
    // All dimensions organized by category
    const dimensions: FilterDimension[] = [
      // Temporal
      'era', 'historicalPeriod', 'documentAge',
      // Spatial
      'zone', 'geographicScale', 'placeType',
      // Content Classification
      'category', 'scanType', 'mediaType', 'subjectMatter',
      // Knowledge Graph
      'nodeType', 'connectionDensity', 'narrativeRole',
      // Provenance & Trust
      'license', 'confidence', 'verificationLevel', 'contested',
      // Discovery
      'source', 'status', 'entities', 'relevance', 'serendipityScore', 'researchPotential',
      // Classification Status
      'classificationStatus'
    ];
    
    const dimensionLabels: Record<FilterDimension, { label: string; description: string; dataType: DimensionMetadata['dataType'] }> = {
      // === TEMPORAL ===
      era: { label: 'Era', description: 'Decade of origin (1920s, 1950s, etc.)', dataType: 'string' },
      historicalPeriod: { label: 'Historical Period', description: 'Named era (Victorian, Jazz Age, Cold War)', dataType: 'array' },
      documentAge: { label: 'Document Age', description: 'Age classification (Contemporary to Antique)', dataType: 'string' },
      
      // === SPATIAL ===
      zone: { label: 'GIS Zone', description: 'Geographic zone from location data', dataType: 'string' },
      geographicScale: { label: 'Geographic Scale', description: 'Scope: Local, Regional, National, International', dataType: 'string' },
      placeType: { label: 'Place Type', description: 'Environment: Urban, Rural, Industrial, Sacred', dataType: 'string' },
      
      // === CONTENT CLASSIFICATION ===
      category: { label: 'Category', description: 'AI-derived document type classification', dataType: 'string' },
      scanType: { label: 'Scan Type', description: 'Physical form: Document, Item, or Scenery', dataType: 'string' },
      mediaType: { label: 'Media Type', description: 'Format: Photograph, Map, Letter, Newspaper', dataType: 'string' },
      subjectMatter: { label: 'Subject Matter', description: 'Primary focus: People, Places, Events, Objects, Ideas', dataType: 'string' },
      
      // === KNOWLEDGE GRAPH ===
      nodeType: { label: 'Node Type', description: 'Graph entity: Person, Location, Organization, Date', dataType: 'string' },
      connectionDensity: { label: 'Connection Density', description: 'Network role: Isolated, Linked, or Hub', dataType: 'string' },
      narrativeRole: { label: 'Narrative Role', description: 'Story function: Protagonist, Setting, Evidence, Context', dataType: 'string' },
      
      // === PROVENANCE & TRUST ===
      license: { label: 'License', description: 'Usage rights: CC0, GEOGRAPH_CORPUS, Custom', dataType: 'string' },
      confidence: { label: 'Confidence', description: 'AI analysis reliability score', dataType: 'number' },
      verificationLevel: { label: 'Verification', description: 'Trust level: Unverified to Institutional', dataType: 'string' },
      contested: { label: 'Contested', description: 'Has access restrictions or controversies', dataType: 'boolean' },
      
      // === DISCOVERY ===
      source: { label: 'Source', description: 'Original collection or archive', dataType: 'string' },
      status: { label: 'Status', description: 'Processing pipeline status', dataType: 'string' },
      entities: { label: 'Entities', description: 'Extracted people, places, organizations', dataType: 'array' },
      relevance: { label: 'Relevance', description: 'Contextual importance score', dataType: 'number' },
      serendipityScore: { label: 'Serendipity', description: 'Potential for surprising discoveries', dataType: 'string' },
      researchPotential: { label: 'Research Potential', description: 'Value for scholarly investigation', dataType: 'string' },
      
      // === CLASSIFICATION STATUS ===
      classificationStatus: { label: 'Classification', description: 'Structured classification status: structured, partial, or unstructured', dataType: 'string' },
    };
    
    dimensions.forEach(dim => {
      const meta = dimensionLabels[dim];
      if (!meta) return; // Skip if not defined
      
      const availableValues = dim === 'nodeType' 
        ? extractNodeTypes(boundGraphData)
        : extractDimensionValues(boundAssets, dim);
      
      const deps = FILTER_DEPENDENCIES.filter(d => d.target === dim).map(d => d.source);
      const affects = FILTER_DEPENDENCIES.filter(d => d.source === dim).map(d => d.target);
      
      newDimensions.set(dim, {
        dimension: dim,
        label: meta.label,
        description: meta.description,
        dataType: meta.dataType,
        availableValues,
        filteredValues: availableValues, // Will be updated by dependency engine
        isActive: state.activeFilters.has(dim),
        dependsOn: deps,
        affects,
      });
    });
    
    setState(prev => ({ ...prev, dimensions: newDimensions }));
  }, [boundAssets, boundGraphData]);

  // Filtered assets computation
  const filteredAssets = useMemo(() => {
    if (state.activeFilters.size === 0) return boundAssets;
    
    return boundAssets.filter(asset => {
      for (const filter of state.activeFilters.values()) {
        if (!applyFilterToAsset(asset, filter)) return false;
      }
      return true;
    });
  }, [boundAssets, state.activeFilters]);

  // Filtered graph data computation
  const filteredGraphData = useMemo(() => {
    if (state.activeFilters.size === 0) return boundGraphData;
    
    // Filter nodes
    const nodeFilters = Array.from(state.activeFilters.values()).filter(
      f => ['nodeType', 'relevance', 'license'].includes(f.dimension)
    );
    
    let filteredNodes = boundGraphData.nodes;
    if (nodeFilters.length > 0) {
      filteredNodes = boundGraphData.nodes.filter(node => 
        nodeFilters.every(filter => applyFilterToNode(node, filter))
      );
    }
    
    // Also filter nodes based on filtered assets (documents)
    const assetIds = new Set(filteredAssets.map(a => a.id));
    filteredNodes = filteredNodes.filter(node => {
      if (node.type === 'DOCUMENT') {
        return assetIds.has(node.id);
      }
      return true;
    });
    
    // Keep only links where both source and target exist
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = boundGraphData.links.filter(
      link => nodeIds.has(link.source) && nodeIds.has(link.target)
    );
    
    return { nodes: filteredNodes, links: filteredLinks };
  }, [boundGraphData, state.activeFilters, filteredAssets]);

  // Analytics computation
  const analytics = useMemo<FilterAnalytics>(() => {
    const totalAssets = boundAssets.length;
    const filtered = filteredAssets.length;
    
    // Calculate dimension impact
    const dimensionImpact = new Map<FilterDimension, number>();
    state.activeFilters.forEach((filter, dim) => {
      // Calculate how many assets this single filter removes
      const withoutThis = boundAssets.filter(asset => {
        for (const [d, f] of state.activeFilters) {
          if (d === dim) continue; // Skip this filter
          if (!applyFilterToAsset(asset, f)) return false;
        }
        return true;
      }).length;
      
      const impact = totalAssets > 0 ? (withoutThis - filtered) / totalAssets : 0;
      dimensionImpact.set(dim, Math.abs(impact));
    });
    
    // Suggest filters based on current data distribution
    const suggestedFilters: FilterValue[] = [];
    
    // If too many results, suggest high confidence filter
    if (filtered > 100 && !state.activeFilters.has('confidence')) {
      suggestedFilters.push({ dimension: 'confidence', value: 0.7, operator: 'gte' });
    }
    
    // If viewing graph, suggest document type filter
    if (filtered > 50 && !state.activeFilters.has('nodeType')) {
      suggestedFilters.push({ dimension: 'nodeType', value: 'DOCUMENT', operator: 'eq' });
    }
    
    return {
      totalAssets,
      filteredAssets: filtered,
      filterEfficiency: totalAssets > 0 ? filtered / totalAssets : 1,
      dimensionImpact,
      suggestedFilters,
    };
  }, [boundAssets, filteredAssets, state.activeFilters]);

  // ============================================
  // Actions
  // ============================================

  const setFilter = useCallback((dimension: FilterDimension, value: FilterValue | null) => {
    setState(prev => {
      const newFilters = new Map(prev.activeFilters);
      if (value === null) {
        newFilters.delete(dimension);
      } else {
        newFilters.set(dimension, value);
      }
      return { ...prev, activeFilters: newFilters };
    });
  }, []);

  const setFilters = useCallback((filters: Map<FilterDimension, FilterValue>) => {
    setState(prev => ({ ...prev, activeFilters: new Map(filters) }));
  }, []);

  const clearFilter = useCallback((dimension: FilterDimension) => {
    setState(prev => {
      const newFilters = new Map(prev.activeFilters);
      newFilters.delete(dimension);
      return { ...prev, activeFilters: newFilters };
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setState(prev => ({ ...prev, activeFilters: new Map() }));
  }, []);

  const toggleViewSync = useCallback((view: ViewMode) => {
    setState(prev => {
      const newSynced = new Set(prev.syncedViews);
      if (newSynced.has(view)) {
        newSynced.delete(view);
      } else {
        newSynced.add(view);
      }
      return { ...prev, syncedViews: newSynced };
    });
  }, []);

  const setViewOverride = useCallback((view: ViewMode, dimension: FilterDimension, value: FilterValue | null) => {
    setState(prev => {
      const newOverrides = new Map(prev.viewOverrides);
      const viewOverrides = new Map(newOverrides.get(view) || []);
      
      if (value === null) {
        viewOverrides.delete(dimension);
      } else {
        viewOverrides.set(dimension, value);
      }
      
      if (viewOverrides.size === 0) {
        newOverrides.delete(view);
      } else {
        newOverrides.set(view, viewOverrides);
      }
      
      return { ...prev, viewOverrides: newOverrides };
    });
  }, []);

  const getFiltersForView = useCallback((view: ViewMode): Map<FilterDimension, FilterValue> => {
    // If view is synced, use global filters
    if (state.syncedViews.has(view)) {
      const overrides = state.viewOverrides.get(view);
      if (overrides && overrides.size > 0) {
        const merged = new Map(state.activeFilters);
        overrides.forEach((value, key) => merged.set(key, value));
        return merged;
      }
      return state.activeFilters;
    }
    
    // If not synced, use only view-specific overrides
    return state.viewOverrides.get(view) || new Map();
  }, [state.syncedViews, state.activeFilters, state.viewOverrides]);

  const getDependentDimensions = useCallback((dimension: FilterDimension): FilterDimension[] => {
    const dependencies = FILTER_DEPENDENCIES.filter(d => d.source === dimension);
    return dependencies.map(d => d.target);
  }, []);

  const getSuggestedValues = useCallback((dimension: FilterDimension): any[] => {
    const meta = state.dimensions.get(dimension);
    if (!meta) return [];
    
    // Get constraints from active filters on dependent dimensions
    let suggestedValues = [...meta.availableValues];
    
    meta.dependsOn.forEach(depDim => {
      const depFilter = state.activeFilters.get(depDim);
      if (!depFilter) return;
      
      const dep = FILTER_DEPENDENCIES.find(d => d.source === depDim && d.target === dimension);
      if (!dep || dep.type !== 'suggests') return;
      
      // Apply transformer if available
      if (dep.transformer) {
        suggestedValues = dep.transformer(depFilter.value, boundAssets);
      }
    });
    
    return suggestedValues;
  }, [state.dimensions, state.activeFilters, boundAssets]);

  const getConstrainedValues = useCallback((dimension: FilterDimension): any[] => {
    const meta = state.dimensions.get(dimension);
    if (!meta) return [];
    
    // Re-extract available values from filtered assets
    return extractDimensionValues(filteredAssets, dimension);
  }, [state.dimensions, filteredAssets]);

  const bindAssets = useCallback((assets: DigitalAsset[]) => {
    setBoundAssets(assets);
  }, []);

  const bindGraphData = useCallback((graphData: GraphData) => {
    setBoundGraphData(graphData);
  }, []);

  const applyQuickFilter = useCallback((preset: QuickFilterPreset) => {
    if (preset === 'clear_all') {
      clearAllFilters();
      return;
    }
    
    const filters = QUICK_FILTER_DEFINITIONS[preset];
    const newFilters = new Map<FilterDimension, FilterValue>();
    filters.forEach(f => newFilters.set(f.dimension, f));
    setFilters(newFilters);
  }, [clearAllFilters, setFilters]);

  const getActiveFilterCount = useCallback((): number => {
    return state.activeFilters.size;
  }, [state.activeFilters]);

  const exportFilterState = useCallback((): string => {
    const exportData = {
      filters: Array.from(state.activeFilters.entries()),
      syncedViews: Array.from(state.syncedViews),
      overrides: Array.from(state.viewOverrides.entries()).map(([view, filters]) => [
        view,
        Array.from(filters.entries()),
      ]),
    };
    return JSON.stringify(exportData);
  }, [state]);

  const importFilterState = useCallback((stateJson: string) => {
    try {
      const data = JSON.parse(stateJson);
      setState(prev => ({
        ...prev,
        activeFilters: new Map(data.filters || []),
        syncedViews: new Set(data.syncedViews || ['graph', 'world', 'database', 'curator']),
        viewOverrides: new Map(
          (data.overrides || []).map(([view, filters]: [ViewMode, [FilterDimension, FilterValue][]]) => [
            view,
            new Map(filters),
          ])
        ),
      }));
    } catch (e) {
      console.error('Failed to import filter state:', e);
    }
  }, []);

  // ============================================
  // Context Value
  // ============================================

  const contextValue: FilterContextValue = {
    state,
    analytics,
    filteredAssets,
    filteredGraphData,
    setFilter,
    setFilters,
    clearFilter,
    clearAllFilters,
    toggleViewSync,
    setViewOverride,
    getFiltersForView,
    getDependentDimensions,
    getSuggestedValues,
    getConstrainedValues,
    bindAssets,
    bindGraphData,
    applyQuickFilter,
    getActiveFilterCount,
    exportFilterState,
    importFilterState,
  };

  return (
    <FilterContext.Provider value={contextValue}>
      {children}
    </FilterContext.Provider>
  );
}

// ============================================
// Hooks
// ============================================

export function useFilterContext(): FilterContextValue {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilterContext must be used within a FilterProvider');
  }
  return context;
}

export function useFilteredAssets(): DigitalAsset[] {
  const { filteredAssets } = useFilterContext();
  return filteredAssets;
}

export function useFilteredGraphData(): GraphData {
  const { filteredGraphData } = useFilterContext();
  return filteredGraphData;
}

export function useFilterAnalytics(): FilterAnalytics {
  const { analytics } = useFilterContext();
  return analytics;
}

export function useFilterDimension(dimension: FilterDimension): {
  metadata: DimensionMetadata | undefined;
  currentValue: FilterValue | undefined;
  setFilter: (value: FilterValue | null) => void;
  availableValues: any[];
  constrainedValues: any[];
} {
  const context = useFilterContext();
  const metadata = context.state.dimensions.get(dimension);
  const currentValue = context.state.activeFilters.get(dimension);
  
  const setFilter = useCallback((value: FilterValue | null) => {
    context.setFilter(dimension, value);
  }, [context, dimension]);
  
  const availableValues = metadata?.availableValues || [];
  const constrainedValues = context.getConstrainedValues(dimension);
  
  return { metadata, currentValue, setFilter, availableValues, constrainedValues };
}
