/**
 * Curator Merge Panel Component
 * 
 * Allows users to manually select and merge/consolidate assets
 * in Curator Mode and Structured DB views.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { 
  Merge, 
  Split, 
  Check, 
  X, 
  ChevronDown, 
  ChevronUp,
  Sparkles,
  Eye,
  AlertCircle,
  CheckCircle,
  Layers,
  Trash2,
  Edit3,
  RefreshCcw,
  Search,
  Filter
} from 'lucide-react';
import { DigitalAsset, ImageBundle } from '../types';
import { 
  getMergeSuggestions, 
  findSimilarAssets, 
  manualMergeAssets,
  DeduplicationCluster,
  SimilarityMatch,
  DEFAULT_CONFIG
} from '../services/deduplicationServiceV2';

// ============================================
// Types
// ============================================

interface CuratorMergePanelProps {
  assets: DigitalAsset[];
  selectedAssetIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onMergeComplete: (cluster: DeduplicationCluster) => void;
  onSplitComplete?: (assetIds: string[]) => void;
}

interface SuggestionCardProps {
  cluster: DeduplicationCluster;
  onAccept: () => void;
  onReject: () => void;
  onPreview: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

interface SimilarityBadgeProps {
  score: number;
}

// ============================================
// Utility Components
// ============================================

function SimilarityBadge({ score }: SimilarityBadgeProps) {
  const percentage = Math.round(score * 100);
  
  let color = 'bg-slate-600';
  let label = 'Low';
  
  if (percentage >= 80) {
    color = 'bg-emerald-600';
    label = 'High';
  } else if (percentage >= 60) {
    color = 'bg-amber-600';
    label = 'Medium';
  } else if (percentage >= 40) {
    color = 'bg-orange-600';
    label = 'Fair';
  }
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium text-white ${color}`}>
      {percentage}% {label}
    </span>
  );
}

function AssetPreviewCard({ asset }: { asset: DigitalAsset }) {
  return (
    <div className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg">
      <div className="w-12 h-12 rounded overflow-hidden bg-slate-700 flex-shrink-0">
        {asset.imageUrl ? (
          <img 
            src={asset.imageUrl} 
            alt="" 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500">
            <Layers size={20} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          {asset.sqlRecord?.DOCUMENT_TITLE || 'Untitled'}
        </p>
        <p className="text-xs text-slate-400 truncate">
          {asset.sqlRecord?.SOURCE_COLLECTION || 'No collection'}
        </p>
      </div>
    </div>
  );
}

// ============================================
// Suggestion Card Component
// ============================================

function SuggestionCard({ 
  cluster, 
  onAccept, 
  onReject, 
  onPreview,
  isExpanded,
  onToggleExpand 
}: SuggestionCardProps) {
  const allAssets = [cluster.primaryAsset, ...cluster.duplicates];
  
  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800/30">
      {/* Header */}
      <div className="p-3 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-400" />
            <span className="text-sm font-medium text-white">
              {cluster.consolidatedMetadata.title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SimilarityBadge score={cluster.similarity} />
            <span className="text-xs text-slate-400">
              {allAssets.length} items
            </span>
          </div>
        </div>
        
        {/* Match reasons */}
        <div className="flex flex-wrap gap-1 mt-2">
          {cluster.matchReasons.slice(0, 3).map((reason, i) => (
            <span key={i} className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300">
              {reason}
            </span>
          ))}
          {cluster.matchReasons.length > 3 && (
            <span className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-400">
              +{cluster.matchReasons.length - 3} more
            </span>
          )}
        </div>
      </div>
      
      {/* Preview thumbnails */}
      <div className="p-3 flex gap-2 overflow-x-auto">
        {allAssets.slice(0, 5).map((asset) => (
          <div 
            key={asset.id}
            className="w-16 h-16 rounded overflow-hidden bg-slate-700 flex-shrink-0"
          >
            {asset.imageUrl ? (
              <img 
                src={asset.imageUrl} 
                alt="" 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500">
                <Layers size={20} />
              </div>
            )}
          </div>
        ))}
        {allAssets.length > 5 && (
          <div className="w-16 h-16 rounded bg-slate-700 flex-shrink-0 flex items-center justify-center">
            <span className="text-xs text-slate-400">+{allAssets.length - 5}</span>
          </div>
        )}
      </div>
      
      {/* Expanded details */}
      {isExpanded && (
        <div className="p-3 border-t border-slate-700 space-y-2">
          <h4 className="text-xs font-semibold text-slate-400 uppercase">All Items</h4>
          {allAssets.map((asset) => (
            <AssetPreviewCard key={asset.id} asset={asset} />
          ))}
          
          <h4 className="text-xs font-semibold text-slate-400 uppercase mt-4">
            Consolidated Metadata
          </h4>
          <div className="text-sm text-slate-300 space-y-1">
            <p><span className="text-slate-500">Title:</span> {cluster.consolidatedMetadata.title}</p>
            <p><span className="text-slate-500">Category:</span> {cluster.consolidatedMetadata.category}</p>
            <p><span className="text-slate-500">Entities:</span> {cluster.consolidatedMetadata.entities.slice(0, 5).join(', ')}</p>
            <p><span className="text-slate-500">Keywords:</span> {cluster.consolidatedMetadata.keywords.slice(0, 5).join(', ')}</p>
          </div>
        </div>
      )}
      
      {/* Actions */}
      <div className="p-3 border-t border-slate-700 flex items-center justify-between">
        <button
          onClick={onToggleExpand}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
        >
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {isExpanded ? 'Less' : 'More'}
        </button>
        
        <div className="flex items-center gap-2">
          <button
            onClick={onReject}
            className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-white flex items-center gap-1"
          >
            <X size={14} />
            Keep Separate
          </button>
          <button
            onClick={onAccept}
            className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 rounded text-white flex items-center gap-1"
          >
            <Check size={14} />
            Merge
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Curator Merge Panel
// ============================================

export function CuratorMergePanel({
  assets,
  selectedAssetIds,
  onSelectionChange,
  onMergeComplete,
  onSplitComplete,
}: CuratorMergePanelProps) {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'manual' | 'similar'>('suggestions');
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [similarResults, setSimilarResults] = useState<SimilarityMatch[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  
  // Get AI-powered merge suggestions
  const suggestions = useMemo(() => {
    const allSuggestions = getMergeSuggestions(assets);
    return allSuggestions.filter(s => !dismissedSuggestions.has(s.id));
  }, [assets, dismissedSuggestions]);
  
  // Selected assets
  const selectedAssets = useMemo(() => {
    return assets.filter(a => selectedAssetIds.includes(a.id));
  }, [assets, selectedAssetIds]);
  
  // Handle accepting a suggestion
  const handleAcceptSuggestion = useCallback((cluster: DeduplicationCluster) => {
    onMergeComplete(cluster);
    setDismissedSuggestions(prev => new Set([...prev, cluster.id]));
  }, [onMergeComplete]);
  
  // Handle rejecting a suggestion
  const handleRejectSuggestion = useCallback((clusterId: string) => {
    setDismissedSuggestions(prev => new Set([...prev, clusterId]));
  }, []);
  
  // Handle manual merge
  const handleManualMerge = useCallback(() => {
    if (selectedAssetIds.length < 2) return;
    
    const cluster = manualMergeAssets(assets, {
      assetIds: selectedAssetIds,
      customTitle: customTitle || undefined,
    });
    
    onMergeComplete(cluster);
    onSelectionChange([]);
    setCustomTitle('');
  }, [assets, selectedAssetIds, customTitle, onMergeComplete, onSelectionChange]);
  
  // Find similar assets for a query
  const handleFindSimilar = useCallback(() => {
    if (selectedAssets.length !== 1) return;
    
    const results = findSimilarAssets(selectedAssets[0], assets, 0.25);
    setSimilarResults(results);
    setActiveTab('similar');
  }, [selectedAssets, assets]);
  
  // Add to selection from similar results
  const handleAddToSelection = useCallback((assetId: string) => {
    if (!selectedAssetIds.includes(assetId)) {
      onSelectionChange([...selectedAssetIds, assetId]);
    }
  }, [selectedAssetIds, onSelectionChange]);
  
  return (
    <div className="h-full flex flex-col bg-slate-900 text-white">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Merge size={20} className="text-primary-400" />
          Curator Merge Tools
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Consolidate duplicate and similar assets
        </p>
      </div>
      
      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setActiveTab('suggestions')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'suggestions'
              ? 'text-primary-400 border-b-2 border-primary-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Sparkles size={16} />
            Suggestions
            {suggestions.length > 0 && (
              <span className="px-1.5 py-0.5 bg-primary-600 rounded-full text-xs">
                {suggestions.length}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'manual'
              ? 'text-primary-400 border-b-2 border-primary-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Layers size={16} />
            Manual Merge
            {selectedAssetIds.length > 0 && (
              <span className="px-1.5 py-0.5 bg-amber-600 rounded-full text-xs">
                {selectedAssetIds.length}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('similar')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'similar'
              ? 'text-primary-400 border-b-2 border-primary-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Search size={16} />
            Find Similar
          </div>
        </button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Suggestions Tab */}
        {activeTab === 'suggestions' && (
          <div className="space-y-4">
            {suggestions.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle size={48} className="mx-auto text-emerald-400 mb-4" />
                <h3 className="text-lg font-semibold text-white">All caught up!</h3>
                <p className="text-sm text-slate-400 mt-2">
                  No duplicate suggestions at the moment.
                  <br />
                  Try lowering the threshold or adding more assets.
                </p>
                <button
                  onClick={() => setDismissedSuggestions(new Set())}
                  className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm flex items-center gap-2 mx-auto"
                >
                  <RefreshCcw size={14} />
                  Reset Dismissed
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-slate-400">
                    {suggestions.length} potential merge{suggestions.length !== 1 ? 's' : ''} detected
                  </p>
                  <button
                    onClick={() => setDismissedSuggestions(new Set())}
                    className="text-xs text-slate-500 hover:text-white"
                  >
                    Reset
                  </button>
                </div>
                
                {suggestions.map((cluster) => (
                  <SuggestionCard
                    key={cluster.id}
                    cluster={cluster}
                    onAccept={() => handleAcceptSuggestion(cluster)}
                    onReject={() => handleRejectSuggestion(cluster.id)}
                    onPreview={() => {}}
                    isExpanded={expandedSuggestion === cluster.id}
                    onToggleExpand={() => setExpandedSuggestion(
                      expandedSuggestion === cluster.id ? null : cluster.id
                    )}
                  />
                ))}
              </>
            )}
          </div>
        )}
        
        {/* Manual Merge Tab */}
        {activeTab === 'manual' && (
          <div className="space-y-4">
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-sm font-semibold text-white mb-2">
                Selected Assets ({selectedAssetIds.length})
              </h3>
              
              {selectedAssets.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Select assets from the main view to merge them.
                  <br />
                  Use checkboxes or Ctrl+Click to multi-select.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedAssets.map((asset) => (
                    <div key={asset.id} className="flex items-center gap-2">
                      <AssetPreviewCard asset={asset} />
                      <button
                        onClick={() => onSelectionChange(
                          selectedAssetIds.filter(id => id !== asset.id)
                        )}
                        className="p-1 hover:bg-slate-700 rounded"
                      >
                        <X size={14} className="text-slate-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {selectedAssets.length >= 2 && (
              <>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <h3 className="text-sm font-semibold text-white mb-2">
                    Merge Options
                  </h3>
                  
                  <label className="block mb-4">
                    <span className="text-xs text-slate-400">Custom Title (optional)</span>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="Leave empty for auto-generated title"
                      className="mt-1 w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm"
                    />
                  </label>
                  
                  <button
                    onClick={handleManualMerge}
                    className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-semibold flex items-center justify-center gap-2"
                  >
                    <Merge size={18} />
                    Merge {selectedAssets.length} Assets
                  </button>
                </div>
                
                {selectedAssets.length === 1 && (
                  <button
                    onClick={handleFindSimilar}
                    className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm flex items-center justify-center gap-2"
                  >
                    <Search size={16} />
                    Find Similar Assets
                  </button>
                )}
              </>
            )}
          </div>
        )}
        
        {/* Find Similar Tab */}
        {activeTab === 'similar' && (
          <div className="space-y-4">
            {selectedAssets.length !== 1 ? (
              <div className="text-center py-8">
                <AlertCircle size={48} className="mx-auto text-amber-400 mb-4" />
                <h3 className="text-lg font-semibold text-white">Select One Asset</h3>
                <p className="text-sm text-slate-400 mt-2">
                  Select a single asset to find similar items.
                </p>
              </div>
            ) : (
              <>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <h3 className="text-sm font-semibold text-white mb-2">Reference Asset</h3>
                  <AssetPreviewCard asset={selectedAssets[0]} />
                  <button
                    onClick={handleFindSimilar}
                    className="mt-3 w-full px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-lg text-sm flex items-center justify-center gap-2"
                  >
                    <Search size={16} />
                    Search for Similar
                  </button>
                </div>
                
                {similarResults.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-white">
                      Similar Assets ({similarResults.length})
                    </h3>
                    
                    {similarResults.map((match) => (
                      <div 
                        key={match.assetB.id}
                        className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700"
                      >
                        <div className="flex-1">
                          <AssetPreviewCard asset={match.assetB} />
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <SimilarityBadge score={match.score} />
                          <button
                            onClick={() => handleAddToSelection(match.assetB.id)}
                            disabled={selectedAssetIds.includes(match.assetB.id)}
                            className={`px-3 py-1 text-xs rounded ${
                              selectedAssetIds.includes(match.assetB.id)
                                ? 'bg-slate-700 text-slate-500'
                                : 'bg-primary-600 hover:bg-primary-500 text-white'
                            }`}
                          >
                            {selectedAssetIds.includes(match.assetB.id) ? 'Selected' : 'Add'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Footer Stats */}
      <div className="p-3 border-t border-slate-700 bg-slate-800/50">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{assets.length} total assets</span>
          <span>{suggestions.length} pending suggestions</span>
        </div>
      </div>
    </div>
  );
}

export default CuratorMergePanel;
