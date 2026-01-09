/**
 * Plugin System
 * 
 * Dynamic plugin loader supporting runtime loading of plugins
 * from NPM packages, local files, or remote URLs.
 */

import { IPlugin } from './types';
import { moduleRegistry } from './registry';
import { eventEmitter } from './events';
import { logger } from '../lib/logger';

// ============================================
// Plugin Manifest Types
// ============================================

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  main: string; // Entry point file
  dependencies?: string[];
  requiredFeatures?: string[];
  config?: Record<string, unknown>;
}

export interface PluginLoadOptions {
  /** Plugin configuration to pass to onLoad */
  config?: Record<string, unknown>;
  /** Whether to validate dependencies before loading */
  validateDependencies?: boolean;
  /** Timeout for plugin loading in ms */
  timeout?: number;
}

// ============================================
// Plugin Loader Class
// ============================================

class PluginLoader {
  private loadedManifests: Map<string, PluginManifest> = new Map();
  private pluginConfigs: Map<string, Record<string, unknown>> = new Map();

  /**
   * Load a plugin from a dynamic import
   */
  async loadPlugin(
    pluginModule: { default: IPlugin } | IPlugin,
    options: PluginLoadOptions = {}
  ): Promise<void> {
    const plugin = 'default' in pluginModule ? pluginModule.default : pluginModule;
    
    if (options.config) {
      this.pluginConfigs.set(plugin.id, options.config);
    }

    if (options.validateDependencies && plugin.dependencies) {
      this.validateDependencies(plugin);
    }

    await moduleRegistry.loadPlugin(plugin);
    logger.info(`Plugin loaded: ${plugin.name} v${plugin.version}`);
  }

  /**
   * Load a plugin from a URL (for dynamic loading)
   */
  async loadPluginFromURL(url: string, options: PluginLoadOptions = {}): Promise<void> {
    const timeout = options.timeout || 10000;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // For ESM modules
      const module = await import(/* @vite-ignore */ url);
      clearTimeout(timeoutId);

      await this.loadPlugin(module, options);
    } catch (error) {
      logger.error(`Failed to load plugin from URL: ${url}`, error);
      throw error;
    }
  }

  /**
   * Load plugins from a manifest file
   */
  async loadPluginsFromManifest(manifestUrl: string): Promise<void> {
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch manifest: ${response.statusText}`);
      }

      const manifest: { plugins: PluginManifest[] } = await response.json();

      for (const pluginManifest of manifest.plugins) {
        await this.loadPluginFromManifest(pluginManifest);
      }
    } catch (error) {
      logger.error('Failed to load plugins from manifest');
      throw error;
    }
  }

  /**
   * Load a single plugin from its manifest
   */
  async loadPluginFromManifest(manifest: PluginManifest): Promise<void> {
    this.loadedManifests.set(manifest.id, manifest);

    try {
      const module = await import(/* @vite-ignore */ manifest.main);
      await this.loadPlugin(module, { config: manifest.config });
    } catch (error) {
      logger.error(`Failed to load plugin ${manifest.id}`);
      throw error;
    }
  }

  /**
   * Unload a plugin
   */
  unloadPlugin(pluginId: string): void {
    moduleRegistry.unloadPlugin(pluginId);
    this.loadedManifests.delete(pluginId);
    this.pluginConfigs.delete(pluginId);
    logger.info(`Plugin unloaded: ${pluginId}`);
  }

  /**
   * Get plugin configuration
   */
  getPluginConfig(pluginId: string): Record<string, unknown> | undefined {
    return this.pluginConfigs.get(pluginId);
  }

  /**
   * Validate plugin dependencies
   */
  private validateDependencies(plugin: IPlugin): void {
    if (!plugin.dependencies) return;

    const loadedPlugins = moduleRegistry.getAllPlugins().map(p => p.id);

    for (const dep of plugin.dependencies) {
      if (!loadedPlugins.includes(dep)) {
        throw new Error(
          `Plugin "${plugin.id}" requires "${dep}" which is not loaded`
        );
      }
    }
  }

  /**
   * Get all loaded plugin manifests
   */
  getLoadedManifests(): PluginManifest[] {
    return Array.from(this.loadedManifests.values());
  }

  /**
   * Check if a plugin is loaded
   */
  isPluginLoaded(pluginId: string): boolean {
    return moduleRegistry.getPlugin(pluginId) !== undefined;
  }
}

// ============================================
// Plugin Builder Helper
// ============================================

export class PluginBuilder {
  private plugin: Partial<IPlugin> = {};

  id(id: string): this {
    this.plugin.id = id;
    return this;
  }

  name(name: string): this {
    this.plugin.name = name;
    return this;
  }

  version(version: string): this {
    this.plugin.version = version;
    return this;
  }

  description(description: string): this {
    this.plugin.description = description;
    return this;
  }

  author(author: string): this {
    this.plugin.author = author;
    return this;
  }

  dependencies(...deps: string[]): this {
    this.plugin.dependencies = deps;
    return this;
  }

  requiredFeatures(...features: string[]): this {
    this.plugin.requiredFeatures = features;
    return this;
  }

  onLoad(handler: () => Promise<void>): this {
    this.plugin.onLoad = handler;
    return this;
  }

  onUnload(handler: () => void): this {
    this.plugin.onUnload = handler;
    return this;
  }

  withModules(modules: IPlugin['modules']): this {
    this.plugin.modules = modules;
    return this;
  }

  build(): IPlugin {
    if (!this.plugin.id || !this.plugin.name || !this.plugin.version) {
      throw new Error('Plugin must have id, name, and version');
    }

    return this.plugin as IPlugin;
  }
}

// ============================================
// Singleton Exports
// ============================================

export const pluginLoader = new PluginLoader();

/**
 * Create a new plugin using the builder pattern
 */
export function createPlugin(): PluginBuilder {
  return new PluginBuilder();
}

// ============================================
// Built-in Plugins Discovery
// ============================================

/**
 * Discover and load built-in plugins from the plugins directory
 */
export async function loadBuiltinPlugins(): Promise<void> {
  const builtinPlugins: Array<() => Promise<{ default: IPlugin } | IPlugin>> = [
    // Add built-in plugins here as they are created
    // () => import('../plugins/example-plugin'),
  ];

  for (const loadFn of builtinPlugins) {
    try {
      const module = await loadFn();
      await pluginLoader.loadPlugin(module);
    } catch (error) {
      logger.warn('Failed to load built-in plugin');
    }
  }
}

/**
 * Load plugins based on environment configuration
 */
export async function loadConfiguredPlugins(): Promise<void> {
  // Check for plugin configuration in environment
  // @ts-ignore
  const pluginManifestUrl = import.meta?.env?.VITE_PLUGIN_MANIFEST_URL;
  
  if (pluginManifestUrl) {
    try {
      await pluginLoader.loadPluginsFromManifest(pluginManifestUrl);
    } catch (error) {
      logger.warn('Failed to load plugins from manifest URL');
    }
  }

  // Load from localStorage if configured
  try {
    const localPluginConfig = localStorage.getItem('loadopoly_plugins');
    if (localPluginConfig) {
      const config = JSON.parse(localPluginConfig);
      if (config.plugins && Array.isArray(config.plugins)) {
        for (const pluginUrl of config.plugins) {
          await pluginLoader.loadPluginFromURL(pluginUrl);
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to load locally configured plugins');
  }
}
