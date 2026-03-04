/**
 * Integration Status Component
 * 
 * Provides visual indicators for all active integrations (Supabase, Gemini, Polygon, etc.)
 * with real-time status updates and quick diagnostics.
 */

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Database, 
  Cpu, 
  Coins, 
  Wifi, 
  WifiOff,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Settings,
  Zap,
  Globe
} from 'lucide-react';

export type IntegrationState = 'connected' | 'disconnected' | 'pending' | 'error';

export interface Integration {
  id: string;
  name: string;
  icon: React.ReactNode;
  state: IntegrationState;
  message?: string;
  lastChecked?: Date;
  actions?: {
    label: string;
    onClick: () => void;
  }[];
}

interface IntegrationStatusProps {
  integrations: Integration[];
  compact?: boolean;
  onRefresh?: () => void;
  onSettingsClick?: () => void;
}

const stateConfig: Record<IntegrationState, { color: string; bgColor: string; Icon: React.FC<any> }> = {
  connected: { color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', Icon: CheckCircle },
  disconnected: { color: 'text-slate-400', bgColor: 'bg-slate-500/10', Icon: WifiOff },
  pending: { color: 'text-amber-400', bgColor: 'bg-amber-500/10', Icon: Loader2 },
  error: { color: 'text-red-400', bgColor: 'bg-red-500/10', Icon: AlertCircle },
};

export function IntegrationStatusBadge({ state, size = 'sm' }: { state: IntegrationState; size?: 'sm' | 'md' }) {
  const config = stateConfig[state];
  const sizeClasses = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';
  
  return (
    <span className={`inline-block ${sizeClasses} rounded-full ${config.color.replace('text-', 'bg-')} ${state === 'pending' ? 'animate-pulse' : ''}`} />
  );
}

export function IntegrationStatusItem({ integration, compact }: { integration: Integration; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const config = stateConfig[integration.state];
  const StatusIcon = config.Icon;

  if (compact) {
    return (
      <div 
        className={`flex items-center gap-2 px-2 py-1 rounded ${config.bgColor}`}
        title={`${integration.name}: ${integration.state}${integration.message ? ` - ${integration.message}` : ''}`}
      >
        <div className={`${config.color}`}>
          {integration.icon}
        </div>
        <IntegrationStatusBadge state={integration.state} />
      </div>
    );
  }

  return (
    <div className={`border border-slate-800 rounded-lg overflow-hidden ${config.bgColor}`}>
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-slate-900/50 ${config.color}`}>
            {integration.icon}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">{integration.name}</span>
              <StatusIcon 
                size={14} 
                className={`${config.color} ${integration.state === 'pending' ? 'animate-spin' : ''}`} 
              />
            </div>
            <span className={`text-xs ${config.color}`}>
              {integration.state.charAt(0).toUpperCase() + integration.state.slice(1)}
            </span>
          </div>
        </div>
        {(integration.message || integration.actions) && (
          expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />
        )}
      </button>
      
      {expanded && (integration.message || integration.actions) && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-800/50">
          {integration.message && (
            <p className="text-xs text-slate-400 pt-2">{integration.message}</p>
          )}
          {integration.lastChecked && (
            <p className="text-[10px] text-slate-500">
              Last checked: {integration.lastChecked.toLocaleTimeString()}
            </p>
          )}
          {integration.actions && (
            <div className="flex gap-2 pt-1">
              {integration.actions.map((action, i) => (
                <button
                  key={i}
                  onClick={action.onClick}
                  className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function IntegrationStatus({ 
  integrations, 
  compact = false, 
  onRefresh,
  onSettingsClick 
}: IntegrationStatusProps) {
  const connectedCount = integrations.filter(i => i.state === 'connected').length;
  const hasErrors = integrations.some(i => i.state === 'error');
  const hasPending = integrations.some(i => i.state === 'pending');

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {integrations.slice(0, 4).map((integration) => (
          <IntegrationStatusItem key={integration.id} integration={integration} compact />
        ))}
        {integrations.length > 4 && (
          <span className="text-xs text-slate-500 px-1">+{integrations.length - 4}</span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${hasErrors ? 'bg-red-500/10' : hasPending ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
            {hasErrors ? (
              <AlertCircle size={18} className="text-red-400" />
            ) : hasPending ? (
              <Loader2 size={18} className="text-amber-400 animate-spin" />
            ) : (
              <Wifi size={18} className="text-emerald-400" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Integrations</h3>
            <p className="text-xs text-slate-400">
              {connectedCount}/{integrations.length} connected
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button 
              onClick={onRefresh}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              title="Refresh status"
            >
              <RefreshCw size={16} className="text-slate-400" />
            </button>
          )}
          {onSettingsClick && (
            <button 
              onClick={onSettingsClick}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              title="Integration settings"
            >
              <Settings size={16} className="text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* Integration List */}
      <div className="p-3 space-y-2">
        {integrations.map((integration) => (
          <IntegrationStatusItem key={integration.id} integration={integration} />
        ))}
      </div>
    </div>
  );
}

// Hook to manage integration status
export function useIntegrationStatus() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  const checkSupabaseStatus = async (): Promise<IntegrationState> => {
    try {
      const { supabase, isSupabaseConfigured } = await import('../lib/supabaseClient');
      if (!isSupabaseConfigured() || !supabase) return 'disconnected';
      // Use correct table name - historical_documents_global
      const { error } = await supabase.from('historical_documents_global').select('ASSET_ID').limit(1);
      // PGRST116 = no rows found, which is OK - connection works
      if (error && error.code !== 'PGRST116') return 'error';
      return 'connected';
    } catch {
      return 'error';
    }
  };

  const checkGeminiStatus = async (): Promise<IntegrationState> => {
    try {
      // @ts-ignore
      const apiKey = import.meta.env?.VITE_GEMINI_API_KEY || import.meta.env?.API_KEY;
      if (!apiKey) return 'disconnected';
      // Simple validation - key exists and has reasonable length
      return apiKey.length > 20 ? 'connected' : 'error';
    } catch {
      return 'disconnected';
    }
  };

  const checkWeb3Status = async (): Promise<IntegrationState> => {
    try {
      const enabled = localStorage.getItem('geograph-web3-enabled') === 'true';
      if (!enabled) return 'disconnected';
      // @ts-ignore
      if (typeof window.ethereum !== 'undefined') return 'connected';
      return 'disconnected';
    } catch {
      return 'disconnected';
    }
  };

  const refreshStatus = async () => {
    setIsChecking(true);
    const now = new Date();

    const [supabaseState, geminiState, web3State] = await Promise.all([
      checkSupabaseStatus(),
      checkGeminiStatus(),
      checkWeb3Status(),
    ]);

    setIntegrations([
      {
        id: 'supabase',
        name: 'Supabase',
        icon: <Database size={16} />,
        state: supabaseState,
        message: supabaseState === 'connected' 
          ? 'Cloud sync active' 
          : supabaseState === 'error' 
            ? 'Connection failed. Check your API keys.' 
            : 'Not configured. Data stored locally.',
        lastChecked: now,
        actions: supabaseState !== 'connected' ? [
          { label: 'Configure', onClick: () => {} }
        ] : undefined
      },
      {
        id: 'gemini',
        name: 'Gemini AI',
        icon: <Cpu size={16} />,
        state: geminiState,
        message: geminiState === 'connected' 
          ? 'OCR & NLP processing ready' 
          : 'API key required for AI processing.',
        lastChecked: now,
        actions: geminiState !== 'connected' ? [
          { label: 'Add API Key', onClick: () => {} }
        ] : undefined
      },
      {
        id: 'polygon',
        name: 'Polygon Web3',
        icon: <Coins size={16} />,
        state: web3State,
        message: web3State === 'connected' 
          ? 'Wallet connected for shard minting' 
          : 'Connect wallet to earn GARD tokens.',
        lastChecked: now,
        actions: web3State !== 'connected' ? [
          { label: 'Enable Web3', onClick: () => localStorage.setItem('geograph-web3-enabled', 'true') }
        ] : undefined
      },
      {
        id: 'network',
        name: 'Network',
        icon: navigator.onLine ? <Wifi size={16} /> : <WifiOff size={16} />,
        state: navigator.onLine ? 'connected' : 'disconnected',
        message: navigator.onLine ? 'Online - real-time sync active' : 'Offline - changes queued locally',
        lastChecked: now,
      }
    ]);

    setIsChecking(false);
  };

  useEffect(() => {
    refreshStatus();
    
    // Listen for online/offline events
    const handleOnline = () => refreshStatus();
    const handleOffline = () => refreshStatus();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Periodic refresh every 30 seconds
    const interval = setInterval(refreshStatus, 30000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return { integrations, isChecking, refreshStatus };
}
