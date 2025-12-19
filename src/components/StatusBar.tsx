import React from 'react';
import { Cloud, CloudOff, Database, User, Shield, Wifi, WifiOff } from 'lucide-react';

interface StatusBarProps {
    user: any;
    syncOn: boolean;
    isOnline: boolean;
    localCount: number;
    onTabChange: (tab: string) => void;
}

export default function StatusBar({ user, syncOn, isOnline, localCount, onTabChange }: StatusBarProps) {
    return (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-950/80 backdrop-blur-md border-t border-slate-800 px-4 py-1.5 flex items-center justify-between z-50 text-[10px] font-medium text-slate-500">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                    {isOnline ? (
                        <span className="flex items-center gap-1 text-emerald-500">
                            <Wifi size={12} /> Network Online
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-red-500">
                            <WifiOff size={12} /> Offline Mode
                        </span>
                    )}
                </div>
                
                <div className="h-3 w-px bg-slate-800" />
                
                <div className="flex items-center gap-1.5">
                    <Database size={12} />
                    <span>{localCount} Local Assets</span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <button 
                    onClick={() => onTabChange('settings')}
                    className={`flex items-center gap-1.5 transition-colors hover:text-white ${syncOn ? 'text-emerald-500' : 'text-slate-500'}`}
                >
                    {syncOn ? <Cloud size={12} /> : <CloudOff size={12} />}
                    {syncOn ? 'Auto-Sync Active' : 'Sync Disabled'}
                </button>

                <div className="h-3 w-px bg-slate-800" />

                <button 
                    onClick={() => onTabChange('settings')}
                    className={`flex items-center gap-1.5 transition-colors hover:text-white ${user ? 'text-primary-400' : 'text-slate-500'}`}
                >
                    {user ? (
                        <>
                            <Shield size={12} />
                            <span>{user.email}</span>
                        </>
                    ) : (
                        <>
                            <User size={12} />
                            <span>Guest Session</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
