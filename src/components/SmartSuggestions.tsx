import React from 'react';
import { Sparkles, ArrowRight, Shield, Radio, Database, Zap } from 'lucide-react';

interface Suggestion {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    actionLabel: string;
    action: () => void;
    priority: 'high' | 'medium' | 'low';
}

interface SmartSuggestionsProps {
    user: any;
    localAssetCount: number;
    syncEnabled: boolean;
    web3Enabled: boolean;
    scannerConnected: boolean;
    onAction: (tab: string) => void;
}

export default function SmartSuggestions({ 
    user, 
    localAssetCount, 
    syncEnabled, 
    web3Enabled, 
    scannerConnected,
    onAction 
}: SmartSuggestionsProps) {
    const suggestions: Suggestion[] = [];

    if (!user) {
        suggestions.push({
            id: 'auth',
            title: 'Secure Your Data',
            description: 'Sign in to enable cloud sync and protect your local repository.',
            icon: <Shield className="text-blue-400" size={20} />,
            actionLabel: 'Sign In',
            action: () => onAction('settings'),
            priority: 'high'
        });
    }

    if (localAssetCount > 0 && !syncEnabled) {
        suggestions.push({
            id: 'sync',
            title: 'Enable Auto-Sync',
            description: 'Automatically ingest files from your local folders.',
            icon: <Database className="text-emerald-400" size={20} />,
            actionLabel: 'Enable',
            action: () => onAction('settings'),
            priority: 'medium'
        });
    }

    if (!scannerConnected) {
        suggestions.push({
            id: 'scanner',
            title: 'Connect Hardware',
            description: 'Bridge a network scanner for high-speed document ingestion.',
            icon: <Radio className="text-purple-400" size={20} />,
            actionLabel: 'Connect',
            action: () => onAction('settings'),
            priority: 'low'
        });
    }

    if (localAssetCount > 10 && !web3Enabled) {
        suggestions.push({
            id: 'web3',
            title: 'Earn Shards',
            description: 'Enable Web3 to mint verified shards for your contributions.',
            icon: <Zap className="text-amber-400" size={20} />,
            actionLabel: 'Enable Web3',
            action: () => onAction('settings'),
            priority: 'medium'
        });
    }

    if (suggestions.length === 0) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {suggestions.map((s) => (
                <div 
                    key={s.id}
                    className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 hover:bg-slate-800/50 transition-all group cursor-pointer"
                    onClick={s.action}
                >
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 group-hover:border-slate-700 transition-colors">
                            {s.icon}
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                                <h4 className="text-sm font-bold text-white flex items-center gap-1">
                                    {s.title}
                                    {s.priority === 'high' && <Sparkles size={12} className="text-blue-400 animate-pulse" />}
                                </h4>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                                    s.priority === 'high' ? 'bg-blue-900/30 text-blue-400' : 
                                    s.priority === 'medium' ? 'bg-emerald-900/30 text-emerald-400' : 
                                    'bg-slate-800 text-slate-500'
                                }`}>
                                    {s.priority}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mb-3 line-clamp-2">
                                {s.description}
                            </p>
                            <button className="text-xs font-bold text-primary-500 flex items-center gap-1 group-hover:gap-2 transition-all">
                                {s.actionLabel} <ArrowRight size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
