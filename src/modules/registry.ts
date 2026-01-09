/**
 * Module Registry
 * 
 * Central registry for pluggable modules including renderers, LLM providers,
 * storage adapters, and processors. Enables modular integration of new features.
 */

import {
  IRendererModule,
  ILLMProvider,
  IDataStorage,
  IPlugin,
  IProcessor,
  ModuleEventType,
  ModuleEvent,
  EventHandler,
} from './types';
import { eventEmitter } from './events';
import { logger } from '../lib/logger';

// ============================================
// Module Registry Class
// ============================================

class ModuleRegistry {
  private renderers: Map<string, IRendererModule> = new Map();
  private llmProviders: Map<string, ILLMProvider> = new Map();
  private storageAdapters: Map<string, IDataStorage> = new Map();
  private processors: Map<string, IProcessor> = new Map();
  private plugins: Map<string, IPlugin> = new Map();

  private activeStorage: string | null = null;
  private activeLLM: string | null = null;

  // ============================================
  // Renderer Module Registration
  // ============================================

  registerRenderer(module: IRendererModule): void {
    if (this.renderers.has(module.name)) {
      logger.warn(`Renderer "${module.name}" is already registered. Overwriting.`);
    }
    this.renderers.set(module.name, module);
    eventEmitter.emit('module:registered', { type: 'renderer', name: module.name });
    logger.info(`Registered renderer: ${module.name}`);
  }

  unregisterRenderer(name: string): boolean {
    const result = this.renderers.delete(name);
    if (result) {
      eventEmitter.emit('module:unregistered', { type: 'renderer', name });
      logger.info(`Unregistered renderer: ${name}`);
    }
    return result;
  }

  getRenderer(name: string): IRendererModule | undefined {
    return this.renderers.get(name);
  }

  getAllRenderers(): IRendererModule[] {
    return Array.from(this.renderers.values()).sort((a, b) => a.priority - b.priority);
  }

  getSupportedRenderers(): IRendererModule[] {
    return this.getAllRenderers().filter(r => r.isSupported());
  }

  // ============================================
  // LLM Provider Registration
  // ============================================

  registerLLMProvider(provider: ILLMProvider): void {
    if (this.llmProviders.has(provider.name)) {
      logger.warn(`LLM Provider "${provider.name}" is already registered. Overwriting.`);
    }
    this.llmProviders.set(provider.name, provider);
    eventEmitter.emit('module:registered', { type: 'llm', name: provider.name });
    logger.info(`Registered LLM provider: ${provider.name}`);
  }

  unregisterLLMProvider(name: string): boolean {
    const result = this.llmProviders.delete(name);
    if (result) {
      if (this.activeLLM === name) {
        this.activeLLM = null;
      }
      eventEmitter.emit('module:unregistered', { type: 'llm', name });
      logger.info(`Unregistered LLM provider: ${name}`);
    }
    return result;
  }

  getLLMProvider(name: string): ILLMProvider | undefined {
    return this.llmProviders.get(name);
  }

  getAllLLMProviders(): ILLMProvider[] {
    return Array.from(this.llmProviders.values()).sort((a, b) => a.priority - b.priority);
  }

  setActiveLLMProvider(name: string): void {
    if (!this.llmProviders.has(name)) {
      throw new Error(`LLM Provider "${name}" is not registered`);
    }
    this.activeLLM = name;
    logger.info(`Active LLM provider set to: ${name}`);
  }

  getActiveLLMProvider(): ILLMProvider | null {
    if (!this.activeLLM) return null;
    return this.llmProviders.get(this.activeLLM) || null;
  }

  async getLLMProviderWithFallback(): Promise<ILLMProvider | null> {
    const providers = this.getAllLLMProviders();
    for (const provider of providers) {
      try {
        if (await provider.isAvailable()) {
          return provider;
        }
      } catch (e) {
        logger.warn(`LLM provider ${provider.name} availability check failed`);
      }
    }
    return null;
  }

  // ============================================
  // Storage Adapter Registration
  // ============================================

  registerStorageAdapter(adapter: IDataStorage): void {
    if (this.storageAdapters.has(adapter.name)) {
      logger.warn(`Storage adapter "${adapter.name}" is already registered. Overwriting.`);
    }
    this.storageAdapters.set(adapter.name, adapter);
    eventEmitter.emit('module:registered', { type: 'storage', name: adapter.name });
    logger.info(`Registered storage adapter: ${adapter.name}`);
  }

  unregisterStorageAdapter(name: string): boolean {
    const result = this.storageAdapters.delete(name);
    if (result) {
      if (this.activeStorage === name) {
        this.activeStorage = null;
      }
      eventEmitter.emit('module:unregistered', { type: 'storage', name });
      logger.info(`Unregistered storage adapter: ${name}`);
    }
    return result;
  }

  getStorageAdapter(name: string): IDataStorage | undefined {
    return this.storageAdapters.get(name);
  }

  getAllStorageAdapters(): IDataStorage[] {
    return Array.from(this.storageAdapters.values());
  }

  setActiveStorageAdapter(name: string): void {
    if (!this.storageAdapters.has(name)) {
      throw new Error(`Storage adapter "${name}" is not registered`);
    }
    this.activeStorage = name;
    logger.info(`Active storage adapter set to: ${name}`);
  }

  getActiveStorageAdapter(): IDataStorage | null {
    if (!this.activeStorage) return null;
    return this.storageAdapters.get(this.activeStorage) || null;
  }

