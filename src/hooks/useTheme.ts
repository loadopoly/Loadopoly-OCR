/**
 * Theme Management Hook
 * Provides dark/light mode toggle with system preference detection
 * and persistent user preference storage.
 */

import { useState, useEffect, useCallback, createContext, useContext } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isHighContrast: boolean;
  setHighContrast: (enabled: boolean) => void;
  reducedMotion: boolean;
}

const THEME_STORAGE_KEY = 'geograph-theme';
const HIGH_CONTRAST_KEY = 'geograph-high-contrast';

// CSS custom properties for theme tokens
export const themeTokens = {
  light: {
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#f8fafc',
    '--bg-tertiary': '#f1f5f9',
    '--bg-elevated': '#ffffff',
    '--text-primary': '#0f172a',
    '--text-secondary': '#475569',
    '--text-muted': '#94a3b8',
    '--border-primary': '#e2e8f0',
    '--border-secondary': '#cbd5e1',
    '--accent-primary': '#3b82f6',
    '--accent-secondary': '#60a5fa',
    '--success': '#10b981',
    '--warning': '#f59e0b',
    '--error': '#ef4444',
    '--surface-gis': '#d4f0e3',
    '--surface-ai': '#dbeafe',
    '--surface-nft': '#fef3c7',
  },
  dark: {
    '--bg-primary': '#0f172a',
    '--bg-secondary': '#1e293b',
    '--bg-tertiary': '#334155',
    '--bg-elevated': '#1e293b',
    '--text-primary': '#f8fafc',
    '--text-secondary': '#cbd5e1',
    '--text-muted': '#64748b',
    '--border-primary': '#334155',
    '--border-secondary': '#475569',
    '--accent-primary': '#3b82f6',
    '--accent-secondary': '#60a5fa',
    '--success': '#10b981',
    '--warning': '#f59e0b',
    '--error': '#ef4444',
    '--surface-gis': '#064e3b',
    '--surface-ai': '#1e3a5f',
    '--surface-nft': '#78350f',
  },
  highContrast: {
    '--text-primary': '#ffffff',
    '--text-secondary': '#f1f5f9',
    '--border-primary': '#ffffff',
    '--accent-primary': '#60a5fa',
  }
};

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useTheme(): ThemeContextType {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (theme === 'system') return getSystemTheme();
    return theme;
  });

  const [isHighContrast, setIsHighContrast] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(HIGH_CONTRAST_KEY) === 'true';
  });

  const [reducedMotion, setReducedMotion] = useState(getReducedMotion);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    setResolvedTheme(resolved);

    // Apply CSS custom properties
    const tokens = themeTokens[resolved];
    Object.entries(tokens).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Apply high contrast overrides
    if (isHighContrast) {
      Object.entries(themeTokens.highContrast).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }

    // Update class for Tailwind dark mode
    root.classList.toggle('dark', resolved === 'dark');
    root.classList.toggle('light', resolved === 'light');
    root.classList.toggle('high-contrast', isHighContrast);

    // Update meta theme-color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', tokens['--bg-primary']);
    }
  }, [theme, isHighContrast]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = () => {
      if (theme === 'system') {
        setResolvedTheme(getSystemTheme());
      }
    };

    const handleMotionChange = () => {
      setReducedMotion(getReducedMotion());
    };

    mediaQuery.addEventListener('change', handleChange);
    motionQuery.addEventListener('change', handleMotionChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      motionQuery.removeEventListener('change', handleMotionChange);
    };
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  const setHighContrast = useCallback((enabled: boolean) => {
    setIsHighContrast(enabled);
    localStorage.setItem(HIGH_CONTRAST_KEY, String(enabled));
  }, []);

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    isHighContrast,
    setHighContrast,
    reducedMotion,
  };
}

// Context for theme provider
export const ThemeContext = createContext<ThemeContextType | null>(null);

export function useThemeContext(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within ThemeProvider');
  }
  return context;
}
