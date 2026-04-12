/**
 * Enhanced Onboarding Wizard (v2 — Streamlined)
 * 
 * 2-step flow: 
 *   Step 1: Welcome + Persona selection (controls progressive disclosure)
 *   Step 2: Quick start — tells user to scan their first document
 * 
 * Account creation, API keys, and demo tour moved to Settings.
 * Goal: first OCR result in <60 seconds from app open.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Camera,
  Network,
  Globe,
  Shield,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  Search,
  Compass,
  Code,
  FileText,
  Upload,
} from 'lucide-react';
import type { Persona } from '../hooks/useUXPreferences';

// ============================================
// Types
// ============================================

interface UserPreferences {
  level: 'beginner' | 'intermediate' | 'advanced';
  showWeb3Features: boolean;
  showAdvancedGIS: boolean;
  enableDemoMode: boolean;
}

const STORAGE_KEY = 'geograph-onboarding-v2';
const PREFS_KEY = 'geograph-user-preferences';

interface EnhancedOnboardingProps {
  onComplete: (preferences: UserPreferences) => void;
  onPersonaSelected?: (persona: Persona) => void;
  forceShow?: boolean;
}

// ============================================
// Persona cards
// ============================================

const PERSONAS: { id: Persona; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
  {
    id: 'researcher',
    label: 'Researcher',
    desc: 'Focused on OCR, structured data, and knowledge graph exploration.',
    icon: <Search size={24} />,
    color: 'border-blue-500/50 bg-blue-500/10',
  },
  {
    id: 'archivist',
    label: 'Archivist',
    desc: 'Batch digitization, annotation curation, and AR document scanning.',
    icon: <FileText size={24} />,
    color: 'border-emerald-500/50 bg-emerald-500/10',
  },
  {
    id: 'explorer',
    label: 'Explorer',
    desc: '3D worlds, social features, and community collaboration.',
    icon: <Compass size={24} />,
    color: 'border-purple-500/50 bg-purple-500/10',
  },
  {
    id: 'developer',
    label: 'Power User',
    desc: 'All features enabled — Web3, APIs, integrations, and full control.',
    icon: <Code size={24} />,
    color: 'border-amber-500/50 bg-amber-500/10',
  },
];

// ============================================
// Component
// ============================================

export function EnhancedOnboarding({ onComplete, onPersonaSelected, forceShow = false }: EnhancedOnboardingProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedPersona, setSelectedPersona] = useState<Persona>('researcher');

  useEffect(() => {
    if (forceShow) {
      setIsVisible(true);
      return;
    }
    
    const hasCompleted = localStorage.getItem(STORAGE_KEY);
    if (!hasCompleted) {
      setIsVisible(true);
    }
  }, [forceShow]);

  const handleComplete = useCallback(() => {
    const personaToLevel: Record<Persona, 'beginner' | 'intermediate' | 'advanced'> = {
      researcher: 'intermediate',
      archivist: 'intermediate',
      explorer: 'beginner',
      developer: 'advanced',
    };

    const preferences: UserPreferences = {
      level: personaToLevel[selectedPersona],
      showWeb3Features: selectedPersona === 'developer',
      showAdvancedGIS: selectedPersona !== 'explorer',
      enableDemoMode: false,
    };
    
    localStorage.setItem(STORAGE_KEY, 'true');
    localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
    
    onPersonaSelected?.(selectedPersona);
    setIsVisible(false);
    onComplete(preferences);
  }, [selectedPersona, onComplete, onPersonaSelected]);

  const handleSkipAll = useCallback(() => {
    const preferences: UserPreferences = {
      level: 'intermediate',
      showWeb3Features: false,
      showAdvancedGIS: false,
      enableDemoMode: false,
    };
    
    localStorage.setItem(STORAGE_KEY, 'true');
    localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
    
    onPersonaSelected?.('researcher');
    setIsVisible(false);
    onComplete(preferences);
  }, [onComplete, onPersonaSelected]);

  if (!isVisible) return null;

  return (
    <div 
      className="fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome wizard"
    >
      <div className="max-w-xl w-full">
        {/* Skip button */}
        <button
          onClick={handleSkipAll}
          className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white transition-colors flex items-center gap-1 text-sm"
          aria-label="Skip onboarding"
        >
          Skip <X size={16} />
        </button>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-6">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                i < currentStep ? 'bg-primary-500' : i === currentStep ? 'bg-primary-600' : 'bg-slate-800'
              }`}
            />
          ))}
        </div>

        {/* Step card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className={`p-6 bg-gradient-to-br ${currentStep === 0 ? 'from-primary-600 to-cyan-600' : 'from-emerald-600 to-teal-600'} flex items-center justify-center`}>
            <div className="text-white opacity-90">
              {currentStep === 0 ? <Sparkles size={32} /> : <Camera size={32} />}
            </div>
          </div>

          {/* Content */}
          <div className="p-8">
            {currentStep === 0 ? (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-white mb-1">Welcome to GeoGraph</h2>
                  <p className="text-slate-400">AI-powered OCR that builds knowledge graphs from your documents.</p>
                </div>

                {/* What it does — brief */}
                <div className="grid grid-cols-2 gap-3 mb-8">
                  {[
                    { icon: <Camera size={16} />, text: 'AI-powered OCR' },
                    { icon: <Network size={16} />, text: 'Knowledge graphs' },
                    { icon: <Globe size={16} />, text: 'GIS metadata' },
                    { icon: <Shield size={16} />, text: 'Privacy-first' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-slate-400 text-sm">
                      <div className="text-primary-400">{item.icon}</div>
                      {item.text}
                    </div>
                  ))}
                </div>

                {/* Persona selection */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-3">How will you use GeoGraph?</p>
                  <div className="grid grid-cols-2 gap-3">
                    {PERSONAS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPersona(p.id)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          selectedPersona === p.id
                            ? `${p.color} ring-2 ring-offset-2 ring-offset-slate-900 ring-primary-500`
                            : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                        }`}
                      >
                        <div className={`mb-2 ${selectedPersona === p.id ? 'text-white' : 'text-slate-400'}`}>
                          {p.icon}
                        </div>
                        <h4 className="text-sm font-bold text-white">{p.label}</h4>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">{p.desc}</p>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-3 text-center">
                    This controls which tabs are visible. Change anytime in Settings.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-white mb-1">Scan Your First Document</h2>
                  <p className="text-slate-400">See AI-extracted text and a knowledge graph in seconds.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                    <div className="p-2 rounded-lg bg-primary-500/20 text-primary-400 flex-shrink-0">
                      <Upload size={20} />
                    </div>
                    <div>
                      <h4 className="text-white font-medium text-sm">Upload or capture a document</h4>
                      <p className="text-xs text-slate-400 mt-1">Use the camera button in the header, or drag a file onto Quick Processing.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                    <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 flex-shrink-0">
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <h4 className="text-white font-medium text-sm">AI extracts text, entities, and metadata</h4>
                      <p className="text-xs text-slate-400 mt-1">Processing happens on our servers — no API key needed for your first documents.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                    <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 flex-shrink-0">
                      <Network size={20} />
                    </div>
                    <div>
                      <h4 className="text-white font-medium text-sm">Explore your knowledge graph</h4>
                      <p className="text-xs text-slate-400 mt-1">See people, places, dates, and connections extracted from your document.</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-800">
              <button
                onClick={() => setCurrentStep(0)}
                disabled={currentStep === 0}
                className={`flex items-center gap-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentStep === 0 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <ChevronLeft size={18} />
                Back
              </button>

              <button
                onClick={currentStep === 0 ? () => setCurrentStep(1) : handleComplete}
                className="flex items-center gap-1 px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors"
              >
                {currentStep === 0 ? 'Next' : 'Start Scanning'}
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-4">
          Step {currentStep + 1} of 2
        </p>
      </div>
    </div>
  );
}

/**
 * Hook to manage user preferences from onboarding
 */
export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(() => {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPreferences(prev => {
      const next = { ...prev, ...updates } as UserPreferences;
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { preferences, updatePreferences };
}
