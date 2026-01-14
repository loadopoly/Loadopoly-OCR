/**
 * Lazy Loading Component Wrappers
 * 
 * Provides code-split loading for heavy visualization components
 * to improve initial load time and reduce main bundle size.
 * 
 * Features:
 * - Suspense boundaries with loading states
 * - Error boundaries for graceful failures
 * - Preload hints for better UX
 * - Intersection observer for viewport-based loading
 */

import React, { Suspense, lazy, ComponentType, useEffect, useState, useRef } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

// ============================================
// Loading Fallback Component
// ============================================

interface LoadingFallbackProps {
  message?: string;
  height?: string;
}

export const LoadingFallback: React.FC<LoadingFallbackProps> = ({ 
  message = 'Loading...', 
  height = 'h-64' 
}) => (
  <div className={`${height} flex flex-col items-center justify-center bg-slate-900/50 rounded-xl border border-slate-800`}>
    <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-2" />
    <span className="text-slate-400 text-sm">{message}</span>
  </div>
);

// ============================================
// Error Fallback Component  
// ============================================

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
  componentName?: string;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ 
  error, 
  resetError, 
  componentName = 'Component' 
}) => (
  <div className="h-64 flex flex-col items-center justify-center bg-slate-900/50 rounded-xl border border-red-900/50 p-4">
    <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
    <span className="text-slate-300 text-sm mb-1">Failed to load {componentName}</span>
    <span className="text-slate-500 text-xs mb-3">{error.message}</span>
    <button 
      onClick={resetError}
      className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors"
    >
      <RefreshCw className="w-4 h-4" />
      Retry
    </button>
  </div>
);

// ============================================
// Error Boundary for Lazy Components
// ============================================

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class LazyErrorBoundary extends React.Component<
  { children: React.ReactNode; componentName?: string },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; componentName?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <ErrorFallback 
          error={this.state.error} 
          resetError={this.resetError}
          componentName={this.props.componentName}
        />
      );
    }
    return this.props.children;
  }
}

// ============================================
// Lazy Component Factory with Retry
// ============================================

function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  retries = 3,
  delay = 1000
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    for (let i = 0; i < retries; i++) {
      try {
        return await importFn();
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
    throw new Error('Failed to load component after retries');
  });
}

// ============================================
// Lazy Loaded Heavy Components
// ============================================

// Graph Visualizer - D3.js force-directed graph
export const LazyGraphVisualizer = lazyWithRetry(
  () => import('../components/GraphVisualizer')
);

// AR Scene - Camera and WebGL overlay
export const LazyARScene = lazyWithRetry(
  () => import('../components/ARScene')
);

// Semantic Canvas - Canvas-based visualization
export const LazySemanticCanvas = lazyWithRetry(
  () => import('../components/SemanticCanvas')
);

// World Renderer - Three.js 3D metaverse view (default export)
export const LazyWorldRenderer = lazyWithRetry(
  () => import('../components/metaverse/WorldRenderer')
);

// Knowledge Explorer - Complex data explorer (named export)
export const LazyKnowledgeExplorer = lazyWithRetry(
  () => import('../components/metaverse/KnowledgeExplorer').then(m => ({ default: m.KnowledgeExplorer }))
);

// Map View - 2D mapping component (named export)
export const LazyMapView2D = lazyWithRetry(
  () => import('../components/metaverse/MapView2D').then(m => ({ default: m.MapView2D }))
);

// Batch Importer - File processing UI
export const LazyBatchImporter = lazyWithRetry(
  () => import('../components/BatchImporter')
);

// Annotation Editor - Image annotation tool
export const LazyAnnotationEditor = lazyWithRetry(
  () => import('../components/AnnotationEditor')
);

// ============================================
// Wrapped Components with Suspense
// ============================================

interface WithSuspenseProps {
  fallbackMessage?: string;
  fallbackHeight?: string;
  componentName?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withLazySuspense<T extends ComponentType<any>>(
  LazyComponent: React.LazyExoticComponent<T>,
  options: WithSuspenseProps = {}
): T {
  const { 
    fallbackMessage = 'Loading component...', 
    fallbackHeight = 'h-64',
    componentName = 'Component'
  } = options;

  const WrappedComponent = (props: React.ComponentProps<T>) => (
    <LazyErrorBoundary componentName={componentName}>
      <Suspense fallback={<LoadingFallback message={fallbackMessage} height={fallbackHeight} />}>
        <LazyComponent {...props} />
      </Suspense>
    </LazyErrorBoundary>
  );
  
  return WrappedComponent as unknown as T;
}

// Pre-wrapped components for easy use
export const GraphVisualizerLazy = withLazySuspense(LazyGraphVisualizer, {
  fallbackMessage: 'Loading knowledge graph...',
  fallbackHeight: 'h-96',
  componentName: 'Graph Visualizer'
});

export const ARSceneLazy = withLazySuspense(LazyARScene, {
  fallbackMessage: 'Initializing AR camera...',
  fallbackHeight: 'h-screen',
  componentName: 'AR Scene'
});

export const SemanticCanvasLazy = withLazySuspense(LazySemanticCanvas, {
  fallbackMessage: 'Loading semantic canvas...',
  fallbackHeight: 'h-96',
  componentName: 'Semantic Canvas'
});

export const WorldRendererLazy = withLazySuspense(LazyWorldRenderer, {
  fallbackMessage: 'Loading 3D world...',
  fallbackHeight: 'h-screen',
  componentName: 'World Renderer'
});

// ============================================
// Viewport-Based Lazy Loading
// ============================================

interface LazyOnViewportProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  rootMargin?: string;
  threshold?: number;
}

export const LazyOnViewport: React.FC<LazyOnViewportProps> = ({
  children,
  fallback = <LoadingFallback />,
  rootMargin = '100px',
  threshold = 0.1
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return (
    <div ref={ref}>
      {isVisible ? children : fallback}
    </div>
  );
};

// ============================================
// Preload Functions for Route Prefetching
// ============================================

export const preloadGraphVisualizer = () => {
  import('../components/GraphVisualizer');
};

export const preloadARScene = () => {
  import('../components/ARScene');
};

export const preloadWorldRenderer = () => {
  import('../components/metaverse/WorldRenderer');
};

export const preloadBatchImporter = () => {
  import('../components/BatchImporter');
};

// Preload all heavy components (call on idle)
export const preloadAllHeavyComponents = () => {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => {
      preloadGraphVisualizer();
      preloadARScene();
      preloadWorldRenderer();
      preloadBatchImporter();
    });
  } else {
    // Fallback for Safari
    setTimeout(() => {
      preloadGraphVisualizer();
      preloadARScene();
      preloadWorldRenderer();
      preloadBatchImporter();
    }, 2000);
  }
};
