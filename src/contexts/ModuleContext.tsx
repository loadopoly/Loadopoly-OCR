/**
 * Module Context Provider
 * 
 * React context for accessing the module system throughout the app.
 * Provides hooks for feature flags, storage, LLM providers, etc.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import {
  moduleRegistry,
  featureFlags,
  graphHealer,
  eventEmitter,
  getModuleSystemStatus,
  IRendererModule,
  ILLMProvider,
  IDataStorage,
  FeatureFlag,
} from '../modules';
import { isModuleSystemInitialized, getInitPromise } from '../bootstrap';

// ============================================
// Context Types
// ============================================

interface ModuleContextValue {
  // Initialization
  isInitialized: boolean;
  isLoading: boolean;
  
  // Registry access
  renderers: IRendererModule[];
  llmProviders: ILLMProvider[];
  storageAdapters: IDataStorage[];
  
  // Active providers
  activeStorage: IDataStorage | null;
  activeLLM: ILLMProvider | null;
  
  // Feature flags
  featureFlags: FeatureFlag[];
  isFeatureEnabled: (name: string) => boolean;
  
  // Stats
  stats: {
    renderers: number;
    llmProviders: number;
    storageAdapters: number;
    processors: number;
    plugins: number;
  };
  
  // Actions
  setActiveStorage: (name: string) => void;
  setActiveLLM: (name: string) => void;
  toggleFeatureFlag: (name: string, enabled: boolean) => void;
}

const defaultContextValue: ModuleContextValue = {
  isInitialized: false,
  isLoading: true,
  renderers: [],
  llmProviders: [],
  storageAdapters: [],
  activeStorage: null,
  activeLLM: null,
  featureFlags: [],
  isFeatureEnabled: () => false,
  stats: { renderers: 0, llmProviders: 0, storageAdapters: 0, processors: 0, plugins: 0 },
  setActiveStorage: () => {},
  setActiveLLM: () => {},
  toggleFeatureFlag: () => {},
};

// ============================================
// Context
// ============================================

const ModuleContext = createContext<ModuleContextValue>(defaultContextValue);

// ============================================
// Provider Component
// ============================================

interface ModuleProviderProps {
  children: ReactNode;
}

export function ModuleProvider({ children }: ModuleProviderProps) {
  const [isInitialized, setIsInitialized] = useState(isModuleSystemInitialized());
  const [isLoading, setIsLoading] = useState(!isModuleSystemInitialized());
  
  const [renderers, setRenderers] = useState<IRendererModule[]>([]);
  const [llmProviders, setLLMProviders] = useState<ILLMProvider[]>([]);
  const [storageAdapters, setStorageAdapters] = useState<IDataStorage[]>([]);
  const [activeStorage, setActiveStorageState] = useState<IDataStorage | null>(null);
  const [activeLLM, setActiveLLMState] = useState<ILLMProvider | null>(null);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [stats, setStats] = useState(defaultContextValue.stats);

  // Wait for initialization
  useEffect(() => {
    const initPromise = getInitPromise();
    if (initPromise) {
      initPromise
        .then(() => {
          setIsInitialized(true);
          setIsLoading(false);
          refreshState();
        })
        .catch(() => {
          setIsLoading(false);
        });
    } else if (isModuleSystemInitialized()) {
      setIsInitialized(true);
      setIsLoading(false);
      refreshState();
    }
  }, []);

  // Refresh state from registry
  // PERF FIX: useCallback so refreshState is stable across renders. Previously
  // this was an inline function that was recreated every render and couldn't be
  // used as an effect dependency.
  const refreshState = useCallback(() => {
    setRenderers(moduleRegistry.getAllRenderers());
    setLLMProviders(moduleRegistry.getAllLLMProviders());
    setStorageAdapters(moduleRegistry.getAllStorageAdapters());
    setActiveStorageState(moduleRegistry.getActiveStorageAdapter());
    setActiveLLMState(moduleRegistry.getActiveLLMProvider());
    setFlags(featureFlags.getAllFlags());
    setStats(moduleRegistry.getStats());
  }, []);

  // Subscribe to registry changes
  useEffect(() => {
    if (!isInitialized) return;

    const unsubRegister = eventEmitter.on('module:registered', refreshState);
    const unsubUnregister = eventEmitter.on('module:unregistered', refreshState);
    const unsubPluginLoad = eventEmitter.on('plugin:loaded', refreshState);
    const unsubPluginUnload = eventEmitter.on('plugin:unloaded', refreshState);

    return () => {
      unsubRegister();
      unsubUnregister();
      unsubPluginLoad();
      unsubPluginUnload();
    };
  }, [isInitialized]);

  // Actions — PERF FIX: useCallback to keep stable references for context consumers
  const setActiveStorage = useCallback((name: string) => {
    try {
      moduleRegistry.setActiveStorageAdapter(name);
      setActiveStorageState(moduleRegistry.getActiveStorageAdapter());
    } catch (error) {
      console.error('Failed to set active storage:', error);
    }
  }, []);

  const setActiveLLM = useCallback((name: string) => {
    try {
      moduleRegistry.setActiveLLMProvider(name);
      setActiveLLMState(moduleRegistry.getActiveLLMProvider());
    } catch (error) {
      console.error('Failed to set active LLM:', error);
    }
  }, []);

  const toggleFeatureFlag = useCallback((name: string, enabled: boolean) => {
    const provider = featureFlags.getProvider();
    if (provider && 'setFlag' in provider) {
      (provider as any).setFlag(name, enabled);
      setFlags(featureFlags.getAllFlags());
    }
  }, []);

  const isFeatureEnabled = useCallback((name: string) => {
    return featureFlags.isEnabled(name);
  }, []);

  // PERF FIX: useMemo prevents every child of ModuleProvider from re-rendering
  // whenever any unrelated parent state changes. Previously this object literal
  // was recreated on every render, forcing React to treat the context value as
  // "changed" and re-render the entire app tree.
  const value: ModuleContextValue = useMemo(() => ({
    isInitialized,
    isLoading,
    renderers,
    llmProviders,
    storageAdapters,
    activeStorage,
    activeLLM,
    featureFlags: flags,
    isFeatureEnabled,
    stats,
    setActiveStorage,
    setActiveLLM,
    toggleFeatureFlag,
  }), [
    isInitialized, isLoading, renderers, llmProviders, storageAdapters,
    activeStorage, activeLLM, flags, isFeatureEnabled, stats,
    setActiveStorage, setActiveLLM, toggleFeatureFlag,
  ]);

  return (
    <ModuleContext.Provider value={value}>
      {children}
    </ModuleContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useModuleContext(): ModuleContextValue {
  const context = useContext(ModuleContext);
  if (!context) {
    throw new Error('useModuleContext must be used within a ModuleProvider');
  }
  return context;
}

// ============================================
// Convenience Hooks
// ============================================

/**
 * Hook to check if the module system is ready
 */
export function useModuleSystemReady(): boolean {
  const { isInitialized, isLoading } = useModuleContext();
  return isInitialized && !isLoading;
}

/**
 * Hook to get available renderers
 */
export function useRenderers(): IRendererModule[] {
  const { renderers } = useModuleContext();
  return renderers.filter(r => r.isSupported());
}

/**
 * Hook to get available LLM providers
 */
export function useLLMProviders(): ILLMProvider[] {
  const { llmProviders } = useModuleContext();
  return llmProviders;
}

/**
 * Hook to check a single feature flag
 */
export function useFeature(flagName: string): boolean {
  const { isFeatureEnabled } = useModuleContext();
  const [enabled, setEnabled] = useState(() => isFeatureEnabled(flagName));

  useEffect(() => {
    const unsubscribe = featureFlags.subscribe(flagName, setEnabled);
    return unsubscribe;
  }, [flagName]);

  return enabled;
}
