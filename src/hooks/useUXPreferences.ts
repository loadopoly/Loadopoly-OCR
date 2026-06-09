/**
 * UX Preferences Hook
 * 
 * Manages progressive disclosure, persona-based tab visibility,
 * and extension feature flags. Persists to localStorage.
 * 
 * Phase 1: First-value-fast (simplified defaults for new users)
 * Phase 2: Progressive disclosure (4-tab simplified mode)
 * Phase 3: Extension architecture (toggle feature groups on/off)
 */

import { useState, useCallback, useMemo } from 'react';

// ============================================
// Types
// ============================================

export type Persona = 'researcher' | 'archivist' | 'explorer' | 'developer';

export interface ExtensionFlags {
  web3: boolean;
  threeD: boolean;
  social: boolean;
  marketplace: boolean;
  curatorMode: boolean;
  arScanner: boolean;
}

export interface UXPreferences {
  persona: Persona;
  simplifiedMode: boolean;
  extensions: ExtensionFlags;
  hasCompletedOnboarding: boolean;
  hasProcessedFirstAsset: boolean;
  assetCount: number;
}

// ============================================
// Constants
// ============================================

const STORAGE_KEY = 'geograph-ux-preferences';

const DEFAULT_EXTENSIONS: ExtensionFlags = {
  web3: false,
  threeD: false,
  social: false,
  marketplace: false,
  curatorMode: false,
  arScanner: true,
};

const PERSONA_EXTENSIONS: Record<Persona, Partial<ExtensionFlags>> = {
  researcher: { curatorMode: true },
  archivist: { curatorMode: true, arScanner: true },
  explorer: { threeD: true, social: true },
  developer: { web3: true, threeD: true, social: true, marketplace: true, curatorMode: true, arScanner: true },
};

// Core tabs always visible in simplified mode
export const CORE_TABS = ['dashboard', 'batch', 'assets', 'graph'] as const;

// Extension tabs - only visible when their extension is enabled or simplified mode is off
export const EXTENSION_TAB_MAP: Record<string, keyof ExtensionFlags> = {
  ar: 'arScanner',
  curator: 'curatorMode',
  world: 'threeD',
  social: 'social',
  market: 'marketplace',
};

// Tabs that are always available regardless of mode
export const ALWAYS_AVAILABLE_TABS = ['operate', 'dashboard', 'batch', 'assets', 'graph', 'database', 'settings'] as const;

// ============================================
// Storage helpers
// ============================================

function loadPreferences(): UXPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        persona: parsed.persona || 'researcher',
        simplifiedMode: parsed.simplifiedMode ?? true,
        extensions: { ...DEFAULT_EXTENSIONS, ...parsed.extensions },
        hasCompletedOnboarding: parsed.hasCompletedOnboarding ?? false,
        hasProcessedFirstAsset: parsed.hasProcessedFirstAsset ?? false,
        assetCount: parsed.assetCount ?? 0,
      };
    }
  } catch { /* ignore */ }
  
  return {
    persona: 'researcher',
    simplifiedMode: true,
    extensions: { ...DEFAULT_EXTENSIONS },
    hasCompletedOnboarding: false,
    hasProcessedFirstAsset: false,
    assetCount: 0,
  };
}

function savePreferences(prefs: UXPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

// ============================================
// Hook
// ============================================

export function useUXPreferences() {
  const [prefs, setPrefs] = useState<UXPreferences>(loadPreferences);

  const updatePrefs = useCallback((updates: Partial<UXPreferences>) => {
    setPrefs(prev => {
      const next = { ...prev, ...updates };
      savePreferences(next);
      return next;
    });
  }, []);

  const setPersona = useCallback((persona: Persona) => {
    setPrefs(prev => {
      const personaExtensions = PERSONA_EXTENSIONS[persona];
      const next = {
        ...prev,
        persona,
        extensions: { ...DEFAULT_EXTENSIONS, ...personaExtensions },
      };
      savePreferences(next);
      return next;
    });
  }, []);

  const toggleExtension = useCallback((key: keyof ExtensionFlags) => {
    setPrefs(prev => {
      const next = {
        ...prev,
        extensions: { ...prev.extensions, [key]: !prev.extensions[key] },
      };
      savePreferences(next);
      return next;
    });
  }, []);

  const setExtension = useCallback((key: keyof ExtensionFlags, value: boolean) => {
    setPrefs(prev => {
      const next = {
        ...prev,
        extensions: { ...prev.extensions, [key]: value },
      };
      savePreferences(next);
      return next;
    });
  }, []);

  const setSimplifiedMode = useCallback((enabled: boolean) => {
    updatePrefs({ simplifiedMode: enabled });
  }, [updatePrefs]);

  const markOnboardingComplete = useCallback(() => {
    updatePrefs({ hasCompletedOnboarding: true });
  }, [updatePrefs]);

  const markFirstAssetProcessed = useCallback(() => {
    if (!prefs.hasProcessedFirstAsset) {
      updatePrefs({ hasProcessedFirstAsset: true });
    }
  }, [prefs.hasProcessedFirstAsset, updatePrefs]);

  const updateAssetCount = useCallback((count: number) => {
    // Auto-unlock simplified mode after 5 assets
    const updates: Partial<UXPreferences> = { assetCount: count };
    if (count >= 5 && prefs.simplifiedMode) {
      // Don't auto-disable, but the UI can show a prompt
    }
    updatePrefs(updates);
  }, [prefs.simplifiedMode, updatePrefs]);

  const isTabVisible = useCallback((tabId: string): boolean => {
    // Settings and review are always controlled separately
    if (tabId === 'settings') return true;
    if (tabId === 'review') return true; // admin-gated separately

    // Always-available tabs
    if ((ALWAYS_AVAILABLE_TABS as readonly string[]).includes(tabId)) return true;

    // In simplified mode, only show core tabs + enabled extensions
    if (prefs.simplifiedMode) {
      if ((CORE_TABS as readonly string[]).includes(tabId)) return true;
      
      const extensionKey = EXTENSION_TAB_MAP[tabId];
      if (extensionKey) {
        return prefs.extensions[extensionKey];
      }
      return false;
    }

    // Full mode: everything visible
    return true;
  }, [prefs.simplifiedMode, prefs.extensions]);

  const visibleExtensionCount = useMemo(() => {
    return Object.values(prefs.extensions).filter(Boolean).length;
  }, [prefs.extensions]);

  return {
    ...prefs,
    setPersona,
    toggleExtension,
    setExtension,
    setSimplifiedMode,
    markOnboardingComplete,
    markFirstAssetProcessed,
    updateAssetCount,
    updatePrefs,
    isTabVisible,
    visibleExtensionCount,
  };
}
