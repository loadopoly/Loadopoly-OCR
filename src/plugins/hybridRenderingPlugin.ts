/**
 * Hybrid Rendering Plugin
 * 
 * Provides adaptive rendering that falls back from Three.js WebGL to D3.js SVG
 * when WebGL is unavailable. Includes lazy loading and IPFS caching for
 * bandwidth optimization.
 * 
 * @module hybridRenderingPlugin
 */

import { logger } from '../lib/logger';
import { GraphNode, GraphEdge, DataAsset } from '../types';

// Rendering Configuration
const RENDER_CONFIG = {
  WEBGL_MEMORY_THRESHOLD_MB: 256,
  MAX_NODES_3D: 2000,
  MAX_NODES_2D: 5000,
  LAZY_LOAD_DISTANCE: 500,
  CACHE_TTL_MS: 3600000, // 1 hour
  SVG_MIN_NODE_SIZE: 4,
  SVG_MAX_NODE_SIZE: 20,
  FORCE_SIMULATION_ITERATIONS: 300,
};

/**
 * Rendering capability detection result
 */
export interface RenderCapabilities {
  webgl: boolean;
  webgl2: boolean;
  webgpu: boolean;
  maxTextureSize: number;
  availableMemory: number;
  isMobile: boolean;
  preferredMode: RenderMode;
}

/**
 * Render mode enum
 */
export type RenderMode = 'webgl' | 'svg' | 'canvas2d' | 'hybrid';

/**
 * Rendered graph state
 */
export interface RenderedGraph {
  mode: RenderMode;
  nodeCount: number;
  edgeCount: number;
  visibleNodeIds: Set<string>;
  lodLevel: number;
  lastUpdate: number;
}

/**
 * Lazy loaded shard
 */
export interface LazyLoadedShard {
  shardId: string;
  ipfsCid: string;
  position: { x: number; y: number; z?: number };
  loaded: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  thumbnail?: string;
}

/**
 * SVG Graph renderer using D3.js patterns
 */
interface SVGRenderer {
  container: SVGElement | null;
  simulation: any; // D3 force simulation
  nodeElements: Map<string, SVGCircleElement>;
  edgeElements: Map<string, SVGLineElement>;
  zoom: number;
  pan: { x: number; y: number };
}

/**
 * IPFS cache entry
 */
interface IPFSCacheEntry {
  cid: string;
  data: any;
  timestamp: number;
  size: number;
}

/**
 * Hybrid Rendering Service
 */
class HybridRenderingService {
  private capabilities: RenderCapabilities | null = null;
  private currentMode: RenderMode = 'webgl';
  private renderedGraph: RenderedGraph | null = null;
  private svgRenderer: SVGRenderer | null = null;
  private lazyShards: Map<string, LazyLoadedShard> = new Map();
  private ipfsCache: Map<string, IPFSCacheEntry> = new Map();
  private cacheSize: number = 0;
  private maxCacheSize: number = 50 * 1024 * 1024; // 50MB

  /**
   * Detect rendering capabilities
   */
  detectCapabilities(): RenderCapabilities {
    if (this.capabilities) {
      return this.capabilities;
    }

    // Detect WebGL support
    let webgl = false;
    let webgl2 = false;
    let maxTextureSize = 0;

    try {
      const canvas = document.createElement('canvas');
      const gl2 = canvas.getContext('webgl2');
      if (gl2) {
        webgl2 = true;
        webgl = true;
        maxTextureSize = gl2.getParameter(gl2.MAX_TEXTURE_SIZE);
      } else {
        const gl = canvas.getContext('webgl');
        if (gl) {
          webgl = true;
          maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        }
      }
    } catch (e) {
      logger.warn('WebGL detection failed', { error: e });
    }

    // Detect WebGPU
    const webgpu = 'gpu' in navigator;

    // Estimate available memory
    let availableMemory = 512; // Default assumption
    if ('deviceMemory' in navigator) {
      availableMemory = (navigator as any).deviceMemory * 1024;
    }

    // Detect mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

    // Determine preferred mode
    let preferredMode: RenderMode = 'svg';
    if (webgl && availableMemory >= RENDER_CONFIG.WEBGL_MEMORY_THRESHOLD_MB) {
      preferredMode = isMobile ? 'hybrid' : 'webgl';
    }

    this.capabilities = {
      webgl,
      webgl2,
      webgpu,
      maxTextureSize,
      availableMemory,
      isMobile,
      preferredMode,
    };

    logger.info('Rendering capabilities detected', this.capabilities);

    return this.capabilities;
  }

