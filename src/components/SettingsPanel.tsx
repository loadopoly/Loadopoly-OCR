import React, { useState, useEffect } from 'react';
import { enableAutoSync, disableAutoSync, isSyncEnabled, setScannerUrl as setEngineScannerUrl } from '../lib/syncEngine';
import { clearAllAssets } from '../lib/indexeddb';
import { FolderSync, Radio, CheckCircle, User, LogIn, Trash2, AlertTriangle, Wallet, Globe, Cpu, Key, Shield, RefreshCw, Camera } from 'lucide-react';
import { getCurrentUser } from '../lib/auth';
import AuthModal from './AuthModal';
import ProfileSettings from './ProfileSettings';

interface SettingsPanelProps {
    onOpenPrivacy: () => void;
    syncOn: boolean;
    setSyncOn: (val: boolean) => void;
    web3Enabled: boolean;
    setWeb3Enabled: (val: boolean) => void;
    scannerConnected: boolean;
    setScannerConnected: (val: boolean) => void;
    debugMode: boolean;
    setDebugMode: (val: boolean) => void;
    zoomEnabled: boolean;
    setZoomEnabled: (val: boolean) => void;
    selectedLLM: string;
    setSelectedLLM: (val: string) => void;
}

export default function SettingsPanel({ 
    onOpenPrivacy, 
    syncOn, 
    setSyncOn, 
    web3Enabled, 
    setWeb3Enabled,
    scannerConnected,
    setScannerConnected,
    debugMode,
    setDebugMode,
    zoomEnabled,
    setZoomEnabled,
    selectedLLM,
    setSelectedLLM
}: SettingsPanelProps) {
  const [scannerUrl, setScannerUrl] = useState('');
  const [savedScannerUrl, setSavedScannerUrl] = useState('');
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [llmKey, setLlmKey] = useState(localStorage.getItem(`geograph-llm-key-${selectedLLM}`) || '');
  const [llmUser, setLlmUser] = useState(localStorage.getItem(`geograph-llm-user-${selectedLLM}`) || '');
  const [llmLogin, setLlmLogin] = useState(localStorage.getItem(`geograph-llm-login-${selectedLLM}`) || '');

  useEffect(() => {
    const storedUrl = localStorage.getItem('geograph-scanner-url');
    if (storedUrl) {
        setScannerUrl(storedUrl);
        setSavedScannerUrl(storedUrl);
    }

    getCurrentUser().then(({ data }) => {
        setUser(data.user);
    });
  }, []);

  useEffect(() => {
    setLlmKey(localStorage.getItem(`geograph-llm-key-${selectedLLM}`) || '');
    setLlmUser(localStorage.getItem(`geograph-llm-user-${selectedLLM}`) || '');
    setLlmLogin(localStorage.getItem(`geograph-llm-login-${selectedLLM}`) || '');
  }, [selectedLLM]);

  const handleSaveLLMConfig = () => {
    localStorage.setItem('geograph-selected-llm', selectedLLM);
    localStorage.setItem(`geograph-llm-key-${selectedLLM}`, llmKey);
    localStorage.setItem(`geograph-llm-user-${selectedLLM}`, llmUser);
    localStorage.setItem(`geograph-llm-login-${selectedLLM}`, llmLogin);
    
    // Sync with legacy Gemini key
    if (selectedLLM === 'Gemini 2.5 Flash') {
      localStorage.setItem('geograph-gemini-key', llmKey);
    }
    
    alert(`${selectedLLM} configuration saved!`);
  };

  const handleToggleSync = async () => {
      if (syncOn) {
          await disableAutoSync();
          setSyncOn(false);
      } else {
          const success = await enableAutoSync();
          if (success) setSyncOn(true);
      }
  };

  const handleToggleWeb3 = () => {
      const newState = !web3Enabled;
      setWeb3Enabled(newState);
      localStorage.setItem('geograph-web3-enabled', String(newState));
  };

  const handleToggleDebug = () => {
      const newState = !debugMode;
      setDebugMode(newState);
      localStorage.setItem('geograph-debug-mode', String(newState));
  };

  const handleToggleZoom = () => {
      const newState = !zoomEnabled;
      setZoomEnabled(newState);
      localStorage.setItem('loadopoly-zoom-enabled', String(newState));
  };

  const handleSaveScanner = () => {
      setEngineScannerUrl(scannerUrl);
      setSavedScannerUrl(scannerUrl);
      setScannerConnected(!!scannerUrl);
      localStorage.setItem('geograph-scanner-url', scannerUrl);
  };

  const handleClearData = async () => {
      if (window.confirm("WARNING: This will delete ALL locally stored assets and graph data. This action cannot be undone. Are you sure?")) {
          await clearAllAssets();
          window.location.reload();
      }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 p-6">
      
      {/* Header */}
      <div>
          <h2 className="text-2xl font-bold text-white mb-2">Node Settings</h2>
          <p className="text-slate-400">Configure local integration, automation hardware, and account.</p>
      </div>

      {/* Authentication Section */}
      {user ? (
        <ProfileSettings />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-blue-900/30 text-blue-500">
                    <User size={24} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white">GeoGraph Account</h3>
                    <p className="text-sm text-slate-400">Sign in to sync datasets and access paid markers.</p>
                </div>
            </div>
            <button 
                onClick={() => setShowAuthModal(true)}
                className="w-full sm:w-auto px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2"
            >
                <LogIn size={18} /> Sign In
            </button>
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => { setShowAuthModal(false); getCurrentUser().then(({ data }) => setUser(data.user)); }} />}

      {/* AI Model Configuration Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-primary-900/30 text-primary-500">
            <Cpu size={24} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-white mb-2">LLM Options & Credentials</h3>
            <p className="text-sm text-slate-400 mb-6">
              Configure and select which dynamic LLM to use for processing. 
              Manage all API keys, usernames, and logins here.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Model Selection</label>
                <select 
                  value={selectedLLM}
                  onChange={(e) => setSelectedLLM(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white text-sm focus:border-primary-500 outline-none transition-all"
                >
                  <option value="Gemini 2.5 Flash">Gemini 2.5 Flash (Default)</option>
                  <option value="GPT-4o">GPT-4o</option>
                  <option value="Claude 3.5 Sonnet">Claude 3.5 Sonnet</option>
                  <option value="Local (Ollama)">Local (Ollama)</option>
                  <option value="Custom LLM">Custom LLM</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">API Key / Token</label>
                  <div className="relative">
                    <input
                      type="password"
                      value={llmKey}
                      onChange={(e) => setLlmKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:border-primary-500 outline-none transition-all"
                    />
                    <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Username / Login</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={llmUser}
                      onChange={(e) => setLlmUser(e.target.value)}
                      placeholder="Username or Email"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:border-primary-500 outline-none transition-all"
                    />
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">System Login / Domain</label>
                <div className="relative">
                  <input
                    type="text"
                    value={llmLogin}
                    onChange={(e) => setLlmLogin(e.target.value)}
                    placeholder="https://your-custom-llm-endpoint.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:border-primary-500 outline-none transition-all"
                  />
                  <Shield size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                </div>
              </div>

              <button
                onClick={handleSaveLLMConfig}
                className="w-full px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all mt-2"
              >
                <RefreshCw size={16} /> Save LLM Configuration
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Web3 / Blockchain Settings */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-start gap-4">
            <div className={`p-3 rounded-lg ${web3Enabled ? 'bg-indigo-900/30 text-indigo-500' : 'bg-slate-800 text-slate-500'}`}>
                <Wallet size={24} />
            </div>
            <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-white">Web3 Integration</h3>
                    <button 
                        onClick={handleToggleWeb3}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${web3Enabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${web3Enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
                <p className="text-sm text-slate-400 mb-2">
                    Enable strict blockchain verification for rewards. 
                </p>
                <ul className="text-xs text-slate-500 space-y-1 list-disc pl-4 mb-4">
                    <li><strong>Enabled:</strong> Requires MetaMask signature to earn shards. Mints real NFTs on Polygon.</li>
                    <li><strong>Disabled:</strong> Earn virtual shards instantly. No wallet required. Full app functionality maintained.</li>
                </ul>
            </div>
        </div>
      </div>

      {/* Auto Sync Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-start gap-4">
            <div className={`p-3 rounded-lg ${syncOn ? 'bg-emerald-900/30 text-emerald-500' : 'bg-slate-800 text-slate-500'}`}>
                <FolderSync size={24} />
            </div>
            <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">Local Folder Watcher</h3>
                <p className="text-sm text-slate-400 mb-4">
                    Automatically ingest any image file dropped into a specific local folder (Downloads, Dropbox, etc.). 
                    Ideal for tethered cameras or existing workflows.
                </p>
                
                <button
                    onClick={handleToggleSync}
                    className={`px-6 py-3 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${
                        syncOn 
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                        : 'bg-slate-700 hover:bg-slate-600 text-white'
                    }`}
                >
                    {syncOn ? (
                        <>
                           <CheckCircle size={16} /> Auto-Sync Active
                        </>
                    ) : (
                        'Enable Auto-Sync'
                    )}
                </button>
                
                {syncOn && (
                    <div className="mt-3 text-xs text-emerald-400/80 bg-emerald-950/20 p-2 rounded border border-emerald-900/50 inline-block">
                        ● Watching for new files...
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Direct Scanner Connect */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-purple-900/30 text-purple-500">
                <Radio size={24} />
            </div>
            <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">Archive Scanner Bridge (Network)</h3>
                <p className="text-sm text-slate-400 mb-4">
                    Poll a network-attached scanner or IoT drop folder via JSON API.
                </p>
                
                <div className="flex gap-2 mb-2">
                    <input
                        type="text"
                        placeholder="http://192.168.1.50:8080/scan-drop"
                        value={scannerUrl}
                        onChange={(e) => setScannerUrl(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white text-sm focus:border-purple-500 outline-none transition-all focus:ring-1 focus:ring-purple-500"
                    />
                    <button
                        onClick={handleSaveScanner}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                            savedScannerUrl === scannerUrl && scannerUrl !== ''
                            ? 'bg-emerald-600 text-white'
                            : 'bg-purple-600 hover:bg-purple-500 text-white'
                        }`}
                    >
                        {savedScannerUrl === scannerUrl && scannerUrl !== '' ? 'Connected' : 'Connect'}
                    </button>
                </div>
                
                {savedScannerUrl && (
                    <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <CheckCircle size={12} className="text-emerald-500" />
                            Connected to: <span className="font-mono text-slate-400">{savedScannerUrl}</span>
                        </div>
                        <button 
                            onClick={() => { setScannerUrl(''); handleSaveScanner(); }}
                            className="text-[10px] text-slate-600 hover:text-red-400 transition-colors"
                        >
                            Disconnect
                        </button>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Camera & Scanning Settings */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-start gap-4">
            <div className={`p-3 rounded-lg ${zoomEnabled ? 'bg-primary-900/30 text-primary-500' : 'bg-slate-800 text-slate-500'}`}>
                <Camera size={24} />
            </div>
            <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-white">Camera & Scanning</h3>
                    <button 
                        onClick={handleToggleZoom}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${zoomEnabled ? 'bg-primary-600' : 'bg-slate-700'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${zoomEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
                <p className="text-sm text-slate-400">
                    Enable advanced zoom functions in the AR Scanner and Instant Capture mode. 
                    This allows for better precision when scanning distant or small artifacts.
                </p>
            </div>
        </div>
      </div>

      {/* Debug & Developer Section */}
      <div className="bg-slate-900 border border-amber-900/30 rounded-xl p-6">
        <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-amber-900/20 text-amber-500">
                <Radio size={24} />
            </div>
            <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-white">Developer Tools</h3>
                    <button 
                        onClick={handleToggleDebug}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${debugMode ? 'bg-amber-600' : 'bg-slate-700'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${debugMode ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
                <p className="text-sm text-slate-400">
                    Enable verbose logging and detailed error reporting in the processing queue. 
                    Useful for troubleshooting AI extraction failures.
                </p>
            </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-slate-900 border border-red-900/30 rounded-xl p-6">
        <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-red-900/20 text-red-500">
                <AlertTriangle size={24} />
            </div>
            <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">Repository Maintenance</h3>
                <p className="text-sm text-slate-400 mb-4">
                    Reset local storage and clear all indexed assets.
                </p>
                <button
                    onClick={handleClearData}
                    className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
                >
                    <Trash2 size={16} /> Clear Local Repository
                </button>
            </div>
        </div>
      </div>

      <div className="text-center text-xs text-slate-600 mt-8 pb-4 flex flex-col gap-2 items-center">
        <p>GeoGraph Node v2.8.1 • Local-First Architecture</p>
        <button 
          onClick={onOpenPrivacy}
          className="text-slate-500 hover:text-slate-300 underline transition-colors"
        >
          Privacy Policy
        </button>
      </div>
    </div>
  );
}