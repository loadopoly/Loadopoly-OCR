/**
 * WorldRenderer Component
 * 
 * 3D visualization of the knowledge graph using Three.js.
 * Provides navigable environment with avatar presence.
 * 
 * Note: Requires three.js packages to be installed:
 * npm install three @react-three/fiber @react-three/drei
 */

import React, { useRef, useMemo, useState, useEffect, useCallback, Suspense } from 'react';
import { GraphData, GraphNode, GraphLink } from '../../types';
import { PresenceState } from '../../services/avatarService';
import { ZoomIn, ZoomOut, RotateCcw, Users, Compass, Layers } from 'lucide-react';

// ============================================
// Types
// ============================================

interface WorldNode extends GraphNode {
  worldPosition: [number, number, number];
  scale: number;
  color: string;
}

interface WorldLink {
  source: [number, number, number];
  target: [number, number, number];
  relationship: string;
}

interface WorldRendererProps {
  graphData: GraphData;
  nearbyUsers?: PresenceState[];
  currentUserId?: string;
  onNodeSelect?: (node: GraphNode) => void;
  onPositionChange?: (position: [number, number, number]) => void;
}

// ============================================
// Graph to World Mapping
// ============================================

const TYPE_COLORS: Record<string, string> = {
  DOCUMENT: '#6366f1',
  PERSON: '#3b82f6',
  LOCATION: '#10b981',
  ORGANIZATION: '#f59e0b',
  DATE: '#ec4899',
  CONCEPT: '#8b5cf6',
  CLUSTER: '#64748b',
};

function graphToWorld(data: GraphData): { nodes: WorldNode[]; links: WorldLink[] } {
  const nodeMap = new Map<string, WorldNode>();

  // Position nodes in 3D space using golden angle spherical distribution
  data.nodes.forEach((node, index) => {
    const phi = Math.acos(1 - 2 * (index + 0.5) / Math.max(data.nodes.length, 1));
    const theta = Math.PI * (1 + Math.sqrt(5)) * index;
    
    const radius = 20 + (1 - node.relevance) * 30;
    
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);

    nodeMap.set(node.id, {
      ...node,
      worldPosition: [x, y, z],
      scale: 0.5 + node.relevance * 1.5,
      color: TYPE_COLORS[node.type] || '#64748b',
    });
  });

  // Map links to 3D coordinates
  const worldLinks: WorldLink[] = data.links
    .map((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
      
      const sourceNode = nodeMap.get(sourceId);
      const targetNode = nodeMap.get(targetId);
      
      if (!sourceNode || !targetNode) return null;
      
      return {
        source: sourceNode.worldPosition,
        target: targetNode.worldPosition,
        relationship: link.relationship,
      };
    })
    .filter((l): l is WorldLink => l !== null);

  return {
    nodes: Array.from(nodeMap.values()),
    links: worldLinks,
  };
}

// ============================================
// Fallback 2D Canvas Renderer
// ============================================

