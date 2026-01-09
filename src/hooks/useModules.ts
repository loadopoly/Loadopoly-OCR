/**
 * React Hooks for Module System
 * 
 * Provides React hooks for accessing module system features
 * including feature flags, LLM providers, and storage.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { featureFlags, isFeatureEnabled, getFeatureValue } from '../modules/featureFlags';
import { moduleRegistry, getActiveStorage, getActiveLLM } from '../modules/registry';
import { graphHealer } from '../modules/graphHealer';
import { eventEmitter } from '../modules/events';
import {
  FeatureFlagContext,
  IDataStorage,
  ILLMProvider,
  HealingResult,
  ModuleEventType,
} from '../modules/types';
import { GraphData } from '../types';

// ============================================
// Feature Flags Hook
// ============================================

/**
 * Hook to check if a feature flag is enabled
 */
export function useFeatureFlag(
  flagName: string,
  context?: FeatureFlagContext
): boolean {
  const [enabled, setEnabled] = useState(() => 
    isFeatureEnabled(flagName, context)
  );

  useEffect(() => {
    // Subscribe to flag changes
    const unsubscribe = featureFlags.subscribe(flagName, setEnabled);
    return unsubscribe;
  }, [flagName]);

  return enabled;
}

/**
 * Hook to get a feature flag value
 */
export function useFeatureFlagValue<T>(
  flagName: string,
  defaultValue: T,
  context?: FeatureFlagContext
): T {
  const [value, setValue] = useState(() =>
    getFeatureValue(flagName, defaultValue, context)
  );

  useEffect(() => {
    const unsubscribe = featureFlags.subscribe(flagName, () => {
      setValue(getFeatureValue(flagName, defaultValue, context));
    });
    return unsubscribe;
  }, [flagName, defaultValue, context]);

  return value;
}

/**
 * Hook to get all feature flags
 */
export function useAllFeatureFlags() {
  const [flags, setFlags] = useState(() => featureFlags.getAllFlags());

  useEffect(() => {
    // Re-fetch flags periodically or on changes
    const interval = setInterval(() => {
      setFlags(featureFlags.getAllFlags());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return flags;
}

// ============================================
// Storage Hook
// ============================================

/**
 * Hook to access the active storage adapter
 */
export function useStorage(): {
  storage: IDataStorage | null;
  isConnected: boolean;
  error: string | null;
} {
  const [storage, setStorage] = useState<IDataStorage | null>(() => getActiveStorage());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      const currentStorage = getActiveStorage();
      setStorage(currentStorage);

      if (currentStorage) {
        try {
          const connected = await currentStorage.isConnected();
          setIsConnected(connected);
          setError(null);
        } catch (e) {
          setIsConnected(false);
          setError(e instanceof Error ? e.message : 'Connection failed');
        }
      } else {
        setIsConnected(false);
        setError('No storage adapter configured');
      }
    };

    checkConnection();

    // Listen for storage changes
    const unsubscribe = eventEmitter.on('module:registered', (event) => {
      if (event.payload && (event.payload as any).type === 'storage') {
        checkConnection();
      }
    });

    return unsubscribe;
  }, []);

  return { storage, isConnected, error };
}

// ============================================
// LLM Provider Hook
// ============================================

/**
 * Hook to access the active LLM provider
 */
export function useLLMProvider(): {
  provider: ILLMProvider | null;
  isAvailable: boolean;
  extractMetadata: (image: Blob, options?: any) => Promise<any>;
} {
  const [provider, setProvider] = useState<ILLMProvider | null>(() => getActiveLLM());
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    const checkAvailability = async () => {
      const currentProvider = getActiveLLM();
      setProvider(currentProvider);

      if (currentProvider) {
        try {
          const available = await currentProvider.isAvailable();
          setIsAvailable(available);
        } catch {
          setIsAvailable(false);
        }
      } else {
        setIsAvailable(false);
      }
    };

    checkAvailability();

    const unsubscribe = eventEmitter.on('module:registered', (event) => {
      if (event.payload && (event.payload as any).type === 'llm') {
        checkAvailability();
      }
    });

    return unsubscribe;
  }, []);

  const extractMetadata = useCallback(async (image: Blob, options?: any) => {
    if (!provider) {
      throw new Error('No LLM provider available');
    }
    return provider.extractMetadata(image, options);
  }, [provider]);

  return { provider, isAvailable, extractMetadata };
}

// ============================================
// Graph Healer Hook
// ============================================

/**
 * Hook to use the graph healer
 */
export function useGraphHealer(): {
  heal: (graph: GraphData, options?: any) => Promise<HealingResult>;
  isHealing: boolean;
  lastResult: HealingResult | null;
  history: any[];
} {
  const [isHealing, setIsHealing] = useState(false);
  const [lastResult, setLastResult] = useState<HealingResult | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    // Listen for healing events
    const unsubscribe = eventEmitter.on('graph:healed', (event) => {
      setLastResult(event.payload as HealingResult);
      setHistory(graphHealer.getHistory(10));
    });

    return unsubscribe;
  }, []);

  const heal = useCallback(async (graph: GraphData, options?: any) => {
    setIsHealing(true);
    try {
      const result = await graphHealer.healGraph(graph, options);
      setLastResult(result);
      return result;
    } finally {
      setIsHealing(false);
    }
  }, []);

  return { heal, isHealing, lastResult, history };
}

// ============================================
// Module Events Hook
// ============================================

/**
 * Hook to subscribe to module events
 */
export function useModuleEvent<T = unknown>(
  eventType: ModuleEventType,
  handler: (payload: T) => void
): void {
  useEffect(() => {
    const unsubscribe = eventEmitter.on(eventType, (event) => {
      handler(event.payload as T);
    });

    return unsubscribe;
  }, [eventType, handler]);
}

// ============================================
// Module Registry Hook
// ============================================

/**
 * Hook to get module registry stats
 */
export function useModuleRegistry() {
  const [stats, setStats] = useState(() => moduleRegistry.getStats());
  const [renderers, setRenderers] = useState(() => moduleRegistry.getAllRenderers());
  const [providers, setProviders] = useState(() => moduleRegistry.getAllLLMProviders());

  useEffect(() => {
    const updateStats = () => {
      setStats(moduleRegistry.getStats());
      setRenderers(moduleRegistry.getAllRenderers());
      setProviders(moduleRegistry.getAllLLMProviders());
    };

    const unsubRegister = eventEmitter.on('module:registered', updateStats);
    const unsubUnregister = eventEmitter.on('module:unregistered', updateStats);

    return () => {
      unsubRegister();
      unsubUnregister();
    };
  }, []);

  return { stats, renderers, providers };
}

// ============================================
// User Tier Hook
// ============================================

/**
 * Hook to get user tier configuration
 */
export function useUserTier(tier: 'novice' | 'intermediate' | 'expert') {
  return useMemo(() => {
    const configs = {
      novice: {
        showAdvancedControls: false,
        enableAPIAccess: false,
        enableRawDataExport: false,
        maxConcurrentUploads: 3,
        graphComplexityLimit: 100,
      },
      intermediate: {
        showAdvancedControls: true,
        enableAPIAccess: false,
        enableRawDataExport: true,
        maxConcurrentUploads: 10,
        graphComplexityLimit: 500,
      },
      expert: {
        showAdvancedControls: true,
        enableAPIAccess: true,
        enableRawDataExport: true,
        maxConcurrentUploads: 50,
        graphComplexityLimit: 5000,
      },
    };

    return configs[tier];
  }, [tier]);
}
