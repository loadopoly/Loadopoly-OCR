import React, { useEffect, useState } from 'react';
import { getCurrentUser, signOut } from '../lib/auth';
import BluetoothScannerConnect from './BluetoothScannerConnect';
import { User, LogOut, Settings, Shield } from 'lucide-react';

export default function ProfileSettings() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser().then(({ data }) => {
        setUser(data.user);
        setLoading(false);
    });
  }, []);

  const handleSignOut = async () => {
      await signOut();
      setUser(null);
      window.location.reload(); // Simple reload to reset state
  };

  if (loading) return <div className="text-center py-8 text-slate-500">Loading profile...</div>;

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
             <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800">
                 <h4 className="text-sm font-bold text-slate-300 mb-1">Contributions</h4>
                 <p className="text-2xl font-mono text-white">0</p>
             </div>
             <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800">
                 <h4 className="text-sm font-bold text-slate-300 mb-1">Total Shards</h4>
                 <p className="text-2xl font-mono text-purple-400">0</p>
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

      <button 
        onClick={handleSignOut} 
        className="w-full py-3 bg-red-900/20 hover:bg-red-900/30 text-red-400 border border-red-900/50 rounded-lg flex items-center justify-center gap-2 transition-colors"
      >
          <LogOut size={18} /> Sign Out
      </button>
    </div>
  );
}
