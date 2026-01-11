/**
 * Filter Dependency Visualizer
 * 
 * Renders an interactive visualization of filter dimension dependencies,
 * showing how selections in one dimension affect available values in others.
 * Designed for qualitative modeling of complex quantitative structures.
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  Network,
  ArrowRight,
  Circle,
  Zap,
  Info,
  Eye,
  EyeOff,
  RefreshCw,
  Layers,
  Target,
  Link2,
} from 'lucide-react';
import { useFilterContext, FilterDimension, DimensionMetadata } from '../contexts/FilterContext';

// ============================================
// Types
// ============================================

interface DependencyEdge {
  source: FilterDimension;
  target: FilterDimension;
  type: 'constrains' | 'suggests' | 'excludes' | 'requires';
  weight: number;
}

interface NodePosition {
  x: number;
  y: number;
}

// ============================================
// Dependency Graph Definition
// ============================================

const DEPENDENCY_EDGES: DependencyEdge[] = [
  { source: 'category', target: 'entities', type: 'constrains', weight: 0.8 },
  { source: 'era', target: 'confidence', type: 'suggests', weight: 0.4 },
  { source: 'zone', target: 'category', type: 'constrains', weight: 0.6 },
  { source: 'scanType', target: 'entities', type: 'constrains', weight: 0.9 },
  { source: 'license', target: 'nodeType', type: 'constrains', weight: 0.5 },
  { source: 'confidence', target: 'relevance', type: 'constrains', weight: 0.7 },
  { source: 'status', target: 'category', type: 'constrains', weight: 0.3 },
  { source: 'category', target: 'nodeType', type: 'suggests', weight: 0.6 },
  { source: 'nodeType', target: 'category', type: 'suggests', weight: 0.5 },
  { source: 'contested', target: 'license', type: 'constrains', weight: 0.4 },
  { source: 'source', target: 'era', type: 'suggests', weight: 0.5 },
];

// Layout positions for dimensions (organized by thematic clusters)
const DIMENSION_POSITIONS: Record<FilterDimension, NodePosition> = {
  // === TEMPORAL CLUSTER (top-left) ===
  era: { x: 20, y: 10 },
  historicalPeriod: { x: 35, y: 15 },
  documentAge: { x: 25, y: 25 },
  
  // === SPATIAL CLUSTER (top-right) ===
  zone: { x: 70, y: 10 },
  geographicScale: { x: 85, y: 15 },
  placeType: { x: 75, y: 25 },
  
  // === CONTENT CLUSTER (center-left) ===
  category: { x: 15, y: 45 },
  scanType: { x: 10, y: 55 },
  mediaType: { x: 20, y: 60 },
  subjectMatter: { x: 30, y: 50 },
  
  // === KNOWLEDGE GRAPH CLUSTER (center) ===
  nodeType: { x: 50, y: 40 },
  connectionDensity: { x: 55, y: 55 },
  narrativeRole: { x: 45, y: 60 },
  
  // === PROVENANCE CLUSTER (center-right) ===
  license: { x: 80, y: 45 },
  confidence: { x: 90, y: 50 },
  verificationLevel: { x: 85, y: 60 },
  contested: { x: 75, y: 55 },
  
  // === DISCOVERY CLUSTER (bottom) ===
  source: { x: 30, y: 80 },
  status: { x: 45, y: 85 },
  entities: { x: 55, y: 80 },
  relevance: { x: 65, y: 85 },
  serendipityScore: { x: 40, y: 75 },
  researchPotential: { x: 60, y: 75 },
  
  // === CLASSIFICATION STATUS (bottom-right) ===
  classificationStatus: { x: 80, y: 80 },
};

// ============================================
// Sub-Components
// ============================================

interface DimensionNodeProps {
  dimension: FilterDimension;
  metadata?: DimensionMetadata;
  position: NodePosition;
  isActive: boolean;
  isHovered: boolean;
  isHighlighted: boolean;
  onHover: (dim: FilterDimension | null) => void;
  onClick: (dim: FilterDimension) => void;
}

function DimensionNode({
  dimension,
  metadata,
  position,
  isActive,
  isHovered,
  isHighlighted,
  onHover,
  onClick,
}: DimensionNodeProps) {
  const fillColor = isActive
    ? '#6366f1' // primary
    : isHighlighted
      ? '#10b981' // emerald
      : '#334155'; // slate-700
  
  const strokeColor = isHovered
    ? '#a5b4fc' // primary-300
    : isActive
      ? '#818cf8' // primary-400
      : '#475569'; // slate-600
  
  const textColor = isActive || isHighlighted ? '#ffffff' : '#94a3b8';
  
  const radius = isActive ? 24 : isHovered ? 22 : 20;
  
  return (
    <g
      transform={`translate(${position.x}, ${position.y})`}
      onMouseEnter={() => onHover(dimension)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(dimension)}
      style={{ cursor: 'pointer' }}
    >
      {/* Glow effect for active nodes */}
      {isActive && (
        <circle
          r={radius + 8}
          fill="none"
          stroke="#6366f1"
          strokeWidth={2}
          opacity={0.3}
          className="animate-pulse"
        />
      )}
      
      {/* Main circle */}
      <circle
        r={radius}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={isHovered ? 3 : 2}
        className="transition-all duration-200"
      />
      
      {/* Icon placeholder */}
      <circle
        r={6}
        cy={-5}
        fill={textColor}
        opacity={0.5}
      />
      
      {/* Label */}
      <text
        y={15}
        textAnchor="middle"
        fill={textColor}
        fontSize={9}
        fontWeight={isActive ? 'bold' : 'normal'}
        className="select-none"
      >
        {metadata?.label || dimension}
      </text>
      
      {/* Value count badge */}
      {metadata && (
        <g transform="translate(15, -15)">
          <circle
            r={8}
            fill={isActive ? '#10b981' : '#475569'}
          />
          <text
            textAnchor="middle"
            y={3}
            fill="white"
            fontSize={7}
            fontWeight="bold"
          >
            {metadata.filteredValues.length}
          </text>
        </g>
      )}
    </g>
  );
}

