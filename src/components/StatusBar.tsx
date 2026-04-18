import React from 'react';
import { Cloud, CloudOff, Database, User, Shield, Wifi, WifiOff, Globe, Lock, Activity, AlertCircle } from 'lucide-react';

interface StatusBarProps {
    user: any;
    syncOn: boolean;
    isOnline: boolean;
    localCount: number;
    isGlobalView: boolean;
    setIsGlobalView: (val: boolean) => void;
    onTabChange: (tab: string) => void;
    pendingCount?: number;
    stuckCount?: number;
    onQueueClick?: () => void;
}

// PERF FIX: React.memo prevents StatusBar from re-rendering on every App state
// change. StatusBar is always mounted and only depends on a small set of props —
// without memo it re-renders ~30+ times per second during batch processing.
const StatusBar = React.memo(function StatusBar({ 
    user, 
    syncOn, 
    isOnline, 
    localCount, 
    isGlobalView, 
    setIsGlobalView, 
    onTabChange,
    pendingCount = 0,
    stuckCount = 0,
    onQueueClick 
}: StatusBarProps) {
    return (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-950 border-t border-slate-800 px-2 sm:px-4 py-1.5 flex items-center justify-between z-50 text-[10px] font-medium text-slate-500" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)', maxWidth: '100vw', overflowX: 'hidden' }}>
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                <div className="flex items-center gap-1.5">
                    {isOnline ? (
                        <span className="flex items-center gap-1 text-emerald-500">
                            <Wifi size={12} /> <span className="hidden sm:inline">Network Online</span>
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-red-500">
                            <WifiOff size={12} /> <span className="hidden sm:inline">Offline Mode</span>
                        </span>
                    )}
                </div>
                
                <div className="h-3 w-px bg-slate-800 hidden sm:block" />
                
                {/* Processing Queue Status - Always Visible */}
                <button 
                    onClick={onQueueClick}
                    className={`flex items-center gap-1.5 transition-colors hover:text-white ${
                        pendingCount > 0 ? 'text-amber-400' : stuckCount > 0 ? 'text-orange-400' : 'text-slate-500'
                    }`}
                    title="Press Q to toggle queue panel"
                >
                    {stuckCount > 0 ? (
                        <AlertCircle size={12} className="text-orange-500" />
                    ) : (
                        <Activity size={12} className={pendingCount > 0 ? 'animate-pulse' : ''} />
                    )}
                    <span>
                        {pendingCount > 0 
                            ? `${pendingCount} pending` 
                            : stuckCount > 0 
                                ? `${stuckCount} stuck` 
                                : 'Queue idle'}
                    </span>
                </button>
                
                <div className="h-3 w-px bg-slate-800 hidden sm:block" />
                
                <div className="hidden sm:flex items-center gap-1.5">
                    <Database size={12} />
                    <span>{localCount} <span className="hidden sm:inline">Local Assets</span></span>
                </div>

                <div className="h-3 w-px bg-slate-800 hidden md:block" />

                <div className="hidden md:flex items-center bg-slate-900 rounded-full p-0.5 border border-slate-800">
                    <button 
                        onClick={() => setIsGlobalView(false)}
                        className={`px-2 py-0.5 rounded-full transition-all flex items-center gap-1 ${!isGlobalView ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Lock size={10} />
                        <span>LOCAL</span>
                    </button>
                    <button 
                        onClick={() => setIsGlobalView(true)}
                        className={`px-2 py-0.5 rounded-full transition-all flex items-center gap-1 ${isGlobalView ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Globe size={10} />
                        <span>MASTER</span>
                    </button>
                </div>

                <div className="h-3 w-px bg-slate-800 hidden lg:block" />
                <span className="text-slate-600 hidden lg:inline">v1.8.1</span>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                <button 
                    onClick={() => onTabChange('settings')}
                    className={`flex items-center gap-1.5 transition-colors hover:text-white ${syncOn ? 'text-emerald-500' : 'text-slate-500'}`}
                >
                    {syncOn ? <Cloud size={12} /> : <CloudOff size={12} />}
                    <span className="hidden sm:inline">{syncOn ? 'Auto-Sync Active' : 'Sync Disabled'}</span>
                </button>

                <div className="h-3 w-px bg-slate-800 hidden sm:block" />

                <button 
                    onClick={() => onTabChange('settings')}
                    className={`hidden sm:flex items-center gap-1.5 transition-colors hover:text-white ${user ? 'text-primary-400' : 'text-slate-500'}`}
                >
                    {user ? (
                        <>
                            <Shield size={12} />
                            <span className="max-w-[100px] truncate">{user.email}</span>
                        </>
                    ) : (
                        <>
                            <User size={12} />
                            <span>Guest</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
});

export default StatusBar;
