import React, { useState, useEffect, useMemo } from 'react';
import { 
    Sparkles, 
    ArrowRight, 
    Shield, 
    Radio, 
    Database, 
    Zap, 
    Info, 
    X, 
    CheckCircle,
    AlertCircle,
    Lightbulb,
    Clock,
    FileImage,
    Upload,
    Cpu,
    Globe,
    Coins,
    Filter,
    Network,
    Layers,
    Sliders,
    Target,
    TrendingUp,
    Link2,
} from 'lucide-react';
import { IntegrationStatusBadge, IntegrationState } from './IntegrationStatus';
import { useFilterContext, FilterDimension, QuickFilterPreset } from '../contexts/FilterContext';
import FilterDependencyVisualizer from './FilterDependencyVisualizer';

interface Suggestion {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    actionLabel: string;
    action: () => void;
    priority: 'high' | 'medium' | 'low';
    category?: 'setup' | 'optimize' | 'earn' | 'tip';
    tooltip?: string;
    dismissible?: boolean;
}

interface ProactiveHint {
    id: string;
    message: string;
    icon: React.ReactNode;
    type: 'info' | 'success' | 'warning';
    autoHide?: number;
}

interface SmartSuggestionsProps {
    user: any;
    localAssetCount: number;
    syncEnabled: boolean;
    web3Enabled: boolean;
    scannerConnected: boolean;
    onAction: (tab: string) => void;
    // New props for enhanced features
    pendingCount?: number;
    processingCount?: number;
    geminiConnected?: boolean;
    supabaseConnected?: boolean;
    recentActivity?: 'upload' | 'process' | 'mint' | null;
    onOpenIntegrationsHub?: () => void;
}

// Inline tooltip component
function Tooltip({ children, content }: { children: React.ReactNode; content: string }) {
    const [show, setShow] = useState(false);
    
    return (
        <div className="relative inline-block">
            <div 
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
            >
                {children}
            </div>
            {show && (
                <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white whitespace-nowrap shadow-xl">
                    {content}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700" />
                </div>
            )}
        </div>
    );
}

// ============================================
// Filter Insights Panel - Dynamic Dependencies
// ============================================

