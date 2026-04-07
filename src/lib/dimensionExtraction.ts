/**
 * Dimension Extraction — Pure Functions
 *
 * All CPU-intensive dimension derivation and extraction logic lives here so it
 * can be shared between the main-thread FilterContext (for applyFilterToAsset
 * and getConstrainedValues) AND the Web Worker that computes Tier 1+2
 * dimensions off the main thread.
 *
 * RULES:
 *  - NO React imports
 *  - NO DOM access
 *  - Every export must be a pure function or serialisable constant
 */

import type { DigitalAsset, GraphNode, GraphData } from '../types';

// ============================================
// Types (re-exported by FilterContext for backward compat)
// ============================================

export type FilterDimension =
  | 'era' | 'historicalPeriod' | 'documentAge'
  | 'zone' | 'geographicScale' | 'placeType'
  | 'category' | 'scanType' | 'mediaType' | 'subjectMatter'
  | 'nodeType' | 'connectionDensity' | 'narrativeRole'
  | 'license' | 'confidence' | 'verificationLevel' | 'contested'
  | 'source' | 'status' | 'entities' | 'relevance'
  | 'serendipityScore' | 'researchPotential'
  | 'classificationStatus';

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

export interface FilterDependency {
  source: FilterDimension;
  target: FilterDimension;
  type: 'constrains' | 'suggests' | 'excludes' | 'requires';
  weight: number;
  transformer?: (sourceValue: any, assets: DigitalAsset[]) => any[];
}

// ============================================
// Constants
// ============================================

