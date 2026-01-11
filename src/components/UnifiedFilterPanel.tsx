/**
 * Unified Filter Panel Component
 * 
 * A sophisticated filter interface that provides dynamic, interdependent filtering
 * across Knowledge Graph, 3D World, Structure DB, and Curator Mode views.
 * Implements qualitative modeling of complex quantitative data structures.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Link2,
  Unlink,
  Sparkles,
  Layers,
  Sliders,
  Target,
  Zap,
  Database,
  Network,
  Globe,
  ShieldCheck,
  BarChart2,
  TrendingDown,
  Info,
  Save,
  Upload,
  Clock,
  FileText,
  Tag,
  MapPin,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  useFilterContext,
  FilterDimension,
  FilterValue,
  ViewMode,
  QuickFilterPreset,
  DimensionMetadata,
} from '../contexts/FilterContext';

// ============================================
// Types
// ============================================

interface UnifiedFilterPanelProps {
  activeView?: ViewMode;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  showQuickFilters?: boolean;
  showViewSync?: boolean;
  showAnalytics?: boolean;
  compactMode?: boolean;
}

interface DimensionFilterProps {
  dimension: FilterDimension;
  metadata: DimensionMetadata;
  currentValue?: FilterValue;
  constrainedValues: any[];
  onFilterChange: (value: FilterValue | null) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  compactMode?: boolean;
}

// ============================================
// Icon Mapping
// ============================================

const DIMENSION_ICONS: Record<FilterDimension, React.ReactNode> = {
  category: <Tag size={14} />,
  era: <Clock size={14} />,
  license: <ShieldCheck size={14} />,
  nodeType: <Network size={14} />,
  zone: <MapPin size={14} />,
  scanType: <FileText size={14} />,
  status: <CheckCircle size={14} />,
  confidence: <Target size={14} />,
  entities: <Layers size={14} />,
  relevance: <TrendingDown size={14} />,
  contested: <AlertTriangle size={14} />,
  source: <Database size={14} />,
};

const VIEW_ICONS: Record<ViewMode, React.ReactNode> = {
  graph: <Network size={14} />,
  world: <Globe size={14} />,
  database: <Database size={14} />,
  curator: <ShieldCheck size={14} />,
  semantic: <Layers size={14} />,
};

const QUICK_FILTER_INFO: Record<QuickFilterPreset, { label: string; icon: React.ReactNode; description: string }> = {
  public_domain: { label: 'Public Domain', icon: <ShieldCheck size={12} />, description: 'CC0 licensed items only' },
  high_confidence: { label: 'High Confidence', icon: <Target size={12} />, description: 'Confidence score ≥ 80%' },
  recent_era: { label: 'Recent Era', icon: <Clock size={12} />, description: '2000s onwards' },
  historic_era: { label: 'Historic', icon: <Clock size={12} />, description: 'Pre-1950s documents' },
  documents_only: { label: 'Documents', icon: <FileText size={12} />, description: 'Document scan types' },
  items_only: { label: 'Items', icon: <Layers size={12} />, description: 'Item scan types' },
  needs_review: { label: 'Needs Review', icon: <AlertTriangle size={12} />, description: 'Low confidence items' },
  graph_ready: { label: 'Graph Ready', icon: <Network size={12} />, description: 'Assets with graph data' },
  clear_all: { label: 'Clear All', icon: <X size={12} />, description: 'Reset all filters' },
};

// ============================================
// Sub-Components
// ============================================

function QuickFilterButton({
  preset,
  isActive,
  onClick,
}: {
  preset: QuickFilterPreset;
  isActive: boolean;
  onClick: () => void;
}) {
  const info = QUICK_FILTER_INFO[preset];
  
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
        transition-all duration-200 group
        ${isActive 
          ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20' 
          : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-white border border-slate-700/50'
        }
      `}
      title={info.description}
    >
      <span className={`transition-transform ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
        {info.icon}
      </span>
      <span>{info.label}</span>
    </button>
  );
}

function DimensionFilter({
  dimension,
  metadata,
  currentValue,
  constrainedValues,
  onFilterChange,
  isExpanded,
  onToggleExpand,
  compactMode = false,
}: DimensionFilterProps) {
  const isActive = !!currentValue;
  const availableCount = metadata.availableValues.length;
  const constrainedCount = constrainedValues.length;
  const isConstrained = constrainedCount < availableCount;
  
  const handleValueSelect = (value: any) => {
    if (currentValue?.value === value) {
      onFilterChange(null);
    } else {
      onFilterChange({
        dimension,
        value,
        operator: metadata.dataType === 'array' ? 'contains' : 'eq',
      });
    }
  };
  
  const handleMultiSelect = (values: any[]) => {
    if (values.length === 0) {
      onFilterChange(null);
    } else {
      onFilterChange({
        dimension,
        value: values,
        operator: 'in',
      });
    }
  };
  
  // Render based on data type
  const renderValues = () => {
    if (metadata.dataType === 'boolean') {
      return (
        <div className="flex gap-2">
          <button
            onClick={() => handleValueSelect(true)}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              currentValue?.value === true
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Yes
          </button>
          <button
            onClick={() => handleValueSelect(false)}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              currentValue?.value === false
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            No
          </button>
        </div>
      );
    }
    
    if (metadata.dataType === 'number') {
      const ranges = ['excellent', 'good', 'fair', 'low'];
      return (
        <div className="flex flex-wrap gap-1.5">
          {ranges.map(range => {
            const isSelected = currentValue?.value === range || 
              (Array.isArray(currentValue?.value) && currentValue.value.includes(range));
            const isAvailable = constrainedValues.includes(range);
            
            return (
              <button
                key={range}
                onClick={() => handleValueSelect(range)}
                disabled={!isAvailable}
                className={`
                  px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all
                  ${isSelected
                    ? 'bg-primary-600 text-white'
                    : isAvailable
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-900 text-slate-600 cursor-not-allowed opacity-50'
                  }
                `}
              >
                {range}
              </button>
            );
          })}
        </div>
      );
    }
    
    // String or array types - show pill buttons
    const displayValues = isExpanded ? constrainedValues : constrainedValues.slice(0, 6);
    const hasMore = constrainedValues.length > 6;
    
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {displayValues.map((value: any) => {
            const isSelected = currentValue?.value === value ||
              (Array.isArray(currentValue?.value) && currentValue.value.includes(value));
            const displayValue = String(value).length > 20 
              ? String(value).slice(0, 18) + '...' 
              : String(value);
            
            return (
              <button
                key={value}
                onClick={() => handleValueSelect(value)}
                className={`
                  px-2.5 py-1 rounded-md text-xs font-medium transition-all
                  ${isSelected
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/50'
                  }
                `}
                title={String(value)}
              >
                {displayValue}
              </button>
            );
          })}
        </div>
        
        {hasMore && !isExpanded && (
          <button
            onClick={onToggleExpand}
            className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
          >
            <ChevronDown size={12} />
            Show {constrainedValues.length - 6} more
          </button>
        )}
        
        {hasMore && isExpanded && (
          <button
            onClick={onToggleExpand}
            className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
          >
            <ChevronUp size={12} />
            Show less
          </button>
        )}
      </div>
    );
  };
  
  if (compactMode) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-slate-500">{DIMENSION_ICONS[dimension]}</span>
        <select
          value={currentValue?.value as string || ''}
          onChange={(e) => e.target.value ? handleValueSelect(e.target.value) : onFilterChange(null)}
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
        >
          <option value="">All {metadata.label}s</option>
          {constrainedValues.map((v: any) => (
            <option key={v} value={v}>{String(v)}</option>
          ))}
        </select>
      </div>
    );
  }
  
  return (
    <div className={`rounded-xl border transition-all ${
      isActive 
        ? 'bg-slate-800/80 border-primary-500/50' 
        : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
    }`}>
      <div 
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={onToggleExpand}
      >
        <span className={`p-1.5 rounded-lg ${isActive ? 'bg-primary-500/20 text-primary-400' : 'bg-slate-800 text-slate-500'}`}>
          {DIMENSION_ICONS[dimension]}
        </span>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-white">{metadata.label}</span>
            {isActive && (
              <span className="px-1.5 py-0.5 bg-primary-500/20 rounded text-[10px] text-primary-400 font-bold">
                ACTIVE
              </span>
            )}
            {isConstrained && !isActive && (
              <span className="px-1.5 py-0.5 bg-amber-500/20 rounded text-[10px] text-amber-400 font-bold">
                CONSTRAINED
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 truncate">{metadata.description}</p>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {constrainedCount}/{availableCount}
          </span>
          {isExpanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </div>
      </div>
      
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-800">
          {constrainedValues.length > 0 ? (
            renderValues()
          ) : (
            <p className="text-xs text-slate-500 italic py-2">No values available with current filters</p>
          )}
        </div>
      )}
      
      {isActive && (
        <div className="px-3 pb-3">
          <button
            onClick={(e) => { e.stopPropagation(); onFilterChange(null); }}
            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
          >
            <X size={12} />
            Clear filter
          </button>
        </div>
      )}
    </div>
  );
}

function ViewSyncToggle({ view, isSynced, onToggle }: { view: ViewMode; isSynced: boolean; onToggle: () => void }) {
  const viewLabels: Record<ViewMode, string> = {
    graph: 'Knowledge Graph',
    world: '3D World',
    database: 'Structure DB',
    curator: 'Curator Mode',
    semantic: 'Semantic View',
  };
  
  return (
    <button
      onClick={onToggle}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all
        ${isSynced 
          ? 'bg-primary-600/20 text-primary-400 border border-primary-500/30' 
          : 'bg-slate-800/50 text-slate-500 border border-slate-700/50 hover:border-slate-600'
        }
      `}
    >
      {VIEW_ICONS[view]}
      <span>{viewLabels[view]}</span>
      {isSynced ? <Link2 size={12} /> : <Unlink size={12} />}
    </button>
  );
}

function FilterAnalyticsBar({ 
  total, 
  filtered, 
  efficiency 
}: { 
  total: number; 
  filtered: number; 
  efficiency: number;
}) {
  const percentage = total > 0 ? (filtered / total) * 100 : 100;
  
  return (
    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">Filter Results</span>
        <span className="text-sm font-bold text-white">{filtered.toLocaleString()}</span>
      </div>
      
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-primary-600 to-primary-400 transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
        <span>of {total.toLocaleString()} total</span>
        <span className={efficiency < 0.5 ? 'text-amber-400' : ''}>
          {(percentage).toFixed(1)}% shown
        </span>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function UnifiedFilterPanel({
  activeView,
  isCollapsed = false,
  onCollapsedChange,
  showQuickFilters = true,
  showViewSync = true,
  showAnalytics = true,
  compactMode = false,
}: UnifiedFilterPanelProps) {
  const context = useFilterContext();
  const [expandedDimensions, setExpandedDimensions] = useState<Set<FilterDimension>>(new Set(['category']));
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const { state, analytics, setFilter, clearAllFilters, toggleViewSync, applyQuickFilter, getConstrainedValues, exportFilterState, importFilterState } = context;
  
  const activeFilterCount = context.getActiveFilterCount();
  
  const toggleDimensionExpand = useCallback((dimension: FilterDimension) => {
    setExpandedDimensions(prev => {
      const next = new Set(prev);
      if (next.has(dimension)) {
        next.delete(dimension);
      } else {
        next.add(dimension);
      }
      return next;
    });
  }, []);
  
  // Determine which quick filter is active
  const activeQuickFilter = useMemo(() => {
    if (state.activeFilters.size === 0) return null;
    if (state.activeFilters.size === 1) {
      const [filter] = Array.from(state.activeFilters.values());
      if (filter.dimension === 'license' && filter.value === 'CC0') return 'public_domain';
      if (filter.dimension === 'confidence' && filter.value === 0.8) return 'high_confidence';
      if (filter.dimension === 'scanType' && filter.value === 'DOCUMENT') return 'documents_only';
      if (filter.dimension === 'scanType' && filter.value === 'ITEM') return 'items_only';
    }
    return null;
  }, [state.activeFilters]);
  
  // Primary dimensions shown first
  const primaryDimensions: FilterDimension[] = ['category', 'era', 'nodeType', 'license'];
  const advancedDimensions: FilterDimension[] = ['zone', 'scanType', 'status', 'confidence', 'contested', 'source'];
  
  const handleExport = () => {
    const json = exportFilterState();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'filter-state.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        importFilterState(text);
      }
    };
    input.click();
  };
  
  if (isCollapsed) {
    return (
      <button
        onClick={() => onCollapsedChange?.(false)}
        className="p-2 bg-slate-900/80 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors"
      >
        <Filter size={16} className="text-slate-400" />
        {activeFilterCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-600 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </button>
    );
  }
  
  return (
    <div className={`bg-slate-900/95 backdrop-blur-sm border border-slate-800 rounded-2xl shadow-2xl ${compactMode ? 'p-3' : 'p-4'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-primary-600 to-primary-700 rounded-lg">
            <Sliders size={18} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-white">Dynamic Filters</h3>
            <p className="text-xs text-slate-500">Interdependent filtering engine</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <RefreshCw size={12} />
              Clear ({activeFilterCount})
            </button>
          )}
          
          {onCollapsedChange && (
            <button
              onClick={() => onCollapsedChange(true)}
              className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X size={14} className="text-slate-500" />
            </button>
          )}
        </div>
      </div>
      
      {/* Quick Filters */}
      {showQuickFilters && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={12} className="text-amber-400" />
            <span className="text-xs font-medium text-slate-400">Quick Filters</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['public_domain', 'high_confidence', 'documents_only', 'historic_era', 'needs_review'] as QuickFilterPreset[]).map(preset => (
              <QuickFilterButton
                key={preset}
                preset={preset}
                isActive={activeQuickFilter === preset}
                onClick={() => applyQuickFilter(preset)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* View Sync */}
      {showViewSync && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Link2 size={12} className="text-primary-400" />
            <span className="text-xs font-medium text-slate-400">Synced Views</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['graph', 'world', 'database', 'curator'] as ViewMode[]).map(view => (
              <ViewSyncToggle
                key={view}
                view={view}
                isSynced={state.syncedViews.has(view)}
                onToggle={() => toggleViewSync(view)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Analytics */}
      {showAnalytics && (
        <div className="mb-4">
          <FilterAnalyticsBar
            total={analytics.totalAssets}
            filtered={analytics.filteredAssets}
            efficiency={analytics.filterEfficiency}
          />
        </div>
      )}
      
      {/* Primary Dimensions */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Filter size={12} className="text-slate-400" />
          <span className="text-xs font-medium text-slate-400">Filter Dimensions</span>
        </div>
        
        {primaryDimensions.map(dim => {
          const metadata = state.dimensions.get(dim);
          if (!metadata) return null;
          
          return (
            <DimensionFilter
              key={dim}
              dimension={dim}
              metadata={metadata}
              currentValue={state.activeFilters.get(dim)}
              constrainedValues={getConstrainedValues(dim)}
              onFilterChange={(value) => setFilter(dim, value)}
              isExpanded={expandedDimensions.has(dim)}
              onToggleExpand={() => toggleDimensionExpand(dim)}
              compactMode={compactMode}
            />
          );
        })}
      </div>
      
      {/* Advanced Dimensions */}
      <div className="border-t border-slate-800 pt-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors mb-3"
        >
          {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span className="font-medium">Advanced Filters</span>
          <span className="text-slate-600">({advancedDimensions.length})</span>
        </button>
        
        {showAdvanced && (
          <div className="space-y-2">
            {advancedDimensions.map(dim => {
              const metadata = state.dimensions.get(dim);
              if (!metadata) return null;
              
              return (
                <DimensionFilter
                  key={dim}
                  dimension={dim}
                  metadata={metadata}
                  currentValue={state.activeFilters.get(dim)}
                  constrainedValues={getConstrainedValues(dim)}
                  onFilterChange={(value) => setFilter(dim, value)}
                  isExpanded={expandedDimensions.has(dim)}
                  onToggleExpand={() => toggleDimensionExpand(dim)}
                  compactMode={compactMode}
                />
              );
            })}
          </div>
        )}
      </div>
      
      {/* Footer Actions */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors group"
            title="Export filter state"
          >
            <Save size={14} className="text-slate-500 group-hover:text-white" />
          </button>
          <button
            onClick={handleImport}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors group"
            title="Import filter state"
          >
            <Upload size={14} className="text-slate-500 group-hover:text-white" />
          </button>
        </div>
        
        {analytics.suggestedFilters.length > 0 && (
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-amber-400" />
            <span className="text-xs text-slate-500">
              {analytics.suggestedFilters.length} suggested filter{analytics.suggestedFilters.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Compact Inline Filter Bar
// ============================================

export function InlineFilterBar({ activeView }: { activeView?: ViewMode }) {
  const context = useFilterContext();
  const { state, setFilter, clearFilter, getConstrainedValues } = context;
  const activeFilterCount = context.getActiveFilterCount();
  
  // Show only the most commonly used filters inline
  const inlineDimensions: FilterDimension[] = ['category', 'era', 'license'];
  
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-slate-900/50 border-b border-slate-800">
      <div className="flex items-center gap-2 text-slate-500">
        <Filter size={14} />
        <span className="text-xs font-medium">Filters</span>
      </div>
      
      {inlineDimensions.map(dim => {
        const metadata = state.dimensions.get(dim);
        const currentValue = state.activeFilters.get(dim);
        const constrainedValues = getConstrainedValues(dim);
        
        if (!metadata) return null;
        
        return (
          <div key={dim} className="flex items-center gap-1.5">
            <span className="text-slate-600">{DIMENSION_ICONS[dim]}</span>
            <select
              value={currentValue?.value as string || ''}
              onChange={(e) => {
                if (e.target.value) {
                  setFilter(dim, { dimension: dim, value: e.target.value, operator: 'eq' });
                } else {
                  clearFilter(dim);
                }
              }}
              className="bg-transparent border-none text-xs text-slate-300 focus:outline-none cursor-pointer font-medium"
            >
              <option value="">All {metadata.label}s</option>
              {constrainedValues.map((v: any) => (
                <option key={v} value={v}>{String(v)}</option>
              ))}
            </select>
          </div>
        );
      })}
      
      {activeFilterCount > 0 && (
        <button
          onClick={() => context.clearAllFilters()}
          className="ml-auto text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
        >
          <X size={12} />
          Clear ({activeFilterCount})
        </button>
      )}
    </div>
  );
}

// ============================================
// Filter Badge (for showing active filters)
// ============================================

export function FilterBadge({ count, onClick }: { count: number; onClick?: () => void }) {
  if (count === 0) return null;
  
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 bg-primary-600/20 hover:bg-primary-600/30 border border-primary-500/30 rounded-lg text-xs font-medium text-primary-400 transition-colors"
    >
      <Filter size={12} />
      <span>{count} filter{count > 1 ? 's' : ''}</span>
    </button>
  );
}