interface DependencyEdgeLineProps {
  edge: DependencyEdge;
  sourcePos: NodePosition;
  targetPos: NodePosition;
  isHighlighted: boolean;
  isSourceActive: boolean;
  isTargetActive: boolean;
}

function DependencyEdgeLine({
  edge,
  sourcePos,
  targetPos,
  isHighlighted,
  isSourceActive,
  isTargetActive,
}: DependencyEdgeLineProps) {
  const strokeColor = isHighlighted
    ? edge.type === 'constrains'
      ? '#f59e0b' // amber
      : '#10b981' // emerald
    : '#334155'; // slate-700
  
  const opacity = isHighlighted ? edge.weight : 0.3;
  const strokeWidth = isHighlighted ? 2 : 1;
  
  // Calculate control point for curved path
  const midX = (sourcePos.x + targetPos.x) / 2;
  const midY = (sourcePos.y + targetPos.y) / 2;
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;
  const perpX = -dy * 0.2;
  const perpY = dx * 0.2;
  
  const path = `M ${sourcePos.x} ${sourcePos.y} Q ${midX + perpX} ${midY + perpY} ${targetPos.x} ${targetPos.y}`;
  
  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        opacity={opacity}
        strokeDasharray={edge.type === 'suggests' ? '4 2' : undefined}
        markerEnd={isHighlighted ? 'url(#arrowhead)' : undefined}
        className="transition-all duration-200"
      />
    </g>
  );
}

// ============================================
// Main Component
// ============================================

interface FilterDependencyVisualizerProps {
  width?: number;
  height?: number;
  interactive?: boolean;
  showLegend?: boolean;
  onDimensionSelect?: (dimension: FilterDimension) => void;
}

