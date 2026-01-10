/**
 * Module System Bootstrap
 * 
 * Initializes the module system when the application starts.
 * Should be imported at the top of the main entry point.
 */

import { initializeModuleSystem, ModuleSystemConfig } from './modules';
import { logger } from './lib/logger';

let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Bootstrap the module system with default configuration
 */
export async function bootstrapModuleSystem(config?: ModuleSystemConfig): Promise<void> {
  if (initialized) {
    logger.debug('Module system already initialized');
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  const defaultConfig: ModuleSystemConfig = {
    enableGemini: true,
    enableOpenAI: false, // Disabled by default, can be enabled via feature flags
    enableSupabase: true,
    enableInMemoryStorage: true, // Enable as fallback for offline mode
    featureFlagProvider: 'localStorage',
    loadPlugins: true,
  };

  initPromise = initializeModuleSystem({ ...defaultConfig, ...config })
    .then(() => {
      initialized = true;
      logger.info('Module system bootstrap complete');
    })
    .catch((error) => {
      logger.error('Module system bootstrap failed', error);
      throw error;
    });

  return initPromise;
}

/**
 * Check if the module system is initialized
 */
export function isModuleSystemInitialized(): boolean {
  return initialized;
}

/**
 * Get the initialization promise (useful for waiting on init)
 */
export function getInitPromise(): Promise<void> | null {
  return initPromise;
}
