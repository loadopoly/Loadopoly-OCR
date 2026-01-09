/**
 * Feature Flags System
 * 
 * Provides feature flag management for A/B testing, gradual rollouts,
 * and user-tier based feature gating.
 */

import {
  FeatureFlag,
  IFeatureFlagProvider,
  FeatureFlagContext,
  UserTier,
} from './types';
import { logger } from '../lib/logger';

// ============================================
// Default Feature Flags
// ============================================

const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    name: 'enable_3d_navigator',
    enabled: true,
    description: 'Enable the 3D graph navigator view',
    rolloutPercentage: 100,
  },
  {
    name: 'enable_ar_mode',
    enabled: true,
    description: 'Enable AR scanning mode',
    rolloutPercentage: 100,
  },
  {
    name: 'enable_semantic_canvas',
    enabled: true,
    description: 'Enable the semantic canvas visualization',
    rolloutPercentage: 100,
  },
  {
    name: 'enable_graph_healing',
    enabled: true,
    description: 'Enable automatic graph healing',
    rolloutPercentage: 50,
  },
  {
    name: 'enable_openai_provider',
    enabled: false,
    description: 'Enable OpenAI as an LLM provider option',
    rolloutPercentage: 0,
  },
  {
    name: 'enable_batch_processing',
    enabled: true,
    description: 'Enable batch image processing',
    rolloutPercentage: 100,
  },
  {
    name: 'enable_api_access',
    enabled: false,
    description: 'Enable REST/GraphQL API access for expert users',
    rolloutPercentage: 0,
  },
  {
    name: 'enable_advanced_filters',
    enabled: true,
    description: 'Enable advanced filtering options',
    rolloutPercentage: 100,
  },
  {
    name: 'enable_metaverse',
    enabled: true,
    description: 'Enable metaverse/world renderer',
    rolloutPercentage: 100,
  },
  {
    name: 'enable_web3_features',
    enabled: true,
    description: 'Enable Web3/NFT features',
    rolloutPercentage: 100,
  },
];

// ============================================
// Local Storage Feature Flag Provider
// ============================================

export class LocalStorageFeatureFlagProvider implements IFeatureFlagProvider {
  name = 'local-storage';
  private flags: Map<string, FeatureFlag> = new Map();
  private subscribers: Map<string, Set<(enabled: boolean) => void>> = new Map();
  private storageKey = 'loadopoly_feature_flags';

  async init(_config: Record<string, unknown>): Promise<void> {
    // Load defaults
    for (const flag of DEFAULT_FLAGS) {
      this.flags.set(flag.name, flag);
    }

    // Override with stored flags
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, boolean>;
        for (const [name, enabled] of Object.entries(parsed)) {
          const existing = this.flags.get(name);
          if (existing) {
            this.flags.set(name, { ...existing, enabled });
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to load feature flags from localStorage');
    }

    logger.info('Feature flags initialized');
  }

  isEnabled(flagName: string, context?: FeatureFlagContext): boolean {
    const flag = this.flags.get(flagName);
    if (!flag) {
      logger.warn(`Unknown feature flag: ${flagName}`);
      return false;
    }

    // Check base enabled state
    if (!flag.enabled) {
      return false;
    }

    // Check rollout percentage
    if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
      const hash = this.hashContext(flagName, context);
      if (hash > flag.rolloutPercentage) {
        return false;
      }
    }

    // Check user tier restrictions
    if (context?.userTier) {
      const tierRequirements = this.getTierRequirements(flagName);
      if (tierRequirements && !tierRequirements.includes(context.userTier)) {
        return false;
      }
    }

    return true;
  }

  getValue<T>(flagName: string, defaultValue: T, context?: FeatureFlagContext): T {
    const flag = this.flags.get(flagName);
    if (!flag) {
      return defaultValue;
    }

    if (!this.isEnabled(flagName, context)) {
      return defaultValue;
    }

    if (flag.variants) {
      const variantKey = context?.userId || 'default';
      const variant = flag.variants[variantKey] as T;
      if (variant !== undefined) {
        return variant;
      }
    }

    return defaultValue;
  }

