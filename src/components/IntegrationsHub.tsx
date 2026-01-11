/**
 * Integrations Hub Panel
 * 
 * Unified settings panel for all external integrations including:
 * - Supabase (database, storage, auth)
 * - Gemini AI (OCR, NLP, image analysis)
 * - Polygon (NFT minting, GARD tokens)
 * - IPFS (decentralized storage)
 * 
 * Features:
 * - Connection status with color-coded indicators
 * - Quick toggle switches for each integration
 * - Error logs and diagnostics
 * - API key management
 * - Rate limit monitoring
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings, 
  Database, 
  Cpu, 
  Coins, 
  CloudOff,
  Check,
  AlertTriangle,
  Eye,
  EyeOff,
  RefreshCw,
  Zap,
  Globe,
  Clock,
  AlertCircle,
  ChevronRight,
  ExternalLink,
  Info,
  Trash2,
  Copy,
  CheckCircle
} from 'lucide-react';
import IntegrationStatus, { useIntegrationStatus, Integration } from './IntegrationStatus';

interface IntegrationsHubProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ErrorLog {
  timestamp: Date;
  service: string;
  message: string;
  code?: string;
}

type TabType = 'overview' | 'settings' | 'logs' | 'diagnostics';

export default function IntegrationsHub({ isOpen, onClose }: IntegrationsHubProps) {
  const { integrations, isChecking, refreshStatus } = useIntegrationStatus();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Service-specific settings
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [web3Enabled, setWeb3Enabled] = useState(false);
  const [ipfsEnabled, setIpfsEnabled] = useState(false);
  
  // Usage stats
  const [usageStats, setUsageStats] = useState({
    geminiCalls: 0,
    geminiLimit: 60,
    supabaseRows: 0,
    supabaseStorage: '0 MB',
    ipfsFiles: 0,
  });

  useEffect(() => {
    // Load saved settings
    const savedGeminiKey = localStorage.getItem('geograph-gemini-key') || '';
    const savedSupabaseUrl = localStorage.getItem('geograph-supabase-url') || '';
    const savedSupabaseKey = localStorage.getItem('geograph-supabase-key') || '';
    const savedWeb3 = localStorage.getItem('geograph-web3-enabled') === 'true';
    const savedIpfs = localStorage.getItem('geograph-ipfs-enabled') === 'true';
    
    setGeminiApiKey(savedGeminiKey);
    setSupabaseUrl(savedSupabaseUrl);
    setSupabaseKey(savedSupabaseKey);
    setWeb3Enabled(savedWeb3);
    setIpfsEnabled(savedIpfs);

    // Load error logs from localStorage
    try {
      const logs = JSON.parse(localStorage.getItem('geograph-error-logs') || '[]');
      setErrorLogs(logs.map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })));
    } catch {}
  }, [isOpen]);

  const saveSettings = () => {
    localStorage.setItem('geograph-gemini-key', geminiApiKey);
    localStorage.setItem('geograph-supabase-url', supabaseUrl);
    localStorage.setItem('geograph-supabase-key', supabaseKey);
    localStorage.setItem('geograph-web3-enabled', String(web3Enabled));
    localStorage.setItem('geograph-ipfs-enabled', String(ipfsEnabled));
    
    // Trigger status refresh
    refreshStatus();
  };

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const clearErrorLogs = () => {
    setErrorLogs([]);
    localStorage.removeItem('geograph-error-logs');
  };

  if (!isOpen) return null;

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Globe size={16} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
    { id: 'logs', label: 'Logs', icon: <Clock size={16} /> },
    { id: 'diagnostics', label: 'Diagnostics', icon: <Zap size={16} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="relative w-full max-w-2xl max-h-[80vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
              <Settings size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Integrations Hub</h2>
              <p className="text-xs text-slate-400">Manage external services & APIs</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 px-2 bg-slate-900/50">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative
                ${activeTab === tab.id 
                  ? 'text-blue-400' 
                  : 'text-slate-400 hover:text-white'}`}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Quick Status */}
              <IntegrationStatus 
                integrations={integrations}
                onRefresh={refreshStatus}
                onSettingsClick={() => setActiveTab('settings')}
              />

              {/* Usage Overview */}
              <div className="bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Zap size={16} className="text-amber-400" />
                  Usage This Session
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900/50 p-3 rounded-lg">
                    <div className="text-xs text-slate-400">Gemini API Calls</div>
                    <div className="text-xl font-bold text-white">
                      {usageStats.geminiCalls}
                      <span className="text-sm text-slate-500 font-normal">/{usageStats.geminiLimit}</span>
                    </div>
                    <div className="h-1 bg-slate-700 rounded-full mt-2 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                        style={{ width: `${(usageStats.geminiCalls / usageStats.geminiLimit) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="bg-slate-900/50 p-3 rounded-lg">
                    <div className="text-xs text-slate-400">Supabase Storage</div>
                    <div className="text-xl font-bold text-white">{usageStats.supabaseStorage}</div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-sm font-bold text-white mb-3">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={refreshStatus}
                    disabled={isChecking}
                    className="flex items-center justify-center gap-2 p-3 bg-slate-900/50 hover:bg-slate-700 rounded-lg text-sm text-white transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={isChecking ? 'animate-spin' : ''} />
                    Refresh All
                  </button>
                  <button 
                    onClick={() => setActiveTab('settings')}
                    className="flex items-center justify-center gap-2 p-3 bg-slate-900/50 hover:bg-slate-700 rounded-lg text-sm text-white transition-colors"
                  >
                    <Settings size={16} />
                    Configure
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Gemini AI */}
              <div className="bg-slate-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <Cpu size={18} className="text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Google Gemini AI</h3>
                      <p className="text-xs text-slate-400">OCR, NLP & image analysis</p>
                    </div>
                  </div>
                  <a 
                    href="https://makersuite.google.com/app/apikey" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    Get API Key <ExternalLink size={12} />
                  </a>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-400">API Key</label>
                  <div className="relative">
                    <input
                      type={showApiKey['gemini'] ? 'text' : 'password'}
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder="AIza..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white pr-20"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                      <button 
                        onClick={() => setShowApiKey({ ...showApiKey, gemini: !showApiKey['gemini'] })}
                        className="p-1.5 hover:bg-slate-700 rounded"
                      >
                        {showApiKey['gemini'] ? <EyeOff size={14} className="text-slate-400" /> : <Eye size={14} className="text-slate-400" />}
                      </button>
                      {geminiApiKey && (
                        <button 
                          onClick={() => copyToClipboard(geminiApiKey, 'gemini')}
                          className="p-1.5 hover:bg-slate-700 rounded"
                        >
                          {copiedKey === 'gemini' ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} className="text-slate-400" />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Supabase */}
              <div className="bg-slate-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                      <Database size={18} className="text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Supabase</h3>
                      <p className="text-xs text-slate-400">Database, storage & real-time</p>
                    </div>
                  </div>
                  <a 
                    href="https://supabase.com/dashboard" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                  >
                    Dashboard <ExternalLink size={12} />
                  </a>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400">Project URL</label>
                    <input
                      type="text"
                      value={supabaseUrl}
                      onChange={(e) => setSupabaseUrl(e.target.value)}
                      placeholder="https://xyz.supabase.co"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Anon Key</label>
                    <div className="relative">
                      <input
                        type={showApiKey['supabase'] ? 'text' : 'password'}
                        value={supabaseKey}
                        onChange={(e) => setSupabaseKey(e.target.value)}
                        placeholder="eyJ..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white pr-20"
                      />
                      <button 
                        onClick={() => setShowApiKey({ ...showApiKey, supabase: !showApiKey['supabase'] })}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-700 rounded"
                      >
                        {showApiKey['supabase'] ? <EyeOff size={14} className="text-slate-400" /> : <Eye size={14} className="text-slate-400" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Web3 / Polygon */}
              <div className="bg-slate-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <Coins size={18} className="text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Polygon Web3</h3>
                      <p className="text-xs text-slate-400">NFT minting & GARD tokens</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={web3Enabled}
                      onChange={(e) => setWeb3Enabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
                {web3Enabled && (
                  <div className="mt-3 p-3 bg-slate-900/50 rounded-lg">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Info size={12} />
                      Connect your wallet via MetaMask to start minting shards
                    </div>
                  </div>
                )}
              </div>

              {/* IPFS */}
              <div className="bg-slate-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-cyan-500/10 rounded-lg">
                      <CloudOff size={18} className="text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">IPFS Storage</h3>
                      <p className="text-xs text-slate-400">Decentralized file storage</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ipfsEnabled}
                      onChange={(e) => setIpfsEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                  </label>
                </div>
              </div>

              {/* Save Button */}
              <button
                onClick={saveSettings}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <Check size={16} />
                Save Settings
              </button>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Recent Activity</h3>
                {errorLogs.length > 0 && (
                  <button 
                    onClick={clearErrorLogs}
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                  >
                    <Trash2 size={12} /> Clear Logs
                  </button>
                )}
              </div>
              
              {errorLogs.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3 opacity-50" />
                  <p className="text-slate-400 text-sm">No errors logged</p>
                  <p className="text-slate-500 text-xs mt-1">All systems operating normally</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {errorLogs.map((log, i) => (
                    <div key={i} className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-red-400">{log.service}</span>
                        <span className="text-[10px] text-slate-500">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">{log.message}</p>
                      {log.code && (
                        <code className="text-[10px] text-slate-500 mt-1 block">Code: {log.code}</code>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <div className="space-y-4">
              <div className="bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-sm font-bold text-white mb-3">System Info</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Browser</span>
                    <span className="text-white">{navigator.userAgent.split(' ').slice(-2).join(' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Online</span>
                    <span className={navigator.onLine ? 'text-emerald-400' : 'text-red-400'}>
                      {navigator.onLine ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Service Worker</span>
                    <span className="text-white">{'serviceWorker' in navigator ? 'Supported' : 'Not Supported'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">IndexedDB</span>
                    <span className="text-white">{'indexedDB' in window ? 'Supported' : 'Not Supported'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">WebGL</span>
                    <span className="text-white">
                      {(() => {
                        try {
                          const canvas = document.createElement('canvas');
                          return (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) ? 'Supported' : 'Not Supported';
                        } catch { return 'Not Supported'; }
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-sm font-bold text-white mb-3">Local Storage</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Used</span>
                    <span className="text-white">
                      {(() => {
                        let total = 0;
                        for (let key in localStorage) {
                          if (localStorage.hasOwnProperty(key)) {
                            total += localStorage[key].length;
                          }
                        }
                        return `${(total / 1024).toFixed(2)} KB`;
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Keys</span>
                    <span className="text-white">{localStorage.length}</span>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    if (confirm('Clear all local data? This cannot be undone.')) {
                      localStorage.clear();
                      window.location.reload();
                    }
                  }}
                  className="mt-3 text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <Trash2 size={12} /> Clear All Data
                </button>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-sm font-bold text-white mb-3">Quick Tests</h3>
                <div className="space-y-2">
                  <button 
                    onClick={async () => {
                      try {
                        const { supabase } = await import('../lib/supabaseClient');
                        if (!supabase) throw new Error('Supabase client not configured');
                        const start = Date.now();
                        await supabase.from('GEOGRAPH_CORPUS_ASSETS').select('ID').limit(1);
                        alert(`Supabase connection OK (${Date.now() - start}ms)`);
                      } catch (e: any) {
                        alert(`Supabase error: ${e.message}`);
                      }
                    }}
                    className="w-full text-left text-xs p-2 bg-slate-900/50 hover:bg-slate-700 rounded flex items-center gap-2"
                  >
                    <Database size={14} className="text-emerald-400" />
                    <span className="text-slate-300">Test Supabase Connection</span>
                    <ChevronRight size={14} className="text-slate-500 ml-auto" />
                  </button>
                  <button 
                    onClick={() => {
                      // @ts-ignore
                      const key = import.meta.env?.VITE_GEMINI_API_KEY || localStorage.getItem('geograph-gemini-key');
                      if (key && key.length > 20) {
                        alert('Gemini API key is configured');
                      } else {
                        alert('Gemini API key is missing or invalid');
                      }
                    }}
                    className="w-full text-left text-xs p-2 bg-slate-900/50 hover:bg-slate-700 rounded flex items-center gap-2"
                  >
                    <Cpu size={14} className="text-blue-400" />
                    <span className="text-slate-300">Validate Gemini Key</span>
                    <ChevronRight size={14} className="text-slate-500 ml-auto" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