function FilterInsightsPanel({ onNavigate }: { onNavigate: (tab: string) => void }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showDependencyGraph, setShowDependencyGraph] = useState(false);
    
    // Try to use filter context if available
    let filterContext: ReturnType<typeof useFilterContext> | null = null;
    try {
        filterContext = useFilterContext();
    } catch {
        // FilterProvider not mounted yet, show placeholder
        return null;
    }
    
    const { state, analytics, applyQuickFilter, clearAllFilters, getActiveFilterCount } = filterContext;
    const activeCount = getActiveFilterCount();
    
    // Calculate cross-view filter impact
    const crossViewImpact = useMemo(() => {
        const syncedCount = state.syncedViews.size;
        const dimensions = Array.from(state.dimensions.values());
        const constrainedDimensions = dimensions.filter(d => 
            d.filteredValues.length < d.availableValues.length
        );
        
        return {
            syncedViews: syncedCount,
            constrainedDimensions: constrainedDimensions.length,
            totalDimensions: dimensions.length,
            efficiency: analytics.filterEfficiency,
        };
    }, [state.dimensions, state.syncedViews, analytics.filterEfficiency]);
    
    // Quick filter presets with smart recommendations
    const recommendedFilters = useMemo(() => {
        const recommendations: { preset: QuickFilterPreset; reason: string }[] = [];
        
        if (analytics.filteredAssets > 100) {
            recommendations.push({
                preset: 'high_confidence',
                reason: 'Reduce noise with confidence filter',
            });
        }
        
        if (activeCount === 0 && analytics.totalAssets > 50) {
            recommendations.push({
                preset: 'public_domain',
                reason: 'Start with public domain items',
            });
        }
        
        return recommendations;
    }, [analytics, activeCount]);
    
    if (analytics.totalAssets === 0) {
        return null; // Don't show if no data
    }
    
    return (
        <div className="mb-6">
            {/* Collapsed Summary Bar */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-900/80 to-slate-800/50 border border-slate-800 rounded-xl hover:border-slate-700 transition-all group"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-600/20 rounded-lg group-hover:bg-primary-600/30 transition-colors">
                        <Sliders size={16} className="text-primary-400" />
                    </div>
                    <div className="text-left">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-white text-sm">Dynamic Filters</span>
                            {activeCount > 0 && (
                                <span className="px-1.5 py-0.5 bg-primary-600 rounded text-[10px] font-bold text-white">
                                    {activeCount} ACTIVE
                                </span>
                            )}
                            {crossViewImpact.constrainedDimensions > 0 && (
                                <span className="px-1.5 py-0.5 bg-amber-500/20 rounded text-[10px] font-bold text-amber-400">
                                    {crossViewImpact.constrainedDimensions} CONSTRAINED
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500">
                            {analytics.filteredAssets.toLocaleString()} of {analytics.totalAssets.toLocaleString()} items • 
                            {' '}{crossViewImpact.syncedViews} views synced
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Mini filter efficiency bar */}
                    <div className="hidden sm:flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-primary-600 to-emerald-500 transition-all duration-500"
                                style={{ width: `${crossViewImpact.efficiency * 100}%` }}
                            />
                        </div>
                        <span className="text-xs text-slate-500">{(crossViewImpact.efficiency * 100).toFixed(0)}%</span>
                    </div>
                    
                    <ArrowRight 
                        size={16} 
                        className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                    />
                </div>
            </button>
            
            {/* Expanded Panel */}
            {isExpanded && (
                <div className="mt-3 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                    {/* Quick Actions Bar */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
                        <span className="text-xs text-slate-500 mr-2">Quick Filters:</span>
                        
                        <button
                            onClick={() => applyQuickFilter('public_domain')}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 flex items-center gap-1 transition-colors"
                        >
                            <Shield size={12} />
                            Public Domain
                        </button>
                        
                        <button
                            onClick={() => applyQuickFilter('high_confidence')}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 flex items-center gap-1 transition-colors"
                        >
                            <Target size={12} />
                            High Confidence
                        </button>
                        
                        <button
                            onClick={() => applyQuickFilter('graph_ready')}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 flex items-center gap-1 transition-colors"
                        >
                            <Network size={12} />
                            Graph Ready
                        </button>
                        
                        {activeCount > 0 && (
                            <button
                                onClick={clearAllFilters}
                                className="ml-auto px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-xs text-red-400 flex items-center gap-1 transition-colors"
                            >
                                <X size={12} />
                                Clear All
                            </button>
                        )}
                    </div>
                    
                    {/* Cross-View Sync Status */}
                    <div className="px-4 py-3 border-b border-slate-800">
                        <div className="flex items-center gap-2 mb-2">
                            <Link2 size={12} className="text-primary-400" />
                            <span className="text-xs font-medium text-slate-400">Cross-View Dependencies</span>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-2">
                            {(['graph', 'world', 'database', 'curator'] as const).map(view => {
                                const isSynced = state.syncedViews.has(view);
                                const viewLabels = {
                                    graph: 'Knowledge Graph',
                                    world: '3D World',
                                    database: 'Structure DB',
                                    curator: 'Curator Mode',
                                };
                                const viewIcons = {
                                    graph: <Network size={14} />,
                                    world: <Globe size={14} />,
                                    database: <Database size={14} />,
                                    curator: <Shield size={14} />,
                                };
                                
                                return (
                                    <button
                                        key={view}
                                        onClick={() => onNavigate(view)}
                                        className={`
                                            flex flex-col items-center gap-1.5 p-3 rounded-lg transition-all
                                            ${isSynced 
                                                ? 'bg-primary-600/10 border border-primary-500/30 text-primary-400' 
                                                : 'bg-slate-800/50 border border-slate-700/50 text-slate-500 hover:text-slate-300'
                                            }
                                        `}
                                    >
                                        {viewIcons[view]}
                                        <span className="text-[10px] font-medium">{viewLabels[view]}</span>
                                        {isSynced && (
                                            <span className="text-[8px] uppercase tracking-wider opacity-75">Synced</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    
                    {/* Dependency Graph Toggle */}
                    <div className="px-4 py-3">
                        <button
                            onClick={() => setShowDependencyGraph(!showDependencyGraph)}
                            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
                        >
                            <Layers size={12} />
                            <span>{showDependencyGraph ? 'Hide' : 'Show'} Dependency Graph</span>
                        </button>
                        
                        {showDependencyGraph && (
                            <div className="mt-3">
                                <FilterDependencyVisualizer
                                    width={360}
                                    height={250}
                                    interactive={true}
                                    showLegend={true}
                                    onDimensionSelect={(dim) => {
                                        // Could expand the dimension in the filter panel
                                        console.log('Selected dimension:', dim);
                                    }}
                                />
                            </div>
                        )}
                    </div>
                    
                    {/* Recommendations */}
                    {recommendedFilters.length > 0 && (
                        <div className="px-4 py-3 bg-amber-500/5 border-t border-amber-500/20">
                            <div className="flex items-center gap-2 mb-2">
                                <Sparkles size={12} className="text-amber-400" />
                                <span className="text-xs font-medium text-amber-400">Recommended Filters</span>
                            </div>
                            
                            <div className="space-y-2">
                                {recommendedFilters.map(({ preset, reason }) => (
                                    <button
                                        key={preset}
                                        onClick={() => applyQuickFilter(preset)}
                                        className="w-full flex items-center justify-between p-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors"
                                    >
                                        <span className="text-xs text-slate-300">{reason}</span>
                                        <span className="text-xs text-primary-400">Apply →</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Proactive hint banner
function ProactiveHintBanner({ hint, onDismiss }: { hint: ProactiveHint; onDismiss: () => void }) {
    useEffect(() => {
        if (hint.autoHide) {
            const timer = setTimeout(onDismiss, hint.autoHide);
            return () => clearTimeout(timer);
        }
    }, [hint.autoHide, onDismiss]);

    const bgColor = hint.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20' 
        : hint.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20' 
        : 'bg-blue-500/10 border-blue-500/20';
    
    const textColor = hint.type === 'success' ? 'text-emerald-400' 
        : hint.type === 'warning' ? 'text-amber-400' 
        : 'text-blue-400';

    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${bgColor} mb-4 animate-slideDown`}>
            <div className={textColor}>{hint.icon}</div>
            <p className="text-sm text-white flex-1">{hint.message}</p>
            <button onClick={onDismiss} className="p-1 hover:bg-slate-800 rounded-full transition-colors">
                <X size={14} className="text-slate-400" />
            </button>
        </div>
    );
}

// Connection status indicator for integrations
function ConnectionStatusIndicator({ 
    label, 
    state, 
    onClick 
}: { 
    label: string; 
    state: IntegrationState; 
    onClick?: () => void 
}) {
    return (
        <button 
            onClick={onClick}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors"
        >
            <IntegrationStatusBadge state={state} size="sm" />
            <span className="text-xs text-slate-300">{label}</span>
        </button>
    );
}

export default function SmartSuggestions({ 
    user, 
    localAssetCount, 
    syncEnabled, 
    web3Enabled, 
    scannerConnected,
    onAction,
    pendingCount = 0,
    processingCount = 0,
    geminiConnected = true,
    supabaseConnected = true,
    recentActivity = null,
    onOpenIntegrationsHub
}: SmartSuggestionsProps) {
    const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>([]);
    const [activeHints, setActiveHints] = useState<ProactiveHint[]>([]);
    const [showAllSuggestions, setShowAllSuggestions] = useState(false);

    // Load dismissed suggestions from localStorage
    useEffect(() => {
        const dismissed = JSON.parse(localStorage.getItem('geograph-dismissed-suggestions') || '[]');
        setDismissedSuggestions(dismissed);
    }, []);

    // Generate proactive hints based on recent activity
    useEffect(() => {
        const hints: ProactiveHint[] = [];
        
        if (recentActivity === 'upload' && pendingCount > 0) {
            hints.push({
                id: 'pending-processing',
                message: `${pendingCount} file${pendingCount > 1 ? 's' : ''} ready for OCR processing. Click "Process All" to extract text.`,
                icon: <Lightbulb size={18} />,
                type: 'info',
                autoHide: 10000
            });
        }
        
        if (processingCount > 0) {
            hints.push({
                id: 'processing-active',
                message: `Processing ${processingCount} file${processingCount > 1 ? 's' : ''}... This may take a moment.`,
                icon: <Clock size={18} className="animate-spin" />,
                type: 'info'
            });
        }

        if (!geminiConnected && localAssetCount > 0) {
            hints.push({
                id: 'gemini-needed',
                message: 'Configure Gemini API to enable AI-powered OCR and text extraction.',
                icon: <AlertCircle size={18} />,
                type: 'warning'
            });
        }

        setActiveHints(hints);
    }, [recentActivity, pendingCount, processingCount, geminiConnected, localAssetCount]);

    const dismissSuggestion = (id: string) => {
        const updated = [...dismissedSuggestions, id];
        setDismissedSuggestions(updated);
        localStorage.setItem('geograph-dismissed-suggestions', JSON.stringify(updated));
    };

    const dismissHint = (id: string) => {
        setActiveHints(prev => prev.filter(h => h.id !== id));
    };

    const suggestions: Suggestion[] = [];

    // Priority 1: Authentication & Security
    if (!user) {
        suggestions.push({
            id: 'auth',
            title: 'Secure Your Data',
            description: 'Sign in to enable cloud sync and protect your local repository.',
            icon: <Shield className="text-blue-400" size={20} />,
            actionLabel: 'Sign In',
            action: () => onAction('settings'),
            priority: 'high',
            category: 'setup',
            tooltip: 'Signing in enables cross-device sync and data backup'
        });
    }

    // Priority 2: Gemini Connection
    if (!geminiConnected) {
        suggestions.push({
            id: 'gemini',
            title: 'Connect Gemini AI',
            description: 'Enable AI-powered OCR, text extraction, and smart categorization.',
            icon: <Cpu className="text-cyan-400" size={20} />,
            actionLabel: 'Configure',
            action: () => onOpenIntegrationsHub?.() || onAction('settings'),
            priority: 'high',
            category: 'setup',
            tooltip: 'Gemini processes images to extract text and metadata automatically'
        });
    }

    // Priority 3: Cloud Sync
    if (localAssetCount > 0 && !syncEnabled) {
        suggestions.push({
            id: 'sync',
            title: 'Enable Auto-Sync',
            description: 'Automatically ingest files from your local folders.',
            icon: <Database className="text-emerald-400" size={20} />,
            actionLabel: 'Enable',
            action: () => onAction('settings'),
            priority: 'medium',
            category: 'optimize',
            tooltip: 'Auto-sync watches folders and imports new files automatically'
        });
    }

    // Priority 4: Pending Processing
    if (pendingCount > 5) {
        suggestions.push({
            id: 'batch-process',
            title: 'Batch Process Files',
            description: `You have ${pendingCount} files awaiting OCR processing.`,
            icon: <FileImage className="text-orange-400" size={20} />,
            actionLabel: 'Process All',
            action: () => onAction('process'),
            priority: 'medium',
            category: 'optimize',
            dismissible: true
        });
    }

    // Priority 5: Hardware Scanner
    if (!scannerConnected) {
        suggestions.push({
            id: 'scanner',
            title: 'Connect Hardware',
            description: 'Bridge a network scanner for high-speed document ingestion.',
            icon: <Radio className="text-purple-400" size={20} />,
            actionLabel: 'Connect',
            action: () => onAction('settings'),
            priority: 'low',
            category: 'optimize',
            dismissible: true,
            tooltip: 'Supports TWAIN and network-enabled scanners'
        });
    }

    // Priority 6: Web3 Earnings
    if (localAssetCount > 10 && !web3Enabled) {
        suggestions.push({
            id: 'web3',
            title: 'Earn GARD Shards',
            description: 'Enable Web3 to mint verified shards for your contributions.',
            icon: <Zap className="text-amber-400" size={20} />,
            actionLabel: 'Enable Web3',
            action: () => onOpenIntegrationsHub?.() || onAction('settings'),
            priority: 'medium',
            category: 'earn',
            tooltip: 'Earn tokens on Polygon for contributing verified data'
        });
    }

    // Contextual tip based on activity
    if (localAssetCount === 0) {
        suggestions.push({
            id: 'get-started',
            title: 'Get Started',
            description: 'Upload your first document, image, or receipt to begin building your corpus.',
            icon: <Upload className="text-indigo-400" size={20} />,
            actionLabel: 'Upload',
            action: () => onAction('upload'),
            priority: 'high',
            category: 'tip'
        });
    }

    // Filter dismissed suggestions
    const visibleSuggestions = suggestions.filter(s => !dismissedSuggestions.includes(s.id));
    const displayedSuggestions = showAllSuggestions ? visibleSuggestions : visibleSuggestions.slice(0, 3);

    return (
        <div className="mb-8">
            {/* Proactive Hints */}
            {activeHints.map(hint => (
                <ProactiveHintBanner 
                    key={hint.id} 
                    hint={hint} 
                    onDismiss={() => dismissHint(hint.id)} 
                />
            ))}

            {/* Connection Status Bar */}
            {onOpenIntegrationsHub && (
                <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-800">
                    <span className="text-xs text-slate-500 mr-2">Integrations:</span>
                    <ConnectionStatusIndicator 
                        label="Supabase" 
                        state={supabaseConnected ? 'connected' : 'disconnected'} 
                        onClick={onOpenIntegrationsHub}
                    />
                    <ConnectionStatusIndicator 
                        label="Gemini" 
                        state={geminiConnected ? 'connected' : 'disconnected'} 
                        onClick={onOpenIntegrationsHub}
                    />
                    <ConnectionStatusIndicator 
                        label="Web3" 
                        state={web3Enabled ? 'connected' : 'disconnected'} 
                        onClick={onOpenIntegrationsHub}
                    />
                    <button 
                        onClick={onOpenIntegrationsHub}
                        className="ml-auto text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                        <Globe size={12} /> Manage All
                    </button>
                </div>
            )}

            {/* Dynamic Filter Insights Panel */}
            <FilterInsightsPanel onNavigate={onAction} />

            {/* Suggestions Grid */}
            {visibleSuggestions.length > 0 && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {displayedSuggestions.map((s) => (
                            <div 
                                key={s.id}
                                className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 hover:bg-slate-800/50 transition-all group cursor-pointer relative"
                                onClick={s.action}
                            >
                                {s.dismissible && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); dismissSuggestion(s.id); }}
                                        className="absolute top-2 right-2 p-1 hover:bg-slate-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X size={12} className="text-slate-500" />
                                    </button>
                                )}
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 group-hover:border-slate-700 transition-colors">
                                        {s.icon}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <h4 className="text-sm font-bold text-white flex items-center gap-1">
                                                {s.title}
                                                {s.priority === 'high' && <Sparkles size={12} className="text-blue-400 animate-pulse" />}
                                                {s.tooltip && (
                                                    <Tooltip content={s.tooltip}>
                                                        <Info size={12} className="text-slate-500 cursor-help" />
                                                    </Tooltip>
                                                )}
                                            </h4>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                                                s.priority === 'high' ? 'bg-blue-900/30 text-blue-400' : 
                                                s.priority === 'medium' ? 'bg-emerald-900/30 text-emerald-400' : 
                                                'bg-slate-800 text-slate-500'
                                            }`}>
                                                {s.category || s.priority}
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
                    
                    {visibleSuggestions.length > 3 && (
                        <button 
                            onClick={() => setShowAllSuggestions(!showAllSuggestions)}
                            className="mt-4 text-xs text-slate-400 hover:text-white flex items-center gap-1 mx-auto"
                        >
                            {showAllSuggestions ? 'Show Less' : `Show ${visibleSuggestions.length - 3} More Suggestions`}
                            <ArrowRight size={12} className={`transition-transform ${showAllSuggestions ? 'rotate-90' : ''}`} />
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

// CSS animation for slide down (add to your global CSS or index.css)
// @keyframes slideDown {
//     from { opacity: 0; transform: translateY(-10px); }
//     to { opacity: 1; transform: translateY(0); }
// }
// .animate-slideDown { animation: slideDown 0.3s ease-out; }