  /**
   * Initialize renderer with appropriate mode
   */
  async initialize(container: HTMLElement, mode?: RenderMode): Promise<boolean> {
    const caps = this.detectCapabilities();
    this.currentMode = mode || caps.preferredMode;

    logger.info('Initializing renderer', { mode: this.currentMode });

    switch (this.currentMode) {
      case 'webgl':
        return this.initializeWebGL(container);
      case 'svg':
        return this.initializeSVG(container);
      case 'hybrid':
        // Try WebGL first, fall back to SVG
        if (await this.initializeWebGL(container)) {
          return true;
        }
        return this.initializeSVG(container);
      case 'canvas2d':
        return this.initializeCanvas2D(container);
      default:
        return this.initializeSVG(container);
    }
  }

  /**
   * Initialize WebGL renderer (Three.js)
   */
  private async initializeWebGL(container: HTMLElement): Promise<boolean> {
    try {
      // Dynamic import of Three.js
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls');

      const width = container.clientWidth;
      const height = container.clientHeight;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 10000);
      const renderer = new THREE.WebGLRenderer({ antialias: true });

      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      // Store references for later use
      (this as any)._three = { THREE, scene, camera, renderer, controls };

      logger.info('WebGL renderer initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize WebGL', { error });
      return false;
    }
  }

  /**
   * Initialize SVG renderer (D3.js patterns)
   */
  private initializeSVG(container: HTMLElement): boolean {
    try {
      const width = container.clientWidth;
      const height = container.clientHeight;

      // Create SVG element
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.style.width = '100%';
      svg.style.height = '100%';
      container.appendChild(svg);

      // Create groups for edges and nodes
      const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      edgeGroup.setAttribute('class', 'edges');
      svg.appendChild(edgeGroup);

      const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      nodeGroup.setAttribute('class', 'nodes');
      svg.appendChild(nodeGroup);

      this.svgRenderer = {
        container: svg,
        simulation: null,
        nodeElements: new Map(),
        edgeElements: new Map(),
        zoom: 1,
        pan: { x: 0, y: 0 },
      };

      // Add zoom/pan handlers
      this.setupSVGInteraction(svg);

      logger.info('SVG renderer initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize SVG', { error });
      return false;
    }
  }

  /**
   * Initialize Canvas 2D renderer
   */
  private initializeCanvas2D(container: HTMLElement): boolean {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get 2D context');

      (this as any)._canvas2d = { canvas, ctx };

      logger.info('Canvas 2D renderer initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Canvas 2D', { error });
      return false;
    }
  }

  /**
   * Setup SVG interaction (zoom/pan)
   */
  private setupSVGInteraction(svg: SVGElement): void {
    let isPanning = false;
    let startX = 0;
    let startY = 0;

    svg.addEventListener('mousedown', (e) => {
      isPanning = true;
      startX = e.clientX - (this.svgRenderer?.pan.x || 0);
      startY = e.clientY - (this.svgRenderer?.pan.y || 0);
    });

    svg.addEventListener('mousemove', (e) => {
      if (!isPanning || !this.svgRenderer) return;
      this.svgRenderer.pan.x = e.clientX - startX;
      this.svgRenderer.pan.y = e.clientY - startY;
      this.updateSVGTransform();
    });

    svg.addEventListener('mouseup', () => {
      isPanning = false;
    });

    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.svgRenderer) return;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.svgRenderer.zoom *= delta;
      this.svgRenderer.zoom = Math.max(0.1, Math.min(5, this.svgRenderer.zoom));
      this.updateSVGTransform();
    });
  }

  /**
   * Update SVG transform for zoom/pan
   */
  private updateSVGTransform(): void {
    if (!this.svgRenderer?.container) return;
    const groups = this.svgRenderer.container.querySelectorAll('g');
    const transform = `translate(${this.svgRenderer.pan.x}, ${this.svgRenderer.pan.y}) scale(${this.svgRenderer.zoom})`;
    groups.forEach(g => g.setAttribute('transform', transform));
  }

  /**
   * Render graph with current mode
   */
  async renderGraph(
    nodes: GraphNode[],
    edges: GraphEdge[],
    options: {
      animate?: boolean;
      highlightIds?: string[];
    } = {}
  ): Promise<RenderedGraph> {
    const startTime = Date.now();

    // Apply LOD based on node count
    const { processedNodes, processedEdges, lodLevel } = this.applyLOD(nodes, edges);

    switch (this.currentMode) {
      case 'webgl':
        await this.renderWebGL(processedNodes, processedEdges, options);
        break;
      case 'svg':
        await this.renderSVG(processedNodes, processedEdges, options);
        break;
      case 'canvas2d':
        await this.renderCanvas2D(processedNodes, processedEdges, options);
        break;
      case 'hybrid':
        // Use WebGL for 3D, SVG for overview
        await this.renderWebGL(processedNodes, processedEdges, options);
        break;
    }

    this.renderedGraph = {
      mode: this.currentMode,
      nodeCount: processedNodes.length,
      edgeCount: processedEdges.length,
      visibleNodeIds: new Set(processedNodes.map(n => n.id)),
      lodLevel,
      lastUpdate: Date.now(),
    };

    logger.info('Graph rendered', {
      mode: this.currentMode,
      nodeCount: processedNodes.length,
      lodLevel,
      renderTime: Date.now() - startTime,
    });

    return this.renderedGraph;
  }

  /**
   * Apply Level of Detail based on node count
   */
  private applyLOD(
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): { processedNodes: GraphNode[]; processedEdges: GraphEdge[]; lodLevel: number } {
    const maxNodes = this.currentMode === 'svg' 
      ? RENDER_CONFIG.MAX_NODES_2D 
      : RENDER_CONFIG.MAX_NODES_3D;

    if (nodes.length <= maxNodes) {
      return { processedNodes: nodes, processedEdges: edges, lodLevel: 0 };
    }

    // Sort by importance (confidence, connections)
    const nodeConnections = new Map<string, number>();
    edges.forEach(e => {
      nodeConnections.set(e.source, (nodeConnections.get(e.source) || 0) + 1);
      nodeConnections.set(e.target, (nodeConnections.get(e.target) || 0) + 1);
    });

    const scoredNodes = nodes.map(n => ({
      node: n,
      score: (n.confidence || 0.5) * (nodeConnections.get(n.id) || 0 + 1),
    }));

    scoredNodes.sort((a, b) => b.score - a.score);

    const processedNodes = scoredNodes.slice(0, maxNodes).map(s => s.node);
    const nodeIdSet = new Set(processedNodes.map(n => n.id));

    const processedEdges = edges.filter(
      e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target)
    );

    const lodLevel = Math.ceil(Math.log2(nodes.length / maxNodes));

    return { processedNodes, processedEdges, lodLevel };
  }

  /**
   * Render with WebGL (Three.js)
   */
  private async renderWebGL(
    nodes: GraphNode[],
    edges: GraphEdge[],
    options: { animate?: boolean; highlightIds?: string[] }
  ): Promise<void> {
    const three = (this as any)._three;
    if (!three) return;

    const { THREE, scene, camera, renderer, controls } = three;

    // Clear existing objects
    while (scene.children.length > 0) {
      scene.remove(scene.children[0]);
    }

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Create node geometries
    const nodeGeometry = new THREE.SphereGeometry(5, 16, 16);
    const highlightSet = new Set(options.highlightIds || []);

    const nodePositions = new Map<string, THREE.Vector3>();

    nodes.forEach((node, index) => {
      const material = new THREE.MeshPhongMaterial({
        color: highlightSet.has(node.id) ? 0xff6600 : this.getNodeColor(node.type),
      });
      const mesh = new THREE.Mesh(nodeGeometry, material);

      // Position using force-directed layout approximation
      const angle = (index / nodes.length) * Math.PI * 2;
      const radius = 100 + Math.random() * 100;
      const position = new THREE.Vector3(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * 100,
        Math.sin(angle) * radius
      );

      mesh.position.copy(position);
      mesh.userData = { nodeId: node.id, node };
      scene.add(mesh);
      nodePositions.set(node.id, position);
    });

    // Create edge lines
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x444444, opacity: 0.5 });

    edges.forEach(edge => {
      const sourcePos = nodePositions.get(edge.source);
      const targetPos = nodePositions.get(edge.target);
      if (!sourcePos || !targetPos) return;

      const geometry = new THREE.BufferGeometry().setFromPoints([sourcePos, targetPos]);
      const line = new THREE.Line(geometry, edgeMaterial);
      scene.add(line);
    });

    // Position camera
    camera.position.set(0, 100, 300);
    camera.lookAt(0, 0, 0);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
  }

  /**
   * Render with SVG (D3.js patterns)
   */
  private async renderSVG(
    nodes: GraphNode[],
    edges: GraphEdge[],
    options: { animate?: boolean; highlightIds?: string[] }
  ): Promise<void> {
    if (!this.svgRenderer?.container) return;

    const svg = this.svgRenderer.container;
    const width = parseInt(svg.getAttribute('width') || '800');
    const height = parseInt(svg.getAttribute('height') || '600');

    const edgeGroup = svg.querySelector('.edges');
    const nodeGroup = svg.querySelector('.nodes');
    if (!edgeGroup || !nodeGroup) return;

    // Clear existing elements
    edgeGroup.innerHTML = '';
    nodeGroup.innerHTML = '';
    this.svgRenderer.nodeElements.clear();
    this.svgRenderer.edgeElements.clear();

    // Simple force-directed layout
    const nodePositions = this.computeForceLayout(nodes, edges, width, height);
    const highlightSet = new Set(options.highlightIds || []);

    // Render edges
    edges.forEach(edge => {
      const sourcePos = nodePositions.get(edge.source);
      const targetPos = nodePositions.get(edge.target);
      if (!sourcePos || !targetPos) return;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(sourcePos.x));
      line.setAttribute('y1', String(sourcePos.y));
      line.setAttribute('x2', String(targetPos.x));
      line.setAttribute('y2', String(targetPos.y));
      line.setAttribute('stroke', '#ccc');
      line.setAttribute('stroke-width', '1');
      edgeGroup.appendChild(line);

      this.svgRenderer!.edgeElements.set(`${edge.source}-${edge.target}`, line);
    });

    // Render nodes
    nodes.forEach(node => {
      const pos = nodePositions.get(node.id);
      if (!pos) return;

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(pos.x));
      circle.setAttribute('cy', String(pos.y));
      circle.setAttribute('r', String(this.getNodeSize(node)));
      circle.setAttribute('fill', highlightSet.has(node.id) ? '#ff6600' : this.getNodeColorHex(node.type));
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '2');
      circle.style.cursor = 'pointer';

      // Add hover title
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${node.label} (${node.type})`;
      circle.appendChild(title);

      // Click handler
      circle.addEventListener('click', () => {
        this.onNodeClick(node);
      });

      nodeGroup.appendChild(circle);
      this.svgRenderer!.nodeElements.set(node.id, circle);
    });
  }

  /**
   * Render with Canvas 2D
   */
  private async renderCanvas2D(
    nodes: GraphNode[],
    edges: GraphEdge[],
    options: { animate?: boolean; highlightIds?: string[] }
  ): Promise<void> {
    const canvas2d = (this as any)._canvas2d;
    if (!canvas2d) return;

    const { canvas, ctx } = canvas2d;
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Compute layout
    const nodePositions = this.computeForceLayout(nodes, edges, width, height);
    const highlightSet = new Set(options.highlightIds || []);

    // Draw edges
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    edges.forEach(edge => {
      const sourcePos = nodePositions.get(edge.source);
      const targetPos = nodePositions.get(edge.target);
      if (!sourcePos || !targetPos) return;

      ctx.beginPath();
      ctx.moveTo(sourcePos.x, sourcePos.y);
      ctx.lineTo(targetPos.x, targetPos.y);
      ctx.stroke();
    });

    // Draw nodes
    nodes.forEach(node => {
      const pos = nodePositions.get(node.id);
      if (!pos) return;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, this.getNodeSize(node), 0, Math.PI * 2);
      ctx.fillStyle = highlightSet.has(node.id) ? '#ff6600' : this.getNodeColorHex(node.type);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  /**
   * Compute force-directed layout (simplified)
   */
  private computeForceLayout(
    nodes: GraphNode[],
    edges: GraphEdge[],
    width: number,
    height: number
  ): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();

    // Initialize positions
    nodes.forEach((node, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      const radius = Math.min(width, height) * 0.3;
      positions.set(node.id, {
        x: width / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
        y: height / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 50,
      });
    });

    // Simple force simulation
    const edgeMap = new Map<string, string[]>();
    edges.forEach(e => {
      const sources = edgeMap.get(e.source) || [];
      sources.push(e.target);
      edgeMap.set(e.source, sources);

      const targets = edgeMap.get(e.target) || [];
      targets.push(e.source);
      edgeMap.set(e.target, targets);
    });

    const iterations = Math.min(RENDER_CONFIG.FORCE_SIMULATION_ITERATIONS, nodes.length * 2);
    const repulsion = 5000;
    const attraction = 0.01;

    for (let iter = 0; iter < iterations; iter++) {
      // Repulsion between all nodes
      for (const node1 of nodes) {
        const pos1 = positions.get(node1.id)!;
        let fx = 0, fy = 0;

        for (const node2 of nodes) {
          if (node1.id === node2.id) continue;
          const pos2 = positions.get(node2.id)!;

          const dx = pos1.x - pos2.x;
          const dy = pos1.y - pos2.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          const force = repulsion / (dist * dist);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }

        // Attraction along edges
        const connected = edgeMap.get(node1.id) || [];
        for (const targetId of connected) {
          const pos2 = positions.get(targetId)!;
          const dx = pos2.x - pos1.x;
          const dy = pos2.y - pos1.y;
          fx += dx * attraction;
          fy += dy * attraction;
        }

        // Apply forces with damping
        const damping = 0.1 * (1 - iter / iterations);
        pos1.x += fx * damping;
        pos1.y += fy * damping;

        // Keep within bounds
        pos1.x = Math.max(50, Math.min(width - 50, pos1.x));
        pos1.y = Math.max(50, Math.min(height - 50, pos1.y));
      }
    }

    return positions;
  }

  /**
   * Get node color based on type
   */
  private getNodeColor(type: string): number {
    const colors: Record<string, number> = {
      person: 0x4a90d9,
      place: 0x50c878,
      event: 0xffa500,
      organization: 0x9370db,
      concept: 0xff69b4,
      document: 0x87ceeb,
      artifact: 0xdaa520,
      default: 0x808080,
    };
    return colors[type.toLowerCase()] || colors.default;
  }

  /**
   * Get node color as hex string
   */
  private getNodeColorHex(type: string): string {
    const color = this.getNodeColor(type);
    return `#${color.toString(16).padStart(6, '0')}`;
  }

  /**
   * Get node size based on confidence
   */
  private getNodeSize(node: GraphNode): number {
    const confidence = node.confidence || 0.5;
    return RENDER_CONFIG.SVG_MIN_NODE_SIZE + 
      (RENDER_CONFIG.SVG_MAX_NODE_SIZE - RENDER_CONFIG.SVG_MIN_NODE_SIZE) * confidence;
  }

  /**
   * Node click handler
   */
  private onNodeClick(node: GraphNode): void {
    logger.debug('Node clicked', { nodeId: node.id, type: node.type });
    // Emit event for external handling
    window.dispatchEvent(new CustomEvent('graph:nodeClick', { detail: node }));
  }

  /**
   * Lazy load shard from IPFS
   */
  async lazyLoadShard(cid: string, position: { x: number; y: number; z?: number }): Promise<LazyLoadedShard> {
    const shardId = `shard_${cid}`;

    // Check if already loaded
    const existing = this.lazyShards.get(shardId);
    if (existing?.loaded) {
      return existing;
    }

    // Check IPFS cache
    const cached = this.ipfsCache.get(cid);
    if (cached && Date.now() - cached.timestamp < RENDER_CONFIG.CACHE_TTL_MS) {
      const shard: LazyLoadedShard = {
        shardId,
        ipfsCid: cid,
        position,
        loaded: true,
        nodes: cached.data.nodes || [],
        edges: cached.data.edges || [],
      };
      this.lazyShards.set(shardId, shard);
      return shard;
    }

    // Fetch from IPFS
    try {
      const response = await fetch(`https://ipfs.io/ipfs/${cid}`);
      const data = await response.json();

      // Cache the data
      this.addToCache(cid, data);

      const shard: LazyLoadedShard = {
        shardId,
        ipfsCid: cid,
        position,
        loaded: true,
        nodes: data.nodes || [],
        edges: data.edges || [],
      };

      this.lazyShards.set(shardId, shard);
      logger.info('Shard lazy loaded', { shardId, nodeCount: shard.nodes.length });

      return shard;
    } catch (error) {
      logger.error('Failed to lazy load shard', { cid, error });
      throw error;
    }
  }

  /**
   * Add data to IPFS cache with size management
   */
  private addToCache(cid: string, data: any): void {
    const dataStr = JSON.stringify(data);
    const size = new Blob([dataStr]).size;

    // Evict old entries if necessary
    while (this.cacheSize + size > this.maxCacheSize && this.ipfsCache.size > 0) {
      const oldestKey = this.ipfsCache.keys().next().value;
      if (oldestKey) {
        const entry = this.ipfsCache.get(oldestKey);
        if (entry) {
          this.cacheSize -= entry.size;
        }
        this.ipfsCache.delete(oldestKey);
      }
    }

    this.ipfsCache.set(cid, {
      cid,
      data,
      timestamp: Date.now(),
      size,
    });
    this.cacheSize += size;
  }

  /**
   * Get current render mode
   */
  getCurrentMode(): RenderMode {
    return this.currentMode;
  }

  /**
   * Switch render mode
   */
  async switchMode(mode: RenderMode, container: HTMLElement): Promise<boolean> {
    this.cleanup();
    return this.initialize(container, mode);
  }

  /**
   * Get render stats
   */
  getStats(): {
    mode: RenderMode;
    nodeCount: number;
    edgeCount: number;
    lodLevel: number;
    cacheSizeMB: number;
  } {
    return {
      mode: this.currentMode,
      nodeCount: this.renderedGraph?.nodeCount || 0,
      edgeCount: this.renderedGraph?.edgeCount || 0,
      lodLevel: this.renderedGraph?.lodLevel || 0,
      cacheSizeMB: this.cacheSize / (1024 * 1024),
    };
  }

  /**
   * Cleanup renderer
   */
  cleanup(): void {
    // Cleanup WebGL
    const three = (this as any)._three;
    if (three?.renderer) {
      three.renderer.dispose();
      three.renderer.domElement.remove();
    }

    // Cleanup SVG
    if (this.svgRenderer?.container) {
      this.svgRenderer.container.remove();
    }

    // Cleanup Canvas
    const canvas2d = (this as any)._canvas2d;
    if (canvas2d?.canvas) {
      canvas2d.canvas.remove();
    }

    this.svgRenderer = null;
    (this as any)._three = null;
    (this as any)._canvas2d = null;

    logger.info('Renderer cleaned up');
  }
}

// Export singleton
export const hybridRenderingService = new HybridRenderingService();

/**
 * Plugin definition for hybrid rendering
 */
export const createHybridRenderingPlugin = () => ({
  id: 'hybrid-rendering',
  name: 'Hybrid Rendering Engine',
  version: '1.0.0',

  detectCapabilities() {
    return hybridRenderingService.detectCapabilities();
  },

  async initialize(container: HTMLElement, mode?: RenderMode) {
    return hybridRenderingService.initialize(container, mode);
  },

  async renderGraph(
    nodes: GraphNode[],
    edges: GraphEdge[],
    options?: { animate?: boolean; highlightIds?: string[] }
  ) {
    return hybridRenderingService.renderGraph(nodes, edges, options || {});
  },

  async lazyLoadShard(cid: string, position: { x: number; y: number; z?: number }) {
    return hybridRenderingService.lazyLoadShard(cid, position);
  },

  getStats() {
    return hybridRenderingService.getStats();
  },

  cleanup() {
    hybridRenderingService.cleanup();
  },
});

export default hybridRenderingService;
