import React, { useEffect, useState } from 'react';
import { getCurrentUser, signOut, deleteUserAccount } from '../lib/auth';
import { loadAssets } from '../lib/indexeddb';
import BluetoothScannerConnect from './BluetoothScannerConnect';
import { User, LogOut, Settings, Shield, Coins, Layers, Trash2, AlertTriangle, Database } from 'lucide-react';
import { AssetStatus } from '../types';

export default function ProfileSettings() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ shards: 0, contributions: 0 });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const init = async () => {
        // Load User
        const { data } = await getCurrentUser();
        setUser(data.user);

        // Calculate Stats from Local DB
        const assets = await loadAssets();
        const totalShards = assets.reduce((sum, asset) => sum + (asset.nft?.dcc1?.shardsCollected || 0), 0);
        // We count "contributions" as assets that have either been minted or successfully processed and saved
        const totalContribs = assets.filter(a => a.status === AssetStatus.MINTED).length;

        setStats({ shards: totalShards, contributions: totalContribs });
        setLoading(false);
    };
    init();
  }, []);

  const handleSignOut = async () => {
      await signOut();
      setUser(null);
      window.location.reload(); // Simple reload to reset state
  };

  const handleDeleteAccount = async () => {
      const { error } = await deleteUserAccount();
      if (error) {
          alert("Failed to delete account: " + error.message);
      } else {
          setUser(null);
          window.location.reload();
      }
  };

  if (loading) return <div className="text-center py-8 text-slate-500 animate-pulse">Loading profile data...</div>;

  if (!user) return <div className="text-center py-8 text-slate-400">Not logged in</div>;

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center text-slate-500 border border-slate-700">
                <User size={32} />
            </div>
            <div>
                <h3 className="text-xl font-bold text-white">My Account</h3>
                <p className="text-slate-400 text-sm">{user.email}</p>
                <div className="flex items-center gap-1 mt-1">
                    <span className="text-[10px] text-slate-600 font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        ID: {user.id.substring(0, 8)}...
                    </span>
                    <span className="text-[10px] text-emerald-500 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/50 flex items-center gap-1">
                        <Shield size={10} /> Verified
                    </span>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 flex items-center justify-between">
                 <div>
                    <h4 className="text-sm font-bold text-slate-400 mb-1 flex items-center gap-1">
                        <Layers size={14} /> Contributions
                    </h4>
                    <p className="text-2xl font-mono text-white">{stats.contributions}</p>
                 </div>
             </div>
             <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 flex items-center justify-between">
                 <div>
                    <h4 className="text-sm font-bold text-slate-400 mb-1 flex items-center gap-1">
                        <Coins size={14} /> Total Shards
                    </h4>
                    <p className="text-2xl font-mono text-purple-400">{stats.shards.toLocaleString()}</p>
                 </div>
             </div>
        </div>
      </div>

      {/* Cloud Connection Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Database size={20} className="text-emerald-500" /> Cloud Connection
        </h3>
        <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-sm">Status</span>
                <span className="text-emerald-500 text-sm font-bold flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Connected
                </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-sm">Project URL</span>
                <span className="text-slate-300 text-sm font-mono">
                    {import.meta.env.VITE_SUPABASE_URL?.replace(/https:\/\/(.*?)\.supabase\.co/, '...$1')}
                </span>
            </div>
             <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-sm">Storage Bucket</span>
                <span className="text-slate-300 text-sm font-mono">assets (Public)</span>
            </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Settings size={20} className="text-primary-500" /> Hardware Integration
        </h3>
        <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
            <label className="block text-sm font-medium text-slate-300 mb-2">Bluetooth Scanner</label>
            <BluetoothScannerConnect />
        </div>
      </div>

      <div className="space-y-3">
        <button 
            onClick={handleSignOut} 
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
            <LogOut size={18} /> Sign Out
        </button>

        {!showDeleteConfirm ? (
            <button 
                onClick={() => setShowDeleteConfirm(true)} 
                className="w-full py-3 bg-red-900/10 hover:bg-red-900/20 text-red-500/70 hover:text-red-500 text-sm flex items-center justify-center gap-2 transition-colors"
            >
                <Trash2 size={16} /> Delete Account
            </button>
        ) : (
            <div className="p-4 bg-red-950/20 border border-red-900/50 rounded-lg space-y-3">
                <div className="flex items-start gap-3 text-red-400 text-sm">
                    <AlertTriangle size={20} className="shrink-0" />
                    <p>Are you sure? This will permanently delete your account and all associated data from the cloud. This action cannot be undone.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={handleDeleteAccount}
                        className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-sm transition-colors"
                    >
                        Yes, Delete Everything
                    </button>
                    <button 
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}