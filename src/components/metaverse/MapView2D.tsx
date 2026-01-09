/**
 * MapView2D Component
 * 2D fallback mode for the 3D metaverse visualization
 * Features zoom/pan gestures, touch support, and haptic feedback
 */

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Grid3X3,
  List,
  Map as MapIcon,
  Layers,
  Filter,
  Eye,
  EyeOff,
  Move,
  MousePointer2,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { GraphData, GraphNode, GraphLink, DigitalAsset } from '../../types';

// Control mode types
type ControlMode = 'mouse' | 'touch' | 'hybrid';
type ViewMode = 'map' | 'grid' | 'list';

// Type colors matching 3D renderer
const TYPE_COLORS: Record<string, string> = {
  DOCUMENT: '#6366f1',
  PERSON: '#3b82f6',
  LOCATION: '#10b981',
  ORGANIZATION: '#f59e0b',
  DATE: '#ec4899',
  CONCEPT: '#8b5cf6',
  CLUSTER: '#64748b',
};

interface MapNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  relevance: number;
  connections: number;
}

interface MapViewProps {
  graphData: GraphData;
  assets?: DigitalAsset[];
  onNodeSelect?: (node: GraphNode) => void;
  onAssetView?: (assetId: string) => void;
  className?: string;
}

// Haptic feedback helper
function triggerHaptic(type: 'light' | 'medium' | 'heavy' = 'light') {
  if ('vibrate' in navigator) {
    const durations = { light: 10, medium: 25, heavy: 50 };
    navigator.vibrate(durations[type]);
  }
}

