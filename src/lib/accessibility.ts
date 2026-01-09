/**
 * Enhanced Accessibility Utilities
 * WCAG AA compliant helpers for screen readers, color contrast, focus management
 */

// ============================================
// Screen Reader Announcements
// ============================================

export const announce = (message: string, type: 'polite' | 'assertive' = 'polite') => {
  const region = document.getElementById(type === 'assertive' ? 'alert-region' : 'status-region');
  if (region) {
    region.textContent = message;
    setTimeout(() => {
      if (region.textContent === message) {
        region.textContent = '';
      }
    }, 3000);
  }
};

// Create ARIA live regions if they don't exist
export function initializeAriaRegions(): void {
  if (typeof document === 'undefined') return;

  const regions = [
    { id: 'status-region', politeness: 'polite' },
    { id: 'alert-region', politeness: 'assertive' },
  ];

  regions.forEach(({ id, politeness }) => {
    if (!document.getElementById(id)) {
      const region = document.createElement('div');
      region.id = id;
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', politeness);
      region.setAttribute('aria-atomic', 'true');
      region.className = 'sr-only';
      region.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      `;
      document.body.appendChild(region);
    }
  });
}

// ============================================
// Color Contrast Utilities
// ============================================

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

export function getContrastRatio(foreground: string, background: string): number {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  if (!fg || !bg) return 1;
  const l1 = getLuminance(fg.r, fg.g, fg.b);
  const l2 = getLuminance(bg.r, bg.g, bg.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsContrastRequirements(
  foreground: string,
  background: string,
  type: 'normal' | 'large' | 'ui' = 'normal'
): boolean {
  const ratio = getContrastRatio(foreground, background);
  const requirements = { normal: 4.5, large: 3, ui: 3 };
  return ratio >= requirements[type];
}

export function getAccessibleTextColor(background: string): string {
  const bg = hexToRgb(background);
  if (!bg) return '#ffffff';
  const luminance = getLuminance(bg.r, bg.g, bg.b);
  return luminance > 0.179 ? '#0f172a' : '#ffffff';
}

// ============================================
// Focus Management
// ============================================

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]',
].join(', ');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS));
}

export function trapFocus(container: HTMLElement): () => void {
  const focusableElements = getFocusableElements(container);
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const previouslyFocused = document.activeElement as HTMLElement;
  firstElement?.focus();

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement?.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement?.focus();
    }
  };

  container.addEventListener('keydown', handleKeyDown);
  return () => {
    container.removeEventListener('keydown', handleKeyDown);
    previouslyFocused?.focus();
  };
}

export const focusRingStyles = {
  outline: '2px solid #3b82f6',
  outlineOffset: '2px',
  boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.3)',
};

// ============================================
// Reduced Motion Support
// ============================================

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function getAnimationDuration(normalMs: number): number {
  return prefersReducedMotion() ? 0 : normalMs;
}

export function createTransition(
  property: string,
  durationMs: number,
  easing: string = 'ease-out'
): string {
  const duration = getAnimationDuration(durationMs);
  return duration > 0 ? `${property} ${duration}ms ${easing}` : 'none';
}

// ============================================
// Keyboard Navigation
// ============================================

export function handleArrowNavigation(
  e: KeyboardEvent,
  items: HTMLElement[],
  currentIndex: number,
  options: { loop?: boolean; orientation?: 'horizontal' | 'vertical' | 'both' } = {}
): number {
  const { loop = true, orientation = 'vertical' } = options;
  let newIndex = currentIndex;
  const isVerticalKey = e.key === 'ArrowUp' || e.key === 'ArrowDown';
  const isHorizontalKey = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
  const shouldHandleVertical = orientation === 'vertical' || orientation === 'both';
  const shouldHandleHorizontal = orientation === 'horizontal' || orientation === 'both';

  if (shouldHandleVertical && isVerticalKey) {
    if (e.key === 'ArrowDown') {
      newIndex = currentIndex + 1;
      if (newIndex >= items.length) newIndex = loop ? 0 : items.length - 1;
    } else {
      newIndex = currentIndex - 1;
      if (newIndex < 0) newIndex = loop ? items.length - 1 : 0;
    }
    e.preventDefault();
  }

  if (shouldHandleHorizontal && isHorizontalKey) {
    if (e.key === 'ArrowRight') {
      newIndex = currentIndex + 1;
      if (newIndex >= items.length) newIndex = loop ? 0 : items.length - 1;
    } else {
      newIndex = currentIndex - 1;
      if (newIndex < 0) newIndex = loop ? items.length - 1 : 0;
    }
    e.preventDefault();
  }

  if (newIndex !== currentIndex && items[newIndex]) items[newIndex].focus();
  return newIndex;
}

// ============================================
// Screen Reader Descriptions
// ============================================

export function generateImageAltText(metadata: {
  documentTitle?: string;
  documentType?: string;
  dateCreated?: string;
  location?: string;
  ocrText?: string;
}): string {
  const parts: string[] = [];
  if (metadata.documentType) parts.push(`${metadata.documentType} document`);
  else parts.push('Document');
  if (metadata.documentTitle) parts.push(`titled "${metadata.documentTitle}"`);
  if (metadata.dateCreated) parts.push(`dated ${metadata.dateCreated}`);
  if (metadata.location) parts.push(`from ${metadata.location}`);
  if (metadata.ocrText) {
    const preview = metadata.ocrText.slice(0, 100).trim();
    parts.push(`containing text: "${preview}${metadata.ocrText.length > 100 ? '...' : ''}"`);
  }
  return parts.join(', ') + '.';
}

export function generateNodeDescription(node: {
  label: string;
  type: string;
  connections: number;
  relevance: number;
}): string {
  const typeLabel = node.type.charAt(0) + node.type.slice(1).toLowerCase();
  return `${typeLabel}: ${node.label}. ${node.connections} connections. Relevance: ${Math.round(node.relevance * 100)}%.`;
}

// ============================================
// Accessibility Audit
// ============================================

export function runAccessibilityAudit(): { issues: string[]; warnings: string[] } {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (typeof document === 'undefined') return { issues, warnings };

  const imagesWithoutAlt = document.querySelectorAll('img:not([alt])');
  if (imagesWithoutAlt.length > 0) {
    issues.push(`${imagesWithoutAlt.length} image(s) missing alt text`);
  }

  const buttons = document.querySelectorAll('button');
  buttons.forEach((btn) => {
    const hasLabel = btn.textContent?.trim() || btn.getAttribute('aria-label') || btn.getAttribute('aria-labelledby');
    if (!hasLabel) issues.push('Button missing accessible name');
  });

  const inputs = document.querySelectorAll('input, select, textarea');
  inputs.forEach((input) => {
    const id = input.getAttribute('id');
    const hasLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby') || (id && document.querySelector(`label[for="${id}"]`));
    if (!hasLabel) warnings.push('Form input may be missing associated label');
  });

  if (!document.documentElement.hasAttribute('lang')) {
    issues.push('Document missing lang attribute');
  }

  return { issues, warnings };
}