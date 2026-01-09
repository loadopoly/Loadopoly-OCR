/**
 * Module System - Main Exports
 * 
 * Central export point for the modular architecture enabling:
 * - Pluggable renderers, LLM providers, and storage backends
 * - Plugin system for third-party extensions
 * - Self-healing graph capabilities
 * - Feature flag management
 * - Event-driven architecture
 */

// ============================================
// Types
// ============================================
export * from './types';

// ============================================
// Core Systems
// ============================================
export { moduleRegistry, registerModule, getModule, registerLLMProvider, getStorageProvider, getActiveStorage, getActiveLLM } from './registry';
export { eventEmitter, graph, onNodeAdded, onNodeRemoved, onEdgeAdded, onEdgeRemoved, onGraphHealed, onAssetCreated, onAssetUpdated, onAssetDeleted } from './events';

// ============================================
// Storage Adapters
// ============================================
export { BaseStorage, InMemoryStorage } from './storage/abstract';
export { SupabaseStorage, supabaseStorage } from './storage/supabase';

// ============================================
// LLM Providers
// ============================================
export { BaseLLMProvider, MockLLMProvider } from './llm/abstract';
export { GeminiProvider, geminiProvider } from './llm/gemini';
export { OpenAIProvider, openAIProvider } from './llm/openai';

// ============================================
// Plugin System
// ============================================
export { pluginLoader, createPlugin, loadBuiltinPlugins, loadConfiguredPlugins, PluginBuilder } from './plugins';
export type { PluginManifest, PluginLoadOptions } from './plugins';

// ============================================
// Graph Healer
// ============================================
export { graphHealer, startScheduledHealing, stopScheduledHealing, GraphHealer } from './graphHealer';

// ============================================
// Feature Flags
// ============================================
export { featureFlags, isFeatureEnabled, getFeatureValue, LocalStorageFeatureFlagProvider, EnvironmentFeatureFlagProvider } from './featureFlags';

// ============================================
// Initialization
// ============================================

import { moduleRegistry } from './registry';
import { geminiProvider } from './llm/gemini';
import { openAIProvider } from './llm/openai';
import { MockLLMProvider } from './llm/abstract';
import { supabaseStorage } from './storage/supabase';
import { InMemoryStorage } from './storage/abstract';
import { featureFlags, LocalStorageFeatureFlagProvider } from './featureFlags';
import { loadBuiltinPlugins, loadConfiguredPlugins } from './plugins';
import { logger } from '../lib/logger';

export interface ModuleSystemConfig {
  /** Enable Gemini LLM provider */
  enableGemini?: boolean;
  /** Enable OpenAI LLM provider */
  enableOpenAI?: boolean;
  /** Enable Supabase storage */
  enableSupabase?: boolean;
  /** Enable in-memory storage (for offline/testing) */
  enableInMemoryStorage?: boolean;
  /** Feature flag provider to use */
  featureFlagProvider?: 'localStorage' | 'environment';
  /** Load built-in plugins */
  loadPlugins?: boolean;
  /** User context for feature flags */
  userContext?: {
    userId?: string;
    userTier?: 'novice' | 'intermediate' | 'expert';
  };
}

/**
 * Initialize the module system with all providers and plugins
 */
export async function initializeModuleSystem(config: ModuleSystemConfig = {}): Promise<void> {
  logger.info('Initializing module system');

  // Initialize feature flags first
  const ffProvider = config.featureFlagProvider === 'environment'
    ? new (await import('./featureFlags')).EnvironmentFeatureFlagProvider()
    : new LocalStorageFeatureFlagProvider();
  
  await featureFlags.init(ffProvider);

  if (config.userContext) {
    featureFlags.setDefaultContext(config.userContext);
  }

  // Register LLM providers
  if (config.enableGemini !== false) {
    try {
      await geminiProvider.init({});
      moduleRegistry.registerLLMProvider(geminiProvider);
      if (await geminiProvider.isAvailable()) {
        moduleRegistry.setActiveLLMProvider('gemini');
      }
    } catch (error) {
      logger.warn('Failed to initialize Gemini provider');
    }
  }

  if (config.enableOpenAI) {
    try {
      await openAIProvider.init({});
      moduleRegistry.registerLLMProvider(openAIProvider);
    } catch (error) {
      logger.warn('Failed to initialize OpenAI provider');
    }
  }

  // Always register mock provider as fallback
  const mockProvider = new MockLLMProvider();
  await mockProvider.init({});
  moduleRegistry.registerLLMProvider(mockProvider);

  // Register storage adapters
  if (config.enableSupabase !== false) {
    try {
      await supabaseStorage.init({
        userId: config.userContext?.userId,
      });
      moduleRegistry.registerStorageAdapter(supabaseStorage);
      if (await supabaseStorage.isConnected()) {
        moduleRegistry.setActiveStorageAdapter('supabase');
      }
    } catch (error) {
      logger.warn('Failed to initialize Supabase storage');
    }
  }

  if (config.enableInMemoryStorage) {
    const inMemoryStorage = new InMemoryStorage();
    await inMemoryStorage.init({});
    moduleRegistry.registerStorageAdapter(inMemoryStorage);
    
    // Use in-memory if no other storage is active
    if (!moduleRegistry.getActiveStorageAdapter()) {
      moduleRegistry.setActiveStorageAdapter('in-memory');
    }
  }

  // Load plugins
  if (config.loadPlugins !== false) {
    try {
      await loadBuiltinPlugins();
      await loadConfiguredPlugins();
    } catch (error) {
      logger.warn('Failed to load plugins');
    }
  }

  logger.info('Module system initialized');
}

/**
 * Get module system status
 */
export function getModuleSystemStatus(): {
  initialized: boolean;
  stats: ReturnType<typeof moduleRegistry.getStats>;
  featureFlags: number;
} {
  return {
    initialized: true,
    stats: moduleRegistry.getStats(),
    featureFlags: featureFlags.getAllFlags().length,
  };
}