  subscribe(flagName: string, callback: (enabled: boolean) => void): () => void {
    if (!this.subscribers.has(flagName)) {
      this.subscribers.set(flagName, new Set());
    }
    this.subscribers.get(flagName)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(flagName)?.delete(callback);
    };
  }

  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  /**
   * Set a feature flag value (for admin/testing)
   */
  setFlag(flagName: string, enabled: boolean): void {
    const flag = this.flags.get(flagName);
    if (flag) {
      this.flags.set(flagName, { ...flag, enabled });
      this.persistFlags();
      this.notifySubscribers(flagName, enabled);
    }
  }

  /**
   * Reset all flags to defaults
   */
  resetToDefaults(): void {
    this.flags.clear();
    for (const flag of DEFAULT_FLAGS) {
      this.flags.set(flag.name, flag);
    }
    localStorage.removeItem(this.storageKey);
    logger.info('Feature flags reset to defaults');
  }

  private hashContext(flagName: string, context?: FeatureFlagContext): number {
    const seed = `${flagName}_${context?.userId || 'anonymous'}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash) % 100;
  }

  private getTierRequirements(flagName: string): UserTier[] | null {
    const tierRestrictions: Record<string, UserTier[]> = {
      enable_api_access: ['expert'],
      enable_advanced_filters: ['intermediate', 'expert'],
      enable_graph_healing: ['intermediate', 'expert'],
    };
    return tierRestrictions[flagName] || null;
  }

  private persistFlags(): void {
    try {
      const toStore: Record<string, boolean> = {};
      for (const [name, flag] of this.flags) {
        toStore[name] = flag.enabled;
      }
      localStorage.setItem(this.storageKey, JSON.stringify(toStore));
    } catch (error) {
      logger.warn('Failed to persist feature flags');
    }
  }

  private notifySubscribers(flagName: string, enabled: boolean): void {
    const callbacks = this.subscribers.get(flagName);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(enabled);
        } catch (error) {
          logger.error('Feature flag subscriber error', error);
        }
      }
    }
  }
}

// ============================================
// Environment-based Feature Flag Provider
// ============================================

export class EnvironmentFeatureFlagProvider implements IFeatureFlagProvider {
  name = 'environment';
  private flags: Map<string, FeatureFlag> = new Map();

  async init(_config: Record<string, unknown>): Promise<void> {
    // Load from environment variables
    // Format: VITE_FF_ENABLE_3D_NAVIGATOR=true
    
    // @ts-ignore
    const env = typeof import.meta !== 'undefined' ? import.meta.env : process?.env || {};

    for (const flag of DEFAULT_FLAGS) {
      const envKey = `VITE_FF_${flag.name.toUpperCase()}`;
      const envValue = env[envKey];

      if (envValue !== undefined) {
        this.flags.set(flag.name, {
          ...flag,
          enabled: envValue === 'true' || envValue === '1',
        });
      } else {
        this.flags.set(flag.name, flag);
      }
    }

    logger.info('Environment feature flags initialized');
  }

  isEnabled(flagName: string, _context?: FeatureFlagContext): boolean {
    return this.flags.get(flagName)?.enabled ?? false;
  }

  getValue<T>(flagName: string, defaultValue: T, _context?: FeatureFlagContext): T {
    const flag = this.flags.get(flagName);
    if (!flag?.enabled) {
      return defaultValue;
    }
    return defaultValue;
  }

  subscribe(_flagName: string, _callback: (enabled: boolean) => void): () => void {
    // Environment flags don't change at runtime
    return () => {};
  }

  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }
}

// ============================================
// Feature Flag Manager
// ============================================

class FeatureFlagManager {
  private provider: IFeatureFlagProvider | null = null;
  private defaultContext: FeatureFlagContext = {};

  async init(provider?: IFeatureFlagProvider): Promise<void> {
    this.provider = provider || new LocalStorageFeatureFlagProvider();
    await this.provider.init({});
    logger.info(`Feature flag manager initialized with ${this.provider.name} provider`);
  }

  setDefaultContext(context: FeatureFlagContext): void {
    this.defaultContext = context;
  }

  isEnabled(flagName: string, context?: FeatureFlagContext): boolean {
    if (!this.provider) {
      logger.warn('Feature flags not initialized');
      return false;
    }
    return this.provider.isEnabled(flagName, { ...this.defaultContext, ...context });
  }

  getValue<T>(flagName: string, defaultValue: T, context?: FeatureFlagContext): T {
    if (!this.provider) {
      return defaultValue;
    }
    return this.provider.getValue(flagName, defaultValue, { ...this.defaultContext, ...context });
  }

  subscribe(flagName: string, callback: (enabled: boolean) => void): () => void {
    if (!this.provider) {
      return () => {};
    }
    return this.provider.subscribe(flagName, callback);
  }

  getAllFlags(): FeatureFlag[] {
    if (!this.provider) {
      return [];
    }
    return this.provider.getAllFlags();
  }

  getProvider(): IFeatureFlagProvider | null {
    return this.provider;
  }
}

// ============================================
// Singleton Export
// ============================================

export const featureFlags = new FeatureFlagManager();

// ============================================
// React Hook (if needed)
// ============================================

/**
 * Check if a feature is enabled (for use outside React)
 */
export function isFeatureEnabled(flagName: string, context?: FeatureFlagContext): boolean {
  return featureFlags.isEnabled(flagName, context);
}

/**
 * Get feature flag value
 */
export function getFeatureValue<T>(flagName: string, defaultValue: T, context?: FeatureFlagContext): T {
  return featureFlags.getValue(flagName, defaultValue, context);
}