function Canvas2DFallback({ 
  nodes, 
  links, 
  selectedNode,
  onNodeClick,
  nearbyUsers = [],
}: { 
  nodes: WorldNode[];
  links: WorldLink[];
  selectedNode: WorldNode | null;
  onNodeClick: (node: WorldNode) => void;
  nearbyUsers: PresenceState[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  // Project 3D to 2D (simple orthographic projection)
  const project = useCallback((pos: [number, number, number]): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Simple isometric projection
    const isoX = (pos[0] - pos[2]) * 0.866;
    const isoY = (pos[0] + pos[2]) * 0.5 - pos[1];
    
    return {
      x: centerX + (isoX * zoom * 5) + offset.x,
      y: centerY + (isoY * zoom * 5) + offset.y,
    };
  }, [zoom, offset]);

  // Draw the scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw links
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    
    links.forEach(link => {
      const start = project(link.source);
      const end = project(link.target);
      
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    });
    
    ctx.globalAlpha = 1;

    // Draw nodes
    nodes.forEach(node => {
      const pos = project(node.worldPosition);
      const radius = node.scale * 8 * zoom;
      const isSelected = selectedNode?.id === node.id;
      
      // Glow effect
      if (isSelected) {
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 20;
      }
      
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();
      
      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      ctx.shadowBlur = 0;
      
      // Label for larger nodes
      if (node.scale > 1 || isSelected) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `${10 * zoom}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(
          node.label.length > 15 ? node.label.slice(0, 15) + '...' : node.label,
          pos.x,
          pos.y - radius - 5
        );
      }
    });

    // Draw nearby users
    nearbyUsers.forEach(user => {
      const pos = project(user.position);
      
      // Avatar marker
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = user.avatarColor || '#6366f1';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Name tag
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(user.displayName || 'User', pos.x, pos.y - 18);
    });

  }, [nodes, links, selectedNode, zoom, offset, nearbyUsers, project]);

  // Handle mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const dx = e.clientX - lastPos.x;
    const dy = e.clientY - lastPos.y;
    
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    setLastPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Find clicked node
    for (const node of nodes) {
      const pos = project(node.worldPosition);
      const radius = node.scale * 8 * zoom;
      const dist = Math.sqrt((clickX - pos.x) ** 2 + (clickY - pos.y) ** 2);
      
      if (dist <= radius) {
        onNodeClick(node);
        return;
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.2, Math.min(5, prev * delta)));
  };

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={600}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      onWheel={handleWheel}
    />
  );
}

// ============================================
// Main Component
// ============================================

export default function WorldRenderer({
  graphData,
  nearbyUsers = [],
  currentUserId,
  onNodeSelect,
  onPositionChange,
}: WorldRendererProps) {
  const [selectedNode, setSelectedNode] = useState<WorldNode | null>(null);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('2d'); // Default to 2D until Three.js loads
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Convert graph to world coordinates
  const { nodes, links } = useMemo(() => graphToWorld(graphData), [graphData]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNodeClick = useCallback((node: WorldNode) => {
    setSelectedNode(node);
    onNodeSelect?.(node);
  }, [onNodeSelect]);

  const handleZoomIn = () => {
    // Zoom logic handled by canvas
  };

  const handleZoomOut = () => {
    // Zoom logic handled by canvas
  };

  const handleReset = () => {
    setSelectedNode(null);
  };

  // Filter out current user from nearby users display
  const otherUsers = nearbyUsers.filter(u => u.userId !== currentUserId);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-slate-950 rounded-xl overflow-hidden">
      {/* Canvas */}
      <div className="w-full h-full">
        <Canvas2DFallback
          nodes={nodes}
          links={links}
          selectedNode={selectedNode}
          onNodeClick={handleNodeClick}
          nearbyUsers={otherUsers}
        />
      </div>

      {/* HUD Overlay - Top Left Stats */}
      <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-sm rounded-lg p-3 border border-slate-700 min-w-[180px]">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <Layers size={14} />
          <span>Knowledge World</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Nodes</span>
            <span className="text-white font-mono">{nodes.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Links</span>
            <span className="text-white font-mono">{links.length}</span>
          </div>
          {otherUsers.length > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-emerald-400 flex items-center gap-1">
                <Users size={12} />
                Online
              </span>
              <span className="text-emerald-400 font-mono">{otherUsers.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Selected Node Info */}
      {selectedNode && (
        <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur-sm rounded-lg p-4 border border-slate-700 max-w-xs">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-white font-bold text-sm">{selectedNode.label}</h3>
              <span className="text-xs text-slate-400 uppercase">{selectedNode.type}</span>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-slate-500 hover:text-white"
            >
              ×
            </button>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Relevance</span>
              <span className="text-white">{(selectedNode.relevance * 100).toFixed(0)}%</span>
            </div>
            {selectedNode.license && (
              <div className="flex justify-between">
                <span className="text-slate-500">License</span>
                <span className="text-emerald-400">{selectedNode.license}</span>
              </div>
            )}
          </div>
          <div 
            className="mt-2 w-full h-1 rounded-full bg-slate-700"
            style={{ 
              background: `linear-gradient(to right, ${selectedNode.color} ${selectedNode.relevance * 100}%, #334155 ${selectedNode.relevance * 100}%)` 
            }}
          />
        </div>
      )}

      {/* Navigation Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <button
          onClick={handleZoomIn}
          className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700 text-white transition-colors"
          title="Zoom In"
        >
          <ZoomIn size={18} />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700 text-white transition-colors"
          title="Zoom Out"
        >
          <ZoomOut size={18} />
        </button>
        <button
          onClick={handleReset}
          className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700 text-white transition-colors"
          title="Reset View"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Online Users List */}
      {otherUsers.length > 0 && (
        <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur-sm rounded-lg p-3 border border-slate-700">
          <div className="flex items-center gap-2 text-xs text-emerald-400 mb-2">
            <Users size={14} />
            <span>Explorers Nearby</span>
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {otherUsers.slice(0, 5).map((user) => (
              <div key={user.sessionId} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: user.avatarColor || '#6366f1' }}
                />
                <span className="text-xs text-white truncate max-w-[100px]">
                  {user.displayName || 'Unknown'}
                </span>
                <span className={`w-2 h-2 rounded-full ${
                  user.status === 'ACTIVE' ? 'bg-emerald-400' :
                  user.status === 'IDLE' ? 'bg-yellow-400' : 'bg-slate-500'
                }`} />
              </div>
            ))}
            {otherUsers.length > 5 && (
              <div className="text-xs text-slate-500">
                +{otherUsers.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-slate-500 bg-slate-900/50 px-3 py-1 rounded-full">
        <Compass size={12} className="inline mr-1" />
        Drag to pan • Scroll to zoom • Click nodes to inspect
      </div>
    </div>
  );
}
