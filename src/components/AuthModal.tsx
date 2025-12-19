import React, { useState } from 'react';
import { signUp, signIn } from '../lib/auth';
import { X, Mail, Lock, ArrowRight, AlertCircle, Shield, Cloud, Zap } from 'lucide-react';

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async () => {
    setLoading(true);
    setError(null);
    const fn = mode === 'login' ? signIn : signUp;
    const { error } = await fn(email, password);
    setLoading(false);
    
    if (!error) {
        onClose();
        window.location.reload(); // Refresh to update user state across app
    } else {
        setError(error.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-slate-900 w-full max-w-4xl rounded-2xl border border-slate-700 shadow-2xl overflow-hidden relative flex flex-col md:flex-row">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors z-10"
        >
            <X size={20} />
        </button>
        
        {/* Left Side: Info */}
        <div className="hidden md:flex flex-1 bg-gradient-to-br from-primary-900/40 to-slate-900 p-10 flex-col justify-center border-r border-slate-800">
            <h2 className="text-3xl font-bold text-white mb-6">Elevate Your Research</h2>
            <div className="space-y-6">
                <div className="flex gap-4">
                    <div className="p-2 bg-primary-500/20 rounded-lg text-primary-400 h-fit">
                        <Cloud size={20} />
                    </div>
                    <div>
                        <h4 className="text-white font-bold">Cloud Sync</h4>
                        <p className="text-slate-400 text-sm">Access your datasets from any device, anytime.</p>
                    </div>
                </div>
                <div className="flex gap-4">
                    <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 h-fit">
                        <Shield size={20} />
                    </div>
                    <div>
                        <h4 className="text-white font-bold">Secure Backup</h4>
                        <p className="text-slate-400 text-sm">Your local repository is automatically backed up to our secure cloud.</p>
                    </div>
                </div>
                <div className="flex gap-4">
                    <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400 h-fit">
                        <Zap size={20} />
                    </div>
                    <div>
                        <h4 className="text-white font-bold">Global Contribution</h4>
                        <p className="text-slate-400 text-sm">Contribute to the global corpus and earn shards for your work.</p>
                    </div>
                </div>
            </div>
        </div>

        {/* Right Side: Form */}
        <div className="flex-1 p-8 md:p-12">
            <h2 className="text-2xl font-bold text-white mb-2">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-slate-400 text-sm mb-8">
                {mode === 'login' ? 'Sign in to access your datasets and scanners.' : 'Join the GeoGraph network to contribute and earn.'}
            </p>

            <div className="space-y-4">
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                        type="email" 
                        placeholder="Email" 
                        value={email} 
                        onChange={e => setEmail(e.target.value)} 
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-primary-500 transition-colors"
                    />
                </div>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                        type="password" 
                        placeholder="Password" 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-primary-500 transition-colors"
                    />
                </div>
            </div>

            {error && (
                <div className="mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-2 text-red-400 text-xs">
                    <AlertCircle size={14} />
                    {error}
                </div>
            )}

            <button 
                onClick={handle} 
                disabled={loading}
                className="w-full py-3 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-lg mt-8 flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-primary-900/20"
            >
                {loading ? 'Processing...' : (
                    <>
                        {mode === 'login' ? 'Sign In' : 'Sign Up'} <ArrowRight size={18} />
                    </>
                )}
            </button>

            <div className="mt-8 text-center">
                <button 
                    onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }} 
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                    {mode === 'login' ? "Need an account? Sign Up" : "Already have one? Sign In"}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}
