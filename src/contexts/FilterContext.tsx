/**
 * Unified Filter Context
 * 
 * Provides dynamic, interdependent filtering across Knowledge Graph, 3D World,
 * Structure DB, and Curator Mode views. Implements a dependency graph for
 * qualitative modeling of complex quantitative structures.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { DigitalAsset, GraphNode, GraphData } from '../types';

// ============================================
// Filter Dimension Types
// ============================================

export type FilterDimension = 
  | 'category'      // NLP categorization
  | 'era'           // Time period
  | 'license'       // Data license
  | 'nodeType'      // Graph node type
  | 'zone'          // GIS zone
  | 'scanType'      // Document/Item/Scenery
  | 'status'        // Processing status
  | 'confidence'    // Confidence score threshold
  | 'entities'      // Entity types
  | 'relevance'     // Relevance score threshold
  | 'contested'     // Contested/restricted items
  | 'source';       // Source collection

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
// ============================================

const FILTER_DEPENDENCIES: FilterDependency[] = [
  // Category constrains entities (certain categories have specific entity types)
  { source: 'category', target: 'entities', type: 'constrains', weight: 0.8 },
  
  // Era affects confidence (older documents may have lower confidence)
  { source: 'era', target: 'confidence', type: 'suggests', weight: 0.4 },
  
  // Zone constrains category (urban zones have different document types)
  { source: 'zone', target: 'category', type: 'constrains', weight: 0.6 },
  
  // Scan type determines available entity types
  { source: 'scanType', target: 'entities', type: 'constrains', weight: 0.9 },
  
  // License affects nodeType visibility
  { source: 'license', target: 'nodeType', type: 'constrains', weight: 0.5 },
  
  // Confidence threshold affects relevance display
  { source: 'confidence', target: 'relevance', type: 'constrains', weight: 0.7 },
  
  // Status filters affect what's visible in curator
  { source: 'status', target: 'category', type: 'constrains', weight: 0.3 },
  
  // Category bi-directionally linked with nodeType for graph coherence
  { source: 'category', target: 'nodeType', type: 'suggests', weight: 0.6 },
  { source: 'nodeType', target: 'category', type: 'suggests', weight: 0.5 },
  
  // Contested flag affects license interpretation
  { source: 'contested', target: 'license', type: 'constrains', weight: 0.4 },
  
  // Source collection determines era distribution
  { source: 'source', target: 'era', type: 'suggests', weight: 0.5 },
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
  | 'public_domain'    // CC0 licensed items
  | 'high_confidence'  // Confidence > 0.8
  | 'recent_era'       // 2000s onwards
  | 'historic_era'     // Pre-1950s
  | 'documents_only'   // Document scan types
  | 'items_only'       // Item scan types
  | 'needs_review'     // Low confidence or contested
  | 'graph_ready'      // Assets with graph data
  | 'clear_all';

const QUICK_FILTER_DEFINITIONS: Record<QuickFilterPreset, FilterValue[]> = {
  public_domain: [
    { dimension: 'license', value: 'CC0', operator: 'eq' },
  ],
  high_confidence: [
    { dimension: 'confidence', value: 0.8, operator: 'gte' },
  ],
  recent_era: [
    { dimension: 'era', value: ['2000s', '2010s', '2020s'], operator: 'in' },
  ],
  historic_era: [
    { dimension: 'era', value: ['1800s', '1850s', '1900s', '1920s', '1930s', '1940s'], operator: 'in' },
  ],
  documents_only: [
    { dimension: 'scanType', value: 'DOCUMENT', operator: 'eq' },
  ],
  items_only: [
    { dimension: 'scanType', value: 'ITEM', operator: 'eq' },
  ],
  needs_review: [
    { dimension: 'confidence', value: 0.5, operator: 'lt' },
  ],
  graph_ready: [
    { dimension: 'nodeType', value: ['DOCUMENT', 'PERSON', 'LOCATION', 'ORGANIZATION'], operator: 'in' },
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

function extractDimensionValues(assets: DigitalAsset[], dimension: FilterDimension): any[] {
  const values = new Set<any>();
  
  assets.forEach(asset => {
    const record = asset.sqlRecord;
    if (!record) return;
    
    switch (dimension) {
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
        // Group into ranges
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
    }
  });
  
  return Array.from(values).sort();
}

function extractNodeTypes(graphData: GraphData): string[] {
  const types = new Set<string>();
  graphData.nodes.forEach(node => types.add(node.type));
  return Array.from(types).sort();
}

function applyFilterToAsset(asset: DigitalAsset, filter: FilterValue): boolean {
  const record = asset.sqlRecord;
  if (!record) return false;
  
  let actualValue: any;
  
  switch (filter.dimension) {
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
    default:
      return true;
  }
  
  switch (filter.operator) {
    case 'eq':
      return actualValue === filter.value;
    case 'neq':
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
    
    const dimensions: FilterDimension[] = [
      'category', 'era', 'license', 'nodeType', 'zone', 'scanType', 
      'status', 'confidence', 'entities', 'relevance', 'contested', 'source'
    ];
    
    const dimensionLabels: Record<FilterDimension, { label: string; description: string; dataType: DimensionMetadata['dataType'] }> = {
      category: { label: 'Category', description: 'NLP-derived document categorization', dataType: 'string' },
      era: { label: 'Era', description: 'Time period derived from document analysis', dataType: 'string' },
      license: { label: 'License', description: 'Data license type', dataType: 'string' },
      nodeType: { label: 'Node Type', description: 'Knowledge graph node type', dataType: 'string' },
      zone: { label: 'GIS Zone', description: 'Geographic zone classification', dataType: 'string' },
      scanType: { label: 'Scan Type', description: 'Type of scanned content', dataType: 'string' },
      status: { label: 'Status', description: 'Processing status', dataType: 'string' },
      confidence: { label: 'Confidence', description: 'Analysis confidence score', dataType: 'number' },
      entities: { label: 'Entities', description: 'Extracted named entities', dataType: 'array' },
      relevance: { label: 'Relevance', description: 'Graph node relevance score', dataType: 'number' },
      contested: { label: 'Contested', description: 'Has access restrictions or controversies', dataType: 'boolean' },
      source: { label: 'Source', description: 'Source collection', dataType: 'string' },
    };
    
    dimensions.forEach(dim => {
      const meta = dimensionLabels[dim];
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