export const ERA_TO_HISTORICAL_PERIOD: Record<string, string[]> = {
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

export const FILTER_DEPENDENCIES: FilterDependency[] = [
  { source: 'era', target: 'historicalPeriod', type: 'constrains', weight: 0.95 },
  { source: 'historicalPeriod', target: 'subjectMatter', type: 'suggests', weight: 0.7 },
  { source: 'documentAge', target: 'confidence', type: 'suggests', weight: 0.6 },
  { source: 'era', target: 'mediaType', type: 'suggests', weight: 0.75 },
  { source: 'zone', target: 'placeType', type: 'constrains', weight: 0.85 },
  { source: 'geographicScale', target: 'subjectMatter', type: 'suggests', weight: 0.5 },
  { source: 'placeType', target: 'category', type: 'suggests', weight: 0.65 },
  { source: 'category', target: 'entities', type: 'constrains', weight: 0.8 },
  { source: 'scanType', target: 'entities', type: 'constrains', weight: 0.9 },
  { source: 'mediaType', target: 'narrativeRole', type: 'suggests', weight: 0.55 },
  { source: 'subjectMatter', target: 'nodeType', type: 'suggests', weight: 0.7 },
  { source: 'category', target: 'nodeType', type: 'suggests', weight: 0.6 },
  { source: 'nodeType', target: 'category', type: 'suggests', weight: 0.5 },
  { source: 'connectionDensity', target: 'serendipityScore', type: 'suggests', weight: 0.8 },
  { source: 'narrativeRole', target: 'researchPotential', type: 'suggests', weight: 0.6 },
  { source: 'license', target: 'nodeType', type: 'constrains', weight: 0.5 },
  { source: 'confidence', target: 'relevance', type: 'constrains', weight: 0.7 },
  { source: 'verificationLevel', target: 'researchPotential', type: 'constrains', weight: 0.75 },
  { source: 'contested', target: 'license', type: 'constrains', weight: 0.4 },
  { source: 'contested', target: 'serendipityScore', type: 'suggests', weight: 0.5 },
  { source: 'status', target: 'category', type: 'constrains', weight: 0.3 },
  { source: 'source', target: 'era', type: 'suggests', weight: 0.5 },
  { source: 'serendipityScore', target: 'confidence', type: 'suggests', weight: 0.35 },
  { source: 'entities', target: 'researchPotential', type: 'suggests', weight: 0.65 },
];

export const DIMENSION_DEPS_ON = new Map<FilterDimension, FilterDimension[]>();
export const DIMENSION_AFFECTS = new Map<FilterDimension, FilterDimension[]>();
for (const dep of FILTER_DEPENDENCIES) {
  if (!DIMENSION_DEPS_ON.has(dep.target)) DIMENSION_DEPS_ON.set(dep.target, []);
  DIMENSION_DEPS_ON.get(dep.target)!.push(dep.source);
  if (!DIMENSION_AFFECTS.has(dep.source)) DIMENSION_AFFECTS.set(dep.source, []);
  DIMENSION_AFFECTS.get(dep.source)!.push(dep.target);
}

export const DIMENSION_LABELS: Record<FilterDimension, { label: string; description: string; dataType: DimensionMetadata['dataType'] }> = {
  era: { label: 'Era', description: 'Decade of origin (1920s, 1950s, etc.)', dataType: 'string' },
  historicalPeriod: { label: 'Historical Period', description: 'Named era (Victorian, Jazz Age, Cold War)', dataType: 'array' },
  documentAge: { label: 'Document Age', description: 'Age classification (Contemporary to Antique)', dataType: 'string' },
  zone: { label: 'GIS Zone', description: 'Geographic zone from location data', dataType: 'string' },
  geographicScale: { label: 'Geographic Scale', description: 'Scope: Local, Regional, National, International', dataType: 'string' },
  placeType: { label: 'Place Type', description: 'Environment: Urban, Rural, Industrial, Sacred', dataType: 'string' },
  category: { label: 'Category', description: 'AI-derived document type classification', dataType: 'string' },
  scanType: { label: 'Scan Type', description: 'Physical form: Document, Item, or Scenery', dataType: 'string' },
  mediaType: { label: 'Media Type', description: 'Format: Photograph, Map, Letter, Newspaper', dataType: 'string' },
  subjectMatter: { label: 'Subject Matter', description: 'Primary focus: People, Places, Events, Objects, Ideas', dataType: 'string' },
  nodeType: { label: 'Node Type', description: 'Graph entity: Person, Location, Organization, Date', dataType: 'string' },
  connectionDensity: { label: 'Connection Density', description: 'Network role: Isolated, Linked, or Hub', dataType: 'string' },
  narrativeRole: { label: 'Narrative Role', description: 'Story function: Protagonist, Setting, Evidence, Context', dataType: 'string' },
  license: { label: 'License', description: 'Usage rights: CC0, GEOGRAPH_CORPUS, Custom', dataType: 'string' },
  confidence: { label: 'Confidence', description: 'AI analysis reliability score', dataType: 'number' },
  verificationLevel: { label: 'Verification', description: 'Trust level: Unverified to Institutional', dataType: 'string' },
  contested: { label: 'Contested', description: 'Has access restrictions or controversies', dataType: 'boolean' },
  source: { label: 'Source', description: 'Original collection or archive', dataType: 'string' },
  status: { label: 'Status', description: 'Processing pipeline status', dataType: 'string' },
  entities: { label: 'Entities', description: 'Extracted people, places, organizations', dataType: 'array' },
  relevance: { label: 'Relevance', description: 'Contextual importance score', dataType: 'number' },
  serendipityScore: { label: 'Serendipity', description: 'Potential for surprising discoveries', dataType: 'string' },
  researchPotential: { label: 'Research Potential', description: 'Value for scholarly investigation', dataType: 'string' },
  classificationStatus: { label: 'Classification', description: 'Structured classification status: structured, partial, or unstructured', dataType: 'string' },
};

export const TIER0_DIMENSIONS: FilterDimension[] = [
  'category', 'era', 'license',
];

export const TIER1_DIMENSIONS: FilterDimension[] = [
  'zone', 'scanType', 'status', 'source',
  'confidence', 'contested', 'entities',
  'historicalPeriod', 'documentAge',
  'verificationLevel', 'classificationStatus',
  'researchPotential', 'relevance',
  'geographicScale', 'placeType',
  'mediaType', 'narrativeRole',
  'nodeType',
];

export const TIER2_DIMENSIONS: FilterDimension[] = [
  'subjectMatter', 'connectionDensity', 'serendipityScore',
];

// ============================================
// Derive Functions
// ============================================

export function getDocumentAge(timestamp: string | null): string {
  if (!timestamp) return 'Unknown';
  const year = parseInt(timestamp.match(/\d{4}/)?.[0] || '0');
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;
  if (age <= 25) return 'Contemporary';
  if (age <= 75) return 'Modern';
  if (age <= 150) return 'Historic';
  return 'Antique';
}

export function deriveMediaType(record: any): string {
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

export function deriveSubjectMatter(record: any, graphNodes: GraphNode[]): string {
  const nodeTypes = graphNodes.map(n => n.type);
  const personCount = nodeTypes.filter(t => t === 'PERSON').length;
  const locationCount = nodeTypes.filter(t => t === 'LOCATION').length;
  const orgCount = nodeTypes.filter(t => t === 'ORGANIZATION').length;
  const dateCount = nodeTypes.filter(t => t === 'DATE').length;
  if (personCount > locationCount && personCount > orgCount) return 'People';
  if (locationCount > personCount && locationCount > orgCount) return 'Places';
  if (orgCount > personCount && orgCount > locationCount) return 'Organizations';
  if (dateCount > 2) return 'Events';
  const description = (record.DOCUMENT_DESCRIPTION || '').toLowerCase();
  if (/portrait|family|biography|genealog/i.test(description)) return 'People';
  if (/building|street|city|town|neighborhood|landscape/i.test(description)) return 'Places';
  if (/event|ceremony|celebration|meeting|gathering/i.test(description)) return 'Events';
  if (/object|artifact|item|tool|equipment/i.test(description)) return 'Objects';
  return 'Ideas';
}

export function derivePlaceType(zone: string): string {
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

export function getConnectionDensity(asset: DigitalAsset, _allAssets: DigitalAsset[]): string {
  const nodeCount = asset.graphData?.nodes?.length || 0;
  const linkCount = asset.graphData?.links?.length || 0;
  const relatedCount = asset.sqlRecord?.RELATED_ASSETS?.length || 0;
  const totalConnections = linkCount + relatedCount;
  if (totalConnections === 0 && nodeCount <= 1) return 'Isolated';
  if (totalConnections >= 10 || nodeCount >= 8) return 'Hub';
  return 'Linked';
}

export function deriveNarrativeRole(asset: DigitalAsset): string {
  const record = asset.sqlRecord;
  if (!record) return 'Context';
  const description = (record.DOCUMENT_DESCRIPTION || '').toLowerCase();
  const nodeTypes = asset.graphData?.nodes?.map(n => n.type) || [];
  const hasPersons = nodeTypes.includes('PERSON');
  const hasLocations = nodeTypes.includes('LOCATION');
  if (hasPersons && /portrait|biography|personal|diary|memoir/i.test(description)) return 'Protagonist';
  if (/certificate|record|document|proof|evidence|contract|deed|will/i.test(description)) return 'Evidence';
  if (hasLocations && /street|building|landscape|cityscape|view|scene/i.test(description)) return 'Setting';
  return 'Context';
}

export function calculateSerendipityScore(
  asset: DigitalAsset,
  allAssets: DigitalAsset[],
  entityFreqMap?: Map<string, number>,
  categoryById?: Map<string, string>
): string {
  const record = asset.sqlRecord;
  if (!record) return 'low';
  let score = 0;
  const entities = record.ENTITIES_EXTRACTED || [];
  if (entityFreqMap) {
    const rareCount = entities.filter((e: string) => (entityFreqMap.get(e) || 0) <= 3).length;
    score += rareCount * 2;
  } else {
    const allEntities = allAssets.flatMap(a => a.sqlRecord?.ENTITIES_EXTRACTED || []);
    const entityFrequency = entities.filter((e: string) =>
      allEntities.filter((ae: string) => ae === e).length <= 3
    ).length;
    score += entityFrequency * 2;
  }
  if (record.ACCESS_RESTRICTIONS) score += 3;
  const category = record.NLP_NODE_CATEGORIZATION;
  if (categoryById) {
    const relatedCategories = asset.sqlRecord?.RELATED_ASSETS?.filter((id: string) => {
      const c = categoryById.get(id);
      return c && c !== category;
    }).length || 0;
    score += relatedCategories * 2;
  } else {
    const relatedCategories = asset.sqlRecord?.RELATED_ASSETS?.map((id: string) =>
      allAssets.find(a => a.id === id)?.sqlRecord?.NLP_NODE_CATEGORIZATION
    ).filter((c: string | undefined) => c && c !== category).length || 0;
    score += relatedCategories * 2;
  }
  if ((record.CONFIDENCE_SCORE || 0) < 0.7 && (record.CONFIDENCE_SCORE || 0) > 0.4) score += 2;
  if (score >= 8) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

export function calculateResearchPotential(asset: DigitalAsset): string {
  const record = asset.sqlRecord;
  if (!record) return 'low';
  let score = 0;
  const entityCount = record.ENTITIES_EXTRACTED?.length || 0;
  score += Math.min(entityCount, 5);
  const nodeCount = asset.graphData?.nodes?.length || 0;
  score += Math.min(nodeCount, 4);
  const conf = record.CONFIDENCE_SCORE || 0;
  if (conf >= 0.8) score += 3;
  else if (conf >= 0.6) score += 2;
  const descLength = (record.DOCUMENT_DESCRIPTION || '').length;
  if (descLength > 500) score += 2;
  else if (descLength > 200) score += 1;
  if (record.IS_USER_ANNOTATED) score += 2;
  if (score >= 10) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

export function getVerificationLevel(record: any): string {
  if (!record) return 'Unverified';
  if (record.IS_USER_ANNOTATED) {
    if (record.COMMUNITY_ID) return 'Community';
  }
  if (record.CONFIDENCE_SCORE >= 0.9 && record.IS_USER_ANNOTATED) return 'Expert';
  if (record.IS_ENTERPRISE) return 'Institutional';
  return 'Unverified';
}

export function deriveGeographicScale(record: any): string {
  if (!record) return 'Local';
  const description = (record.DOCUMENT_DESCRIPTION || '').toLowerCase();
  if (/international|world|global|foreign|abroad/i.test(description)) return 'International';
  if (/national|country|federal|state/i.test(description)) return 'National';
  if (/regional|county|district|province/i.test(description)) return 'Regional';
  return 'Local';
}

export function getClassificationStatus(record: any): 'structured' | 'partial' | 'unstructured' {
  if (!record) return 'unstructured';
  const clusters = [
    record.STRUCTURED_TEMPORAL, record.STRUCTURED_SPATIAL, record.STRUCTURED_CONTENT,
    record.STRUCTURED_KNOWLEDGE_GRAPH, record.STRUCTURED_PROVENANCE, record.STRUCTURED_DISCOVERY,
  ];
  const classifiedCount = clusters.filter(c => c !== null && c !== undefined).length;
  if (classifiedCount === 6) return 'structured';
  if (classifiedCount > 0) return 'partial';
  return 'unstructured';
}

// ============================================
// Extraction Functions
// ============================================

export function extractDimensionValues(assets: DigitalAsset[], dimension: FilterDimension): any[] {
  const values = new Set<any>();
  assets.forEach(asset => {
    const record = asset.sqlRecord;
    if (!record) return;
    switch (dimension) {
      case 'category':
        if (record.NLP_NODE_CATEGORIZATION) values.add(record.NLP_NODE_CATEGORIZATION);
        break;
      case 'era': {
        const year = record.NLP_DERIVED_TIMESTAMP?.match(/\d{4}/)?.[0];
        if (year) values.add(year.slice(0, 3) + '0s');
        break;
      }
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
      case 'confidence': {
        const conf = record.CONFIDENCE_SCORE || 0;
        if (conf >= 0.9) values.add('excellent');
        else if (conf >= 0.7) values.add('good');
        else if (conf >= 0.5) values.add('fair');
        else values.add('low');
        break;
      }
      case 'contested': {
        const isContested = record.ACCESS_RESTRICTIONS ||
          /controversy|removed|relocated/i.test(record.DOCUMENT_DESCRIPTION);
        values.add(isContested);
        break;
      }
      case 'entities':
        record.ENTITIES_EXTRACTED?.forEach((e: string) => values.add(e));
        break;
      case 'historicalPeriod': {
        const eraYear = record.NLP_DERIVED_TIMESTAMP?.match(/\d{4}/)?.[0];
        if (eraYear) {
          const era = eraYear.slice(0, 3) + '0s';
          const periods = ERA_TO_HISTORICAL_PERIOD[era] || ['Modern'];
          periods.forEach(p => values.add(p));
        }
        break;
      }
      case 'documentAge':
        values.add(getDocumentAge(record.NLP_DERIVED_TIMESTAMP));
        break;
      case 'geographicScale':
        values.add(deriveGeographicScale(record));
        break;
      case 'placeType':
        if (record.LOCAL_GIS_ZONE) values.add(derivePlaceType(record.LOCAL_GIS_ZONE));
        break;
      case 'mediaType':
        values.add(deriveMediaType(record));
        break;
      case 'subjectMatter':
        values.add(deriveSubjectMatter(record, asset.graphData?.nodes || []));
        break;
      case 'connectionDensity':
        values.add(getConnectionDensity(asset, assets));
        break;
      case 'narrativeRole':
        values.add(deriveNarrativeRole(asset));
        break;
      case 'verificationLevel':
        values.add(getVerificationLevel(record));
        break;
      case 'serendipityScore':
        values.add(calculateSerendipityScore(asset, assets));
        break;
      case 'researchPotential':
        values.add(calculateResearchPotential(asset));
        break;
      case 'classificationStatus':
        values.add(getClassificationStatus(record));
        break;
    }
  });
  return Array.from(values).sort();
}

export function extractExpensiveDimensionsBatch(assets: DigitalAsset[]): Map<FilterDimension, any[]> {
  const result = new Map<FilterDimension, any[]>();
  const entityFreqMap = new Map<string, number>();
  for (const a of assets) {
    const entities = a.sqlRecord?.ENTITIES_EXTRACTED;
    if (entities) {
      for (const e of entities) {
        entityFreqMap.set(e, (entityFreqMap.get(e) || 0) + 1);
      }
    }
  }
  const categoryById = new Map<string, string>();
  for (const a of assets) {
    const cat = a.sqlRecord?.NLP_NODE_CATEGORIZATION;
    if (cat) categoryById.set(a.id, cat);
  }
  const subjectMatterValues = new Set<any>();
  const connectionDensityValues = new Set<any>();
  const serendipityValues = new Set<any>();
  for (const asset of assets) {
    const record = asset.sqlRecord;
    if (!record) continue;
    subjectMatterValues.add(deriveSubjectMatter(record, asset.graphData?.nodes || []));
    connectionDensityValues.add(getConnectionDensity(asset, assets));
    serendipityValues.add(calculateSerendipityScore(asset, assets, entityFreqMap, categoryById));
  }
  result.set('subjectMatter', Array.from(subjectMatterValues).sort());
  result.set('connectionDensity', Array.from(connectionDensityValues).sort());
  result.set('serendipityScore', Array.from(serendipityValues).sort());
  return result;
}

export function extractNodeTypes(graphData: GraphData): string[] {
  const types = new Set<string>();
  graphData.nodes.forEach(node => types.add(node.type));
  return Array.from(types).sort();
}

// ============================================
// Metadata Builder
// ============================================

export function buildDimensionMeta(dim: FilterDimension, availableValues: any[]): DimensionMetadata {
  const meta = DIMENSION_LABELS[dim];
  return {
    dimension: dim,
    label: meta.label,
    description: meta.description,
    dataType: meta.dataType,
    availableValues,
    filteredValues: availableValues,
    isActive: false,
    dependsOn: DIMENSION_DEPS_ON.get(dim) || [],
    affects: DIMENSION_AFFECTS.get(dim) || [],
  };
}
