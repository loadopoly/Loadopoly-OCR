/**
 * WorldRenderer Component
 * 
 * Interactive 3D visualization of the knowledge graph.
 * Features force-directed layout, deep exploration capabilities,
 * and engaging animations to help users discover connections.
 */

import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { GraphData, GraphNode, GraphLink, DigitalAsset } from '../../types';
import { PresenceState } from '../../services/avatarService';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Users, 
  Compass, 
  Network, 
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause
} from 'lucide-react';
import { KnowledgeExplorer } from './KnowledgeExplorer';

// ============================================
// Types
// ============================================

interface WorldNode extends GraphNode {
  worldPosition: [number, number, number];
  velocity: [number, number, number];
  scale: number;
  color: string;
  connections: number;
}

interface WorldLink {
  source: WorldNode;
  target: WorldNode;
  relationship: string;
}

interface WorldRendererProps {
  graphData: GraphData;
  assets?: DigitalAsset[];
  nearbyUsers?: PresenceState[];
  currentUserId?: string;
  onNodeSelect?: (node: GraphNode) => void;
  onPositionChange?: (position: [number, number, number]) => void;
  onAssetView?: (assetId: string) => void;
}

// ============================================
// Constants
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

const FORCE_CONFIG = {
  repulsion: 800,
  attraction: 0.05,
  damping: 0.85,
  centerForce: 0.01,
  linkDistance: 60,
  maxVelocity: 5,
};

// ============================================
// Force-Directed Layout
// ============================================

function initializeForceLayout(data: GraphData): { nodes: WorldNode[]; links: WorldLink[] } {
  const nodeMap = new Map<string, WorldNode>();
  
  // Count connections for each node
  const connectionCount = new Map<string, number>();
  data.links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
    connectionCount.set(sourceId, (connectionCount.get(sourceId) || 0) + 1);
    connectionCount.set(targetId, (connectionCount.get(targetId) || 0) + 1);
  });

  // Initialize nodes with random positions in a sphere, clustered by type
  data.nodes.forEach((node) => {
    const typeIndex = ['DOCUMENT', 'PERSON', 'LOCATION', 'ORGANIZATION', 'DATE', 'CONCEPT'].indexOf(node.type);
    const baseAngle = (typeIndex / 6) * Math.PI * 2;
    const spread = Math.random() * 20;
    
    const x = Math.cos(baseAngle) * spread + (Math.random() - 0.5) * 30;
    const y = (Math.random() - 0.5) * 40;
    const z = Math.sin(baseAngle) * spread + (Math.random() - 0.5) * 30;

    const connections = connectionCount.get(node.id) || 0;
    
    nodeMap.set(node.id, {
      ...node,
      worldPosition: [x, y, z],
      velocity: [0, 0, 0],
      scale: 0.5 + Math.min(connections, 10) * 0.15 + node.relevance * 0.5,
      color: TYPE_COLORS[node.type] || '#64748b',
      connections,
    });
  });

  // Map links
  const worldLinks: WorldLink[] = data.links
    .map((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
      
      const sourceNode = nodeMap.get(sourceId);
      const targetNode = nodeMap.get(targetId);
      
      if (!sourceNode || !targetNode) return null;
      
      return {
        source: sourceNode,
        target: targetNode,
        relationship: link.relationship,
      };
    })
    .filter((l): l is WorldLink => l !== null);

  return {
    nodes: Array.from(nodeMap.values()),
    links: worldLinks,
  };
}