  // ============================================
  // Processor Registration
  // ============================================

  registerProcessor(processor: IProcessor): void {
    if (this.processors.has(processor.name)) {
      logger.warn(`Processor "${processor.name}" is already registered. Overwriting.`);
    }
    this.processors.set(processor.name, processor);
    eventEmitter.emit('module:registered', { type: 'processor', name: processor.name });
    logger.info(`Registered processor: ${processor.name}`);
  }

  unregisterProcessor(name: string): boolean {
    const result = this.processors.delete(name);
    if (result) {
      eventEmitter.emit('module:unregistered', { type: 'processor', name });
      logger.info(`Unregistered processor: ${name}`);
    }
    return result;
  }

  getProcessor(name: string): IProcessor | undefined {
    return this.processors.get(name);
  }

  getProcessorsByStage(stage: IProcessor['stage']): IProcessor[] {
    return Array.from(this.processors.values())
      .filter(p => p.stage === stage)
      .sort((a, b) => a.priority - b.priority);
  }

  // ============================================
  // Plugin Registration
  // ============================================

  async loadPlugin(plugin: IPlugin): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      logger.warn(`Plugin "${plugin.id}" is already loaded. Skipping.`);
      return;
    }

    // Check dependencies
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(`Plugin "${plugin.id}" requires plugin "${dep}" which is not loaded`);
        }
      }
    }

    // Execute onLoad hook
    if (plugin.onLoad) {
      await plugin.onLoad();
    }

    // Register provided modules
    if (plugin.modules) {
      if (plugin.modules.renderers) {
        for (const renderer of plugin.modules.renderers) {
          this.registerRenderer(renderer);
        }
      }
      if (plugin.modules.llmProviders) {
        for (const provider of plugin.modules.llmProviders) {
          this.registerLLMProvider(provider);
        }
      }
      if (plugin.modules.storageAdapters) {
        for (const adapter of plugin.modules.storageAdapters) {
          this.registerStorageAdapter(adapter);
        }
      }
      if (plugin.modules.processors) {
        for (const processor of plugin.modules.processors) {
          this.registerProcessor(processor);
        }
      }
    }

    this.plugins.set(plugin.id, plugin);
    eventEmitter.emit('plugin:loaded', { pluginId: plugin.id, pluginName: plugin.name });
    logger.info(`Loaded plugin: ${plugin.name} (${plugin.id}) v${plugin.version}`);
  }

  unloadPlugin(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      logger.warn(`Plugin "${pluginId}" is not loaded.`);
      return;
    }

    // Unregister provided modules
    if (plugin.modules) {
      if (plugin.modules.renderers) {
        for (const renderer of plugin.modules.renderers) {
          this.unregisterRenderer(renderer.name);
        }
      }
      if (plugin.modules.llmProviders) {
        for (const provider of plugin.modules.llmProviders) {
          this.unregisterLLMProvider(provider.name);
        }
      }
      if (plugin.modules.storageAdapters) {
        for (const adapter of plugin.modules.storageAdapters) {
          this.unregisterStorageAdapter(adapter.name);
        }
      }
      if (plugin.modules.processors) {
        for (const processor of plugin.modules.processors) {
          this.unregisterProcessor(processor.name);
        }
      }
    }

    // Execute onUnload hook
    if (plugin.onUnload) {
      plugin.onUnload();
    }

    this.plugins.delete(pluginId);
    eventEmitter.emit('plugin:unloaded', { pluginId });
    logger.info(`Unloaded plugin: ${plugin.name} (${pluginId})`);
  }

  getPlugin(id: string): IPlugin | undefined {
    return this.plugins.get(id);
  }

  getAllPlugins(): IPlugin[] {
    return Array.from(this.plugins.values());
  }

  // ============================================
  // Registry Stats
  // ============================================

  getStats(): RegistryStats {
    return {
      renderers: this.renderers.size,
      llmProviders: this.llmProviders.size,
      storageAdapters: this.storageAdapters.size,
      processors: this.processors.size,
      plugins: this.plugins.size,
      activeStorage: this.activeStorage,
      activeLLM: this.activeLLM,
    };
  }

  // ============================================
  // Reset (for testing)
  // ============================================

  reset(): void {
    this.renderers.clear();
    this.llmProviders.clear();
    this.storageAdapters.clear();
    this.processors.clear();
    this.plugins.clear();
    this.activeStorage = null;
    this.activeLLM = null;
    logger.info('Module registry reset');
  }
}

interface RegistryStats {
  renderers: number;
  llmProviders: number;
  storageAdapters: number;
  processors: number;
  plugins: number;
  activeStorage: string | null;
  activeLLM: string | null;
}

// ============================================
// Singleton Export
// ============================================

export const moduleRegistry = new ModuleRegistry();

// ============================================
// Convenience Functions
// ============================================

export function registerModule(module: IRendererModule): void {
  moduleRegistry.registerRenderer(module);
}

export function getModule(name: string): IRendererModule | undefined {
  return moduleRegistry.getRenderer(name);
}

export function registerLLMProvider(provider: ILLMProvider): void {
  moduleRegistry.registerLLMProvider(provider);
}

export function getStorageProvider(name: string): IDataStorage | undefined {
  return moduleRegistry.getStorageAdapter(name);
}

export function getActiveStorage(): IDataStorage | null {
  return moduleRegistry.getActiveStorageAdapter();
}

export function getActiveLLM(): ILLMProvider | null {
  return moduleRegistry.getActiveLLMProvider();
}
