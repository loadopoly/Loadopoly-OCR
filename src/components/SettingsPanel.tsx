import React, { useState, useEffect } from 'react';
import { enableAutoSync, disableAutoSync, isSyncEnabled, setScannerUrl as setEngineScannerUrl } from '../lib/syncEngine';
import { FolderSync, Radio, CheckCircle, User, LogIn } from 'lucide-react';
import { getCurrentUser } from '../lib/auth';
import AuthModal from './AuthModal';
import ProfileSettings from './ProfileSettings';

export default function SettingsPanel({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
  const [syncOn, setSyncOn] = useState(false);
  const [scannerUrl, setScannerUrl] = useState('');
  const [savedScannerUrl, setSavedScannerUrl] = useState('');
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    isSyncEnabled().then(setSyncOn);
    const storedUrl = localStorage.getItem('geograph-scanner-url');
    if (storedUrl) {
        setScannerUrl(storedUrl);
        setSavedScannerUrl(storedUrl);
    }
    
    getCurrentUser().then(({ data }) => {
        setUser(data.user);
    });
  }, []);

  const handleToggleSync = async () => {
      if (syncOn) {
          await disableAutoSync();
          setSyncOn(false);
      } else {
          const success = await enableAutoSync();
          if (success) setSyncOn(true);
      }
  };

  const handleSaveScanner = () => {
      setEngineScannerUrl(scannerUrl);
      setSavedScannerUrl(scannerUrl);
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex items-center justify-between">
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
                className="px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-bold text-sm flex items-center gap-2"
            >
                <LogIn size={18} /> Sign In
            </button>
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => { setShowAuthModal(false); getCurrentUser().then(({ data }) => setUser(data.user)); }} />}

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
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:border-purple-500 outline-none"
                    />
                    <button
                        onClick={handleSaveScanner}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium text-sm"
                    >
                        Connect
                    </button>
                </div>
                
                {savedScannerUrl && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                        <CheckCircle size={12} className="text-purple-500" />
                        Connected to: <span className="font-mono text-slate-400">{savedScannerUrl}</span>
                    </div>
                )}
            </div>
        </div>
      </div>

      <div className="text-center text-xs text-slate-600 mt-8 pb-4 flex flex-col gap-2 items-center">
        <p>GeoGraph Node v1.1.0 • Local-First Architecture</p>
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