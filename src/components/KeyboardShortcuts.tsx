/**
 * Keyboard Shortcuts Help Modal
 * Shows available keyboard shortcuts to power users
 */

import React, { useState, useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutItem {
  keys: string[];
  description: string;
  category: string;
}

const SHORTCUTS: ShortcutItem[] = [
  // Navigation
  { keys: ['1'], description: 'Go to Dashboard', category: 'Navigation' },
  { keys: ['2'], description: 'Go to Quick Processing', category: 'Navigation' },
  { keys: ['3'], description: 'Go to AR Scanner', category: 'Navigation' },
  { keys: ['4'], description: 'Go to Assets & Bundles', category: 'Navigation' },
  { keys: ['5'], description: 'Go to Knowledge Graph', category: 'Navigation' },
  { keys: ['6'], description: 'Go to Structured DB', category: 'Navigation' },
  { keys: ['S'], description: 'Go to Settings', category: 'Navigation' },
  
  // Actions
  { keys: ['U'], description: 'Upload file', category: 'Actions' },
  { keys: ['C'], description: 'Open camera capture', category: 'Actions' },
  { keys: ['R'], description: 'Refresh data', category: 'Actions' },
  { keys: ['G'], description: 'Toggle Global/Local view', category: 'Actions' },
  
  // General
  { keys: ['?'], description: 'Show keyboard shortcuts', category: 'General' },
  { keys: ['Esc'], description: 'Close modal / Cancel', category: 'General' },
];

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const categories = Array.from(new Set(SHORTCUTS.map(s => s.category)));

  return (
    <div 
      className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div 
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary-600/20 text-primary-500">
              <Keyboard size={20} />
            </div>
            <h2 className="text-lg font-bold text-white">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {categories.map(category => (
            <div key={category} className="mb-6 last:mb-0">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                {category}
              </h3>
              <div className="space-y-2">
                {SHORTCUTS.filter(s => s.category === category).map((shortcut, i) => (
                  <div 
                    key={i}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-800/50"
                  >
                    <span className="text-sm text-slate-300">{shortcut.description}</span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key, j) => (
                        <kbd
                          key={j}
                          className="px-2 py-1 text-xs font-mono font-bold bg-slate-700 text-slate-200 rounded border border-slate-600"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50">
          <p className="text-xs text-slate-500 text-center">
            Press <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-300">?</kbd> anytime to show this help
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to manage keyboard shortcuts modal
 */
export function useKeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev),
  };
}