function simulateForces(
  nodes: WorldNode[],
  links: WorldLink[],
  config = FORCE_CONFIG
): WorldNode[] {
  const newNodes = nodes.map(n => ({
    ...n,
    velocity: [...n.velocity] as [number, number, number],
    worldPosition: [...n.worldPosition] as [number, number, number],
  }));

  // Apply repulsion between all nodes
  for (let i = 0; i < newNodes.length; i++) {
    for (let j = i + 1; j < newNodes.length; j++) {
      const nodeA = newNodes[i];
      const nodeB = newNodes[j];
      
      const dx = nodeB.worldPosition[0] - nodeA.worldPosition[0];
      const dy = nodeB.worldPosition[1] - nodeA.worldPosition[1];
      const dz = nodeB.worldPosition[2] - nodeA.worldPosition[2];
      
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const force = config.repulsion / (distance * distance);
      
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      const fz = (dz / distance) * force;
      
      nodeA.velocity[0] -= fx;
      nodeA.velocity[1] -= fy;
      nodeA.velocity[2] -= fz;
      nodeB.velocity[0] += fx;
      nodeB.velocity[1] += fy;
      nodeB.velocity[2] += fz;
    }
  }

  // Apply attraction along links
  const nodeIndexMap = new Map(newNodes.map((n, i) => [n.id, i]));
  links.forEach(link => {
    const sourceIdx = nodeIndexMap.get(link.source.id);
    const targetIdx = nodeIndexMap.get(link.target.id);
    
    if (sourceIdx === undefined || targetIdx === undefined) return;
    
    const source = newNodes[sourceIdx];
    const target = newNodes[targetIdx];
    
    const dx = target.worldPosition[0] - source.worldPosition[0];
    const dy = target.worldPosition[1] - source.worldPosition[1];
    const dz = target.worldPosition[2] - source.worldPosition[2];
    
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const force = (distance - config.linkDistance) * config.attraction;
    
    const fx = (dx / distance) * force;
    const fy = (dy / distance) * force;
    const fz = (dz / distance) * force;
    
    source.velocity[0] += fx;
    source.velocity[1] += fy;
    source.velocity[2] += fz;
    target.velocity[0] -= fx;
    target.velocity[1] -= fy;
    target.velocity[2] -= fz;
  });

  // Apply center force and update positions
  newNodes.forEach(node => {
    // Center gravity
    node.velocity[0] -= node.worldPosition[0] * config.centerForce;
    node.velocity[1] -= node.worldPosition[1] * config.centerForce;
    node.velocity[2] -= node.worldPosition[2] * config.centerForce;
    
    // Damping
    node.velocity[0] *= config.damping;
    node.velocity[1] *= config.damping;
    node.velocity[2] *= config.damping;
    
    // Clamp velocity
    const speed = Math.sqrt(
      node.velocity[0] ** 2 + node.velocity[1] ** 2 + node.velocity[2] ** 2
    );
    if (speed > config.maxVelocity) {
      const scale = config.maxVelocity / speed;
      node.velocity[0] *= scale;
      node.velocity[1] *= scale;
      node.velocity[2] *= scale;
    }
    
    // Update position
    node.worldPosition[0] += node.velocity[0];
    node.worldPosition[1] += node.velocity[1];
    node.worldPosition[2] += node.velocity[2];
  });

  return newNodes;
}

// ============================================
// Canvas 2D Renderer with Animations
// ============================================