export default function FilterDependencyVisualizer({
  width = 400,
  height = 300,
  interactive = true,
  showLegend = true,
  onDimensionSelect,
}: FilterDependencyVisualizerProps) {
  const context = useFilterContext();
  const { state } = context;
  
  const [hoveredDimension, setHoveredDimension] = useState<FilterDimension | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  
  // Scale positions to SVG dimensions
  const scaledPositions = useMemo(() => {
    const result: Record<FilterDimension, NodePosition> = {} as any;
    const padding = 50;
    const scaleX = (width - padding * 2) / 100;
    const scaleY = (height - padding * 2) / 100;
    
    Object.entries(DIMENSION_POSITIONS).forEach(([dim, pos]) => {
      result[dim as FilterDimension] = {
        x: padding + pos.x * scaleX,
        y: padding + pos.y * scaleY,
      };
    });
    
    return result;
  }, [width, height]);
  
  // Find connected dimensions for highlighting
  const connectedDimensions = useMemo(() => {
    if (!hoveredDimension) return new Set<FilterDimension>();
    
    const connected = new Set<FilterDimension>();
    DEPENDENCY_EDGES.forEach(edge => {
      if (edge.source === hoveredDimension) connected.add(edge.target);
      if (edge.target === hoveredDimension) connected.add(edge.source);
    });
    
    return connected;
  }, [hoveredDimension]);
  
  // Find active edges (where source dimension is active)
  const activeEdges = useMemo(() => {
    return DEPENDENCY_EDGES.filter(edge => state.activeFilters.has(edge.source));
  }, [state.activeFilters]);
  
  const handleDimensionClick = useCallback((dimension: FilterDimension) => {
    if (onDimensionSelect) {
      onDimensionSelect(dimension);
    }
  }, [onDimensionSelect]);
  
  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-primary-400" />
          <span className="text-sm font-semibold text-white">Filter Dependencies</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`p-1.5 rounded-lg transition-colors ${showLabels ? 'bg-slate-700' : 'hover:bg-slate-800'}`}
            title={showLabels ? 'Hide labels' : 'Show labels'}
          >
            {showLabels ? <Eye size={14} className="text-slate-400" /> : <EyeOff size={14} className="text-slate-500" />}
          </button>
        </div>
      </div>
      
      {/* SVG Visualization */}
      <svg width={width} height={height} className="bg-slate-950/50">
        {/* Definitions */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="#f59e0b"
            />
          </marker>
          
          {/* Gradient for active connections */}
          <linearGradient id="activeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        
        {/* Background grid */}
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.5" />
        </pattern>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* Edges */}
        <g>
          {DEPENDENCY_EDGES.map((edge, i) => {
            const sourcePos = scaledPositions[edge.source];
            const targetPos = scaledPositions[edge.target];
            const isHighlighted = 
              hoveredDimension === edge.source || 
              hoveredDimension === edge.target ||
              state.activeFilters.has(edge.source);
            
            return (
              <DependencyEdgeLine
                key={`${edge.source}-${edge.target}-${i}`}
                edge={edge}
                sourcePos={sourcePos}
                targetPos={targetPos}
                isHighlighted={isHighlighted}
                isSourceActive={state.activeFilters.has(edge.source)}
                isTargetActive={state.activeFilters.has(edge.target)}
              />
            );
          })}
        </g>
        
        {/* Nodes */}
        <g>
          {Object.entries(scaledPositions).map(([dim, pos]) => {
            const dimension = dim as FilterDimension;
            const metadata = state.dimensions.get(dimension);
            const isActive = state.activeFilters.has(dimension);
            const isHighlighted = connectedDimensions.has(dimension);
            
            return (
              <DimensionNode
                key={dimension}
                dimension={dimension}
                metadata={metadata}
                position={pos}
                isActive={isActive}
                isHovered={hoveredDimension === dimension}
                isHighlighted={isHighlighted}
                onHover={interactive ? setHoveredDimension : () => {}}
                onClick={handleDimensionClick}
              />
            );
          })}
        </g>
      </svg>
      
      {/* Legend */}
      {showLegend && (
        <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-primary-600" />
              <span className="text-slate-400">Active Filter</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 bg-amber-500" />
              <span className="text-slate-400">Constrains</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 bg-emerald-500" style={{ borderStyle: 'dashed' }} />
              <span className="text-slate-400">Suggests</span>
            </div>
          </div>
          
          {/* Active filter impact */}
          {activeEdges.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-1 text-xs text-amber-400">
                <Zap size={12} />
                <span>{activeEdges.length} active dependencies</span>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Hover tooltip */}
      {hoveredDimension && (
        <div className="absolute bottom-4 left-4 right-4 bg-slate-800 rounded-lg p-3 border border-slate-700 shadow-xl">
          <div className="flex items-center gap-2 mb-2">
            <Target size={14} className="text-primary-400" />
            <span className="font-semibold text-white text-sm">
              {state.dimensions.get(hoveredDimension)?.label || hoveredDimension}
            </span>
          </div>
          
          <p className="text-xs text-slate-400 mb-2">
            {state.dimensions.get(hoveredDimension)?.description}
          </p>
          
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1 text-slate-500">
              <Link2 size={12} />
              <span>Affects: {state.dimensions.get(hoveredDimension)?.affects.length || 0}</span>
            </div>
            <div className="flex items-center gap-1 text-slate-500">
              <Layers size={12} />
              <span>Values: {state.dimensions.get(hoveredDimension)?.availableValues.length || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Mini Version for Inline Use
// ============================================

export function MiniDependencyIndicator({ dimension }: { dimension: FilterDimension }) {
  const context = useFilterContext();
  const metadata = context.state.dimensions.get(dimension);
  
  if (!metadata || metadata.affects.length === 0) return null;
  
  return (
    <div className="flex items-center gap-1 text-xs text-slate-500">
      <ArrowRight size={10} />
      <span>Affects {metadata.affects.length}</span>
    </div>
  );
}
