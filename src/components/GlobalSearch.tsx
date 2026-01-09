/**
 * Global Semantic Search Component
 * NLP-powered search bar with filters for GIS, entities, keywords
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search,
  X,
  Filter,
  MapPin,
  User,
  Calendar,
  Tag,
  FileText,
  Building2,
  Sparkles,
  History,
  TrendingUp,
  Command,
  CornerDownLeft,
} from 'lucide-react';
import { DigitalAsset, GraphNode } from '../types';

// Search filter types
type SearchFilterType = 'all' | 'gis' | 'entity' | 'keyword' | 'date' | 'document';

interface SearchFilter {
  type: SearchFilterType;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const SEARCH_FILTERS: SearchFilter[] = [
  { type: 'all', label: 'All', icon: <Search size={14} />, color: 'text-slate-400' },
  { type: 'gis', label: 'Locations', icon: <MapPin size={14} />, color: 'text-emerald-400' },
  { type: 'entity', label: 'People & Orgs', icon: <User size={14} />, color: 'text-blue-400' },
  { type: 'document', label: 'Documents', icon: <FileText size={14} />, color: 'text-purple-400' },
  { type: 'date', label: 'Dates', icon: <Calendar size={14} />, color: 'text-amber-400' },
  { type: 'keyword', label: 'Keywords', icon: <Tag size={14} />, color: 'text-pink-400' },
];

interface SearchResult {
  id: string;
  type: 'asset' | 'node' | 'suggestion';
  title: string;
  subtitle?: string;
  category: SearchFilterType;
  relevance: number;
  data?: DigitalAsset | GraphNode;
}

interface GlobalSearchProps {
  assets: DigitalAsset[];
  graphNodes?: GraphNode[];
  onResultSelect: (result: SearchResult) => void;
  onNavigateToTab?: (tab: string) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Simple fuzzy matching for demo
function fuzzyMatch(text: string, query: string): number {
  if (!text || !query) return 0;
  
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  // Exact match
  if (lowerText === lowerQuery) return 1;
  
  // Contains match
  if (lowerText.includes(lowerQuery)) return 0.8;
  
  // Word match
  const words = lowerText.split(/\s+/);
  const queryWords = lowerQuery.split(/\s+/);
  const matchedWords = queryWords.filter(qw => 
    words.some(w => w.includes(qw) || qw.includes(w))
  );
  
  if (matchedWords.length > 0) {
    return 0.5 * (matchedWords.length / queryWords.length);
  }
  
  return 0;
}

export default function GlobalSearch({
  assets,
  graphNodes = [],
  onResultSelect,
  onNavigateToTab,
  isOpen: controlledOpen,
  onOpenChange,
}: GlobalSearchProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<SearchFilterType>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('geograph-recent-searches') || '[]');
    } catch {
      return [];
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Compute search results
  const results = useMemo((): SearchResult[] => {
    if (!query.trim()) {
      // Show trending/suggested when no query
      return assets.slice(0, 5).map(asset => ({
        id: asset.id,
        type: 'suggestion' as const,
        title: asset.sqlRecord?.DOCUMENT_TITLE || 'Untitled',
        subtitle: asset.sqlRecord?.SOURCE_COLLECTION || 'Recent',
        category: 'document' as SearchFilterType,
        relevance: 0.5,
        data: asset,
      }));
    }

    const searchResults: SearchResult[] = [];

    // Search assets
    assets.forEach(asset => {
      const record = asset.sqlRecord;
      if (!record) return;

      // Search in various fields
      const titleMatch = fuzzyMatch(record.DOCUMENT_TITLE || '', query);
      const contentMatch = fuzzyMatch(record.RAW_OCR_TRANSCRIPTION || '', query);
      const sourceMatch = fuzzyMatch(record.SOURCE_COLLECTION || '', query);
      const locationMatch = fuzzyMatch(
        `${record.LOCAL_GIS_ZONE || ''} ${record.OCR_DERIVED_GIS_ZONE || ''}`,
        query
      );
      const entityMatch = fuzzyMatch(
        (record.ENTITIES_EXTRACTED || []).join(' '),
        query
      );

      const maxRelevance = Math.max(titleMatch, contentMatch * 0.7, sourceMatch * 0.6, locationMatch, entityMatch);

      if (maxRelevance > 0.1) {
        // Determine category based on strongest match
        let category: SearchFilterType = 'document';
        if (locationMatch === maxRelevance) category = 'gis';
        if (entityMatch === maxRelevance) category = 'entity';

        // Filter by active filter
        if (activeFilter !== 'all' && category !== activeFilter) return;

        searchResults.push({
          id: asset.id,
          type: 'asset',
          title: record.DOCUMENT_TITLE || 'Untitled Document',
          subtitle: record.SOURCE_COLLECTION || 'Local Collection',
          category,
          relevance: maxRelevance,
          data: asset,
        });
      }
    });

    // Search graph nodes
    graphNodes.forEach(node => {
      const labelMatch = fuzzyMatch(node.label, query);
      if (labelMatch > 0.2) {
        const nodeCategory: SearchFilterType = 
          node.type === 'LOCATION' ? 'gis' :
          node.type === 'PERSON' || node.type === 'ORGANIZATION' ? 'entity' :
          node.type === 'DATE' ? 'date' :
          'keyword';

        if (activeFilter !== 'all' && nodeCategory !== activeFilter) return;

        searchResults.push({
          id: node.id,
          type: 'node',
          title: node.label,
          subtitle: `${node.type} • ${node.relevance ? Math.round(node.relevance * 100) : 0}% relevance`,
          category: nodeCategory,
          relevance: labelMatch * (node.relevance || 0.5),
          data: node,
        });
      }
    });

    // Sort by relevance
    return searchResults.sort((a, b) => b.relevance - a.relevance).slice(0, 20);
  }, [query, assets, graphNodes, activeFilter]);

  // Navigate results with keyboard
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeFilter]);

  const handleSelect = useCallback((result: SearchResult) => {
    // Save to recent searches
    if (query.trim()) {
      const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem('geograph-recent-searches', JSON.stringify(updated));
    }

    onResultSelect(result);
    setIsOpen(false);
    setQuery('');
  }, [query, recentSearches, onResultSelect, setIsOpen]);

  const getCategoryIcon = (category: SearchFilterType) => {
    switch (category) {
      case 'gis': return <MapPin size={14} className="text-emerald-400" />;
      case 'entity': return <User size={14} className="text-blue-400" />;
      case 'document': return <FileText size={14} className="text-purple-400" />;
      case 'date': return <Calendar size={14} className="text-amber-400" />;
      case 'keyword': return <Tag size={14} className="text-pink-400" />;
      default: return <Search size={14} className="text-slate-400" />;
    }
  };

  if (!isOpen) {
    // Compact search trigger
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-all group"
        aria-label="Open search (Cmd+K)"
      >
        <Search size={16} />
        <span className="hidden sm:inline text-sm">Search...</span>
        <kbd className="hidden md:flex items-center gap-1 px-1.5 py-0.5 bg-slate-900 rounded text-xs text-slate-500 group-hover:text-slate-400">
          <Command size={10} />K
        </kbd>
      </button>
    );
  }

  return (
    <div 
      className="fixed inset-0 z-[150] flex items-start justify-center pt-[10vh] px-4"
      onClick={() => setIsOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />

      {/* Search Modal */}
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn"
        role="dialog"
        aria-label="Search"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-800">
          <Search size={20} className="text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents, locations, people..."
            className="flex-1 bg-transparent text-white text-lg placeholder-slate-500 focus:outline-none"
            aria-label="Search query"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-slate-500 hover:text-white transition-colors"
              aria-label="Clear search"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 px-4 py-3 border-b border-slate-800 overflow-x-auto">
          {SEARCH_FILTERS.map((filter) => (
            <button
              key={filter.type}
              onClick={() => setActiveFilter(filter.type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                activeFilter === filter.type
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {filter.icon}
              {filter.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {!query && recentSearches.length > 0 && (
            <div className="px-4 py-2">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                <History size={12} />
                Recent Searches
              </div>
              {recentSearches.map((search, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(search)}
                  className="block w-full text-left px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  {search}
                </button>
              ))}
            </div>
          )}

          {results.length > 0 ? (
            <div className="py-2">
              {!query && (
                <div className="flex items-center gap-2 px-4 py-1 text-xs text-slate-500">
                  <TrendingUp size={12} />
                  Suggested
                </div>
              )}
              {results.map((result, index) => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    index === selectedIndex
                      ? 'bg-slate-800'
                      : 'hover:bg-slate-800/50'
                  }`}
                >
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                    {getCategoryIcon(result.category)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{result.title}</p>
                    {result.subtitle && (
                      <p className="text-slate-500 text-sm truncate">{result.subtitle}</p>
                    )}
                  </div>
                  {result.type === 'asset' && (
                    <span className="text-xs text-primary-400 flex items-center gap-1">
                      <Sparkles size={10} />
                      {Math.round(result.relevance * 100)}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : query ? (
            <div className="py-12 text-center text-slate-500">
              <Search size={32} className="mx-auto mb-3 opacity-50" />
              <p>No results found for "{query}"</p>
              <p className="text-sm mt-1">Try adjusting your search or filters</p>
            </div>
          ) : null}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-950/50 text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded">↑↓</kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded flex items-center gap-0.5">
                <CornerDownLeft size={10} />
              </kbd> Select
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded">Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