function InteractiveCanvas({ 
  nodes, 
  links, 
  selectedNode,
  hoveredNode,
  highlightedNodes,
  onNodeClick,
  onNodeHover,
  nearbyUsers = [],
  zoom,
  offset,
  onOffsetChange,
  showLabels,
  showLinks,
}: { 
  nodes: WorldNode[];
  links: WorldLink[];
  selectedNode: WorldNode | null;
  hoveredNode: WorldNode | null;
  highlightedNodes: Set<string>;
  onNodeClick: (node: WorldNode | null) => void;
  onNodeHover: (node: WorldNode | null) => void;
  nearbyUsers: PresenceState[];
  zoom: number;
  offset: { x: number; y: number };
  onOffsetChange: (offset: { x: number; y: number }) => void;
  showLabels: boolean;
  showLinks: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const animationTime = useRef(0);
  const animationFrameRef = useRef<number>();

  // Project 3D to 2D
  const project = useCallback((pos: [number, number, number]): { x: number; y: number; depth: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, depth: 0 };
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Isometric projection with subtle rotation
    const time = animationTime.current * 0.0005;
    const rotX = pos[0] * Math.cos(time) - pos[2] * Math.sin(time);
    const rotZ = pos[0] * Math.sin(time) + pos[2] * Math.cos(time);
    
    const isoX = (rotX - rotZ) * 0.866;
    const isoY = (rotX + rotZ) * 0.5 - pos[1];
    
    return {
      x: centerX + (isoX * zoom * 4) + offset.x,
      y: centerY + (isoY * zoom * 4) + offset.y,
      depth: rotZ,
    };
  }, [zoom, offset]);

  // Get connected node IDs for highlighting
  const getConnectedNodeIds = useCallback((nodeId: string): Set<string> => {
    const connected = new Set<string>();
    links.forEach(link => {
      if (link.source.id === nodeId) connected.add(link.target.id);
      if (link.target.id === nodeId) connected.add(link.source.id);
    });
    return connected;
  }, [links]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = (timestamp: number) => {
      animationTime.current = timestamp;
      
      // Clear with gradient background
      const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width / 2
      );
      gradient.addColorStop(0, '#0f172a');
      gradient.addColorStop(1, '#020617');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Add subtle grid pattern
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.5;
      const gridSize = 50 * zoom;
      for (let x = offset.x % gridSize; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = offset.y % gridSize; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Sort nodes by depth for proper rendering
      const sortedNodes = [...nodes].map(node => ({
        node,
        projected: project(node.worldPosition),
      })).sort((a, b) => a.projected.depth - b.projected.depth);

      // Get highlighted connections
      const activeNodeId = hoveredNode?.id || selectedNode?.id;
      const connectedIds = activeNodeId ? getConnectedNodeIds(activeNodeId) : new Set<string>();

      // Draw links
      if (showLinks) {
        links.forEach(link => {
          const start = project(link.source.worldPosition);
          const end = project(link.target.worldPosition);
          
          const isHighlighted = 
            (activeNodeId === link.source.id || activeNodeId === link.target.id) ||
            (highlightedNodes.has(link.source.id) && highlightedNodes.has(link.target.id));
          
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          
          if (isHighlighted) {
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.8;
            
            // Draw animated particles along highlighted links
            const particlePos = (timestamp % 2000) / 2000;
            const px = start.x + (end.x - start.x) * particlePos;
            const py = start.y + (end.y - start.y) * particlePos;
            
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#60a5fa';
            ctx.fill();
          } else {
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.2;
            ctx.stroke();
          }
          
          ctx.globalAlpha = 1;
        });
      }

      // Draw nodes
      sortedNodes.forEach(({ node, projected }) => {
        const pos = projected;
        const baseRadius = node.scale * 6 * zoom;
        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredNode?.id === node.id;
        const isConnected = connectedIds.has(node.id);
        const isInHighlight = highlightedNodes.has(node.id);
        
        // Pulse animation for selected/hovered
        const pulse = isSelected || isHovered 
          ? 1 + Math.sin(timestamp * 0.005) * 0.1 
          : 1;
        const radius = baseRadius * pulse;
        
        // Determine opacity based on state
        let opacity = 0.4;
        if (isSelected || isHovered) opacity = 1;
        else if (isConnected || isInHighlight) opacity = 0.9;
        else if (activeNodeId) opacity = 0.2;
        
        ctx.globalAlpha = opacity;
        
        // Glow effect
        if (isSelected || isHovered || isConnected) {
          const glowGradient = ctx.createRadialGradient(
            pos.x, pos.y, 0,
            pos.x, pos.y, radius * 3
          );
          glowGradient.addColorStop(0, node.color + '80');
          glowGradient.addColorStop(1, 'transparent');
          ctx.fillStyle = glowGradient;
          ctx.fillRect(pos.x - radius * 3, pos.y - radius * 3, radius * 6, radius * 6);
        }
        
        // Node circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();
        
        // Selection ring
        if (isSelected) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.stroke();
          
          // Outer ring animation
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, radius + 8 + Math.sin(timestamp * 0.003) * 3, 0, Math.PI * 2);
          ctx.strokeStyle = node.color + '60';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (isHovered) {
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        
        ctx.globalAlpha = 1;
        
        // Labels
        if (showLabels && (node.scale > 0.8 || isSelected || isHovered || zoom > 1.5)) {
          const labelOpacity = isSelected || isHovered ? 1 : Math.min(1, zoom * 0.5);
          ctx.globalAlpha = labelOpacity;
          ctx.fillStyle = '#ffffff';
          ctx.font = `${Math.max(10, 11 * zoom)}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          
          const label = node.label.length > 20 && !isSelected 
            ? node.label.slice(0, 20) + '...' 
            : node.label;
          
          // Text background
          const metrics = ctx.measureText(label);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
          ctx.fillRect(
            pos.x - metrics.width / 2 - 4,
            pos.y + radius + 4,
            metrics.width + 8,
            14
          );
          
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, pos.x, pos.y + radius + 6);
          ctx.globalAlpha = 1;
        }
      });

      // Draw nearby users
      nearbyUsers.forEach(user => {
        const pos = project(user.position);
        
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = user.avatarColor || '#6366f1';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(user.displayName || 'User', pos.x, pos.y - 22);
      });

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    animationFrameRef.current = requestAnimationFrame(draw);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [nodes, links, selectedNode, hoveredNode, highlightedNodes, zoom, offset, nearbyUsers, project, getConnectedNodeIds, showLabels, showLinks]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (isDragging) {
      const dx = e.clientX - lastPos.x;
      const dy = e.clientY - lastPos.y;
      onOffsetChange({ x: offset.x + dx, y: offset.y + dy });
      setLastPos({ x: e.clientX, y: e.clientY });
      return;
    }

    // Check for hover
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let foundNode: WorldNode | null = null;
    for (const node of nodes) {
      const pos = project(node.worldPosition);
      const radius = node.scale * 6 * zoom;
      const dist = Math.sqrt((mouseX - pos.x) ** 2 + (mouseY - pos.y) ** 2);
      
      if (dist <= radius + 5) {
        foundNode = node;
        break;
      }
    }
    
    onNodeHover(foundNode);
    canvas.style.cursor = foundNode ? 'pointer' : 'grab';
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
    
    for (const node of nodes) {
      const pos = project(node.worldPosition);
      const radius = node.scale * 6 * zoom;
      const dist = Math.sqrt((clickX - pos.x) ** 2 + (clickY - pos.y) ** 2);
      
      if (dist <= radius + 5) {
        onNodeClick(node);
        return;
      }
    }
    
    // Click on empty space clears selection
    onNodeClick(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
  };

  return (
    <canvas
      ref={canvasRef}
      width={1200}
      height={800}
      className="w-full h-full"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { handleMouseUp(); onNodeHover(null); }}
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
  assets = [],
  nearbyUsers = [],
  currentUserId,
  onNodeSelect,
  onPositionChange,
  onAssetView,
}: WorldRendererProps) {
  const [selectedNode, setSelectedNode] = useState<WorldNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<WorldNode | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  
  // Controls state
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isSimulating, setIsSimulating] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [showExplorer, setShowExplorer] = useState(true);
  const [filterType, setFilterType] = useState<string | null>(null);
  
  // Force simulation state
  const [worldData, setWorldData] = useState<{ nodes: WorldNode[]; links: WorldLink[] }>({ nodes: [], links: [] });
  const simulationRef = useRef<number>();

  // Initialize world data when graph changes
  useEffect(() => {
    const initial = initializeForceLayout(graphData);
    setWorldData(initial);
  }, [graphData]);

  // Run force simulation
  useEffect(() => {
    if (!isSimulating || worldData.nodes.length === 0) return;
    
    let frameCount = 0;
    const maxFrames = 300; // Stop after stabilizing
    
    const simulate = () => {
      if (frameCount >= maxFrames) {
        setIsSimulating(false);
        return;
      }
      
      setWorldData(prev => ({
        ...prev,
        nodes: simulateForces(prev.nodes, prev.links),
      }));
      
      frameCount++;
      simulationRef.current = requestAnimationFrame(simulate);
    };
    
    simulationRef.current = requestAnimationFrame(simulate);
    
    return () => {
      if (simulationRef.current) {
        cancelAnimationFrame(simulationRef.current);
      }
    };
  }, [isSimulating, worldData.nodes.length]);

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

  // Filter nodes by type
  const filteredData = useMemo(() => {
    if (!filterType) return worldData;
    
    const filteredNodes = worldData.nodes.filter(n => n.type === filterType);
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = worldData.links.filter(
      l => nodeIds.has(l.source.id) && nodeIds.has(l.target.id)
    );
    
    return { nodes: filteredNodes, links: filteredLinks };
  }, [worldData, filterType]);

  const handleNodeClick = useCallback((node: WorldNode | null) => {
    if (node === null) {
      setSelectedNode(null);
      setHighlightedNodes(new Set());
      return;
    }
    setSelectedNode(node);
    onNodeSelect?.(node);
  }, [onNodeSelect]);

  const handleNodeHover = useCallback((node: WorldNode | null) => {
    setHoveredNode(node);
  }, []);

  const handleExplorerNodeSelect = useCallback((node: GraphNode | null) => {
    if (!node) {
      setSelectedNode(null);
      setHighlightedNodes(new Set());
      return;
    }
    
    // Find the WorldNode
    const worldNode = worldData.nodes.find(n => n.id === node.id);
    if (worldNode) {
      setSelectedNode(worldNode);
      onNodeSelect?.(worldNode);
      
      // Center view on node
      setOffset({ x: -worldNode.worldPosition[0] * zoom * 4, y: -worldNode.worldPosition[1] * zoom * 4 });
    }
  }, [worldData.nodes, zoom, onNodeSelect]);

  const handleZoomIn = () => setZoom(z => Math.min(5, z * 1.2));
  const handleZoomOut = () => setZoom(z => Math.max(0.2, z / 1.2));
  const handleReset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setSelectedNode(null);
    setHighlightedNodes(new Set());
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.2, Math.min(5, z * delta)));
  };

  // Filter out current user from nearby users display
  const otherUsers = nearbyUsers.filter(u => u.userId !== currentUserId);

  // Get unique types for filter
  const nodeTypes = useMemo(() => {
    const types = new Set(graphData.nodes.map(n => n.type));
    return Array.from(types);
  }, [graphData.nodes]);

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full bg-slate-950 rounded-xl overflow-hidden flex"
      onWheel={handleWheel}
    >
      {/* Main Canvas Area */}
      <div className={`relative flex-1 transition-all duration-300 ${showExplorer ? 'mr-80' : ''}`}>
        <InteractiveCanvas
          nodes={filteredData.nodes}
          links={filteredData.links}
          selectedNode={selectedNode}
          hoveredNode={hoveredNode}
          highlightedNodes={highlightedNodes}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          nearbyUsers={otherUsers}
          zoom={zoom}
          offset={offset}
          onOffsetChange={setOffset}
          showLabels={showLabels}
          showLinks={showLinks}
        />

        {/* HUD Overlay - Top Left Stats */}
        <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-sm rounded-lg p-3 border border-slate-700 min-w-[200px]">
          <div className="flex items-center gap-2 text-xs text-primary-400 mb-2">
            <Network size={14} />
            <span className="font-semibold">Knowledge World</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Nodes</span>
              <span className="text-white font-mono">{filteredData.nodes.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Links</span>
              <span className="text-white font-mono">{filteredData.links.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Zoom</span>
              <span className="text-white font-mono">{(zoom * 100).toFixed(0)}%</span>
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
          
          {/* Simulation indicator */}
          <div className="mt-2 pt-2 border-t border-slate-700">
            <button
              onClick={() => setIsSimulating(!isSimulating)}
              className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                isSimulating ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isSimulating ? <Pause size={12} /> : <Play size={12} />}
              {isSimulating ? 'Simulating...' : 'Start Simulation'}
            </button>
          </div>
        </div>

        {/* Type Filter Pills */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 flex-wrap justify-center max-w-md">
          <button
            onClick={() => setFilterType(null)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              !filterType 
                ? 'bg-primary-600 text-white' 
                : 'bg-slate-800/80 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            All Types
          </button>
          {nodeTypes.map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type === filterType ? null : type)}
              className={`px-3 py-1 text-xs rounded-full transition-colors border ${
                filterType === type
                  ? 'text-white border-transparent'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white border-slate-700'
              }`}
              style={{
                backgroundColor: filterType === type ? TYPE_COLORS[type] || '#64748b' : undefined,
              }}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Hover Info Tooltip */}
        {hoveredNode && !selectedNode && (
          <div className="absolute top-20 left-4 bg-slate-900/95 backdrop-blur-sm rounded-lg p-3 border border-slate-700 max-w-xs pointer-events-none">
            <div className="flex items-center gap-2 mb-1">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: hoveredNode.color }}
              />
              <h3 className="text-white font-bold text-sm">{hoveredNode.label}</h3>
            </div>
            <div className="text-xs text-slate-400">
              {hoveredNode.type} • {hoveredNode.connections} connections
            </div>
            <div className="text-xs text-primary-400 mt-1">
              Click to explore →
            </div>
          </div>
        )}

        {/* View Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`p-2 rounded-lg border transition-colors ${
              showLabels 
                ? 'bg-primary-600/20 border-primary-600/50 text-primary-400' 
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Toggle Labels"
          >
            {showLabels ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          <button
            onClick={() => setShowLinks(!showLinks)}
            className={`p-2 rounded-lg border transition-colors ${
              showLinks 
                ? 'bg-primary-600/20 border-primary-600/50 text-primary-400' 
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Toggle Links"
          >
            <Network size={18} />
          </button>
        </div>

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
          <button
            onClick={() => setShowExplorer(!showExplorer)}
            className={`p-2 rounded-lg border transition-colors ${
              showExplorer 
                ? 'bg-primary-600/20 border-primary-600/50 text-primary-400' 
                : 'bg-slate-800/80 border-slate-700 text-white hover:bg-slate-700'
            }`}
            title="Toggle Explorer Panel"
          >
            {showExplorer ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Online Users List */}
        {otherUsers.length > 0 && (
          <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur-sm rounded-lg p-3 border border-slate-700">
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
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-slate-500 bg-slate-900/50 px-3 py-1.5 rounded-full flex items-center gap-2">
          <Compass size={12} />
          <span>Drag to pan</span>
          <span className="text-slate-600">•</span>
          <span>Scroll to zoom</span>
          <span className="text-slate-600">•</span>
          <span>Click nodes to explore</span>
        </div>
      </div>

      {/* Knowledge Explorer Panel */}
      {showExplorer && (
        <div className="absolute top-0 right-0 w-80 h-full border-l border-slate-700">
          <KnowledgeExplorer
            graphData={graphData}
            assets={assets}
            selectedNode={selectedNode}
            onNodeSelect={handleExplorerNodeSelect}
            onAssetView={onAssetView}
          />
        </div>
      )}
    </div>
  );
}