export function MapView2D({
  graphData,
  assets = [],
  onNodeSelect,
  onAssetView,
  className = '',
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [controlMode, setControlMode] = useState<ControlMode>('hybrid');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<MapNode | null>(null);
  const [showLinks, setShowLinks] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());
  
  // Gesture state
  const [isDragging, setIsDragging] = useState(false);
  const [lastPointerPos, setLastPointerPos] = useState({ x: 0, y: 0 });
  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null);
  const [initialPinchZoom, setInitialPinchZoom] = useState(1);

  // Convert graph nodes to map nodes with 2D positions
  const mapNodes = useMemo((): MapNode[] => {
    const nodeMap = new Map<string, number>();
    graphData.links.forEach((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
      nodeMap.set(sourceId, (nodeMap.get(sourceId) || 0) + 1);
      nodeMap.set(targetId, (nodeMap.get(targetId) || 0) + 1);
    });

    // Layout nodes in clusters by type
    const typeGroups = new Map<string, GraphNode[]>();
    graphData.nodes.forEach((node) => {
      const nodes = typeGroups.get(node.type) || [];
      nodes.push(node);
      typeGroups.set(node.type, nodes);
    });

    const allNodes: MapNode[] = [];
    let groupIndex = 0;
    const totalGroups = typeGroups.size;

    typeGroups.forEach((nodes, type) => {
      const baseAngle = (groupIndex / totalGroups) * Math.PI * 2;
      const groupRadius = 150 + nodes.length * 5;

      nodes.forEach((node, i) => {
        const angleSpread = nodes.length > 1 ? (Math.PI / 3) : 0;
        const nodeAngle = baseAngle + (i / nodes.length - 0.5) * angleSpread;
        const distance = groupRadius + Math.random() * 50;

        const connections = nodeMap.get(node.id) || 0;
        
        allNodes.push({
          id: node.id,
          label: node.label,
          type: node.type,
          x: Math.cos(nodeAngle) * distance,
          y: Math.sin(nodeAngle) * distance,
          radius: 8 + Math.min(connections, 10) * 2 + node.relevance * 10,
          color: TYPE_COLORS[node.type] || TYPE_COLORS.CLUSTER,
          relevance: node.relevance,
          connections,
        });
      });

      groupIndex++;
    });

    return allNodes;
  }, [graphData]);

  // Filter nodes
  const visibleNodes = useMemo(() => {
    if (typeFilters.size === 0) return mapNodes;
    return mapNodes.filter((n) => typeFilters.has(n.type));
  }, [mapNodes, typeFilters]);

  // Screen to world coordinate conversion
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      return {
        x: (screenX - rect.left - centerX - pan.x) / zoom,
        y: (screenY - rect.top - centerY - pan.y) / zoom,
      };
    },
    [zoom, pan]
  );

  // Find node at position
  const findNodeAtPosition = useCallback(
    (worldX: number, worldY: number): MapNode | null => {
      for (const node of visibleNodes) {
        const dx = node.x - worldX;
        const dy = node.y - worldY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= node.radius / zoom + 5) {
          return node;
        }
      }
      return null;
    },
    [visibleNodes, zoom]
  );

  // Pointer event handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'touch') {
        triggerHaptic('light');
      }

      const world = screenToWorld(e.clientX, e.clientY);
      const node = findNodeAtPosition(world.x, world.y);

      if (node) {
        setSelectedNode(node);
        triggerHaptic('medium');
        
        const originalNode = graphData.nodes.find((n) => n.id === node.id);
        if (originalNode) {
          onNodeSelect?.(originalNode);
        }
      } else {
        setIsDragging(true);
        setLastPointerPos({ x: e.clientX, y: e.clientY });
      }
    },
    [screenToWorld, findNodeAtPosition, graphData.nodes, onNodeSelect]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging) {
        const dx = e.clientX - lastPointerPos.x;
        const dy = e.clientY - lastPointerPos.y;
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        setLastPointerPos({ x: e.clientX, y: e.clientY });
      } else {
        const world = screenToWorld(e.clientX, e.clientY);
        const node = findNodeAtPosition(world.x, world.y);
        setHoveredNode(node);
      }
    },
    [isDragging, lastPointerPos, screenToWorld, findNodeAtPosition]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch pinch zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      setInitialPinchDistance(distance);
      setInitialPinchZoom(zoom);
    }
  }, [zoom]);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && initialPinchDistance !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const scale = distance / initialPinchDistance;
        const newZoom = Math.max(0.1, Math.min(5, initialPinchZoom * scale));
        setZoom(newZoom);
      }
    },
    [initialPinchDistance, initialPinchZoom]
  );

  const handleTouchEnd = useCallback(() => {
    setInitialPinchDistance(null);
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.1, Math.min(5, prev * delta)));
  }, []);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    triggerHaptic('light');
    setZoom((prev) => Math.min(5, prev * 1.2));
  }, []);

  const handleZoomOut = useCallback(() => {
    triggerHaptic('light');
    setZoom((prev) => Math.max(0.1, prev / 1.2));
  }, []);

  const handleReset = useCallback(() => {
    triggerHaptic('medium');
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Toggle type filter
  const toggleTypeFilter = useCallback((type: string) => {
    triggerHaptic('light');
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Apply transforms
    ctx.save();
    ctx.translate(rect.width / 2 + pan.x, rect.height / 2 + pan.y);
    ctx.scale(zoom, zoom);

    // Draw links
    if (showLinks) {
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
      ctx.lineWidth = 1 / zoom;

      const nodeMap = new Map(visibleNodes.map((n) => [n.id, n]));

      graphData.links.forEach((link) => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
        const source = nodeMap.get(sourceId);
        const target = nodeMap.get(targetId);

        if (source && target) {
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
        }
      });
    }

    // Draw nodes
    visibleNodes.forEach((node) => {
      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;

      // Glow for selected/hovered
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = isSelected
          ? `${node.color}40`
          : `${node.color}20`;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Border
      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3 / zoom;
        ctx.stroke();
      }

      // Label
      if (showLabels && zoom > 0.5) {
        ctx.font = `${12 / zoom}px Inter, system-ui`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(
          node.label.length > 20 ? node.label.slice(0, 20) + '...' : node.label,
          node.x,
          node.y + node.radius + 14 / zoom
        );
      }
    });

    ctx.restore();

    // Draw legend
    const legendY = rect.height - 80;
    ctx.font = '11px Inter, system-ui';
    Object.entries(TYPE_COLORS).forEach(([type, color], i) => {
      const x = 20 + i * 100;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, legendY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = typeFilters.size > 0 && !typeFilters.has(type) ? '#475569' : '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText(type.charAt(0) + type.slice(1).toLowerCase(), x + 12, legendY + 4);
    });
  }, [
    visibleNodes,
    graphData.links,
    zoom,
    pan,
    showLinks,
    showLabels,
    selectedNode,
    hoveredNode,
    typeFilters,
  ]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.width = '100%';
        canvas.style.height = '100%';
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className}`}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      />

      {/* Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        {/* View mode toggle */}
        <div className="flex bg-slate-800/90 backdrop-blur rounded-lg p-1 border border-slate-700">
          <button
            onClick={() => setViewMode('map')}
            className={`p-2 rounded ${viewMode === 'map' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
            title="Map view"
          >
            <MapIcon size={18} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded ${viewMode === 'grid' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
            title="Grid view"
          >
            <Grid3X3 size={18} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded ${viewMode === 'list' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
            title="List view"
          >
            <List size={18} />
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex flex-col bg-slate-800/90 backdrop-blur rounded-lg border border-slate-700">
          <button onClick={handleZoomIn} className="p-2 text-slate-400 hover:text-white" title="Zoom in">
            <ZoomIn size={18} />
          </button>
          <div className="h-px bg-slate-700" />
          <button onClick={handleZoomOut} className="p-2 text-slate-400 hover:text-white" title="Zoom out">
            <ZoomOut size={18} />
          </button>
          <div className="h-px bg-slate-700" />
          <button onClick={handleReset} className="p-2 text-slate-400 hover:text-white" title="Reset view">
            <RotateCcw size={18} />
          </button>
        </div>

        {/* Toggle controls */}
        <div className="flex flex-col bg-slate-800/90 backdrop-blur rounded-lg border border-slate-700">
          <button
            onClick={() => setShowLinks(!showLinks)}
            className={`p-2 ${showLinks ? 'text-primary-400' : 'text-slate-400'} hover:text-white`}
            title="Toggle links"
          >
            <Layers size={18} />
          </button>
          <div className="h-px bg-slate-700" />
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`p-2 ${showLabels ? 'text-primary-400' : 'text-slate-400'} hover:text-white`}
            title="Toggle labels"
          >
            {showLabels ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        </div>

        {/* Control mode indicator */}
        <div className="bg-slate-800/90 backdrop-blur rounded-lg p-2 border border-slate-700">
          <div className="flex items-center gap-1 text-xs text-slate-400">
            {controlMode === 'touch' ? <Smartphone size={14} /> : <Monitor size={14} />}
            <span>{Math.round(zoom * 100)}%</span>
          </div>
        </div>
      </div>

      {/* Node info panel */}
      {selectedNode && (
        <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-80 bg-slate-800/95 backdrop-blur border border-slate-700 rounded-xl p-4 animate-fadeIn">
          <div className="flex items-start gap-3">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0 mt-1"
              style={{ backgroundColor: selectedNode.color }}
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold truncate">{selectedNode.label}</h3>
              <p className="text-slate-400 text-sm">
                {selectedNode.type} • {selectedNode.connections} connections
              </p>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full"
                    style={{ width: `${selectedNode.relevance * 100}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500">
                  {Math.round(selectedNode.relevance * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Type filters */}
      <div className="absolute bottom-4 right-4 flex gap-1">
        {Object.entries(TYPE_COLORS).slice(0, 6).map(([type, color]) => (
          <button
            key={type}
            onClick={() => toggleTypeFilter(type)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              typeFilters.size === 0 || typeFilters.has(type)
                ? 'opacity-100'
                : 'opacity-30'
            }`}
            style={{ backgroundColor: `${color}30` }}
            title={type}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default MapView2D;
