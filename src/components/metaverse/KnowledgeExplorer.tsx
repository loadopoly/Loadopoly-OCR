/**
 * Knowledge Explorer Component
 * 
 * An immersive, interactive exploration interface for the knowledge graph.
 * Designed to help users understand connections, discover history, and
 * engage deeply with their corpus of information.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { 
  X, 
  ExternalLink, 
  GitBranch, 
  Clock, 
  BookOpen, 
  Network, 
  Sparkles,
  ChevronRight,
  Map as MapIcon,
  Compass,
  Star,
  History,
  Link2,
  Eye,
  Filter,
  Search,
  Target,
  Maximize2,
  Info,
  Zap,
  TrendingUp,
  Calendar,
  Globe,
  Users,
  FileText,
  Building,
  MapPin,
  Tag,
  Layers
} from 'lucide-react';
import { GraphData, GraphNode, GraphLink, DigitalAsset } from '../../types';

// ============================================
// Types
// ============================================

interface NodeInsight {
  node: GraphNode;
  connections: ConnectionInfo[];
  pathsTo: PathInfo[];
  clusters: ClusterInfo[];
  temporalContext?: TemporalContext;
  relatedAssets: string[];
}

interface ConnectionInfo {
  node: GraphNode;
  relationship: string;
  direction: 'outgoing' | 'incoming';
  strength: number;
}

interface PathInfo {
  targetNode: GraphNode;
  hops: GraphNode[];
  relationships: string[];
  significance: number;
}

interface ClusterInfo {
  name: string;
  nodes: GraphNode[];
  theme: string;
  relevance: number;
}

interface TemporalContext {
  era?: string;
  dateRange?: { start: string; end: string };
  historicalPeriod?: string;
  timelinePosition?: number;
}

interface KnowledgeExplorerProps {
  graphData: GraphData;
  assets: DigitalAsset[];
  selectedNode: GraphNode | null;
  onNodeSelect: (node: GraphNode | null) => void;
  onAssetView?: (assetId: string) => void;
  onPathExplore?: (path: GraphNode[]) => void;
}

// ============================================
// Utility Functions
// ============================================

function findConnections(node: GraphNode, graphData: GraphData): ConnectionInfo[] {
  const connections: ConnectionInfo[] = [];
  const nodeMap = new Map<string, GraphNode>(graphData.nodes.map(n => [n.id, n]));

  graphData.links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;

    if (sourceId === node.id) {
      const targetNode = nodeMap.get(targetId);
      if (targetNode) {
        connections.push({
          node: targetNode,
          relationship: link.relationship,
          direction: 'outgoing',
          strength: targetNode.relevance,
        });
      }
    } else if (targetId === node.id) {
      const sourceNode = nodeMap.get(sourceId);
      if (sourceNode) {
        connections.push({
          node: sourceNode,
          relationship: link.relationship,
          direction: 'incoming',
          strength: sourceNode.relevance,
        });
      }
    }
  });

  return connections.sort((a, b) => b.strength - a.strength);
}

function findShortestPaths(
  startNode: GraphNode,
  graphData: GraphData,
  maxHops: number = 3,
  maxPaths: number = 5
): PathInfo[] {
  const nodeMap = new Map<string, GraphNode>(graphData.nodes.map(n => [n.id, n]));
  const adjacencyList = new Map<string, { node: GraphNode; relationship: string }[]>();

  // Build adjacency list
  graphData.links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
    
    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);
    
    if (sourceNode && targetNode) {
      if (!adjacencyList.has(sourceId)) adjacencyList.set(sourceId, []);
      if (!adjacencyList.has(targetId)) adjacencyList.set(targetId, []);
      
      adjacencyList.get(sourceId)!.push({ node: targetNode, relationship: link.relationship });
      adjacencyList.get(targetId)!.push({ node: sourceNode, relationship: link.relationship });
    }
  });

  // BFS to find interesting paths
  const paths: PathInfo[] = [];
  const visited = new Set<string>([startNode.id]);
  const queue: { node: GraphNode; path: GraphNode[]; relationships: string[] }[] = [];

  const neighbors = adjacencyList.get(startNode.id) || [];
  neighbors.forEach((item: { node: GraphNode; relationship: string }) => {
    queue.push({ node: item.node, path: [startNode, item.node], relationships: [item.relationship] });
  });

  while (queue.length > 0 && paths.length < maxPaths * 3) {
    const current = queue.shift()!;
    
    if (current.path.length > maxHops + 1) continue;
    
    // High-relevance nodes are interesting destinations
    if (current.node.relevance > 0.6 && current.path.length > 2) {
      paths.push({
        targetNode: current.node,
        hops: current.path,
        relationships: current.relationships,
        significance: current.node.relevance * (1 / current.path.length),
      });
    }

    if (!visited.has(current.node.id)) {
      visited.add(current.node.id);
      
      const nextNeighbors = adjacencyList.get(current.node.id) || [];
      nextNeighbors.forEach((item: { node: GraphNode; relationship: string }) => {
        if (!visited.has(item.node.id)) {
          queue.push({
            node: item.node,
            path: [...current.path, item.node],
            relationships: [...current.relationships, item.relationship],
          });
        }
      });
    }
  }

  return paths
    .sort((a, b) => b.significance - a.significance)
    .slice(0, maxPaths);
}

function identifyClusters(node: GraphNode, graphData: GraphData): ClusterInfo[] {
  const connections = findConnections(node, graphData);
  const typeGroups = new Map<string, GraphNode[]>();

  connections.forEach(conn => {
    const type = conn.node.type;
    if (!typeGroups.has(type)) typeGroups.set(type, []);
    typeGroups.get(type)!.push(conn.node);
  });

  const entries: [string, GraphNode[]][] = Array.from(typeGroups.entries());
  
  return entries
    .filter(([, nodes]) => nodes.length >= 2)
    .map(([type, nodes]) => ({
      name: `${type} Network`,
      nodes,
      theme: getTypeTheme(type),
      relevance: nodes.reduce((sum: number, n: GraphNode) => sum + n.relevance, 0) / nodes.length,
    }))
    .sort((a, b) => b.relevance - a.relevance);
}

function getTypeTheme(type: string): string {
  const themes: Record<string, string> = {
    PERSON: 'Personal connections and historical figures',
    LOCATION: 'Geographic context and places',
    ORGANIZATION: 'Institutions and groups',
    DATE: 'Temporal markers and periods',
    CONCEPT: 'Ideas and abstract themes',
    DOCUMENT: 'Source materials and records',
  };
  return themes[type] || 'Related entities';
}

function getTypeIcon(type: string) {
  const icons: Record<string, React.ReactNode> = {
    PERSON: <Users size={14} />,
    LOCATION: <MapPin size={14} />,
    ORGANIZATION: <Building size={14} />,
    DATE: <Calendar size={14} />,
    CONCEPT: <Sparkles size={14} />,
    DOCUMENT: <FileText size={14} />,
  };
  return icons[type] || <Tag size={14} />;
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    DOCUMENT: '#6366f1',
    PERSON: '#3b82f6',
    LOCATION: '#10b981',
    ORGANIZATION: '#f59e0b',
    DATE: '#ec4899',
    CONCEPT: '#8b5cf6',
    CLUSTER: '#64748b',
  };
  return colors[type] || '#64748b';
}

// ============================================
// Sub-Components
// ============================================

const InsightCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  accentColor?: string;
}> = ({ title, icon, children, collapsible = false, defaultOpen = true, accentColor = '#6366f1' }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
      <button
        onClick={() => collapsible && setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left ${collapsible ? 'cursor-pointer hover:bg-slate-700/30' : ''}`}
        disabled={!collapsible}
      >
        <span style={{ color: accentColor }}>{icon}</span>
        <span className="text-sm font-medium text-white flex-1">{title}</span>
        {collapsible && (
          <ChevronRight 
            size={14} 
            className={`text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} 
          />
        )}
      </button>
      {isOpen && (
        <div className="px-3 pb-3 text-sm">
          {children}
        </div>
      )}
    </div>
  );
};

const ConnectionNode: React.FC<{
  connection: ConnectionInfo;
  onClick: () => void;
}> = ({ connection, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-2 w-full p-2 rounded-lg bg-slate-700/30 hover:bg-slate-700/60 transition-all group"
  >
    <div 
      className="w-8 h-8 rounded-full flex items-center justify-center text-white"
      style={{ backgroundColor: getTypeColor(connection.node.type) }}
    >
      {getTypeIcon(connection.node.type)}
    </div>
    <div className="flex-1 text-left">
      <div className="text-white text-sm font-medium truncate group-hover:text-primary-400 transition-colors">
        {connection.node.label}
      </div>
      <div className="text-xs text-slate-400 flex items-center gap-1">
        <span className={connection.direction === 'outgoing' ? 'text-emerald-400' : 'text-blue-400'}>
          {connection.direction === 'outgoing' ? '→' : '←'}
        </span>
        {connection.relationship}
      </div>
    </div>
    <div className="text-xs text-slate-500">
      {(connection.strength * 100).toFixed(0)}%
    </div>
  </button>
);

const PathVisualization: React.FC<{
  path: PathInfo;
  onNodeClick: (node: GraphNode) => void;
}> = ({ path, onNodeClick }) => (
  <div className="bg-slate-700/20 rounded-lg p-3">
    <div className="flex items-center gap-1 flex-wrap">
      {path.hops.map((node, idx) => (
        <React.Fragment key={node.id}>
          <button
            onClick={() => onNodeClick(node)}
            className="px-2 py-1 rounded text-xs font-medium transition-all hover:scale-105"
            style={{ 
              backgroundColor: `${getTypeColor(node.type)}20`,
              color: getTypeColor(node.type),
              border: `1px solid ${getTypeColor(node.type)}40`
            }}
          >
            {node.label.length > 20 ? node.label.slice(0, 20) + '...' : node.label}
          </button>
          {idx < path.hops.length - 1 && (
            <div className="flex items-center text-slate-500">
              <span className="text-[10px] px-1 bg-slate-800 rounded">
                {path.relationships[idx]}
              </span>
              <ChevronRight size={12} />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
    <div className="mt-2 text-xs text-slate-400">
      <span className="text-amber-400">{path.hops.length - 1} hops</span> • 
      Significance: {(path.significance * 100).toFixed(0)}%
    </div>
  </div>
);

const ClusterVisualization: React.FC<{
  cluster: ClusterInfo;
  onNodeClick: (node: GraphNode) => void;
}> = ({ cluster, onNodeClick }) => (
  <div className="bg-slate-700/20 rounded-lg p-3">
    <div className="flex items-center justify-between mb-2">
      <span className="text-white font-medium text-sm">{cluster.name}</span>
      <span className="text-xs text-slate-400">{cluster.nodes.length} nodes</span>
    </div>
    <p className="text-xs text-slate-400 mb-2">{cluster.theme}</p>
    <div className="flex flex-wrap gap-1">
      {cluster.nodes.slice(0, 6).map(node => (
        <button
          key={node.id}
          onClick={() => onNodeClick(node)}
          className="px-2 py-1 rounded text-xs bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 hover:text-white transition-colors"
        >
          {node.label.length > 15 ? node.label.slice(0, 15) + '...' : node.label}
        </button>
      ))}
      {cluster.nodes.length > 6 && (
        <span className="px-2 py-1 text-xs text-slate-500">
          +{cluster.nodes.length - 6} more
        </span>
      )}
    </div>
  </div>
);

const QuickStat: React.FC<{
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}> = ({ label, value, icon, color }) => (
  <div className="bg-slate-700/30 rounded-lg p-2 flex items-center gap-2">
    <div className="p-1.5 rounded" style={{ backgroundColor: `${color}20` }}>
      <span style={{ color }}>{icon}</span>
    </div>
    <div>
      <div className="text-white font-mono text-sm">{value}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  </div>
);

// ============================================
// Main Component
// ============================================

export const KnowledgeExplorer: React.FC<KnowledgeExplorerProps> = ({
  graphData,
  assets,
  selectedNode,
  onNodeSelect,
  onAssetView,
  onPathExplore,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [explorationHistory, setExplorationHistory] = useState<GraphNode[]>([]);
  const [showDiscoveryMode, setShowDiscoveryMode] = useState(false);

  // Compute insights for selected node
  const insights = useMemo((): NodeInsight | null => {
    if (!selectedNode) return null;

    const connections = findConnections(selectedNode, graphData);
    const pathsTo = findShortestPaths(selectedNode, graphData);
    const clusters = identifyClusters(selectedNode, graphData);
    
    // Find related assets
    const relatedAssets = assets
      .filter(a => 
        a.sqlRecord?.KEYWORDS_TAGS?.some(tag => 
          selectedNode.label.toLowerCase().includes(tag.toLowerCase()) ||
          tag.toLowerCase().includes(selectedNode.label.toLowerCase())
        )
      )
      .map(a => a.id)
      .slice(0, 5);

    return {
      node: selectedNode,
      connections,
      pathsTo,
      clusters,
      relatedAssets,
    };
  }, [selectedNode, graphData, assets]);

  // Handle node selection with history tracking
  const handleNodeClick = useCallback((node: GraphNode) => {
    setExplorationHistory(prev => {
      const newHistory = [...prev, node].slice(-10); // Keep last 10
      return newHistory;
    });
    onNodeSelect(node);
  }, [onNodeSelect]);

  // Discovery mode - random interesting node
  const discoverRandomNode = useCallback(() => {
    const highRelevanceNodes = graphData.nodes.filter(n => n.relevance > 0.5);
    if (highRelevanceNodes.length > 0) {
      const randomNode = highRelevanceNodes[Math.floor(Math.random() * highRelevanceNodes.length)];
      handleNodeClick(randomNode);
    }
  }, [graphData.nodes, handleNodeClick]);

  // Search/filter nodes
  const filteredNodes = useMemo(() => {
    return graphData.nodes.filter(node => {
      const matchesSearch = !searchQuery || 
        node.label.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = !filterType || node.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [graphData.nodes, searchQuery, filterType]);

  // Get unique types for filter
  const nodeTypes = useMemo(() => {
    const types = new Set(graphData.nodes.map(n => n.type));
    return Array.from(types);
  }, [graphData.nodes]);

  // Graph statistics
  const stats = useMemo(() => {
    const typeCount = new Map<string, number>();
    graphData.nodes.forEach(n => {
      typeCount.set(n.type, (typeCount.get(n.type) || 0) + 1);
    });
    
    const avgRelevance = graphData.nodes.length > 0
      ? graphData.nodes.reduce((sum, n) => sum + n.relevance, 0) / graphData.nodes.length
      : 0;
    
    return {
      totalNodes: graphData.nodes.length,
      totalLinks: graphData.links.length,
      typeCount,
      avgRelevance,
      density: graphData.nodes.length > 1 
        ? (2 * graphData.links.length) / (graphData.nodes.length * (graphData.nodes.length - 1))
        : 0,
    };
  }, [graphData]);

  if (!selectedNode) {
    // Empty state / Discovery interface
    return (
      <div className="h-full flex flex-col bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Compass className="text-primary-400" size={20} />
              <h2 className="text-lg font-bold text-white">Knowledge Explorer</h2>
            </div>
            <button
              onClick={discoverRandomNode}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-sm rounded-lg transition-colors"
            >
              <Sparkles size={14} />
              Discover
            </button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search nodes..."
              className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
            />
          </div>
          
          {/* Type Filters */}
          <div className="flex gap-2 mt-3 flex-wrap">
            <button
              onClick={() => setFilterType(null)}
              className={`px-2 py-1 text-xs rounded-full transition-colors ${
                !filterType 
                  ? 'bg-primary-600 text-white' 
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            {nodeTypes.map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type === filterType ? null : type)}
                className={`px-2 py-1 text-xs rounded-full flex items-center gap-1 transition-colors ${
                  filterType === type
                    ? 'text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                style={{
                  backgroundColor: filterType === type ? getTypeColor(type) : 'rgb(30 41 59 / 0.5)',
                }}
              >
                {getTypeIcon(type)}
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Overview */}
        <div className="p-4 border-b border-slate-700">
          <div className="grid grid-cols-2 gap-2">
            <QuickStat 
              label="Total Nodes" 
              value={stats.totalNodes} 
              icon={<Network size={14} />} 
              color="#6366f1" 
            />
            <QuickStat 
              label="Connections" 
              value={stats.totalLinks} 
              icon={<Link2 size={14} />} 
              color="#10b981" 
            />
            <QuickStat 
              label="Avg Relevance" 
              value={`${(stats.avgRelevance * 100).toFixed(0)}%`} 
              icon={<TrendingUp size={14} />} 
              color="#f59e0b" 
            />
            <QuickStat 
              label="Density" 
              value={`${(stats.density * 100).toFixed(1)}%`} 
              icon={<Target size={14} />} 
              color="#ec4899" 
            />
          </div>
        </div>

        {/* Node List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-xs text-slate-400 mb-2">
            {filteredNodes.length} nodes {searchQuery && `matching "${searchQuery}"`}
          </div>
          <div className="space-y-1">
            {filteredNodes.slice(0, 50).map(node => (
              <button
                key={node.id}
                onClick={() => handleNodeClick(node)}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors text-left group"
              >
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${getTypeColor(node.type)}30` }}
                >
                  <span style={{ color: getTypeColor(node.type) }}>
                    {getTypeIcon(node.type)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate group-hover:text-primary-400 transition-colors">
                    {node.label}
                  </div>
                  <div className="text-[10px] text-slate-500">{node.type}</div>
                </div>
                <div className="text-xs text-slate-500">
                  {(node.relevance * 100).toFixed(0)}%
                </div>
              </button>
            ))}
            {filteredNodes.length > 50 && (
              <div className="text-center text-xs text-slate-500 py-2">
                +{filteredNodes.length - 50} more nodes
              </div>
            )}
          </div>
        </div>

        {/* Exploration History */}
        {explorationHistory.length > 0 && (
          <div className="p-4 border-t border-slate-700">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
              <History size={12} />
              Recent Explorations
            </div>
            <div className="flex gap-1 flex-wrap">
              {explorationHistory.slice(-5).map((node, idx) => (
                <button
                  key={`${node.id}-${idx}`}
                  onClick={() => handleNodeClick(node)}
                  className="px-2 py-1 text-xs bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition-colors"
                >
                  {node.label.length > 15 ? node.label.slice(0, 15) + '...' : node.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Selected node detail view
  return (
    <div className="h-full flex flex-col bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
              style={{ backgroundColor: getTypeColor(selectedNode.type) }}
            >
              {getTypeIcon(selectedNode.type)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{selectedNode.label}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span 
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ 
                    backgroundColor: `${getTypeColor(selectedNode.type)}20`,
                    color: getTypeColor(selectedNode.type)
                  }}
                >
                  {selectedNode.type}
                </span>
                <span className="text-xs text-slate-400">
                  {(selectedNode.relevance * 100).toFixed(0)}% relevance
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onNodeSelect(null)}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        
        {/* Relevance bar */}
        <div className="mt-3">
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-500"
              style={{ 
                width: `${selectedNode.relevance * 100}%`,
                backgroundColor: getTypeColor(selectedNode.type)
              }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Quick Stats */}
        {insights && (
          <div className="grid grid-cols-3 gap-2">
            <QuickStat 
              label="Connections" 
              value={insights.connections.length} 
              icon={<Network size={14} />} 
              color="#6366f1" 
            />
            <QuickStat 
              label="Paths" 
              value={insights.pathsTo.length} 
              icon={<GitBranch size={14} />} 
              color="#10b981" 
            />
            <QuickStat 
              label="Clusters" 
              value={insights.clusters.length} 
              icon={<Layers size={14} />} 
              color="#f59e0b" 
            />
          </div>
        )}

        {/* Connections */}
        {insights && insights.connections.length > 0 && (
          <InsightCard 
            title={`Direct Connections (${insights.connections.length})`}
            icon={<Network size={16} />}
            accentColor="#6366f1"
            collapsible
            defaultOpen
          >
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {insights.connections.map((conn, idx) => (
                <ConnectionNode
                  key={`${conn.node.id}-${idx}`}
                  connection={conn}
                  onClick={() => handleNodeClick(conn.node)}
                />
              ))}
            </div>
          </InsightCard>
        )}

        {/* Discovery Paths */}
        {insights && insights.pathsTo.length > 0 && (
          <InsightCard 
            title="Discovery Paths"
            icon={<Compass size={16} />}
            accentColor="#10b981"
            collapsible
            defaultOpen
          >
            <p className="text-xs text-slate-400 mb-3">
              Follow these paths to discover related knowledge
            </p>
            <div className="space-y-3">
              {insights.pathsTo.map((path, idx) => (
                <PathVisualization
                  key={idx}
                  path={path}
                  onNodeClick={handleNodeClick}
                />
              ))}
            </div>
          </InsightCard>
        )}

        {/* Thematic Clusters */}
        {insights && insights.clusters.length > 0 && (
          <InsightCard 
            title="Thematic Clusters"
            icon={<Layers size={16} />}
            accentColor="#f59e0b"
            collapsible
          >
            <p className="text-xs text-slate-400 mb-3">
              Groups of related concepts forming knowledge neighborhoods
            </p>
            <div className="space-y-3">
              {insights.clusters.map((cluster, idx) => (
                <ClusterVisualization
                  key={idx}
                  cluster={cluster}
                  onNodeClick={handleNodeClick}
                />
              ))}
            </div>
          </InsightCard>
        )}

        {/* Related Assets */}
        {insights && insights.relatedAssets.length > 0 && (
          <InsightCard 
            title="Related Documents"
            icon={<FileText size={16} />}
            accentColor="#ec4899"
            collapsible
          >
            <div className="space-y-2">
              {insights.relatedAssets.map(assetId => {
                const asset = assets.find(a => a.id === assetId);
                if (!asset) return null;
                return (
                  <button
                    key={assetId}
                    onClick={() => onAssetView?.(assetId)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg bg-slate-700/30 hover:bg-slate-700/60 transition-colors text-left"
                  >
                    <FileText size={14} className="text-slate-400" />
                    <span className="text-sm text-white truncate flex-1">
                      {asset.sqlRecord?.DOCUMENT_TITLE || 'Untitled'}
                    </span>
                    <ExternalLink size={12} className="text-slate-500" />
                  </button>
                );
              })}
            </div>
          </InsightCard>
        )}

        {/* Exploration Tips */}
        <InsightCard 
          title="Exploration Tips"
          icon={<Info size={16} />}
          accentColor="#8b5cf6"
          collapsible
          defaultOpen={!insights?.connections.length}
        >
          <div className="space-y-2 text-xs text-slate-400">
            <div className="flex items-start gap-2">
              <Zap size={12} className="text-amber-400 mt-0.5" />
              <span>Click on connected nodes to navigate the knowledge graph</span>
            </div>
            <div className="flex items-start gap-2">
              <Eye size={12} className="text-emerald-400 mt-0.5" />
              <span>Follow discovery paths to find unexpected connections</span>
            </div>
            <div className="flex items-start gap-2">
              <Star size={12} className="text-primary-400 mt-0.5" />
              <span>Higher relevance nodes indicate key concepts in your corpus</span>
            </div>
          </div>
        </InsightCard>
      </div>

      {/* Footer with navigation */}
      <div className="p-4 border-t border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {explorationHistory.length > 1 && (
              <button
                onClick={() => {
                  const prev = explorationHistory[explorationHistory.length - 2];
                  if (prev) {
                    setExplorationHistory(h => h.slice(0, -1));
                    onNodeSelect(prev);
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition-colors"
              >
                <ChevronRight size={12} className="rotate-180" />
                Back
              </button>
            )}
          </div>
          <button
            onClick={discoverRandomNode}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary-600/20 text-primary-400 text-sm rounded-lg hover:bg-primary-600/30 transition-colors"
          >
            <Sparkles size={14} />
            Random Discovery
          </button>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeExplorer;
