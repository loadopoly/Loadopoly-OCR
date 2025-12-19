/**
 * Onboarding Flow Component
 * Guides new users through the app's key features
 */

import React, { useState, useEffect } from 'react';
import { 
  Camera, 
  Network, 
  Database, 
  Zap, 
  Globe, 
  Shield,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles
} from 'lucide-react';

interface OnboardingStep {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    icon: <Camera size={48} />,
    title: 'Capture Historical Documents',
    description: 'Use your camera or upload images of documents, artifacts, and scenery. Our AI-powered OCR extracts text and metadata automatically.',
    color: 'from-blue-600 to-cyan-600',
  },
  {
    icon: <Sparkles size={48} />,
    title: 'AI-Powered Analysis',
    description: 'Gemini 2.5 Flash analyzes your content, extracting entities, dates, locations, and generating accessibility descriptions.',
    color: 'from-purple-600 to-pink-600',
  },
  {
    icon: <Network size={48} />,
    title: 'Knowledge Graph Generation',
    description: 'Automatically build semantic relationships between documents, people, places, and concepts in an interactive graph.',
    color: 'from-emerald-600 to-teal-600',
  },
  {
    icon: <Globe size={48} />,
    title: 'GIS & Location Context',
    description: 'Enrich your data with geographic metadata, zone classification, and spatial relationships.',
    color: 'from-amber-600 to-orange-600',
  },
  {
    icon: <Database size={48} />,
    title: 'Cloud Sync & Collaboration',
    description: 'Sign in to sync your data across devices and contribute to the global historical corpus.',
    color: 'from-indigo-600 to-violet-600',
  },
  {
    icon: <Shield size={48} />,
    title: 'Privacy First',
    description: 'Your data stays local by default. You control what gets shared. Optional blockchain verification for authenticity.',
    color: 'from-slate-600 to-slate-500',
  },
];

const STORAGE_KEY = 'geograph-onboarding-completed';

interface OnboardingProps {
  onComplete: () => void;
  forceShow?: boolean;
}

export function Onboarding({ onComplete, forceShow = false }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

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

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsVisible(false);
    onComplete();
  };

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsVisible(false);
    onComplete();
  };

  if (!isVisible) return null;

  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <div 
      className="fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to GeoGraph"
    >
      <div className="max-w-lg w-full">
        {/* Skip button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white transition-colors flex items-center gap-1 text-sm"
          aria-label="Skip onboarding"
        >
          Skip <X size={16} />
        </button>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {ONBOARDING_STEPS.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentStep 
                  ? 'w-8 bg-primary-500' 
                  : index < currentStep 
                    ? 'bg-primary-700' 
                    : 'bg-slate-700'
              }`}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>

        {/* Content Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          {/* Icon Section */}
          <div className={`p-12 bg-gradient-to-br ${step.color} flex items-center justify-center`}>
            <div className="text-white opacity-90">
              {step.icon}
            </div>
          </div>

          {/* Text Content */}
          <div className="p-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-4">{step.title}</h2>
            <p className="text-slate-400 leading-relaxed mb-8">{step.description}</p>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={handlePrev}
                disabled={currentStep === 0}
                className={`flex items-center gap-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentStep === 0
                    ? 'text-slate-600 cursor-not-allowed'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <ChevronLeft size={18} />
                Back
              </button>

              <span className="text-slate-600 text-sm">
                {currentStep + 1} / {ONBOARDING_STEPS.length}
              </span>

              <button
                onClick={handleNext}
                className="flex items-center gap-1 px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors"
              >
                {isLastStep ? 'Get Started' : 'Next'}
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Quick start hint */}
        <p className="text-center text-slate-600 text-xs mt-6">
          Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">Esc</kbd> or click Skip to jump right in
        </p>
      </div>
    </div>
  );
}

/**
 * Hook to manage onboarding state
 */
export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  const resetOnboarding = () => {
    localStorage.removeItem(STORAGE_KEY);
    setShowOnboarding(true);
  };

  const hasCompletedOnboarding = () => {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  };

  return {
    showOnboarding,
    setShowOnboarding,
    resetOnboarding,
    hasCompletedOnboarding,
  };
}
