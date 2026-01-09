/**
 * Enhanced Onboarding Wizard
 * Multi-step guided setup with social logins, API key configuration, and demo tour
 * Uses progressive disclosure to avoid overwhelming new users
 */

import React, { useState, useEffect, useCallback } from 'react';
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
  Sparkles,
  Check,
  Key,
  Eye,
  EyeOff,
  Upload,
  Play,
  Users,
  Wallet,
  Settings,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { signUp, signIn } from '../lib/auth';

// Step definitions
interface WizardStep {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  isRequired: boolean;
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to GeoGraph',
    subtitle: 'Your AI-powered document archive',
    icon: <Sparkles size={32} />,
    color: 'from-primary-600 to-cyan-600',
    isRequired: true,
  },
  {
    id: 'account',
    title: 'Create Your Account',
    subtitle: 'Sync across devices & collaborate',
    icon: <Users size={32} />,
    color: 'from-blue-600 to-indigo-600',
    isRequired: false,
  },
  {
    id: 'api-keys',
    title: 'Configure AI Services',
    subtitle: 'Set up Gemini API for OCR analysis',
    icon: <Key size={32} />,
    color: 'from-purple-600 to-pink-600',
    isRequired: false,
  },
  {
    id: 'demo',
    title: 'Quick Demo Tour',
    subtitle: 'See GeoGraph in action',
    icon: <Play size={32} />,
    color: 'from-emerald-600 to-teal-600',
    isRequired: true,
  },
  {
    id: 'customize',
    title: 'Customize Experience',
    subtitle: 'Set your preferences',
    icon: <Settings size={32} />,
    color: 'from-amber-600 to-orange-600',
    isRequired: false,
  },
];

// Demo tour spots
const DEMO_SPOTS = [
  {
    id: 'capture',
    title: 'Capture Documents',
    description: 'Upload images or use your camera to capture historical documents. Our AI extracts text and metadata automatically.',
    icon: <Camera size={24} className="text-blue-400" />,
  },
  {
    id: 'graph',
    title: 'Knowledge Graph',
    description: 'Discover connections between documents, people, places, and dates in an interactive visualization.',
    icon: <Network size={24} className="text-purple-400" />,
  },
  {
    id: 'gis',
    title: 'Geographic Context',
    description: 'Add location data, zone classifications, and explore your collection on a map.',
    icon: <Globe size={24} className="text-emerald-400" />,
  },
  {
    id: 'sync',
    title: 'Cloud Sync',
    description: 'Your data stays local by default. Optionally sync to access from anywhere.',
    icon: <Database size={24} className="text-cyan-400" />,
  },
];

// User experience levels for progressive disclosure
type UserLevel = 'beginner' | 'intermediate' | 'advanced';

interface UserPreferences {
  level: UserLevel;
  showWeb3Features: boolean;
  showAdvancedGIS: boolean;
  enableDemoMode: boolean;
}

const STORAGE_KEY = 'geograph-onboarding-v2';
const PREFS_KEY = 'geograph-user-preferences';

interface EnhancedOnboardingProps {
  onComplete: (preferences: UserPreferences) => void;
  forceShow?: boolean;
}

