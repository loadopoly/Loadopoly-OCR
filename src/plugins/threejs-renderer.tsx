/**
 * Example Plugin - ThreeJS Renderer
 * 
 * Demonstrates how to create a plugin that provides
 * a 3D graph renderer using Three.js.
 */

import { createPlugin } from '../modules/plugins';
import { IRendererModule, RendererProps, RendererConfig } from '../modules/types';
import React, { useEffect, useRef } from 'react';
import { logger } from '../lib/logger';

// ============================================
// ThreeJS Renderer Module
// ============================================

const ThreeJSRendererComponent: React.FC<RendererProps> = ({ 
  graphData, 
  selectedNodeId,
  onNodeSelect,
  onNodeHover,
  className,
  config 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const threeRef = useRef<any>(null);

  useEffect(() => {
    let animationId: number = 0;
    
    const initThreeJS = async () => {
      if (!containerRef.current) return;

      try {
        // Dynamically import Three.js
        const THREE = await import('three');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Create scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(config?.theme === 'dark' ? 0x1a1a2e : 0xf0f0f0);

        // Create camera
        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.z = 50;

        // Create renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);

        // Add controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        // Create nodes
        const nodeGeometry = new THREE.SphereGeometry(1, 32, 32);
        const nodeMeshes = new Map<string, any>();

        const nodeColors: Record<string, number> = {
          DOCUMENT: 0x4a90d9,
          PERSON: 0xe74c3c,
          LOCATION: 0x2ecc71,
          ORGANIZATION: 0xf39c12,
          DATE: 0x9b59b6,
          CONCEPT: 0x1abc9c,
          CLUSTER: 0x34495e,
        };

        // Position nodes in 3D space
        const positions = new Map<string, any>();
        const nodeCount = graphData.nodes.length;
        const radius = Math.max(20, nodeCount * 2);

        graphData.nodes.forEach((node, index) => {
          const phi = Math.acos(-1 + (2 * index) / nodeCount);
          const theta = Math.sqrt(nodeCount * Math.PI) * phi;

          const x = radius * Math.cos(theta) * Math.sin(phi);
          const y = radius * Math.sin(theta) * Math.sin(phi);
          const z = radius * Math.cos(phi);

          positions.set(node.id, new THREE.Vector3(x, y, z));

          const color = nodeColors[node.type] || 0x95a5a6;
          const material = new THREE.MeshPhongMaterial({ 
            color,
            emissive: node.id === selectedNodeId ? 0xffffff : 0x000000,
            emissiveIntensity: node.id === selectedNodeId ? 0.3 : 0,
          });

          const mesh = new THREE.Mesh(nodeGeometry, material);
          mesh.position.set(x, y, z);
          mesh.scale.setScalar(Math.max(0.5, node.relevance * 2));
          mesh.userData = { node };

          scene.add(mesh);
          nodeMeshes.set(node.id, mesh);
        });

        // Create edges
        const lineMaterial = new THREE.LineBasicMaterial({ 
          color: 0x888888, 
          opacity: 0.5, 
          transparent: true 
        });

        graphData.links.forEach(link => {
          const sourcePos = positions.get(link.source);
          const targetPos = positions.get(link.target);

          if (sourcePos && targetPos) {
            const points = [sourcePos, targetPos];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            scene.add(line);
          }
        });

        // Add lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 50, 50);
        scene.add(directionalLight);

        // Raycaster for interaction
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const onMouseMove = (event: MouseEvent) => {
          const rect = container.getBoundingClientRect();
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObjects(Array.from(nodeMeshes.values()));

          if (intersects.length > 0) {
            const node = intersects[0].object.userData.node;
            onNodeHover?.(node.id);
            container.style.cursor = 'pointer';
          } else {
            onNodeHover?.(null);
            container.style.cursor = 'default';
          }
        };

        const onClick = (event: MouseEvent) => {
          const rect = container.getBoundingClientRect();
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObjects(Array.from(nodeMeshes.values()));

          if (intersects.length > 0) {
            const node = intersects[0].object.userData.node;
            onNodeSelect?.(node.id);
          }
        };

        container.addEventListener('mousemove', onMouseMove);
        container.addEventListener('click', onClick);

        // Animation loop
        let animationId: number = 0;
        const animate = () => {
          animationId = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

        // Handle resize
        const handleResize = () => {
          const newWidth = container.clientWidth;
          const newHeight = container.clientHeight;
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight);
        };
        window.addEventListener('resize', handleResize);

        // Store refs for cleanup
        threeRef.current = {
          renderer,
          scene,
          camera,
          controls,
          animationId,
          cleanup: () => {
            cancelAnimationFrame(animationId);
            container.removeEventListener('mousemove', onMouseMove);
            container.removeEventListener('click', onClick);
            window.removeEventListener('resize', handleResize);
            renderer.dispose();
            container.removeChild(renderer.domElement);
          },
        };
      } catch (error) {
        logger.error('Failed to initialize Three.js renderer', error);
      }
    };

    initThreeJS();

    return () => {
      if (threeRef.current?.cleanup) {
        threeRef.current.cleanup();
      }
    };
  }, [graphData, selectedNodeId, config?.theme]);

  return (
    <div 
      ref={containerRef} 
      className={`w-full h-full min-h-[400px] ${className || ''}`}
    />
  );
};

// ============================================
// Renderer Module Definition
// ============================================

export const ThreeJSRenderer: IRendererModule = {
  name: 'threejs-3d',
  displayName: '3D Graph (Three.js)',
  priority: 20,
  component: ThreeJSRendererComponent,

  async init(config: RendererConfig): Promise<void> {
    logger.info('ThreeJS renderer initialized', config);
  },

  dispose(): void {
    logger.info('ThreeJS renderer disposed');
  },

  isSupported(): boolean {
    // Check for WebGL support
    try {
      const canvas = document.createElement('canvas');
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      );
    } catch {
      return false;
    }
  },
};

// ============================================
// Plugin Definition
// ============================================

export const threeJSPlugin = createPlugin()
  .id('threejs-renderer')
  .name('Three.js 3D Renderer')
  .version('1.0.0')
  .description('Provides a 3D graph visualization using Three.js')
  .author('Loadopoly')
  .withModules({
    renderers: [ThreeJSRenderer],
  })
  .onLoad(async () => {
    logger.info('Three.js renderer plugin loaded');
  })
  .onUnload(() => {
    logger.info('Three.js renderer plugin unloaded');
  })
  .build();

export default threeJSPlugin;