export function EnhancedOnboarding({ onComplete, forceShow = false }: EnhancedOnboardingProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  
  // Account form state
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState(false);
  
  // API key state
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyValid, setApiKeyValid] = useState<boolean | null>(null);
  
  // Demo state
  const [activeDemoSpot, setActiveDemoSpot] = useState(0);
  const [demoComplete, setDemoComplete] = useState(false);
  
  // Preferences
  const [userLevel, setUserLevel] = useState<UserLevel>('beginner');
  const [showWeb3, setShowWeb3] = useState(false);
  const [showAdvancedGIS, setShowAdvancedGIS] = useState(false);

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

  const step = WIZARD_STEPS[currentStep];

  const handleNext = useCallback(() => {
    setCompletedSteps(prev => new Set([...prev, step.id]));
    
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep, step?.id]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const handleSkipStep = useCallback(() => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep]);

  const handleComplete = useCallback(() => {
    const preferences: UserPreferences = {
      level: userLevel,
      showWeb3Features: showWeb3,
      showAdvancedGIS: showAdvancedGIS,
      enableDemoMode: !demoComplete,
    };
    
    localStorage.setItem(STORAGE_KEY, 'true');
    localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
    
    setIsVisible(false);
    onComplete(preferences);
  }, [userLevel, showWeb3, showAdvancedGIS, demoComplete, onComplete]);

  const handleSkipAll = useCallback(() => {
    const preferences: UserPreferences = {
      level: 'intermediate',
      showWeb3Features: false,
      showAdvancedGIS: false,
      enableDemoMode: true,
    };
    
    localStorage.setItem(STORAGE_KEY, 'true');
    localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
    
    setIsVisible(false);
    onComplete(preferences);
  }, [onComplete]);

  const handleAuth = async () => {
    setAuthLoading(true);
    setAuthError(null);
    
    const fn = authMode === 'login' ? signIn : signUp;
    const { error } = await fn(email, password);
    
    setAuthLoading(false);
    
    if (error) {
      setAuthError(error.message);
    } else {
      setAuthSuccess(true);
      setCompletedSteps(prev => new Set([...prev, 'account']));
    }
  };

  const validateApiKey = useCallback(async () => {
    if (!apiKey.trim()) {
      setApiKeyValid(null);
      return;
    }
    
    // Store the API key
    localStorage.setItem('gemini-api-key', apiKey);
    
    // Simple validation - in production, would make a test API call
    const isValid = apiKey.startsWith('AI') && apiKey.length > 20;
    setApiKeyValid(isValid);
    
    if (isValid) {
      setCompletedSteps(prev => new Set([...prev, 'api-keys']));
    }
  }, [apiKey]);

  if (!isVisible) return null;

  const isLastStep = currentStep === WIZARD_STEPS.length - 1;
  const canSkipStep = !step.isRequired && currentStep < WIZARD_STEPS.length - 1;

  // Render step content
  const renderStepContent = () => {
    switch (step.id) {
      case 'welcome':
        return (
          <div className="text-center py-4">
            <p className="text-slate-300 mb-6 max-w-md mx-auto">
              Transform historical documents into connected knowledge. 
              Our AI extracts text, identifies entities, and builds semantic relationships automatically.
            </p>
            <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto text-left">
              {[
                { icon: <Camera size={16} />, text: 'AI-powered OCR' },
                { icon: <Network size={16} />, text: 'Knowledge graphs' },
                { icon: <Globe size={16} />, text: 'GIS integration' },
                { icon: <Shield size={16} />, text: 'Privacy-first' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-slate-400 text-sm">
                  <div className="text-primary-400">{item.icon}</div>
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'account':
        if (authSuccess) {
          return (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check className="text-emerald-400" size={32} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">You're all set!</h3>
              <p className="text-slate-400">Your account is ready. Continue to configure AI services.</p>
            </div>
          );
        }
        
        return (
          <div className="space-y-4">
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setAuthMode('signup')}
                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                  authMode === 'signup'
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Sign Up
              </button>
              <button
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                  authMode === 'login'
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
            </div>
            
            <div className="relative">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-3 px-4 text-white focus:outline-none focus:border-primary-500"
              />
            </div>
            
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-3 px-4 pr-10 text-white focus:outline-none focus:border-primary-500"
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            
            {authError && (
              <p className="text-red-400 text-sm">{authError}</p>
            )}
            
            <button
              onClick={handleAuth}
              disabled={authLoading || !email || !password}
              className="w-full py-3 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {authLoading ? 'Processing...' : authMode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>
            
            <p className="text-center text-slate-500 text-xs">
              You can skip this step and use GeoGraph locally without an account.
            </p>
          </div>
        );
      
      case 'api-keys':
        return (
          <div className="space-y-4">
            <p className="text-slate-400 text-sm">
              GeoGraph uses Google's Gemini AI for document analysis. 
              Enter your API key below, or skip to use limited functionality.
            </p>
            
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                placeholder="Gemini API Key (AIza...)"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onBlur={validateApiKey}
                className={`w-full bg-slate-950 border rounded-lg py-3 px-4 pr-20 text-white focus:outline-none ${
                  apiKeyValid === true
                    ? 'border-emerald-500'
                    : apiKeyValid === false
                    ? 'border-red-500'
                    : 'border-slate-700 focus:border-primary-500'
                }`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {apiKeyValid === true && <Check size={18} className="text-emerald-400" />}
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="text-slate-500 hover:text-white"
                >
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            
            <a
              href="https://makersuite.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 text-sm"
            >
              Get a free API key <ExternalLink size={14} />
            </a>
            
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="flex items-start gap-3">
                <Shield className="text-emerald-400 flex-shrink-0" size={18} />
                <div className="text-sm">
                  <p className="text-white font-medium mb-1">Your key stays local</p>
                  <p className="text-slate-400">
                    API keys are stored only on your device and never sent to our servers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'demo':
        return (
          <div className="space-y-4">
            <div className="grid gap-3">
              {DEMO_SPOTS.map((spot, index) => (
                <button
                  key={spot.id}
                  onClick={() => setActiveDemoSpot(index)}
                  className={`flex items-start gap-3 p-4 rounded-lg text-left transition-all ${
                    activeDemoSpot === index
                      ? 'bg-primary-600/20 border border-primary-500/50'
                      : 'bg-slate-800/50 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="p-2 bg-slate-900 rounded-lg">{spot.icon}</div>
                  <div>
                    <h4 className="text-white font-medium">{spot.title}</h4>
                    <p className="text-slate-400 text-sm mt-1">{spot.description}</p>
                  </div>
                </button>
              ))}
            </div>
            
            <button
              onClick={() => setDemoComplete(true)}
              className="w-full py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              {demoComplete ? '✓ Tour reviewed' : 'Skip interactive demo'}
            </button>
          </div>
        );
      
      case 'customize':
        return (
          <div className="space-y-6">
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Experience Level</label>
              <div className="grid grid-cols-3 gap-2">
                {(['beginner', 'intermediate', 'advanced'] as UserLevel[]).map((level) => (
                  <button
                    key={level}
                    onClick={() => setUserLevel(level)}
                    className={`py-2 px-3 rounded-lg text-sm font-medium capitalize transition-colors ${
                      userLevel === level
                        ? 'bg-primary-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {userLevel === 'beginner' && 'Simplified interface with guided tooltips'}
                {userLevel === 'intermediate' && 'Standard features with optional help'}
                {userLevel === 'advanced' && 'Full feature access with keyboard shortcuts'}
              </p>
            </div>
            
            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Enable Web3/NFT Features</span>
                <button
                  onClick={() => setShowWeb3(!showWeb3)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    showWeb3 ? 'bg-primary-600' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    showWeb3 ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </label>
              
              <label className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Show Advanced GIS Tools</span>
                <button
                  onClick={() => setShowAdvancedGIS(!showAdvancedGIS)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    showAdvancedGIS ? 'bg-primary-600' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    showAdvancedGIS ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </label>
            </div>
            
            <p className="text-xs text-slate-500 text-center">
              You can change these settings anytime in the Settings panel.
            </p>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome wizard"
    >
      <div className="max-w-xl w-full">
        {/* Skip all button */}
        <button
          onClick={handleSkipAll}
          className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white transition-colors flex items-center gap-1 text-sm"
          aria-label="Skip onboarding"
        >
          Skip all <X size={16} />
        </button>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-6">
          {WIZARD_STEPS.map((s, index) => (
            <div
              key={s.id}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                index < currentStep
                  ? 'bg-primary-500'
                  : index === currentStep
                  ? 'bg-primary-600'
                  : 'bg-slate-800'
              }`}
            />
          ))}
        </div>

        {/* Step card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className={`p-8 bg-gradient-to-br ${step.color} flex items-center justify-center`}>
            <div className="text-white opacity-90">{step.icon}</div>
          </div>

          {/* Content */}
          <div className="p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white mb-1">{step.title}</h2>
              <p className="text-slate-400">{step.subtitle}</p>
            </div>

            {renderStepContent()}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-800">
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

              <div className="flex items-center gap-2">
                {canSkipStep && (
                  <button
                    onClick={handleSkipStep}
                    className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm"
                  >
                    Skip
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="flex items-center gap-1 px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors"
                >
                  {isLastStep ? 'Get Started' : 'Continue'}
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step indicator */}
        <p className="text-center text-slate-600 text-xs mt-4">
          Step {currentStep + 1} of {WIZARD_STEPS.length}
          {!step.isRequired && ' (Optional)'}
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
