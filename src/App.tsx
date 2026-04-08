import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { 
  Camera, 
  Map as MapIcon, 
  Network, 
  Upload, 
  FileText, 
  Database, 
  Coins, 
  Layers, 
  Cpu, 
  Share2,
  CheckCircle,
  AlertCircle,
  Activity,
  Table as TableIcon,
  Search,
  Download,
  Filter,
  ShieldCheck,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Package,
  Zap,
  Image as ImageIcon,
  Maximize2,
  RefreshCw,
  Trash2,
  X,
  FolderOpen,
  ArrowLeft,
  ShoppingBag,
  Users,
  Scan,
  Plus,
  Settings,
  User,
  Gift,
  Volume2,
  Globe,
  Lock,
  Radio,
  List,
  CloudDownload,
  Sliders,
  Server
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { 
  AssetStatus, 
  DigitalAsset, 
  LocationData, 
  HistoricalDocumentMetadata, 
  BatchItem, 
  ImageBundle, 
  ScanType, 
  SCAN_TYPE_CONFIG, 
  GraphData, 
  GraphNode,
  UserMessage,
  Community,
  CommunityAdmissionRequest
} from './types';
// PERF FIX: geminiService statically imports @google/genai (253KB vendor-ai).
// processImageWithGemini is only called on user-triggered actions (camera capture),
// so we lazy-import it inside the functions that use it.
// import { processImageWithGemini } from './services/geminiService';
import { createBundles, createUserBundle } from './services/bundleService';
import { initSync, isSyncEnabled } from './lib/syncEngine';
import { loadAssets, saveAsset, deleteAsset, saveArQueueItem, loadArQueue, clearArQueue } from './lib/indexeddb';
// PERF FIX: Supabase-dependent services deferred from static imports.
// vendor-supabase (44KB gzip) + vendor-storage (32KB gzip) no longer block App chunk parse.
// processingQueueService/downloadService keep same variable names; all call sites work unchanged.
// supabaseService functions + auth use inline dynamic import() at each call site.
import type { QueueStats, QueueJob } from './services/processingQueueService';
import type { DownloadQueueItem } from './services/downloadService';

type PQSType = Awaited<typeof import('./services/processingQueueService')>['processingQueueService'];
type DLSType = Awaited<typeof import('./services/downloadService')>['downloadService'];
let processingQueueService: PQSType;
let downloadService: DLSType;
const _pqsP = import('./services/processingQueueService').then(m => { processingQueueService = m.processingQueueService; });
const _dlsP = import('./services/downloadService').then(m => { downloadService = m.downloadService; });
import { canInstall as canInstallPWA, promptInstall } from './lib/pwaUtils';
import { getRecentUXEvents, trackUXEvent } from './lib/uxTelemetry';
// PERF FIX: compressImage dynamically imported inside ingestFile() to avoid
// pulling 445-line imageCompression module into the critical parse path.
import { WorkerPool } from './lib/workerPool';
import { GraphVisualizerLazy as GraphVisualizer, ARSceneLazy as ARScene, SemanticCanvasLazy as SemanticCanvas, BatchImporterLazy as BatchImporter, AnnotationEditorLazy as AnnotationEditor, SocialAppLazy as SocialApp, IntegrationsHubLazy as IntegrationsHub, QueueMonitorLazy as QueueMonitor, ClusterSyncStatsPanelLazy as ClusterSyncStatsPanel, BatchProcessingPanelLazy as BatchProcessingPanel, SmartSuggestionsLazy as SmartSuggestions } from './lib/lazyComponents';
// PERF FIX: Lazy-load components not needed at first paint.
// ContributeButton and BundleCard pull in web3Service → ethers (400KB).
// SettingsPanel and PurchaseModal are only shown on specific tabs/modals.
const ContributeButton = React.lazy(() => import('./components/ContributeButton'));
const BundleCard = React.lazy(() => import('./components/BundleCard'));
const SettingsPanel = React.lazy(() => import('./components/SettingsPanel'));
const PurchaseModal = React.lazy(() => import('./components/PurchaseModal'));
import { ErrorBoundary } from './components/ErrorBoundary';
import CameraCapture from './components/CameraCapture';
import PrivacyPolicyModal from './components/PrivacyPolicyModal';
import StatusBar from './components/StatusBar';
import { useToast } from './components/Toast';
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp } from './components/KeyboardShortcuts';
import { announce } from './lib/accessibility';
import { WorldRendererLazy as WorldRenderer } from './lib/lazyComponents';
import { useAvatar } from './hooks/useAvatar';
import { FilterProvider, useFilterContext } from './contexts/FilterContext';
import UnifiedFilterPanel, { InlineFilterBar, FilterBadge } from './components/UnifiedFilterPanel';
// PERF FIX: ClusterSyncButton is lazy-loaded because importing it from
// ClusterSyncStatsPanel.tsx pulls in chunk-cluster-sync (138KB) which
// cascades to vendor-supabase (169KB) + vendor-ai (253KB). The button is
// only shown in Curator Mode tab, so it's safe to defer.
const ClusterSyncButton = React.lazy(() =>
  import('./components/ClusterSyncStatsPanel').then(m => ({
    default: m.ClusterSyncButton,
  }))
);

// --- Custom Hooks ---
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  return isOnline;
}

// --- Helper Functions ---
async function calculateSHA256(file: File): Promise<string> {
  // For large files on mobile, use chunked hashing to avoid memory pressure
  // If file is > 10MB, use a simplified hash based on metadata (mobile optimization)
  const TEN_MB = 10 * 1024 * 1024;
  
  if (file.size > TEN_MB) {
    // Lightweight hash: Use first 64KB + last 64KB + file metadata
    const CHUNK_SIZE = 64 * 1024;
    const firstChunk = await file.slice(0, CHUNK_SIZE).arrayBuffer();
    const lastChunk = await file.slice(Math.max(0, file.size - CHUNK_SIZE)).arrayBuffer();
    const metaString = `${file.name}|${file.size}|${file.type}|${file.lastModified}`;
    const metaBuffer = new TextEncoder().encode(metaString);
    
    const combined = new Uint8Array(firstChunk.byteLength + lastChunk.byteLength + metaBuffer.byteLength);
    combined.set(new Uint8Array(firstChunk), 0);
    combined.set(new Uint8Array(lastChunk), firstChunk.byteLength);
    combined.set(metaBuffer, firstChunk.byteLength + lastChunk.byteLength);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Original full-file hash for smaller files
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const SidebarItem = ({ icon: Icon, label, active, onClick }: any) => (
  <button
    onClick={onClick}
    style={{ touchAction: 'manipulation' }}
    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all duration-75 ${
      active 
        ? 'bg-primary-600/10 text-primary-500 border-r-2 border-primary-500' 
        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800 active:bg-slate-700 active:scale-[0.97]'
    }`}
  >
    <Icon size={18} />
    {label}
  </button>
);

const StatCard = ({ label, value, icon: Icon, color, onClick }: any) => (
  <div 
    onClick={onClick}
    className={`bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-xl flex items-center justify-between overflow-hidden ${onClick ? 'cursor-pointer hover:bg-slate-800/50 hover:border-slate-700 transition-all active:scale-[0.98]' : ''}`}
  >
    <div className="min-w-0 flex-1">
      <p className="text-slate-500 text-[10px] sm:text-xs uppercase tracking-wider mb-1 truncate">{label}</p>
      <p className="text-xl sm:text-2xl font-bold text-white truncate">{value}</p>
    </div>
    <div className={`p-2 sm:p-3 rounded-lg bg-opacity-10 flex-shrink-0 ml-2 ${color.replace('text-', 'bg-')}`}>
      <Icon className={color} size={20} />
    </div>
  </div>
);

// MobileNavigation — portals to document.body so it escapes the <header>'s
// backdrop-blur containing block (which was clipping position:fixed children).
const MobileNavigation = ({ activeTab, switchTab }: { activeTab: string; switchTab: (tab: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Portal target — always document.body so sidebar is never clipped
  const overlay = isOpen ? createPortal(
    <div className="fixed inset-0 z-[9999] lg:hidden" role="dialog" aria-modal="true">
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => setIsOpen(false)}
        style={{ touchAction: 'none' }}
      />
      {/* Sidebar panel */}
      <div
        className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 border-r border-slate-800 flex flex-col shadow-2xl"
        style={{ animation: 'slideInLeft 200ms ease-out' }}
      >
        <div className="p-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-primary-500">
            <Database size={24} />
            <h1 className="text-xl font-bold tracking-tight text-white">GeoGraph</h1>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg"
            style={{ touchAction: 'manipulation' }}
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
          <SidebarItem icon={Layers} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => { switchTab('dashboard'); setIsOpen(false); }} />
          <SidebarItem icon={Zap} label="Quick Processing" active={activeTab === 'batch'} onClick={() => { switchTab('batch'); setIsOpen(false); }} />
          <SidebarItem icon={Scan} label="AR Scanner" active={activeTab === 'ar'} onClick={() => { switchTab('ar'); setIsOpen(false); }} />
          <SidebarItem icon={ImageIcon} label="Assets & Bundles" active={activeTab === 'assets'} onClick={() => { switchTab('assets'); setIsOpen(false); }} />
          <SidebarItem icon={ShieldCheck} label="Curator Mode" active={activeTab === 'curator'} onClick={() => { switchTab('curator'); setIsOpen(false); }} />
          <SidebarItem icon={Network} label="Explore" active={activeTab === 'explore'} onClick={() => { switchTab('explore'); setIsOpen(false); }} />
          <SidebarItem icon={TableIcon} label="Structured DB" active={activeTab === 'database'} onClick={() => { switchTab('database'); setIsOpen(false); }} />
          <SidebarItem icon={Users} label="Social Hub" active={activeTab === 'social'} onClick={() => { switchTab('social'); setIsOpen(false); }} />
          <SidebarItem icon={ShoppingBag} label="Marketplace" active={activeTab === 'market'} onClick={() => { switchTab('market'); setIsOpen(false); }} />
          <div className="pt-4 mt-4 border-t border-slate-800">
            <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => { switchTab('settings'); setIsOpen(false); }} />
          </div>
        </nav>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-800 active:bg-slate-700 active:scale-90 transition-transform duration-75 rounded-lg"
        style={{ touchAction: 'manipulation' }}
        aria-label="Open navigation menu"
      >
        <List size={24} />
      </button>
      {overlay}
    </>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const savedMobileTab = localStorage.getItem('geograph-mobile-last-tab');
    const mobileEligible = ['dashboard', 'database', 'batch', 'curator', 'settings', 'explore', 'assets'];
    if (window.innerWidth < 1024 && savedMobileTab && mobileEligible.includes(savedMobileTab)) {
      return savedMobileTab;
    }
    return 'dashboard';
  });
  const [localAssets, setLocalAssets] = useState<DigitalAsset[]>([]);
  const [globalAssets, setGlobalAssets] = useState<DigitalAsset[]>([]);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEnterprise, setIsEnterprise] = useState(false);
  const [isGlobalView, setIsGlobalView] = useState(false);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const assets = useMemo(() => {
    let base = isGlobalView ? globalAssets : localAssets;
    if (selectedCommunityId) {
      return base.filter(a => a.sqlRecord?.COMMUNITY_ID === selectedCommunityId);
    }
    return base;
  }, [isGlobalView, globalAssets, localAssets, selectedCommunityId]);
  const [displayItems, setDisplayItems] = useState<(DigitalAsset | ImageBundle)[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [geoPermission, setGeoPermission] = useState<boolean>(false);
  const [groupBy, setGroupBy] = useState<'SOURCE' | 'ZONE' | 'CATEGORY' | 'RIGHTS'>(() => {
    if (typeof window === 'undefined') return 'SOURCE';
    const saved = localStorage.getItem('geograph-db-group-by');
    return saved === 'SOURCE' || saved === 'ZONE' || saved === 'CATEGORY' || saved === 'RIGHTS' ? saved : 'SOURCE';
  });
  const [dbViewMode, setDbViewMode] = useState<'GROUPS' | 'DRILLDOWN'>(() => {
    if (typeof window === 'undefined') return 'DRILLDOWN';
    const saved = localStorage.getItem('geograph-db-view-mode');
    return saved === 'GROUPS' || saved === 'DRILLDOWN' ? saved : 'DRILLDOWN';
  });
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('geograph-db-selected-group');
  });
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;
  const [graphViewMode, setGraphViewMode] = useState<'SINGLE' | 'GLOBAL'>('SINGLE');
  const [graphFilters, setGraphFilters] = useState({ era: 'all', category: 'all', contested: false });
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);
  const [selectedScanType, setSelectedScanType] = useState<ScanType | null>(ScanType.DOCUMENT);
  const [isPublicBroadcast, setIsPublicBroadcast] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [arSessionQueue, setArSessionQueue] = useState<File[]>([]);

  // Restore persisted AR session queue on mount
  useEffect(() => {
    loadArQueue().then(files => {
      if (files.length > 0) {
        setArSessionQueue(prev => prev.length > 0 ? prev : files);
      }
    }).catch(() => {});
  }, []);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showProcessingPanel, setShowProcessingPanel] = useState(false);
  const [showNewBatchPanel, setShowNewBatchPanel] = useState(false);
  const [isLocalDataLoaded, setIsLocalDataLoaded] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  
  // Batch processing concurrency control (legacy - kept for compatibility)
  const [activeBatchJobs, setActiveBatchJobs] = useState(0);
  const MAX_CONCURRENT_BATCH_JOBS = 3; // Limit concurrent processing for mobile memory
  const batchProcessingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [messages, setMessages] = useState<UserMessage[]>([
    { id: '1', senderId: 'system', receiverId: 'me', content: 'Welcome to GeoGraph Social! You can now message other curators and share data.', timestamp: new Date().toISOString(), isRead: false },
    { id: '2', senderId: 'user_882', receiverId: 'me', content: 'Hey, I saw your collection of 19th century maps. Would you be interested in a trade?', timestamp: new Date(Date.now() - 3600000).toISOString(), isRead: false }
  ]);
  const [communities, setCommunities] = useState<Community[]>([
    { id: 'c1', name: 'Global Cartographers', description: 'A community for sharing and verifying historical maps from around the world.', adminIds: ['admin1'], memberIds: ['admin1', 'me'], isPrivate: false, createdAt: new Date().toISOString(), shardDispersionConfig: { adminPercentage: 10, memberPercentage: 90 } },
    { id: 'c2', name: 'Urban Archeology', description: 'Documenting the hidden history of modern cities through visual artifacts.', adminIds: ['me'], memberIds: ['me'], isPrivate: true, createdAt: new Date().toISOString(), shardDispersionConfig: { adminPercentage: 20, memberPercentage: 80 } }
  ]);
  const [admissionRequests, setAdmissionRequests] = useState<CommunityAdmissionRequest[]>([
    { id: 'r1', communityId: 'c2', userId: 'user_441', status: 'PENDING', timestamp: new Date().toISOString() }
  ]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [editingAsset, setEditingAsset] = useState<DigitalAsset | null>(null);
  const [ownedAssetIds, setOwnedAssetIds] = useState<Set<string>>(new Set());
  const [purchaseModalData, setPurchaseModalData] = useState<{title: string, assets: DigitalAsset[]} | null>(null);
  const [debugMode, setDebugMode] = useState(localStorage.getItem('geograph-debug-mode') === 'true');
  const [zoomEnabled, setZoomEnabled] = useState(localStorage.getItem('loadopoly-zoom-enabled') !== 'false');
  const [selectedLLM, setSelectedLLM] = useState(localStorage.getItem('geograph-selected-llm') || 'Gemini 2.5 Flash');
  const [llmStatus, setLlmStatus] = useState<'connected' | 'error' | 'none'>('connected');

  useEffect(() => {
    const key = localStorage.getItem(`geograph-llm-key-${selectedLLM}`);
    if (key) {
      setLlmStatus('connected');
    } else {
      // For Gemini, we might also check the legacy key or env var
      const legacyKey = localStorage.getItem('geograph-gemini-key');
      if (selectedLLM === 'Gemini 2.5 Flash' && legacyKey) {
        setLlmStatus('connected');
      } else {
        setLlmStatus('none');
      }
    }
  }, [selectedLLM]);
  const { isOpen: isShortcutsOpen, setIsOpen: setIsShortcutsOpen } = useKeyboardShortcutsHelp() as any;
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();
  const [syncOn, setSyncOn] = useState(false);
  const [web3Enabled, setWeb3Enabled] = useState(false);
  const [scannerConnected, setScannerConnected] = useState(false);
  const [showIntegrationsHub, setShowIntegrationsHub] = useState(false);
  const [showUnifiedFilters, setShowUnifiedFilters] = useState(false);
  const [showClusterSyncStats, setShowClusterSyncStats] = useState(false);
  const isDevBuild = import.meta.env.DEV;
  // Dashboard queue monitor — default visible so users can always see queue status
  const [showDashboardQueue, setShowDashboardQueue] = useState(() => {
    try { return localStorage.getItem('geograph-queue-visible') !== '0'; } catch { return true; }
  });
  // SW update available — set by geograph-sw-updated custom event, shows a soft banner
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [downloadQueueItems, setDownloadQueueItems] = useState<DownloadQueueItem[]>([]);
  const [downloadProgressByAsset, setDownloadProgressByAsset] = useState<Record<string, {
    loaded: number;
    total: number;
    status: 'idle' | 'downloading' | 'completed' | 'failed' | 'cancelled';
    error?: string;
  }>>({});
  const [signedPreviewUrls, setSignedPreviewUrls] = useState<Record<string, string>>({});
  const signedPreviewPendingRef = useRef<Set<string>>(new Set());
  const [queueDiagnostics, setQueueDiagnostics] = useState<any>(null);
  const [isStandaloneMode, setIsStandaloneMode] = useState(false);
  const [isInstallPromptAvailable, setIsInstallPromptAvailable] = useState(false);
  const [isInstallingPWA, setIsInstallingPWA] = useState(false);
  const [installBannerDismissed, setInstallBannerDismissed] = useState(() => {
    try { return localStorage.getItem('geograph-install-banner-dismissed') === '1'; } catch { return false; }
  });
  const [showQaPanel, setShowQaPanel] = useState(false);
  const [safeAreaDebug, setSafeAreaDebug] = useState({ top: 0, right: 0, bottom: 0, left: 0, viewportHeight: 0, innerHeight: 0 });
  const [recentUxEvents, setRecentUxEvents] = useState<Array<Record<string, unknown>>>([]);
  const [qaFailedJobs, setQaFailedJobs] = useState<QueueJob[]>([]);
  const [dbProcessFeedback, setDbProcessFeedback] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; message: string; action?: 'settings' | 'queue' | 'releaseRetry' } | null>(null);
  const [dbQueueStats, setDbQueueStats] = useState<QueueStats | null>(null);
  const [processingOnlySince, setProcessingOnlySince] = useState<number | null>(null);
  const [dbProcessRun, setDbProcessRun] = useState<{
    running: boolean;
    total: number;
    processed: number;
    failed: number;
    currentAssetId: string | null;
    batchPending: number;
    cancelRequested: boolean;
    step: 'idle' | 'preparing' | 'queueing' | 'triggering' | 'local-processing' | 'finalizing';
  }>({
    running: false,
    total: 0,
    processed: 0,
    failed: 0,
    currentAssetId: null,
    batchPending: 0,
    cancelRequested: false,
    step: 'idle',
  });
  const dbProcessCancelRef = useRef(false);
  // Explore tab sub-view (merges Knowledge Graph + 3D World into one tab)
  const [exploreSubTab, setExploreSubTab] = useState<'graph' | '3d' | 'semantic'>('3d');

  // #8: 3D World is always the landing page when entering Explore tab.
  // Any prior setExploreSubTab('graph') from stat card clicks is reset on re-entry.
  useEffect(() => {
    if (activeTab === 'explore') setExploreSubTab('3d');
  }, [activeTab]);

  // #11: Listen for SW update event dispatched by index.tsx — show soft update banner.
  useEffect(() => {
    const handleSwUpdate = () => setSwUpdateAvailable(true);
    window.addEventListener('geograph-sw-updated', handleSwUpdate);
    return () => window.removeEventListener('geograph-sw-updated', handleSwUpdate);
  }, []);

  // #12/#13: Register background sync when we have pending assets and go back online.
  useEffect(() => {
    if (isOnline && 'serviceWorker' in navigator) {
      const pending = localAssets.filter(
        a => a.status === AssetStatus.PENDING || a.status === AssetStatus.PROCESSING
      ).length;
      if (pending > 0) {
        navigator.serviceWorker.ready
          .then(reg => (reg as any).sync?.register?.('sync-contributions'))
          .catch(() => { /* Background Sync not supported */ });
      }
    }
  }, [isOnline, localAssets]);

  // App resume: re-hydrate state from IndexedDB when the app comes back from background.
  // On Android, the PWA process may be killed; on return the entire React tree
  // remounts fresh which is fine. But if the process survives (tab hidden → visible),
  // we need to refresh data and reconnect subscriptions.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Refresh local data from IndexedDB (covers process-survived case)
        loadAssets().then(loaded => setLocalAssets(loaded)).catch(() => {});
        // Refresh auth session — keeps Supabase token alive
        import('./lib/auth').then(m => m.getCurrentUser()).then(({ data }) => {
          if (data.user) setUser(data.user);
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const startUploadTracking = useCallback((count = 1) => {
    setUploadProgress(prev => {
      const reset = prev.current >= prev.total ? { current: 0, total: 0 } : prev;
      return {
        current: reset.current,
        total: reset.total + count,
      };
    });
  }, []);

  const completeUploadTracking = useCallback(() => {
    setUploadProgress(prev => ({
      ...prev,
      current: Math.min(prev.total, prev.current + 1),
    }));
  }, []);

  useEffect(() => {
    if (uploadProgress.total > 0 && uploadProgress.current >= uploadProgress.total) {
      const timeout = setTimeout(() => {
        setUploadProgress({ current: 0, total: 0 });
      }, 1400);
      return () => clearTimeout(timeout);
    }
  }, [uploadProgress]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    _dlsP.then(() => {
      unsubscribe = downloadService.subscribeToQueue(setDownloadQueueItems);
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    // PERF FIX: Defer queue diagnostics polling — not needed for first paint.
    // Start after 10s so the initial render and data loading aren't competing.
    const startTimeout = setTimeout(async () => {
      await _pqsP;
      setQueueDiagnostics(processingQueueService.getDiagnostics());
    }, 10000);
    const interval = setInterval(async () => {
      await _pqsP;
      setQueueDiagnostics(processingQueueService.getDiagnostics());
    }, 15000); // Also reduced frequency from 5s to 15s
    return () => {
      clearTimeout(startTimeout);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const checkStandaloneMode = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
      setIsStandaloneMode(standalone);
      setIsInstallPromptAvailable(canInstallPWA());
    };

    checkStandaloneMode();
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (event: MediaQueryListEvent) => {
      setIsStandaloneMode(event.matches || (navigator as any).standalone === true);
    };

    mediaQuery.addEventListener('change', handleDisplayModeChange);
    window.addEventListener('resize', checkStandaloneMode);

    return () => {
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
      window.removeEventListener('resize', checkStandaloneMode);
    };
  }, []);

  useEffect(() => {
    if (!isDevBuild || typeof window === 'undefined') return;

    const toNumber = (value: string) => {
      const parsed = Number.parseFloat(value || '0');
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const measureSafeArea = () => {
      const probe = document.createElement('div');
      probe.style.position = 'fixed';
      probe.style.pointerEvents = 'none';
      probe.style.visibility = 'hidden';
      probe.style.paddingTop = 'env(safe-area-inset-top, 0px)';
      probe.style.paddingRight = 'env(safe-area-inset-right, 0px)';
      probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
      probe.style.paddingLeft = 'env(safe-area-inset-left, 0px)';
      document.body.appendChild(probe);
      const computed = window.getComputedStyle(probe);
      setSafeAreaDebug({
        top: toNumber(computed.paddingTop),
        right: toNumber(computed.paddingRight),
        bottom: toNumber(computed.paddingBottom),
        left: toNumber(computed.paddingLeft),
        viewportHeight: Math.round(window.visualViewport?.height || window.innerHeight),
        innerHeight: window.innerHeight,
      });
      probe.remove();
    };

    const refreshTelemetry = () => {
      const latest = getRecentUXEvents().slice(-8).reverse();
      setRecentUxEvents(latest);
    };

    const handleTelemetry = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (!detail || typeof detail !== 'object') return;
      setRecentUxEvents(prev => [detail, ...prev].slice(0, 8));
    };

    measureSafeArea();
    refreshTelemetry();

    window.addEventListener('resize', measureSafeArea);
    window.addEventListener('orientationchange', measureSafeArea);
    window.visualViewport?.addEventListener('resize', measureSafeArea);
    window.visualViewport?.addEventListener('scroll', measureSafeArea);
    window.addEventListener('geograph:ux-event', handleTelemetry as EventListener);

    return () => {
      window.removeEventListener('resize', measureSafeArea);
      window.removeEventListener('orientationchange', measureSafeArea);
      window.visualViewport?.removeEventListener('resize', measureSafeArea);
      window.visualViewport?.removeEventListener('scroll', measureSafeArea);
      window.removeEventListener('geograph:ux-event', handleTelemetry as EventListener);
    };
  }, [isDevBuild]);

  useEffect(() => {
    if (!isDevBuild || !showQaPanel || !user?.id) {
      setQaFailedJobs([]);
      return;
    }

    let mounted = true;
    const loadFailedJobs = async () => {
      try {
        const failed = await processingQueueService.getUserJobs({ status: ['FAILED'], limit: 8 });
        if (mounted) setQaFailedJobs(failed);
      } catch {
        if (mounted) setQaFailedJobs([]);
      }
    };

    loadFailedJobs();
    const interval = setInterval(loadFailedJobs, 12000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isDevBuild, showQaPanel, user?.id, dbQueueStats?.failed]);

  useEffect(() => {
    const updateInstallPromptAvailability = () => setIsInstallPromptAvailable(canInstallPWA());

    updateInstallPromptAvailability();
    window.addEventListener('beforeinstallprompt', updateInstallPromptAvailability);
    window.addEventListener('appinstalled', updateInstallPromptAvailability);

    return () => {
      window.removeEventListener('beforeinstallprompt', updateInstallPromptAvailability);
      window.removeEventListener('appinstalled', updateInstallPromptAvailability);
    };
  }, []);

  useEffect(() => {
    if (!dbProcessFeedback) return;

    const timeout = setTimeout(() => {
      setDbProcessFeedback(null);
    }, 9000);

    return () => clearTimeout(timeout);
  }, [dbProcessFeedback]);

  useEffect(() => {
    localStorage.setItem('geograph-db-view-mode', dbViewMode);
  }, [dbViewMode]);

  useEffect(() => {
    localStorage.setItem('geograph-db-group-by', groupBy);
  }, [groupBy]);

  useEffect(() => {
    if (selectedGroupKey) {
      localStorage.setItem('geograph-db-selected-group', selectedGroupKey);
    } else {
      localStorage.removeItem('geograph-db-selected-group');
    }
  }, [selectedGroupKey]);

  useEffect(() => {
    if (!user?.id || (activeTab !== 'database' && activeTab !== 'dashboard')) return;

    let mounted = true;
    const fetchQueueStats = async () => {
      try {
        const stats = await processingQueueService.getStats();
        if (mounted) setDbQueueStats(stats);
      } catch {
        if (mounted) setDbQueueStats(null);
      }
    };

    fetchQueueStats();
    const interval = setInterval(fetchQueueStats, 15000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [activeTab, user?.id, localAssets.length, batchQueue.length]);

  useEffect(() => {
    if (!dbQueueStats) {
      setProcessingOnlySince(null);
      return;
    }

    if (dbQueueStats.pending === 0 && dbQueueStats.processing > 0) {
      setProcessingOnlySince(prev => prev || Date.now());
      return;
    }

    setProcessingOnlySince(null);
  }, [dbQueueStats]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 1024) {
      localStorage.setItem('geograph-mobile-last-tab', activeTab);
    }
  }, [activeTab]);

  // H3 FIX: Removed eager preload of ARScene + GraphVisualizer.
  // These are already wrapped in React.lazy/Suspense and will load on-demand
  // when the user actually navigates to the Explore or AR tab.
  // Removing this stops ~200KB+ of chunk downloads from competing with the
  // critical auth + data path during cold start.

  // H1 FIX: Lazy-init WorkerPool — pass minWorkers: 0 so no workers are
  // spawned at mount. Workers are created on-demand when first task is queued.
  const workerPoolRef = useRef<WorkerPool | null>(null);
  const getWorkerPool = useCallback(() => {
    if (!workerPoolRef.current) {
      workerPoolRef.current = new WorkerPool('../workers/parallelWorker.ts', { maxWorkers: 4, minWorkers: 0 });
    }
    return workerPoolRef.current;
  }, []);

  const mergeIncomingAssetPreserveImage = useCallback((current: DigitalAsset, incoming: DigitalAsset): DigitalAsset => {
    if (!current.imageBlob) return incoming;
    return {
      ...incoming,
      imageBlob: current.imageBlob,
      imageUrl: current.imageUrl || incoming.imageUrl,
    };
  }, []);

  // Initialize Processing Queue Service with simplified callbacks
  // The heavy lifting is done by the direct Realtime subscription below
  useEffect(() => {
    if (user?.id) {
      _pqsP.then(() => {
        processingQueueService.init(user.id);
      
        // Lightweight callbacks for progress updates only
        processingQueueService.setCallbacks({
          onJobStarted: (job) => {
            setLocalAssets(prev => prev.map(a => 
              a.id === job.assetId ? { ...a, status: AssetStatus.PROCESSING, progress: 10 } : a
            ));
            // Also update batch queue if item exists there
            setBatchQueue(prev => prev.map(item => 
              item.assetId === job.assetId ? { ...item, status: 'PROCESSING', progress: 10, stage: 'Started' } : item
            ));
          },
          onJobProgress: (job) => {
            setLocalAssets(prev => prev.map(a => 
              a.id === job.assetId ? { ...a, progress: Math.min(90, job.progress) } : a
            ));
            setBatchQueue(prev => prev.map(item => 
              item.assetId === job.assetId ? { ...item, progress: job.progress, stage: job.stage } : item
            ));
          },
          // onJobCompleted is now handled by the direct Realtime subscription below
          // This avoids double-fetching and redundant sync
          onJobCompleted: (job) => {
            // Mark as completed in UI immediately - Realtime will provide full data
            setLocalAssets(prev => prev.map(a => 
              a.id === job.assetId ? { ...a, progress: 100 } : a
            ));
            setBatchQueue(prev => prev.map(item => 
              item.assetId === job.assetId ? { ...item, status: 'COMPLETED', progress: 100, stage: 'Done' } : item
            ));
          },
          onJobFailed: (job) => {
            setLocalAssets(prev => prev.map(a => 
              a.id === job.assetId ? { ...a, status: AssetStatus.FAILED, progress: 0, errorMessage: job.error } : a
            ));
            setBatchQueue(prev => prev.map(item => 
              item.assetId === job.assetId ? { ...item, status: 'FAILED', progress: 0, errorMsg: job.error || 'Processing failed' } : item
            ));
          }
        });
      });
    }
  }, [user?.id]);

  // Direct Realtime subscription to processing_queue for job updates
  // This ensures we get updates even if the internal subscription fails
  useEffect(() => {
    if (!user?.id) return;

    let subscription: { unsubscribe: () => void } | undefined;
    _pqsP.then(() => {
      subscription = processingQueueService.subscribeToJobUpdates(
        user.id,
        (job) => {
          console.log('📡 Queue Realtime update:', job.id, job.status, job.stage);
          
          // Update batch queue UI based on job status
          setBatchQueue(prev => prev.map(item => {
            if (item.assetId !== job.assetId) return item;

            switch (job.status) {
              case 'COMPLETED':
                return { ...item, status: 'COMPLETED', progress: 100, stage: 'Done' };
              case 'FAILED':
                return { ...item, status: 'FAILED', progress: 0, errorMsg: job.error || 'Failed' };
              case 'PROCESSING':
                return { ...item, status: 'PROCESSING', progress: job.progress, stage: job.stage || 'Processing...' };
              default:
                return item;
            }
          }));

          // Update local assets based on job status
          if (job.status === 'COMPLETED') {
            setLocalAssets(prev => prev.map(a => 
              a.id === job.assetId ? { ...a, status: AssetStatus.MINTED, progress: 100 } : a
            ));
          } else if (job.status === 'FAILED') {
            setLocalAssets(prev => prev.map(a => 
              a.id === job.assetId ? { ...a, status: AssetStatus.FAILED, progress: 0, errorMessage: job.error } : a
            ));
          } else if (job.status === 'PROCESSING') {
            setLocalAssets(prev => prev.map(a => 
              a.id === job.assetId ? { ...a, status: AssetStatus.PROCESSING, progress: job.progress } : a
            ));
          }
        }
      );
    });

    return () => subscription?.unsubscribe();
  }, [user?.id]);

  // Direct Realtime subscription to historical_documents_global
  // This is more efficient - edge function saves directly to this table,
  // and we get the full asset data in one step without re-fetching
  useEffect(() => {
    if (!user?.id) return;

    let unsubscribe: (() => void) | undefined;
    import('./services/supabaseService').then(({ subscribeToAssetUpdates, mirrorEdgeAssetToMasterIfNeeded }) => {
      unsubscribe = subscribeToAssetUpdates(
        user.id,
        // On asset UPDATE (e.g., edge processing completed)
        (updatedAsset) => {
          setLocalAssets(prev => {
            const current = prev.find(a => a.id === updatedAsset.id);
            if (current) {
              const merged = mergeIncomingAssetPreserveImage(current, updatedAsset);
              return prev.map(a => a.id === updatedAsset.id ? merged : a);
            }
            return prev;
          });

          mirrorEdgeAssetToMasterIfNeeded(updatedAsset, user.id).catch(err =>
            console.warn('Master mirror after edge update failed:', err)
          );

          // Also persist to local IndexedDB
          saveAsset(updatedAsset).catch(e => console.error('Failed to persist updated asset', e));
        },
        // On asset INSERT (e.g., new asset from edge function)
        (newAsset) => {
          setLocalAssets(prev => {
            // Avoid duplicates
            const current = prev.find(a => a.id === newAsset.id);
            if (current) {
              const merged = mergeIncomingAssetPreserveImage(current, newAsset);
              return prev.map(a => a.id === newAsset.id ? merged : a);
            }
            return [newAsset, ...prev];
          });

          mirrorEdgeAssetToMasterIfNeeded(newAsset, user.id).catch(err =>
            console.warn('Master mirror after edge insert failed:', err)
          );

          saveAsset(newAsset).catch(e => console.error('Failed to persist new asset', e));
        }
      );
    });

    return () => unsubscribe?.();
  }, [mergeIncomingAssetPreserveImage, user?.id]);

  // C3 FIX: Only activate avatar/presence tracking when user navigates to Explore tab.
  // Previously this fired on every mount, hitting Supabase for presence even on Dashboard.
  const avatarUserId = (activeTab === 'explore' && user?.id) ? user.id : null;
  const { avatar, nearbyUsers, currentSector, updatePosition } = useAvatar(avatarUserId);

  // Memoized to avoid re-computing on every render (can be large with 387+ assets)
  const totalTokens = useMemo(() => assets.reduce((acc, curr) => acc + (curr.tokenization?.tokenCount || 0), 0), [assets]);
  const knowledgeNodeCount = useMemo(() => assets.reduce((a, c) => a + (c.graphData?.nodes?.length || 0), 0), [assets]);
  const pendingLocalCount = useMemo(() => localAssets.filter(a => a.status === AssetStatus.PENDING || a.status === AssetStatus.PROCESSING).length, [localAssets]);
  const pendingGlobalCount = useMemo(() => globalAssets.filter(a => a.status === AssetStatus.PENDING || a.status === AssetStatus.PROCESSING).length, [globalAssets]);
  const totalPendingCount = pendingLocalCount + pendingGlobalCount;
  
  // Count stuck assets (PROCESSING but likely from prior session)
  const stuckAssetsCount = useMemo(() => localAssets.filter(a => a.status === AssetStatus.PROCESSING).length, [localAssets]);
  const activeDownloads = useMemo(
    () => downloadQueueItems.filter(item => item.status === 'downloading' || item.status === 'pending'),
    [downloadQueueItems]
  );
  const failedDownloads = useMemo(
    () => downloadQueueItems.filter(item => item.status === 'failed').length,
    [downloadQueueItems]
  );
  const structuredCompleteCount = useMemo(() => assets.filter(a =>
    a.sqlRecord?.STRUCTURED_TEMPORAL &&
    a.sqlRecord?.STRUCTURED_SPATIAL &&
    a.sqlRecord?.STRUCTURED_CONTENT &&
    a.sqlRecord?.STRUCTURED_KNOWLEDGE_GRAPH &&
    a.sqlRecord?.STRUCTURED_PROVENANCE &&
    a.sqlRecord?.STRUCTURED_DISCOVERY
  ).length, [assets]);
  const syncQueuedCount = (dbQueueStats?.pending || 0) + (dbQueueStats?.processing || 0);
  const failedAssetCount = useMemo(() => assets.filter(a => a.status === AssetStatus.FAILED).length, [assets]);
  const syncFailureCount = (dbQueueStats?.failed || 0) + failedAssetCount;
  const qaFailedAssets = useMemo(() => {
    const merged = [...localAssets, ...globalAssets].filter(a => a.status === AssetStatus.FAILED);
    const deduped = new Map<string, DigitalAsset>();
    merged.forEach(asset => {
      if (!deduped.has(asset.id)) deduped.set(asset.id, asset);
    });
    return Array.from(deduped.values()).slice(0, 8);
  }, [localAssets, globalAssets]);
  const staleProcessingEligible = Boolean(
    dbQueueStats &&
    dbQueueStats.pending === 0 &&
    dbQueueStats.processing > 0 &&
    processingOnlySince &&
    Date.now() - processingOnlySince > 90_000
  );

  const mapProcessingRemediation = useCallback((message: string): { action?: 'settings' | 'queue' | 'releaseRetry'; hint: string } => {
    const lower = message.toLowerCase();
    if (lower.includes('not logged in') || lower.includes('authenticated')) {
      return { action: 'settings', hint: 'Sign in from Settings to enable server queue processing.' };
    }
    if (lower.includes('offline') || lower.includes('network')) {
      return { action: 'queue', hint: 'Open Queue panel and retry once connection is restored.' };
    }
    if (lower.includes('stale') || lower.includes('processing') || lower.includes('claim')) {
      return { action: 'releaseRetry', hint: 'Release stale locks, then retry queue processing.' };
    }
    return { action: 'queue', hint: 'Open Queue panel to inspect service diagnostics and retry.' };
  }, []);

  const handleReleaseStaleAndRetry = useCallback(async () => {
    try {
      const released = await processingQueueService.releaseStaleJobs();
      await processingQueueService.invokeEdgeFunction(10);
      showToast('success', `Released ${released} stale lock${released !== 1 ? 's' : ''} and retriggered queue.`);
      setDbProcessFeedback({ type: 'success', message: `Released ${released} stale locks and retriggered queue.` });
      trackUXEvent('release_stale_retry', { released });
      setShowProcessingPanel(true);
    } catch (error: any) {
      const message = error?.message || 'Failed to release stale locks.';
      showToast('error', message);
      setDbProcessFeedback({ type: 'error', message, action: 'queue' });
    }
  }, [showToast]);

  const handleCancelDbProcess = useCallback(() => {
    dbProcessCancelRef.current = true;
    setDbProcessRun(prev => ({ ...prev, cancelRequested: true, step: 'finalizing' }));
    showToast('info', 'Stopping after current operation finishes...');
    trackUXEvent('process_pending_cancel', {
      processed: dbProcessRun.processed,
      total: dbProcessRun.total,
    });
  }, [dbProcessRun.processed, dbProcessRun.total, showToast]);

  const toggleQueuePanel = useCallback((source: string) => {
    setShowProcessingPanel(prev => {
      const next = !prev;
      trackUXEvent('queue_panel_toggle', { source, open: next });
      return next;
    });
  }, []);

  const handleAssetDownload = useCallback(async (asset: DigitalAsset, format: 'json' | 'image' = 'image') => {
    if (format === 'json') {
      if (!asset.sqlRecord) return;
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(asset.sqlRecord, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute('href', dataStr);
      downloadAnchorNode.setAttribute('download', `GEOGRAPH_DB_${asset.id}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      return;
    }

    setDownloadProgressByAsset(prev => ({
      ...prev,
      [asset.id]: {
        loaded: 0,
        total: 0,
        status: 'downloading',
      },
    }));

    await downloadService.downloadAsset(asset, {
      onProgress: (loaded, total) => {
        setDownloadProgressByAsset(prev => ({
          ...prev,
          [asset.id]: {
            loaded,
            total,
            status: 'downloading',
          },
        }));
      },
      onComplete: () => {
        setDownloadProgressByAsset(prev => ({
          ...prev,
          [asset.id]: {
            loaded: prev[asset.id]?.total || prev[asset.id]?.loaded || 0,
            total: prev[asset.id]?.total || 0,
            status: 'completed',
          },
        }));
      },
      onError: (error) => {
        const cancelled = error.name === 'AbortError' || /cancel/i.test(error.message);
        setDownloadProgressByAsset(prev => ({
          ...prev,
          [asset.id]: {
            loaded: prev[asset.id]?.loaded || 0,
            total: prev[asset.id]?.total || 0,
            status: cancelled ? 'cancelled' : 'failed',
            error: error.message,
          },
        }));

        if (!cancelled) {
          showToast('warning', 'Image download unavailable — exporting JSON instead.');
          handleAssetDownload(asset, 'json');
        }
      }
    });
  }, [showToast]);

  const handleCancelDownload = useCallback((assetId: string) => {
    const cancelled = downloadService.cancelDownload(assetId);
    if (cancelled) {
      setDownloadProgressByAsset(prev => ({
        ...prev,
        [assetId]: {
          loaded: prev[assetId]?.loaded || 0,
          total: prev[assetId]?.total || 0,
          status: 'cancelled',
          error: 'Cancelled by user',
        },
      }));
    }
  }, []);

  const handleInstallPWA = useCallback(async () => {
    if (!isInstallPromptAvailable || isInstallingPWA) return;

    setIsInstallingPWA(true);
    try {
      const result = await promptInstall();
      if (result === 'accepted') {
        setIsInstallPromptAvailable(false);
      }
    } finally {
      setIsInstallingPWA(false);
    }
  }, [isInstallPromptAvailable, isInstallingPWA]);

  useEffect(() => {
    const handleShortcuts = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      switch(e.key.toLowerCase()) {
        case '1': setActiveTab('dashboard'); break;
        case '2': setActiveTab('batch'); break;
        case '3': setActiveTab('ar'); break;
        case '4': setActiveTab('assets'); break;
        case '5': setActiveTab('explore'); setExploreSubTab('3d'); break;
        case '6': setActiveTab('database'); break;
        case '7': if (isAdmin) setActiveTab('review'); break;
        case 's': setActiveTab('settings'); break;
        case 'g': setIsGlobalView(prev => !prev); break;
        case 'r': if (isGlobalView) refreshGlobalData(); break;
        case 'w': setActiveTab('explore'); setExploreSubTab('3d'); break;
        case 'q': toggleQueuePanel('keyboard'); break; // Queue panel toggle
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [isGlobalView, toggleQueuePanel]);

  useEffect(() => {
    // Defer geo permission check — no need to block render for a status dot
    const checkGeo = () => navigator.permissions.query({ name: 'geolocation' }).then((result) => setGeoPermission(result.state === 'granted'));
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(checkGeo, { timeout: 5000 });
    } else {
      setTimeout(checkGeo, 3000);
    }

    initSync();
    isSyncEnabled().then(setSyncOn);
    setWeb3Enabled(localStorage.getItem('geograph-web3-enabled') === 'true');
    setScannerConnected(!!localStorage.getItem('geograph-scanner-url'));

    const storedPurchases = localStorage.getItem('geograph-owned-assets');
    if (storedPurchases) {
      try {
        const parsed = JSON.parse(storedPurchases);
        setOwnedAssetIds(new Set(Array.isArray(parsed) ? parsed : []));
      } catch {
        setOwnedAssetIds(new Set());
      }
    }
    
    const handleNewFile = (event: CustomEvent<File>) => ingestFile(event.detail, "Auto-Sync");
    window.addEventListener('geograph-new-file', handleNewFile as any);

    // PHASE 0: Load from IndexedDB IMMEDIATELY — no network dependency (~5ms).
    // This gives the user instant content while auth + cloud sync happen in background.
    let localSnapshot: DigitalAsset[] = [];
    const localReady = loadAssets().then((cached) => {
      localSnapshot = cached;
      setLocalAssets(cached);
      setIsLocalDataLoaded(true);
    });

    import('./lib/auth').then(m => m.getCurrentUser()).then(async ({ data }) => { 
      if(data.user) { 
        setUser(data.user); 
        
        // Baseline Super User Assignment
        const isSuperUser = data.user.email === 'loadopoly@gmail.com';
        setIsAdmin(isSuperUser);
        setIsEnterprise(true); // Authenticated users are treated as enterprise-tier

        // Ensure Phase 0 is complete before using localSnapshot
        await localReady;

        // PHASE 2: Defer cloud sync to idle so UI is interactive first
        const deferredSync = async () => {
          try {
            const { contributeAssetToGlobalCorpus, fetchUserAssets } = await import('./services/supabaseService');
            // Sync unsynced local assets to cloud
            const syncPromises = localSnapshot
              .filter(asset => asset.status === AssetStatus.MINTED && !asset.sqlRecord?.USER_ID)
              .map(async (asset) => {
                try {
                  await contributeAssetToGlobalCorpus(asset, data.user.id, 'GEOGRAPH_CORPUS_1.0', true);
                  if (asset.sqlRecord) asset.sqlRecord.USER_ID = data.user.id;
                  await saveAsset(asset);
                } catch (e) {
                  console.error("Failed to sync local asset to cloud:", e);
                }
              });
            
            await Promise.all(syncPromises);

            // Fetch remote assets and merge
            const remoteAssets = await fetchUserAssets(data.user.id);
            const assetMap = new Map<string, DigitalAsset>();
            localSnapshot.forEach(a => assetMap.set(a.id, a));
            // Merge remote data INTO local: preserve local imageBlob and imageUrl
            // when the local version has binary data (remote always lacks imageBlob).
            remoteAssets.forEach(a => {
              const local = assetMap.get(a.id);
              if (local?.imageBlob) {
                // Keep the local blob and its valid blob URL; merge the rest from remote
                assetMap.set(a.id, { ...a, imageBlob: local.imageBlob, imageUrl: local.imageUrl });
              } else {
                assetMap.set(a.id, a);
              }
            });
            
            const mergedAssets = Array.from(assetMap.values()).sort((a, b) => 
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            setLocalAssets(mergedAssets);
            
            // Persist merged state to IndexedDB in background
            for (const asset of mergedAssets) {
              await saveAsset(asset);
            }
          } catch (err) {
            console.error('Failed to sync with cloud:', err);
            // Local data is already shown — no action needed
          }
        };

        // Kick off cloud sync after the browser has finished painting
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(deferredSync, { timeout: 10000 });
        } else {
          setTimeout(deferredSync, 2000);
        }
      } else {
        // Unauthenticated: local data already loaded in Phase 0.
        // Handle cleanup for sessions that expired.
        const handleUnload = () => {
          sessionStorage.setItem('geograph-cleanup-needed', 'true');
        };
        window.addEventListener('beforeunload', handleUnload);
        
        if (sessionStorage.getItem('geograph-cleanup-needed') === 'true') {
          import('./lib/indexeddb').then(({ clearAllAssets }) => {
            clearAllAssets().then(() => {
              sessionStorage.removeItem('geograph-cleanup-needed');
            });
          });
        }
      }
    }).catch(err => {
      console.error("Auth check failed (likely offline):", err);
      // Local data already loaded in Phase 0 — no action needed
    });

    return () => {
      window.removeEventListener('geograph-new-file', handleNewFile as any);
    };
  }, []);

  const refreshGlobalData = async () => {
    setIsProcessing(true);
    try {
      // If not admin, only fetch enterprise-ready assets
      const { fetchGlobalCorpus } = await import('./services/supabaseService');
      const data = await fetchGlobalCorpus(!isAdmin);
      setGlobalAssets(data);
      announce(`Synced ${data.length} cloud assets.`);
    } catch (err) {
      console.error("Global fetch failed", err);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (isGlobalView && globalAssets.length === 0) refreshGlobalData();
  }, [isGlobalView]);

  // C1 FIX: createBundles() runs O(n²) dedup (74K+ comparisons for 387 assets).
  // Debounce to requestIdleCallback and cache by asset-ID fingerprint so it only
  // re-runs when the actual set of assets changes, not on every reference change.
  const bundleCacheRef = useRef<{ fingerprint: string; items: (DigitalAsset | ImageBundle)[] } | null>(null);
  const bundleIdleRef = useRef<any>(null);

  useEffect(() => {
    if (!isLocalDataLoaded) return;

    if (assets.length === 0) {
      setDisplayItems([]);
      bundleCacheRef.current = null;
      setIsAppReady(true);
      return;
    }

    const processedAssets = assets.filter(a => !!a.sqlRecord);
    const processingAssets = assets.filter(a => !a.sqlRecord);

    // Fast fingerprint: sorted asset IDs joined. If unchanged, skip O(n²) dedup entirely.
    const fingerprint = processedAssets.map(a => a.id).sort().join(',');
    if (bundleCacheRef.current?.fingerprint === fingerprint) {
      // Asset set unchanged — reuse cached bundles, just update processing assets
      setDisplayItems([...processingAssets, ...bundleCacheRef.current.items]);
      setIsAppReady(true);
      return;
    }

    // Show processing assets immediately (instant feedback), defer heavy bundling
    setDisplayItems([...processingAssets, ...processedAssets]);
    // PERF FIX: Mark app ready immediately so UI is interactive while bundling runs
    if (!isAppReady) setIsAppReady(true);

    // Cancel any pending idle callback
    if (bundleIdleRef.current !== null) {
      if ('cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(bundleIdleRef.current);
      } else {
        clearTimeout(bundleIdleRef.current);
      }
    }

    const runBundling = () => {
      const bundles = createBundles(processedAssets);
      bundleCacheRef.current = { fingerprint, items: bundles };
      setDisplayItems([...processingAssets, ...bundles]);
      setIsAppReady(true);
    };

    if (!isAppReady) {
      // PERF FIX: Always defer bundling — even on first render. Show raw assets
      // immediately (setDisplayItems above) and run O(n²) dedup in idle callback.
      // This avoids blocking the main thread for 200-800ms during initial paint.
      if ('requestIdleCallback' in window) {
        bundleIdleRef.current = (window as any).requestIdleCallback(() => {
          runBundling();
        }, { timeout: 8000 });
      } else {
        bundleIdleRef.current = setTimeout(runBundling, 500);
      }
    } else {
      // Defer to idle so the sidebar / tab switch animation isn't blocked
      if ('requestIdleCallback' in window) {
        bundleIdleRef.current = (window as any).requestIdleCallback(runBundling, { timeout: 5000 });
      } else {
        bundleIdleRef.current = setTimeout(runBundling, 300);
      }
    }

    return () => {
      if (bundleIdleRef.current !== null) {
        if ('cancelIdleCallback' in window) {
          (window as any).cancelIdleCallback(bundleIdleRef.current);
        } else {
          clearTimeout(bundleIdleRef.current);
        }
      }
    };
  }, [assets, isLocalDataLoaded, isAppReady]);

  const handleAssetUpdate = async (updatedAsset: DigitalAsset) => {
    if (isGlobalView) {
        setGlobalAssets(prev => prev.map(a => a.id === updatedAsset.id ? updatedAsset : a));
    } else {
        setLocalAssets(prev => prev.map(a => a.id === updatedAsset.id ? updatedAsset : a));
    }
    
    if (user?.id || isGlobalView) {
      // Authenticated users or global view: update in Supabase
      const license = isPublicBroadcast ? 'CC0' : 'GEOGRAPH_CORPUS_1.0';
      import('./services/supabaseService').then(m =>
        m.contributeAssetToGlobalCorpus(updatedAsset, user?.id, license as any, true)
      ).catch(err => console.error("Failed to update asset in Supabase", err));
    } else {
      // Unauthenticated users: save to IndexedDB only
      await saveAsset(updatedAsset);
    }
  };

  const handlePurchase = (purchasedItems: DigitalAsset[]) => {
      const newSet = new Set(ownedAssetIds);
      purchasedItems.forEach(item => newSet.add(item.id));
      setOwnedAssetIds(newSet);
      localStorage.setItem('geograph-owned-assets', JSON.stringify(Array.from(newSet)));
      setPurchaseModalData(null);
      alert(`Successfully added ${purchasedItems.length} assets to your node.`);
  };

  const switchTab = async (newTab: string) => {
      trackUXEvent('tab_navigation', { from: activeTab, to: newTab, mobile: window.innerWidth < 1024 });
      if (activeTab === 'ar' && newTab !== 'ar' && arSessionQueue.length > 0) {
          if (window.confirm(`Process ${arSessionQueue.length} items from your AR Session?`)) {
              handleBatchFiles(arSessionQueue);
              setArSessionQueue([]);
              clearArQueue().catch(() => {});
              setActiveTab('batch'); // explicit: user chose to leave AR → go to batch
          } else {
              // If user cancels, stay on AR tab and keep the queue
              return;
          }
      } else {
          setActiveTab(newTab);
      }
  };

  const createInitialAsset = async (file: File): Promise<DigitalAsset> => {
      const checksum = await calculateSHA256(file);
      const ingestDate = new Date().toISOString();
      const id = uuidv4();
      const scanType = (file as any).scanType || ScanType.DOCUMENT;
      // Always start as PENDING - only transition to PROCESSING when actually being processed
      // This ensures consistency between what's shown in queues vs what handleProcessAllPending sees
      const initialStatus = AssetStatus.PENDING;

      return {
        id,
        imageUrl: URL.createObjectURL(file),
        imageBlob: file,
        timestamp: ingestDate,
        ocrText: "",
        status: initialStatus,
        progress: 0,
        sqlRecord: {
          ID: id,
          ASSET_ID: id,
          LOCAL_TIMESTAMP: ingestDate,
          OCR_DERIVED_TIMESTAMP: null,
          NLP_DERIVED_TIMESTAMP: null,
          LOCAL_GIS_ZONE: "PENDING",
          OCR_DERIVED_GIS_ZONE: null,
          NLP_DERIVED_GIS_ZONE: null,
          NODE_COUNT: 0,
          NLP_NODE_CATEGORIZATION: "PENDING",
          RAW_OCR_TRANSCRIPTION: "",
          PREPROCESS_OCR_TRANSCRIPTION: "",
          SOURCE_COLLECTION: "Processing...",
          DOCUMENT_TITLE: file.name,
          DOCUMENT_DESCRIPTION: "Pending Analysis",
          FILE_FORMAT: file.type,
          FILE_SIZE_BYTES: file.size,
          RESOLUTION_DPI: 72,
          COLOR_MODE: "RGB",
          CREATOR_AGENT: null,
          RIGHTS_STATEMENT: "Pending",
          LANGUAGE_CODE: "en-US",
          FIXITY_CHECKSUM: checksum,
          INGEST_DATE: ingestDate,
          CREATED_AT: ingestDate,
          LAST_MODIFIED: ingestDate,
          PROCESSING_STATUS: initialStatus,
          CONFIDENCE_SCORE: 0,
          ENTITIES_EXTRACTED: [],
          RELATED_ASSETS: [],
          PRESERVATION_EVENTS: [{ eventType: "INGESTION", timestamp: ingestDate, agent: "SYSTEM_USER", outcome: "SUCCESS" as const }],
          KEYWORDS_TAGS: [],
          ACCESS_RESTRICTIONS: false,
          SCAN_TYPE: scanType,
          CONTRIBUTOR_ID: null,
          CONTRIBUTED_AT: null,
          DATA_LICENSE: isPublicBroadcast ? 'CC0' : 'GEOGRAPH_CORPUS_1.0', 
          CONTRIBUTOR_NFT_MINTED: false,
          IS_ENTERPRISE: false
        }
      };
  };

  const processAssetPipeline = async (asset: DigitalAsset, file: File) => {
      // Transition to PROCESSING state immediately when starting
      const processingAsset = { ...asset, status: AssetStatus.PROCESSING, progress: 15 };
      if (isGlobalView) {
        setGlobalAssets(prev => prev.map(a => a.id === asset.id ? processingAsset : a));
      } else {
        setLocalAssets(prev => prev.map(a => a.id === asset.id ? processingAsset : a));
      }
      
      let location: {lat: number, lng: number} | null = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2000 }));
          location = { lat: position.coords.latitude, lng: position.coords.longitude };
        } catch (e) {}
      }

      // Update progress to show geo-location complete
      if (isGlobalView) {
        setGlobalAssets(prev => prev.map(a => a.id === asset.id ? { ...a, progress: 30 } : a));
      } else {
        setLocalAssets(prev => prev.map(a => a.id === asset.id ? { ...a, progress: 30 } : a));
      }

      const scanType = (asset.sqlRecord?.SCAN_TYPE as ScanType) || ScanType.DOCUMENT;
      const { processImageWithGemini } = await import('./services/geminiService');
      const analysis = await processImageWithGemini(file, location, scanType, debugMode);
      
      const updatedSqlRecord: HistoricalDocumentMetadata = {
            ...asset.sqlRecord!,
            OCR_DERIVED_TIMESTAMP: analysis.ocrDerivedTimestamp,
            NLP_DERIVED_TIMESTAMP: analysis.nlpDerivedTimestamp,
            LOCAL_GIS_ZONE: analysis.gisMetadata?.zoneType || "Unknown",
            OCR_DERIVED_GIS_ZONE: analysis.ocrDerivedGisZone,
            NLP_DERIVED_GIS_ZONE: analysis.nlpDerivedGisZone,
            NODE_COUNT: analysis.graphData?.nodes?.length || 0,
            NLP_NODE_CATEGORIZATION: analysis.nlpNodeCategorization,
            RAW_OCR_TRANSCRIPTION: analysis.ocrText,
            PREPROCESS_OCR_TRANSCRIPTION: analysis.preprocessOcrTranscription,
            DOCUMENT_TITLE: analysis.documentTitle,
            DOCUMENT_DESCRIPTION: analysis.documentDescription,
            SOURCE_COLLECTION: analysis.suggestedCollection || asset.sqlRecord!.SOURCE_COLLECTION || "Unsorted",
            ASSOCIATIVE_ITEM_TAG: analysis.associativeItemTag,
            CREATOR_AGENT: analysis.creatorAgent,
            RIGHTS_STATEMENT: analysis.rightsStatement,
            LANGUAGE_CODE: analysis.languageCode,
            LAST_MODIFIED: new Date().toISOString(),
            PROCESSING_STATUS: AssetStatus.MINTED,
            CONFIDENCE_SCORE: analysis.confidenceScore,
            TOKEN_COUNT: analysis.tokenization.tokenCount,
            ENTITIES_EXTRACTED: analysis.graphData?.nodes ? analysis.graphData.nodes.map(n => n.label) : [],
            KEYWORDS_TAGS: analysis.keywordsTags || [],
            ACCESS_RESTRICTIONS: analysis.accessRestrictions,
            TAXONOMY: analysis.taxonomy,
            ITEM_ATTRIBUTES: analysis.itemAttributes,
            SCENERY_ATTRIBUTES: analysis.sceneryAttributes,
            ALT_TEXT_SHORT: analysis.alt_text_short,
            ALT_TEXT_LONG: analysis.alt_text_long,
            READING_ORDER: analysis.reading_order,
            ACCESSIBILITY_SCORE: analysis.accessibility_score,
            IS_ENTERPRISE: true, // Processed assets move to enterprise corpus
            PRESERVATION_EVENTS: [
              ...(asset.sqlRecord?.PRESERVATION_EVENTS || []),
              { eventType: "GEMINI_PROCESSING", timestamp: new Date().toISOString(), agent: selectedLLM, outcome: "SUCCESS" as const }
            ]
      };

      const resultAsset = {
            ...asset,
            status: AssetStatus.MINTED,
            progress: 100,
            ocrText: analysis.ocrText,
            gisMetadata: analysis.gisMetadata,
            graphData: analysis.graphData,
            tokenization: analysis.tokenization,
            processingAnalysis: analysis.analysis,
            location: location ? { latitude: location.lat, longitude: location.lng, accuracy: 1 } : undefined,
            sqlRecord: updatedSqlRecord
      };

      // Data Aggregation: Check for existing assets with the same associative tag
      if (analysis.associativeItemTag) {
          const existingWithTag = localAssets.find(a => a.sqlRecord?.ASSOCIATIVE_ITEM_TAG === analysis.associativeItemTag && a.id !== asset.id);
          if (existingWithTag) {
              const bundleId = existingWithTag.sqlRecord?.USER_BUNDLE_ID || uuidv4();
              resultAsset.sqlRecord!.USER_BUNDLE_ID = bundleId;
              
              // If the existing one didn't have a bundle ID, update it
              if (!existingWithTag.sqlRecord?.USER_BUNDLE_ID) {
                  setLocalAssets(prev => prev.map(a => 
                      a.id === existingWithTag.id ? { ...a, sqlRecord: { ...a.sqlRecord!, USER_BUNDLE_ID: bundleId } } : a
                  ));
              }
          }
      }

      // Auto-store to Supabase (Automatic Cloud Sync)
      const license = isPublicBroadcast ? 'CC0' : 'GEOGRAPH_CORPUS_1.0';
      import('./services/supabaseService').then(m => m.contributeAssetToGlobalCorpus(resultAsset, user?.id, license as any, true)).then(syncResult => {
        if (syncResult.success && syncResult.publicUrl) {
          // Update state with the permanent cloud URL
          const updatedAsset = { ...resultAsset, imageUrl: syncResult.publicUrl || resultAsset.imageUrl };
          if (isGlobalView) {
            setGlobalAssets(prev => prev.map(a => a.id === asset.id ? updatedAsset : a));
          } else {
            setLocalAssets(prev => prev.map(a => a.id === asset.id ? updatedAsset : a));
          }
          // #14: Persist the permanent HTTPS URL to IndexedDB so it survives reloads.
          // Without this, the blob: URL from ingest time becomes a broken link on next open.
          saveAsset(updatedAsset).catch(e => console.warn('Failed to persist publicUrl to IndexedDB', e));
        }
      }).catch(err => console.error("Auto-sync to Supabase failed", err));

      return resultAsset;
  };

  const resumeAsset = async (asset: DigitalAsset) => {
    if (isProcessing) return;
    
    let fileToProcess: File | Blob | null = asset.imageBlob || null;
    
    if (!fileToProcess && asset.imageUrl.startsWith('http')) {
        try {
            const response = await fetch(asset.imageUrl);
            fileToProcess = await response.blob();
        } catch (e) {
            console.error("Failed to fetch image for re-processing", e);
            return;
        }
    }
    
    if (!fileToProcess) {
        alert("Could not find image data to re-process.");
        return;
    }
    
    setIsProcessing(true);
    try {
        const file = fileToProcess instanceof File ? fileToProcess : new File([fileToProcess], asset.sqlRecord?.DOCUMENT_TITLE || 'reprocess.jpg', { type: fileToProcess.type });
        const processedAsset = await processAssetPipeline(asset, file);
        setLocalAssets(prev => prev.map(a => a.id === asset.id ? processedAsset : a));
        if (!user) await saveAsset(processedAsset);
    } catch (err) {
        console.error("Resuming processing failed:", err);
    } finally {
        setIsProcessing(false);
    }
  };

  // Concurrent restart of stuck assets - processes while resetting more
  const restartStuckAssets = useCallback(async () => {
    const stuckAssets = localAssets.filter(a => 
      a.status === AssetStatus.PROCESSING && (a.imageBlob || a.imageUrl?.startsWith('http'))
    );
    
    if (stuckAssets.length === 0) return 0;
    
    console.log(`[AutoRestart] Found ${stuckAssets.length} stuck assets - starting concurrent recovery`);
    announce(`Recovering ${stuckAssets.length} stuck item${stuckAssets.length !== 1 ? 's' : ''}...`);
    
    // Process in concurrent batches - reset a few, process them, continue
    const CONCURRENT_RESET = 3; // Match MAX_CONCURRENT_BATCH_JOBS
    let restarted = 0;
    let activeProcessing = 0;
    
    const processOne = async (asset: DigitalAsset) => {
      activeProcessing++;
      try {
        let fileToProcess: File | Blob | null = asset.imageBlob || null;
        
        if (!fileToProcess && asset.imageUrl?.startsWith('http')) {
          const response = await fetch(asset.imageUrl);
          fileToProcess = await response.blob();
        }
        
        if (fileToProcess) {
          const file = fileToProcess instanceof File 
            ? fileToProcess 
            : new File([fileToProcess], asset.sqlRecord?.DOCUMENT_TITLE || `recover_${asset.id}.jpg`, { type: fileToProcess.type });
          
          const processedAsset = await processAssetPipeline(asset, file);
          setLocalAssets(prev => prev.map(a => a.id === asset.id ? processedAsset : a));
          if (!user) await saveAsset(processedAsset);
        }
      } catch (e) {
        console.error(`[AutoRestart] Failed to process ${asset.id}:`, e);
        // Mark as failed so user knows
        setLocalAssets(prev => prev.map(a => 
          a.id === asset.id ? { ...a, status: AssetStatus.FAILED, errorMessage: String(e) } : a
        ));
      } finally {
        activeProcessing--;
      }
    };
    
    // Process all stuck assets with concurrency limit
    for (let i = 0; i < stuckAssets.length; i++) {
      // Wait if at capacity
      while (activeProcessing >= CONCURRENT_RESET) {
        await new Promise(r => setTimeout(r, 200));
      }
      
      const asset = stuckAssets[i];
      // Don't await - fire and continue to next
      processOne(asset);
      restarted++;
      
      // Small stagger to prevent overwhelming
      if (i < stuckAssets.length - 1) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
    
    // Wait for all remaining to complete
    while (activeProcessing > 0) {
      await new Promise(r => setTimeout(r, 200));
    }
    
    return restarted;
  }, [localAssets, user]);

  // On mount: auto-restart stuck assets once (with slight delay to ensure state is loaded)
  const hasAutoRestartedRef = useRef(false);
  useEffect(() => {
    if (hasAutoRestartedRef.current) return;
    if (localAssets.length === 0) return;
    
    const stuckCount = localAssets.filter(a => 
      a.status === AssetStatus.PROCESSING && (a.imageBlob || a.imageUrl?.startsWith('http'))
    ).length;
    
    if (stuckCount > 0) {
      hasAutoRestartedRef.current = true;
      // Delay to let UI settle, then start concurrent processing
      setTimeout(() => {
        restartStuckAssets().then(count => {
          if (count > 0) {
            console.log(`[AutoRestart] Processed ${count} stuck assets`);
            announce(`Recovered ${count} items from prior session.`);
          }
        });
      }, 1500);
    }
  }, [localAssets, restartStuckAssets]);

  useEffect(() => {
    if (isOnline && localAssets.length > 0) {
      const pendingAssets = localAssets.filter(a => a.status === AssetStatus.PENDING);
      if (pendingAssets.length > 0) {
        const processSequentially = async () => {
          for (const asset of pendingAssets) {
            await resumeAsset(asset);
          }
        };
        processSequentially();
      }
    }
  }, [isOnline, localAssets.length]);

  const ingestFile = async (file: File, source: string = "Upload", shouldSwitchTab: boolean = true) => {
    setIsProcessing(true);
    try {
      const newAsset = await createInitialAsset(file);
      if (newAsset.sqlRecord) {
        newAsset.sqlRecord.SOURCE_COLLECTION = source;
        newAsset.sqlRecord.IS_ENTERPRISE = false; 
      }
      
      // Update state immediately for UI feedback
      setLocalAssets(prev => [newAsset, ...prev]);
      
      // Save locally as fallback
      await saveAsset(newAsset);

      if (shouldSwitchTab && source !== "Batch Folder" && source !== "Auto-Sync") setActiveTab('assets');
      
      if (!isOnline) {
        announce("Offline: Asset saved locally. Processing will resume when online.");
        setIsProcessing(false);
        return;
      }

      // Background Processing Queue Integration
      try {
        const scanType = (file as any).scanType || selectedScanType || ScanType.DOCUMENT;
        startUploadTracking();

        // #3: Resolve best GPS coordinates for the image.
        // Priority: EXIF GPS (embedded at shutter time) > device GPS (current position)
        // Also track coordinate source for downstream trust decisions.
        let captureLocation: { lat: number; lng: number } | undefined;
        let coordinateSource: 'exif' | 'device-live' | 'device-delayed' | 'none' = 'none';

        // Try EXIF GPS first (zero-cost, embedded in photo at capture time)
        if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
          try {
            const { extractGpsFromExif } = await import('./lib/imageCompression');
            const exifGps = await extractGpsFromExif(file);
            if (exifGps) {
              captureLocation = exifGps;
              coordinateSource = 'exif';
            }
          } catch { /* EXIF extraction failed — continue to device GPS */ }
        }

        // Fall back to device GPS if no EXIF coordinates
        if (!captureLocation && navigator.geolocation) {
          try {
            const pos = await new Promise<GeolocationPosition>((res, rej) =>
              navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000, maximumAge: 10000 })
            );
            captureLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            // Check staleness: is the photo older than 30 seconds?
            const photoAge = Date.now() - file.lastModified;
            coordinateSource = photoAge > 30_000 ? 'device-delayed' : 'device-live';
          } catch { /* location unavailable — continue without it */ }
        }
        
        await processingQueueService.queueFile(file, {
          scanType,
          location: captureLocation,
          coordinateSource,
          metadata: {
            DOCUMENT_TITLE: newAsset.sqlRecord?.DOCUMENT_TITLE,
            SOURCE_COLLECTION: source
          }
        }, newAsset.id);

        completeUploadTracking();
        
        announce("Asset queued for background processing.");
      } catch (queueErr) {
        completeUploadTracking();
        console.error("Failed to queue for background processing, falling back to client-side:", queueErr);
        // Fallback to legacy client-side pipeline if queue fails
        const processedAsset = await processAssetPipeline(newAsset, file);
        setLocalAssets(prev => prev.map(a => a.id === newAsset.id ? processedAsset : a));
        if (!user) await saveAsset(processedAsset);
      }
    } catch (err) {
      console.error("Ingestion failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // New scalable batch processor handler
  const handleNewBatchProcess = useCallback(async (
    file: File, 
    itemId: string, 
    scanType: ScanType,
    onProgress: (progress: number, stage: string) => void
  ): Promise<string | null> => {
    try {
      onProgress(5, 'Creating asset...');
      
      // Create local asset — dynamically import compressImage to keep it off critical path
      const { compressImage } = await import('./lib/imageCompression');
      const compressionResult = await compressImage(file);
      const imageUrl = URL.createObjectURL(compressionResult.file);
      
      const newAsset: DigitalAsset = {
        id: itemId,
        imageUrl,
        imageBlob: compressionResult.file,
        timestamp: new Date().toISOString(),
        ocrText: '',
        status: AssetStatus.PROCESSING,
        progress: 10,
        sqlRecord: {
          ID: itemId,
          USER_ID: user?.id || 'anonymous',
          SCAN_TYPE: scanType,
          SOURCE_COLLECTION: 'Batch Import',
          PROCESSING_STATUS: AssetStatus.PROCESSING,
          CREATED_AT: new Date().toISOString(),
          LAST_MODIFIED: new Date().toISOString(),
          IS_ENTERPRISE: false,
        } as HistoricalDocumentMetadata
      };
      
      // Add to local assets immediately for UI feedback
      setLocalAssets(prev => [newAsset, ...prev]);
      
      // Save to IndexedDB to persist imageBlob for potential re-queueing
      await saveAsset(newAsset);
      
      onProgress(15, 'Getting location...');
      
      // Resolve best GPS: EXIF (from compression) > device GPS
      let location: { lat: number; lng: number } | null = compressionResult.gpsCoordinates || null;
      let coordinateSource: 'exif' | 'device-live' | 'device-delayed' | 'none' = location ? 'exif' : 'none';

      if (!location && navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => 
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2000 })
          );
          location = { lat: position.coords.latitude, lng: position.coords.longitude };
          const photoAge = Date.now() - file.lastModified;
          coordinateSource = photoAge > 30_000 ? 'device-delayed' : 'device-live';
        } catch (e) {}
      }
      
      // Check if we should use server-side processing
      // Use server queue when online, logged in, and Supabase is configured
      const diag = processingQueueService.getDiagnostics();
      const useServerProcessing = diag.canProcessServer && isOnline;
      
      if (useServerProcessing) {
        onProgress(20, 'Queueing for server processing...');
        
        try {
          startUploadTracking();
          // Queue to server for processing - this uploads to storage and inserts into queue
          const job = await processingQueueService.queueFile(compressionResult.file, {
            scanType,
            priority: 5,
            location: location || undefined,
            coordinateSource,
            metadata: {
              DOCUMENT_TITLE: file.name,
              SOURCE_COLLECTION: 'AR Scanner / Batch Import'
            }
          }, itemId);
          
          // Track serverJobId on batch item for server-side retry
          const { batchProcessor } = await import('./services/batchProcessorService');
          batchProcessor.setServerJobId(itemId, job.id);
          
          // Update local asset to show it's been queued
          const queuedAsset: DigitalAsset = {
            ...newAsset,
            status: AssetStatus.PROCESSING,
            progress: 25,
            serverJobId: job.id,
          };
          setLocalAssets(prev => prev.map(a => a.id === itemId ? queuedAsset : a));
          await saveAsset(queuedAsset);
          
          onProgress(30, 'Queued for server processing');
          
          // Note: The actual processing result will come back via realtime subscription
          // For now, return the asset ID - the batch processor will mark this as complete
          // The asset status will update when the server finishes processing
          debugLogger(`Asset ${itemId} queued for server processing (job: ${job.id})`);
          
          // Return early - server will handle the rest
          onProgress(100, 'Queued (processing on server)');
          completeUploadTracking();
          return itemId;
          
        } catch (queueError: any) {
          completeUploadTracking();
          // Failed to queue to server - fall back to client-side processing
          debugLogger(`Server queue failed, falling back to client processing: ${queueError.message}`, 'warn');
          onProgress(25, 'Server unavailable, processing locally...');
        }
      }
      
      onProgress(25, 'AI analysis...');
      
      // Process with Gemini (client-side fallback or when server not available)
      const { processImageWithGemini } = await import('./services/geminiService');
      const analysis = await processImageWithGemini(file, location, scanType, debugMode);
      
      onProgress(70, 'Building metadata...');
      
      // Build result
      const updatedSqlRecord: HistoricalDocumentMetadata = {
        ...newAsset.sqlRecord!,
        OCR_DERIVED_TIMESTAMP: analysis.ocrDerivedTimestamp,
        NLP_DERIVED_TIMESTAMP: analysis.nlpDerivedTimestamp,
        LOCAL_GIS_ZONE: analysis.gisMetadata?.zoneType || 'Unknown',
        OCR_DERIVED_GIS_ZONE: analysis.ocrDerivedGisZone,
        NLP_DERIVED_GIS_ZONE: analysis.nlpDerivedGisZone,
        NODE_COUNT: analysis.graphData?.nodes?.length || 0,
        NLP_NODE_CATEGORIZATION: analysis.nlpNodeCategorization,
        RAW_OCR_TRANSCRIPTION: analysis.ocrText,
        PREPROCESS_OCR_TRANSCRIPTION: analysis.preprocessOcrTranscription,
        DOCUMENT_TITLE: analysis.documentTitle,
        DOCUMENT_DESCRIPTION: analysis.documentDescription,
        SOURCE_COLLECTION: analysis.suggestedCollection || 'Batch Import',
        ASSOCIATIVE_ITEM_TAG: analysis.associativeItemTag,
        CREATOR_AGENT: analysis.creatorAgent,
        RIGHTS_STATEMENT: analysis.rightsStatement,
        LANGUAGE_CODE: analysis.languageCode,
        LAST_MODIFIED: new Date().toISOString(),
        PROCESSING_STATUS: AssetStatus.MINTED,
        CONFIDENCE_SCORE: analysis.confidenceScore,
        TOKEN_COUNT: analysis.tokenization.tokenCount,
        ENTITIES_EXTRACTED: analysis.graphData?.nodes ? analysis.graphData.nodes.map(n => n.label) : [],
        KEYWORDS_TAGS: analysis.keywordsTags || [],
        ACCESS_RESTRICTIONS: analysis.accessRestrictions,
        TAXONOMY: analysis.taxonomy,
        ITEM_ATTRIBUTES: analysis.itemAttributes,
        SCENERY_ATTRIBUTES: analysis.sceneryAttributes,
        ALT_TEXT_SHORT: analysis.alt_text_short,
        ALT_TEXT_LONG: analysis.alt_text_long,
        READING_ORDER: analysis.reading_order,
        ACCESSIBILITY_SCORE: analysis.accessibility_score,
        IS_ENTERPRISE: true,
        PRESERVATION_EVENTS: [
          ...(newAsset.sqlRecord?.PRESERVATION_EVENTS || []),
          { eventType: 'GEMINI_PROCESSING', timestamp: new Date().toISOString(), agent: selectedLLM, outcome: 'SUCCESS' as const }
        ]
      };
      
      const resultAsset: DigitalAsset = {
        ...newAsset,
        status: AssetStatus.MINTED,
        progress: 100,
        ocrText: analysis.ocrText,
        gisMetadata: analysis.gisMetadata,
        graphData: analysis.graphData,
        tokenization: analysis.tokenization,
        processingAnalysis: analysis.analysis,
        location: location ? { latitude: location.lat, longitude: location.lng, accuracy: 1 } : undefined,
        sqlRecord: updatedSqlRecord
      };
      
      onProgress(85, 'Syncing to cloud...');
      
      // Update local state
      setLocalAssets(prev => prev.map(a => a.id === itemId ? resultAsset : a));
      
      // Auto-sync to cloud
      const license = isPublicBroadcast ? 'CC0' : 'GEOGRAPH_CORPUS_1.0';
      try {
        const { contributeAssetToGlobalCorpus } = await import('./services/supabaseService');
        const syncResult = await contributeAssetToGlobalCorpus(resultAsset, user?.id, license as any, true);
        if (syncResult.success && syncResult.publicUrl) {
          const updatedWithUrl = { ...resultAsset, imageUrl: syncResult.publicUrl };
          setLocalAssets(prev => prev.map(a => 
            a.id === itemId ? updatedWithUrl : a
          ));
          // #14: Persist permanent HTTPS URL to IndexedDB so images survive reloads.
          saveAsset(updatedWithUrl).catch(e => console.warn('Failed to persist publicUrl', e));
        }
      } catch (e) {
        console.warn('Cloud sync failed, asset saved locally:', e);
      }
      
      onProgress(100, 'Complete');
      
      return resultAsset.id;
    } catch (error: any) {
      console.error('Batch item processing failed:', error);
      // Update asset to failed state
      setLocalAssets(prev => prev.map(a => 
        a.id === itemId ? { ...a, status: AssetStatus.FAILED, errorMessage: error.message } : a
      ));
      throw error;
    }
  }, [user?.id, debugMode, selectedLLM, isPublicBroadcast, startUploadTracking, completeUploadTracking]);

  // Legacy batch handler - now delegates to new system
  const handleBatchFiles = async (files: File[]) => {
    // Dynamically load the batch processor only when needed
    const { batchProcessor } = await import('./services/batchProcessorService');
    batchProcessor.addFiles(files, selectedScanType || ScanType.DOCUMENT);
    
    // Show the batch panel UI but do NOT switch tabs here.
    // The caller (switchTab, BatchImporter, onFinishSession) decides which tab
    // to navigate to after invoking this function. This prevents AR session
    // submissions from hijacking the user back to the Quick Processing tab.
    setShowNewBatchPanel(true);
    
    // Announce for accessibility
    if (files.length > 50) {
      announce(`Large batch: ${files.length} files queued. Processing will be managed for optimal performance.`);
    }
  };

  // Cleanup effect for batch processing
  useEffect(() => {
    return () => {
      // Cleanup timeout on unmount
      if (batchProcessingTimeoutRef.current) {
        clearTimeout(batchProcessingTimeoutRef.current);
      }
      // Revoke any remaining blob URLs to free memory
      batchQueue.forEach(item => {
        if ((item as any).imageUrl?.startsWith('blob:')) {
          URL.revokeObjectURL((item as any).imageUrl);
        }
      });
    };
  }, []);

  const handleProcessAllPending = async () => {
    let pendingAssets = (isGlobalView ? globalAssets : localAssets).filter(
      a => a.status === AssetStatus.PENDING || a.status === AssetStatus.PROCESSING
    );

    const batchPendingCount = batchQueue.filter(i => i.status === 'QUEUED' || i.status === 'PROCESSING').length;

    if (isGlobalView && pendingAssets.length === 0 && pendingLocalCount > 0) {
      pendingAssets = localAssets.filter(
        a => a.status === AssetStatus.PENDING || a.status === AssetStatus.PROCESSING
      );
      showToast('info', `Using ${pendingAssets.length} pending local assets while in master view.`);
    }

    if (pendingAssets.length === 0 && batchPendingCount === 0) {
      setDbProcessFeedback({ type: 'info', message: 'No pending assets found.' });
      showToast('info', 'No pending assets found in Structured DB.');
      announce('All assets have been processed.');
      return;
    }

    const totalToProcess = pendingAssets.length + batchPendingCount;

    setIsProcessing(true);
    setShowProcessingPanel(true);
    dbProcessCancelRef.current = false;
    setDbProcessRun({
      running: true,
      total: totalToProcess,
      processed: 0,
      failed: 0,
      currentAssetId: null,
      batchPending: batchPendingCount,
      cancelRequested: false,
      step: 'preparing',
    });
    showToast('info', `Started processing ${totalToProcess} pending items.`);
    trackUXEvent('process_pending_start', { total: totalToProcess, queueReady: isOnline, tab: activeTab });

    let processedCount = 0;
    let failedCount = 0;

    try {
      const diagnostics = processingQueueService.getDiagnostics();
      const queueReady = isOnline && diagnostics.canProcessServer;

      if (queueReady) {
        setDbProcessRun(prev => ({ ...prev, step: 'queueing' }));
        const needsUpload = pendingAssets.filter(a => !a.serverJobId);
        const alreadyOnServer = pendingAssets.filter(a => !!a.serverJobId);

        if (needsUpload.length > 0) {
          setUploadProgress({ current: 0, total: needsUpload.length });

          const result = await processingQueueService.requeueLocalAssets(
            needsUpload.map(a => ({
              id: a.id,
              imageBlob: a.imageBlob,
              imageUrl: a.imageUrl,
              scanType: a.sqlRecord?.SCAN_TYPE,
            })),
            (done, total, currentAssetId) => {
              setUploadProgress({ current: done, total });
              setDbProcessRun(prev => ({ ...prev, processed: done, currentAssetId: currentAssetId || prev.currentAssetId, step: 'queueing' }));
            }
          );

          processedCount += result.queued;
          failedCount += result.failed;
          setDbProcessRun(prev => ({ ...prev, processed: result.queued, failed: result.failed, step: 'queueing' }));
        }

        if (!dbProcessCancelRef.current && (processedCount > 0 || alreadyOnServer.length > 0)) {
          try {
            setDbProcessRun(prev => ({ ...prev, step: 'triggering' }));
            await processingQueueService.invokeEdgeFunction(10);
          } catch (edgeErr) {
            console.warn('Edge trigger failed after requeue:', edgeErr);
          }
        }
      } else {
        setDbProcessRun(prev => ({ ...prev, step: 'local-processing' }));
        for (const asset of pendingAssets) {
          if (dbProcessCancelRef.current) break;
          try {
            if (asset.imageBlob || (asset.imageUrl && asset.imageUrl.startsWith('http'))) {
              setDbProcessRun(prev => ({ ...prev, currentAssetId: asset.id }));
              let file: File;
              if (asset.imageBlob) {
                file = new File([asset.imageBlob], `reprocess_${asset.id}.jpg`, { type: 'image/jpeg' });
              } else {
                const response = await fetch(asset.imageUrl);
                const blob = await response.blob();
                file = new File([blob], `reprocess_${asset.id}.jpg`, { type: blob.type });
              }

              const processedAsset = await processAssetPipeline(asset, file);
              if (isGlobalView) {
                setGlobalAssets(prev => prev.map(a => a.id === asset.id ? processedAsset : a));
              } else {
                setLocalAssets(prev => prev.map(a => a.id === asset.id ? processedAsset : a));
              }
              processedCount++;
              setDbProcessRun(prev => ({ ...prev, processed: prev.processed + 1, step: 'local-processing' }));
            } else {
              failedCount++;
              setDbProcessRun(prev => ({ ...prev, failed: prev.failed + 1, processed: prev.processed + 1, step: 'local-processing' }));
            }
          } catch (err) {
            console.error(`Failed to process asset ${asset.id}:`, err);
            failedCount++;
            setDbProcessRun(prev => ({ ...prev, failed: prev.failed + 1, processed: prev.processed + 1, step: 'local-processing' }));
          }
        }
      }

      setDbProcessRun(prev => ({ ...prev, step: 'finalizing' }));
      if (!dbProcessCancelRef.current && batchPendingCount > 0) {
        processNextBatchItem();
      }

      const wasCancelled = dbProcessCancelRef.current;
      const feedbackType: 'success' | 'warning' = failedCount > 0 || wasCancelled ? 'warning' : 'success';
      const feedbackMessage = wasCancelled
        ? `Stopped early. Processed ${processedCount}, failed ${failedCount}.`
        : `Queued ${processedCount}, failed ${failedCount}, batch started ${batchPendingCount}.`;
      setDbProcessFeedback({ type: feedbackType, message: feedbackMessage });
      showToast(feedbackType, `Structured DB: ${feedbackMessage}`);
      trackUXEvent('process_pending_complete', {
        processedCount,
        failedCount,
        batchPendingCount,
        cancelled: wasCancelled,
      });

      announce(`Processed ${processedCount} asset${processedCount !== 1 ? 's' : ''}${failedCount > 0 ? `, ${failedCount} failed` : ''}.`);
    } catch (error: any) {
      const message = error?.message || 'Failed to process pending assets.';
      const remediation = mapProcessingRemediation(message);
      setDbProcessFeedback({ type: 'error', message: `${message} ${remediation.hint}`, action: remediation.action });
      showToast('error', `Structured DB: ${message}`);
      trackUXEvent('process_pending_error', { message });
    } finally {
      setIsProcessing(false);
      setDbProcessRun(prev => ({ ...prev, running: false, currentAssetId: null, step: 'idle' }));
    }
  };

  // #13: Background sync — when SW fires sync-contributions, trigger the processing queue
  useEffect(() => {
    const handleSyncRequested = () => {
      if (isOnline) {
        handleProcessAllPending();
      }
    };
    window.addEventListener('geograph-sync-requested', handleSyncRequested);
    return () => window.removeEventListener('geograph-sync-requested', handleSyncRequested);
    // handleProcessAllPending is stable (useCallback) — intentionally omitted from deps
  }, [isOnline]);

  const handleSendMessage = (receiverId: string, content: string, giftId?: string, isBundle?: boolean) => {
    const newMessage: UserMessage = {
      id: uuidv4(),
      senderId: user?.id || 'me',
      receiverId,
      content,
      timestamp: new Date().toISOString(),
      giftAssetId: !isBundle ? giftId : undefined,
      giftBundleId: isBundle ? giftId : undefined,
      isRead: false
    };
    setMessages(prev => [...prev, newMessage]);
    announce('Message sent.');
  };

  const handleJoinCommunity = (communityId: string) => {
    const community = communities.find(c => c.id === communityId);
    if (!community) return;

    if (community.isPrivate) {
      const request: CommunityAdmissionRequest = {
        id: uuidv4(),
        communityId,
        userId: user?.id || 'me',
        status: 'PENDING',
        timestamp: new Date().toISOString()
      };
      setAdmissionRequests(prev => [...prev, request]);
      alert('Join request sent to community admins.');
    } else {
      setCommunities(prev => prev.map(c => 
        c.id === communityId ? { ...c, memberIds: [...c.memberIds, user?.id || 'me'] } : c
      ));
      announce(`Joined ${community.name}.`);
    }
  };

  const handleCreateCommunity = (communityData: Partial<Community>) => {
    const newCommunity: Community = {
      id: uuidv4(),
      name: communityData.name || 'New Community',
      description: communityData.description || '',
      adminIds: [user?.id || 'me'],
      memberIds: [user?.id || 'me'],
      isPrivate: communityData.isPrivate || false,
      createdAt: new Date().toISOString(),
      shardDispersionConfig: communityData.shardDispersionConfig || { adminPercentage: 10, memberPercentage: 90 }
    };
    setCommunities(prev => [...prev, newCommunity]);
    announce(`Community ${newCommunity.name} created.`);
  };

  const handleApproveRequest = (requestId: string) => {
    const request = admissionRequests.find(r => r.id === requestId);
    if (!request) return;

    setCommunities(prev => prev.map(c => 
      c.id === request.communityId ? { ...c, memberIds: [...c.memberIds, request.userId] } : c
    ));
    setAdmissionRequests(prev => prev.filter(r => r.id !== requestId));
    announce('Request approved.');
  };

  const handleClaimGift = (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    
    if (msg.giftAssetId) {
      setOwnedAssetIds(prev => new Set([...prev, msg.giftAssetId!]));
      announce('Digital asset claimed successfully.');
    } else if (msg.giftBundleId) {
      // In a real app, we'd fetch the bundle assets and add them to owned
      announce('Data bundle claimed successfully.');
    }
    
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isRead: true } : m));
  };

  const handleManualBundle = async () => {
    if (selectedAssetIds.size < 2) {
      alert("Please select at least 2 assets to bundle.");
      return;
    }

    const bundleTitle = prompt("Enter a title for this manual bundle:", "Manual Collection");
    if (!bundleTitle) return;

    const bundleId = uuidv4();
    const selectedAssets = assets.filter(a => selectedAssetIds.has(a.id));
    
    // Update all selected assets with the new bundle ID
    const updatedAssets = selectedAssets.map(asset => ({
      ...asset,
      sqlRecord: {
        ...asset.sqlRecord!,
        USER_BUNDLE_ID: bundleId,
        DOCUMENT_TITLE: asset.sqlRecord?.DOCUMENT_TITLE || bundleTitle, // Keep original title if exists
        PRESERVATION_EVENTS: [
          ...(asset.sqlRecord?.PRESERVATION_EVENTS || []),
          { eventType: "MANUAL_BUNDLING", timestamp: new Date().toISOString(), agent: user?.email || "User", outcome: "SUCCESS" as const }
        ]
      }
    }));

    // Save locally
    for (const asset of updatedAssets) {
      await saveAsset(asset);
      // Update state
      if (isGlobalView) {
        setGlobalAssets(prev => prev.map(a => a.id === asset.id ? asset : a));
      } else {
        setLocalAssets(prev => prev.map(a => a.id === asset.id ? asset : a));
      }
    }

    // Sync to Supabase
    const license = isPublicBroadcast ? 'CC0' : 'GEOGRAPH_CORPUS_1.0';
    import('./services/supabaseService').then(m => {
      for (const asset of updatedAssets) {
        m.contributeAssetToGlobalCorpus(asset, user?.id, license as any, true).catch(e => console.error("Failed to sync manual bundle", e));
      }
    });

    setSelectedAssetIds(new Set());
    announce(`Created manual bundle: ${bundleTitle}`);
    setActiveTab('assets');
  };

  // Debug logs state for mobile debugging
  const [debugLogs, setDebugLogs] = useState<Array<{id: string, timestamp: string, message: string, level: 'info'|'error'|'warn'}>>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const debugLogger = useCallback((message: string, level: 'info'|'error'|'warn' = 'info') => {
    const logEntry = {
      id: uuidv4(),
      timestamp: new Date().toLocaleTimeString(),
      message,
      level
    };
    setDebugLogs(prev => [...prev.slice(-49), logEntry]); // Keep last 50 logs
    console.log(`[BatchProcessor] ${message}`);
  }, []);

  // Throttled batch processing - handles large batches efficiently on mobile
  const processNextBatchItem = useCallback(() => {
    // Clear any pending timeout to prevent duplicate triggers
    if (batchProcessingTimeoutRef.current) {
      clearTimeout(batchProcessingTimeoutRef.current);
      batchProcessingTimeoutRef.current = null;
    }
    
    setBatchQueue(currentQueue => {
      // Count currently processing items
      const processingCount = currentQueue.filter(i => i.status === 'PROCESSING').length;
      const queuedCount = currentQueue.filter(i => i.status === 'QUEUED').length;
      
      debugLogger(`Processing: ${processingCount}, Queued: ${queuedCount}`);
      
      // Check if we're at concurrency limit
      if (processingCount >= MAX_CONCURRENT_BATCH_JOBS) {
        debugLogger(`At concurrency limit (${MAX_CONCURRENT_BATCH_JOBS}), scheduling retry`);
        // Schedule retry after a delay
        batchProcessingTimeoutRef.current = setTimeout(() => processNextBatchItem(), 500);
        return currentQueue;
      }
      
      // Find next item to process
      const nextItemIndex = currentQueue.findIndex(i => i.status === 'QUEUED');
      if (nextItemIndex === -1) {
        debugLogger('No more items to process');
        return currentQueue; // Nothing left to process
      }
      
      const itemToProcess = currentQueue[nextItemIndex];
      debugLogger(`Starting ${itemToProcess.file.name}`);
      
      // Mark as processing immediately and return - don't do async work in setState
      return currentQueue.map((item, idx) => 
        idx === nextItemIndex ? { ...item, status: 'PROCESSING' as const, progress: 5 } : item
      );
    });
    
    // Process the next item asynchronously (outside of setState)
    processItemAsync();
    
  }, [isOnline, selectedScanType, user, debugLogger]);
  
  // Separate async function for processing individual items
  const processItemAsync = useCallback(async () => {
    let itemToProcess: BatchItem | null = null;
    
    // Find the item that was just marked as PROCESSING
    setBatchQueue(currentQueue => {
      const processingItem = currentQueue.find(i => i.status === 'PROCESSING' && i.progress === 5);
      if (processingItem) {
        itemToProcess = processingItem;
      }
      return currentQueue;
    });
    
    if (!itemToProcess) {
      debugLogger('No processing item found, scheduling next check', 'warn');
      batchProcessingTimeoutRef.current = setTimeout(() => processNextBatchItem(), 100);
      return;
    }
    
    // Type assertion to fix TypeScript inference issue
    const item = itemToProcess as BatchItem;
    
    debugLogger(`Processing ${item.file.name}...`);
    
    try {
      // Update progress to 10%
      setBatchQueue(q => q.map(i => i.id === item.id ? { ...i, progress: 10 } : i));
      
      if (item.scanType) (item.file as any).scanType = item.scanType;
      
      const newAsset = await createInitialAsset(item.file);
      if (newAsset.sqlRecord) {
        newAsset.sqlRecord.SOURCE_COLLECTION = "Batch Ingest";
        newAsset.sqlRecord.IS_ENTERPRISE = false;
      }
      
      debugLogger(`Created asset for ${item.file.name}`);
      
      // Update progress to 30%
      setBatchQueue(q => q.map(i => i.id === item.id ? { ...i, progress: 30 } : i));
      
      setLocalAssets(prev => [newAsset, ...prev]);
      await saveAsset(newAsset);
      
      debugLogger(`Saved asset for ${item.file.name}`);
      
      // Update progress to 50%
      setBatchQueue(q => q.map(i => i.id === item.id ? { ...i, progress: 50 } : i));

      if (!isOnline) {
        debugLogger(`Offline - marking ${item.file.name} as completed`);
        setBatchQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'COMPLETED', progress: 100, assetId: newAsset.id } : i));
        // Release object URL to free memory
        if (newAsset.imageUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(newAsset.imageUrl);
        }
      } else {
        // Integration with background processing queue
        try {
          debugLogger(`Queueing ${item.file.name} for server processing`);
          startUploadTracking();
          
          await processingQueueService.queueFile(item.file, {
            scanType: item.scanType || selectedScanType || ScanType.DOCUMENT,
            priority: 3, 
            metadata: {
              DOCUMENT_TITLE: newAsset.sqlRecord?.DOCUMENT_TITLE,
              SOURCE_COLLECTION: "Batch Ingest"
            }
          }, newAsset.id);
          completeUploadTracking();
          
          debugLogger(`Successfully queued ${item.file.name}`);
          setBatchQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'COMPLETED', progress: 100, assetId: newAsset.id } : i));
        } catch (queueErr) {
          completeUploadTracking();
          debugLogger(`Server queue failed for ${item.file.name}, falling back to client processing: ${queueErr}`, 'warn');
          
          // Fallback to client-side processing with timeout protection
          const processPromise = processAssetPipeline(newAsset, item.file);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Client processing timeout')), 30000)
          );
          
          try {
            const processedAsset = await Promise.race([processPromise, timeoutPromise]) as any;
            setLocalAssets(prev => prev.map(a => a.id === newAsset.id ? processedAsset : a));
            if (!user) await saveAsset(processedAsset);
            setBatchQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'COMPLETED', progress: 100, assetId: newAsset.id } : i));
            debugLogger(`Client processing completed for ${item.file.name}`);
          } catch (clientErr: any) {
            debugLogger(`Client processing failed for ${item.file.name}: ${clientErr.message}`, 'error');
            throw clientErr; // Will be caught by outer try-catch
          }
        }
      }
    } catch (e: any) {
      debugLogger(`Processing failed for ${item.file.name}: ${e.message}`, 'error');
      setBatchQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'ERROR', progress: 100, errorMsg: e.message || "Failed" } : i));
    } finally {
      // Schedule next item with a delay to allow GC and prevent UI blocking
      debugLogger(`Finished ${item.file.name}, scheduling next item`);
      batchProcessingTimeoutRef.current = setTimeout(() => processNextBatchItem(), 200);
    }
    
  }, [isOnline, selectedScanType, user, debugLogger, startUploadTracking, completeUploadTracking]);

  const asText = (value: unknown, fallback = ''): string =>
    typeof value === 'string' ? value : fallback;

  const truncateText = (value: unknown, length: number): string => {
    if (typeof value !== 'string') return '';
    return value.slice(0, length);
  };

  const thumbnailBlobUrlRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    return () => {
      thumbnailBlobUrlRef.current.forEach((url) => URL.revokeObjectURL(url));
      thumbnailBlobUrlRef.current.clear();
    };
  }, []);

  const getBlobThumbnailUrl = useCallback((asset: DigitalAsset): string => {
    if (!asset.imageBlob) return '';
    const existing = thumbnailBlobUrlRef.current.get(asset.id);
    if (existing) return existing;
    const blobUrl = URL.createObjectURL(asset.imageBlob);
    thumbnailBlobUrlRef.current.set(asset.id, blobUrl);
    return blobUrl;
  }, []);

  const isUsableImageUrl = useCallback((value: unknown): value is string => {
    if (typeof value !== 'string' || !value.trim()) return false;
    // blob: URLs are valid within the current session (loadAssets regenerates them
    // from stored imageBlobs and clears dead ones on startup)
    return /^(https?:|blob:|data:)/i.test(value);
  }, []);

  const attemptedSignedUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id || assets.length === 0) return;

    const unresolvedIds = assets
      .filter((asset) => {
        if (attemptedSignedUrlsRef.current.has(asset.id)) return false;
        if (!asset.sqlRecord) return false;
        // Cloud-fetched assets don't include imageBlob; proactively hydrate a signed URL
        // even if they have an http URL, because many historical ORIGINAL_IMAGE_URL values
        // are stale/private and fail at render time.
        return !asset.imageBlob;
      })
      .map((asset) => asset.id);

    if (unresolvedIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const BATCH_SIZE = 80;
      for (let index = 0; index < unresolvedIds.length; index += BATCH_SIZE) {
        if (cancelled) return;
        const batchIds = unresolvedIds.slice(index, index + BATCH_SIZE);
        batchIds.forEach((id) => attemptedSignedUrlsRef.current.add(id));
        const result = await downloadService.getPreviewUrls(batchIds);
        if (cancelled) return;
        if (result && Object.keys(result).length > 0) {
          setSignedPreviewUrls((prev) => ({ ...prev, ...result }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assets, user?.id, isUsableImageUrl]);

  const getThumbnailSrc = useCallback((asset: DigitalAsset): string => {
    // 1. Best: fresh blob URL from stored imageBlob (always valid within current session)
    const blobUrl = getBlobThumbnailUrl(asset);
    if (blobUrl) return blobUrl;
    // 2. Signed URL from storage (generated for this session)
    const signed = signedPreviewUrls[asset.id];
    if (isUsableImageUrl(signed)) return signed;
    // 3. Persisted http(s) imageUrl
    if (isUsableImageUrl(asset.imageUrl)) return asset.imageUrl;
    // 4. Database ORIGINAL_IMAGE_URL
    const originalUrl = typeof asset.sqlRecord?.ORIGINAL_IMAGE_URL === 'string'
      ? asset.sqlRecord.ORIGINAL_IMAGE_URL
      : '';
    if (isUsableImageUrl(originalUrl)) return originalUrl;
    // 5. Inline placeholder SVG
    return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%234A5568" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
  }, [getBlobThumbnailUrl, isUsableImageUrl, signedPreviewUrls]);

  const handleThumbnailError = useCallback(async (event: React.SyntheticEvent<HTMLImageElement>, asset: DigitalAsset) => {
    const img = event.currentTarget;
    const currentSrc = img.src;

    // Collect all viable candidates, try each in order
    const blobUrl = getBlobThumbnailUrl(asset);
    const signed = signedPreviewUrls[asset.id] || '';
    const originalUrl = typeof asset.sqlRecord?.ORIGINAL_IMAGE_URL === 'string'
      ? asset.sqlRecord.ORIGINAL_IMAGE_URL
      : '';

    const candidates = [blobUrl, signed, asset.imageUrl, originalUrl].filter(
      (c): c is string => typeof c === 'string' && c.length > 0 && c !== currentSrc && !c.startsWith('data:')
    );

    const nextSrc = candidates[0];
    if (nextSrc) {
      img.src = nextSrc;
      return;
    }

    // Last resort: request a fresh signed URL from storage
    if (user?.id && !signedPreviewPendingRef.current.has(asset.id)) {
      signedPreviewPendingRef.current.add(asset.id);
      try {
        const refreshed = await downloadService.getPreviewUrl(asset.id);
        if (refreshed && refreshed !== currentSrc) {
          setSignedPreviewUrls((prev) => ({ ...prev, [asset.id]: refreshed }));
          img.src = refreshed;
          return;
        }
      } catch {
        // no-op; fallback below
      } finally {
        signedPreviewPendingRef.current.delete(asset.id);
      }
    }

    img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%234A5568" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
  }, [getBlobThumbnailUrl, signedPreviewUrls, user?.id]);

  // MEMOIZED: Prevent expensive aggregation on every render (e.g. tab switch)
  const aggregatedGroups = useMemo(() => {
    const groups: Record<string, DigitalAsset[]> = {};
    assets.forEach(asset => {
        let key = 'Unknown';
        if (groupBy === 'SOURCE') key = asText(asset.sqlRecord?.SOURCE_COLLECTION, 'Unknown') || 'Unknown';
        if (groupBy === 'ZONE') key = asText(asset.sqlRecord?.LOCAL_GIS_ZONE, 'Unknown') || 'Unknown';
        if (groupBy === 'CATEGORY') key = asText(asset.sqlRecord?.NLP_NODE_CATEGORIZATION, 'Uncategorized') || 'Uncategorized';
        if (groupBy === 'RIGHTS') key = asText(asset.sqlRecord?.RIGHTS_STATEMENT, 'Unknown') || 'Unknown';
        if (!groups[key]) groups[key] = [];
        groups[key].push(asset);
    });
    return groups;
  }, [assets, groupBy]);

  // MEMOIZED: Prevent drilldown calculation on every render
  const drillDownAssets = useMemo(() => 
    selectedGroupKey ? (aggregatedGroups[selectedGroupKey] || []) : assets
  , [aggregatedGroups, selectedGroupKey, assets]);

  // MEMOIZED: Pagination only runs when page or assets change
  const paginatedAssets = useMemo(() => 
    drillDownAssets.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
  , [drillDownAssets, currentPage]);

  const assetsById = useMemo(() => {
    const map: Record<string, DigitalAsset> = {};
    assets.forEach((asset) => {
      const signed = signedPreviewUrls[asset.id];
      map[asset.id] = signed ? { ...asset, imageUrl: signed } : asset;
    });
    return map;
  }, [assets, signedPreviewUrls]);

  const marketItems = useMemo<ImageBundle[]>(() => {
    return displayItems.flatMap((item) => {
      if ('bundleId' in item) return [item as ImageBundle];
      const asset = item as DigitalAsset;
      if (!asset.sqlRecord) return [];
      try {
        return [createUserBundle([asset], asset.sqlRecord?.DOCUMENT_TITLE || 'Single Asset Bundle')];
      } catch {
        return [];
      }
    });
  }, [displayItems]);

  // PERF v2.15.6: globalGraphData computed in a Web Worker.
  // The previous useMemo ran ~30,000-42,000 string operations synchronously
  // on the main thread (5-10s on mobile per invocation, triggered 2-3× during
  // init as `assets` changes).  Moving to a worker keeps the UI responsive.
  const [globalGraphData, setGlobalGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const graphWorkerRef = useRef<Worker | null>(null);
  const graphGenRef = useRef(0);
  const prevGraphInputKeyRef = useRef('');

  // Create / destroy graph worker with component lifecycle
  useEffect(() => {
    try {
      graphWorkerRef.current = new Worker(
        new URL('./workers/graphDataWorker.ts', import.meta.url),
        { type: 'module' }
      );
    } catch {
      graphWorkerRef.current = null;
    }
    return () => {
      graphWorkerRef.current?.terminate();
      graphWorkerRef.current = null;
    };
  }, []);

  // Post asset data to worker whenever assets or graphFilters change
  useEffect(() => {
    const worker = graphWorkerRef.current;
    if (!worker || assets.length === 0) return;

    // Shallow key to skip redundant posts with identical data
    const inputKey = `${assets.length}:${assets[0]?.id}:${assets[assets.length - 1]?.id}:${graphFilters.category}:${graphFilters.era}:${graphFilters.contested}`;
    if (inputKey === prevGraphInputKeyRef.current) return;
    prevGraphInputKeyRef.current = inputKey;

    const gen = ++graphGenRef.current;

    // Strip to ONLY the fields the graph worker needs — reduces structured
    // clone cost from ~2MB (full sqlRecord) to ~200KB (7 fields).
    const minAssets = assets.map(a => {
      const r = a.sqlRecord;
      return {
        id: a.id,
        sqlRecord: r ? {
          NLP_NODE_CATEGORIZATION: r.NLP_NODE_CATEGORIZATION,
          NLP_DERIVED_TIMESTAMP: r.NLP_DERIVED_TIMESTAMP,
          DOCUMENT_DESCRIPTION: r.DOCUMENT_DESCRIPTION,
          ACCESS_RESTRICTIONS: r.ACCESS_RESTRICTIONS,
          DOCUMENT_TITLE: r.DOCUMENT_TITLE,
          DATA_LICENSE: r.DATA_LICENSE,
          STRUCTURED_KNOWLEDGE_GRAPH: r.STRUCTURED_KNOWLEDGE_GRAPH,
        } : null,
        graphData: a.graphData,
      };
    });

    worker.onmessage = (e: MessageEvent<{ gen: number; graphData: GraphData }>) => {
      if (e.data.gen !== gen) return; // stale result
      setGlobalGraphData(e.data.graphData);
    };

    worker.postMessage({ gen, assets: minAssets, graphFilters });
  }, [assets, graphFilters]);

  if (!isAppReady) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#020617', color: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ width: '48px', height: '48px', border: '3px solid #334155', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '16px', color: '#94a3b8', fontSize: '14px' }}>Loading GeoGraph...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <FilterProvider initialAssets={assets} initialGraphData={globalGraphData}>
    <div className="flex h-[100dvh] w-full bg-slate-950 text-slate-200 overflow-hidden font-sans selection:bg-primary-500/30 relative" style={{ maxWidth: '100vw', overflowX: 'hidden' }}>
      
      {/* #11: SW update notification — non-blocking, user-controlled */}
      {swUpdateAvailable && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-primary-700 text-white text-xs flex items-center justify-between px-4 py-2" role="alert">
          <span>A new version of GeoGraph is available.</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                navigator.serviceWorker.ready.then(reg => {
                  reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
                });
                setTimeout(() => window.location.reload(), 500);
              }}
              className="px-3 py-1 bg-white text-primary-700 rounded font-bold text-xs hover:bg-primary-100"
            >Update Now</button>
            <button onClick={() => setSwUpdateAvailable(false)} className="text-primary-200 hover:text-white" aria-label="Dismiss"><X size={14} /></button>
          </div>
        </div>
      )}

      {/* #12: Offline state banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[99] bg-amber-800/90 backdrop-blur-sm text-amber-100 text-xs flex items-center gap-2 px-4 py-2" role="status">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Offline — {localAssets.filter(a => a.status === AssetStatus.PENDING || a.status === AssetStatus.PROCESSING).length} queued
          &nbsp;capture{localAssets.filter(a => a.status === AssetStatus.PENDING || a.status === AssetStatus.PROCESSING).length !== 1 ? 's' : ''}{' '}
          will upload automatically when connection is restored.
        </div>
      )}
      
      {/* Sidebar - Desktop */}
      <div className="hidden lg:flex w-64 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex-col">
        <div className="p-6">
          <div className="flex items-center gap-2 text-primary-500 mb-1">
            <Database size={24} />
            <h1 className="text-xl font-bold tracking-tight text-white">GeoGraph<span className="text-slate-500">Node</span></h1>
          </div>
          <p className="text-xs text-slate-500">OCR • GIS • Graph • NFT</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto custom-scrollbar">
          <SidebarItem icon={Layers} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => switchTab('dashboard')} />
          <SidebarItem icon={Zap} label="Quick Processing" active={activeTab === 'batch'} onClick={() => switchTab('batch')} />
          <SidebarItem icon={Scan} label="AR Scanner" active={activeTab === 'ar'} onClick={() => switchTab('ar')} />
          <SidebarItem icon={ImageIcon} label="Assets & Bundles" active={activeTab === 'assets'} onClick={() => switchTab('assets')} />
          <SidebarItem icon={ShieldCheck} label="Curator Mode" active={activeTab === 'curator'} onClick={() => switchTab('curator')} />
          <SidebarItem icon={Network} label="Explore" active={activeTab === 'explore'} onClick={() => switchTab('explore')} />
          <SidebarItem icon={TableIcon} label="Structured DB" active={activeTab === 'database'} onClick={() => switchTab('database')} />
          <SidebarItem icon={Users} label="Social Hub" active={activeTab === 'social'} onClick={() => switchTab('social')} />
          <SidebarItem icon={ShoppingBag} label="Marketplace" active={activeTab === 'market'} onClick={() => switchTab('market')} />
          {isAdmin && <SidebarItem icon={ShieldCheck} label="Review Queue" active={activeTab === 'review'} onClick={() => switchTab('review')} />}
          <div className="pt-4 mt-4 border-t border-slate-800">
             <SidebarItem icon={Sliders} label="Dynamic Filters" active={showUnifiedFilters} onClick={() => setShowUnifiedFilters(!showUnifiedFilters)} />
             <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => switchTab('settings')} />
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800">
            <div className={`p-3 rounded-xl border transition-all ${isGlobalView ? 'bg-indigo-900/20 border-indigo-500/50' : 'bg-slate-900 border-slate-800'}`}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase text-slate-400">View Mode</span>
                    <div className="flex items-center gap-1">
                        {isGlobalView && <Globe size={12} className="text-indigo-400" />}
                        {isGlobalView ? <span className="text-[10px] text-indigo-400 font-bold">GLOBAL</span> : <span className="text-[10px] text-slate-500">LOCAL</span>}
                    </div>
                </div>
                
                <button 
                    onClick={() => setIsGlobalView(!isGlobalView)}
                    className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                        isGlobalView 
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/50' 
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                    }`}
                >
                    {isGlobalView ? <>Switch to Local <Lock size={12}/></> : <>Switch to Master <Globe size={12}/></>}
                </button>
            </div>
        </div>

        <div className="p-4 border-t border-slate-800">
           <div className="bg-slate-800/50 rounded p-3 text-xs text-slate-400">
             <div className="flex items-center justify-between mb-2">
               <span>Geo Location</span>
               <span className={geoPermission ? 'text-green-500' : 'text-amber-500'}>●</span>
             </div>
             <div className="flex items-center justify-between">
               <span>{selectedLLM}</span>
               <span className={llmStatus === 'connected' ? 'text-green-500' : llmStatus === 'error' ? 'text-red-500' : 'text-slate-600'}>●</span>
             </div>
           </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-14 sm:h-16 border-b border-slate-800 flex items-center justify-between px-3 sm:px-4 lg:px-8 bg-slate-950/80 backdrop-blur z-10" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                <MobileNavigation 
                  activeTab={activeTab} 
                  switchTab={switchTab} 
                />
                <h2 className="text-lg font-semibold text-white capitalize hidden sm:block">
                  {activeTab === 'database' ? (isGlobalView ? 'CLOUD DATAFRAMES' : 'LOCAL DATAFRAMES')
                    : activeTab === 'explore' ? (exploreSubTab === 'graph' ? 'Knowledge Graph' : exploreSubTab === '3d' ? '3D World' : 'Semantic Canvas')
                    : activeTab}
                </h2>
                {/* Compact LOCAL/MASTER toggle — lightweight, always accessible */}
                <div className="hidden sm:flex items-center bg-slate-900 rounded-lg p-1 border border-slate-800 ml-1">
                    <button 
                        onClick={() => setIsGlobalView(false)}
                        className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${!isGlobalView ? 'bg-primary-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        LOCAL
                    </button>
                    <button 
                        onClick={() => setIsGlobalView(true)}
                        className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${isGlobalView ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        MASTER
                    </button>
                </div>
            </div>
          <div
            className="flex items-center gap-1.5 sm:gap-2 min-w-0 max-w-[56vw] sm:max-w-none overflow-x-auto sm:overflow-visible touch-pan-x"
            style={{ scrollbarWidth: 'none' }}
          >
             {/* Queue Status Button - ALWAYS VISIBLE */}
             <button 
               onClick={() => toggleQueuePanel('header')}
                 className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full border transition-all ${
                   showProcessingPanel 
                     ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' 
                     : totalPendingCount > 0 || stuckAssetsCount > 0
                       ? 'bg-amber-900/30 border-amber-600/50 text-amber-400 hover:bg-amber-900/50'
                       : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                 }`}
                 title="Processing Queue (Q)"
             >
                 {totalPendingCount > 0 || stuckAssetsCount > 0 ? (
                   <>
                     <div className={`w-2 h-2 rounded-full bg-amber-500 ${isProcessing ? 'animate-pulse' : ''}`}></div>
                     <span className="hidden sm:inline text-xs font-bold">
                       {totalPendingCount > 0 ? `${totalPendingCount} PENDING` : `${stuckAssetsCount} STUCK`}
                     </span>
                   </>
                 ) : (
                   <>
                     <CheckCircle size={14} className="text-emerald-500" />
                     <span className="hidden sm:inline text-xs font-medium">Queue</span>
                   </>
                 )}
             </button>
             {activeTab !== 'batch' && activeTab !== 'ar' && (
                <>
                  <CameraCapture 
                    onCapture={(file) => ingestFile(file, isGlobalView ? "Global Contribution" : "Mobile Camera", false)} 
                    isOnline={isOnline}
                    zoomEnabled={zoomEnabled}
                  />
                    <label className={`flex-shrink-0 flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 ${isGlobalView ? 'bg-indigo-900/40 border-indigo-500/50 hover:bg-indigo-900/60' : 'bg-slate-800 hover:bg-slate-700 border-slate-700'} border text-slate-200 text-sm font-medium rounded-lg cursor-pointer transition-all ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                      {isProcessing ? <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div> : <Upload size={18} />}
                      <span className="hidden sm:inline">{isGlobalView ? 'Contribute' : 'Upload'}</span>
                      <input type="file" className="hidden" accept="image/*, application/pdf" onChange={(e) => e.target.files?.[0] && ingestFile(e.target.files[0], isGlobalView ? "Global Contribution" : "Direct Upload")} disabled={isProcessing} />
                  </label>
                </>
             )}
             {isGlobalView && (
                  <button 
                    onClick={refreshGlobalData}
                    disabled={isProcessing}
                    className="flex-shrink-0 flex items-center gap-2 px-2.5 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                 >
                     <RefreshCw size={18} className={isProcessing ? 'animate-spin' : ''} />
                     <span className="hidden sm:inline">Refresh Cloud</span>
                 </button>
             )}
             <button 
                onClick={() => setActiveTab('settings')}
               className={`flex-shrink-0 p-2 rounded-full border transition-all ${user ? 'bg-primary-900/20 border-primary-500/50 text-primary-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
             >
                <User size={20} />
             </button>
          </div>
        </header>

        {/* PWA Install Banner — shown in browser mode on mobile, hidden once installed or dismissed */}
        {!isStandaloneMode && !installBannerDismissed && (
          <div className="flex lg:hidden items-center gap-2 px-3 py-2 bg-primary-900/80 border-b border-primary-700/50 text-xs text-primary-100">
            <Download size={13} className="flex-shrink-0 text-primary-300" />
            <span className="flex-1 min-w-0">
              {isInstallPromptAvailable
                ? 'Install app to hide the browser bar'
                : 'Add to Home Screen to hide the browser bar'}
            </span>
            {isInstallPromptAvailable ? (
              <button
                onClick={() => { handleInstallPWA(); setInstallBannerDismissed(true); try { localStorage.setItem('geograph-install-banner-dismissed','1'); } catch {} }}
                disabled={isInstallingPWA}
                className="flex-shrink-0 px-2 py-0.5 bg-primary-600 hover:bg-primary-500 rounded font-semibold disabled:opacity-50"
              >
                {isInstallingPWA ? 'Installing…' : 'Install'}
              </button>
            ) : (
              <span className="flex-shrink-0 text-primary-400 text-[10px]">⋮ → Add to Home Screen</span>
            )}
            <button
              onClick={() => { setInstallBannerDismissed(true); try { localStorage.setItem('geograph-install-banner-dismissed','1'); } catch {} }}
              className="flex-shrink-0 p-1 text-primary-400 hover:text-white"
              aria-label="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 pb-28 sm:pb-20 relative">
          
          {activeTab === 'dashboard' && (
            <div className="space-y-5 sm:space-y-6 lg:space-y-8 max-w-6xl mx-auto">
              {/* Processing Queue Status - deferred to prevent cold-start Supabase calls */}
              <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 border border-slate-700 rounded-xl p-4 sm:p-5 shadow-lg">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h3 className="text-white font-bold flex items-center gap-2">
                    <Server size={18} className="text-primary-500" />
                    Processing Queue Status
                  </h3>
                  <button 
                    onClick={() => setShowProcessingPanel(true)}
                    className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                  >
                    Open Full Panel <ChevronRight size={14} />
                  </button>
                </div>
                {user?.id ? (
                  showDashboardQueue ? (
                    <QueueMonitor userId={user.id} onRequeueComplete={() => {
                      loadAssets().then(loaded => setLocalAssets(loaded));
                    }} uploadProgress={uploadProgress} />
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 px-1">
                      <span className="text-sm text-slate-400">
                        {totalPendingCount > 0
                          ? `${totalPendingCount} item${totalPendingCount !== 1 ? 's' : ''} pending`
                          : 'Queue is clear'}
                      </span>
                      <button
                        onClick={() => setShowDashboardQueue(true)}
                        className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 px-3 py-1.5 bg-slate-800 rounded-lg"
                      >
                        <Activity size={12} />
                        Expand Queue
                      </button>
                    </div>
                  )
                ) : (
                  <div className="text-center py-6 text-slate-400">
                    <User size={32} className="mx-auto mb-2 text-slate-600" />
                    <p className="text-sm mb-2">Login to enable server-side processing</p>
                    <p className="text-xs text-slate-500">
                      {totalPendingCount > 0 && `${totalPendingCount} items waiting locally`}
                    </p>
                    <button 
                      onClick={() => setActiveTab('settings')}
                      className="mt-3 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold rounded-lg"
                    >
                      Login / Sign Up
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                  <p className="text-[10px] uppercase text-slate-500">Sync Queue</p>
                  <p className="text-lg font-bold text-white">{syncQueuedCount}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                  <p className="text-[10px] uppercase text-slate-500">Structured Complete</p>
                  <p className="text-lg font-bold text-emerald-400">{structuredCompleteCount}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                  <p className="text-[10px] uppercase text-slate-500">Failure Signals</p>
                  <p className="text-lg font-bold text-rose-400">{syncFailureCount}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
                <StatCard label="Total Assets" value={assets.length} icon={FileText} color="text-blue-500" onClick={() => setActiveTab('assets')} />
                <StatCard label="Knowledge Nodes" value={knowledgeNodeCount} icon={Network} color="text-purple-500" onClick={() => { setActiveTab('explore'); setExploreSubTab('graph'); }} />
                <StatCard label="Training Tokens" value={totalTokens.toLocaleString()} icon={Cpu} color="text-emerald-500" onClick={() => setActiveTab('database')} />
                <StatCard label="Active Bundles" value={displayItems.filter(i => 'bundleId' in i).length} icon={Package} color="text-amber-500" onClick={() => setActiveTab('market')} />
              </div>

              <SmartSuggestions 
                user={user}
                localAssetCount={localAssets.length}
                syncEnabled={syncOn}
                web3Enabled={web3Enabled}
                scannerConnected={scannerConnected}
                onAction={(tab) => setActiveTab(tab)}
                pendingCount={totalPendingCount}
                processingCount={batchQueue.filter(b => b.status === 'PROCESSING').length}
                geminiConnected={true}
                supabaseConnected={isOnline}
                recentActivity={batchQueue.length > 0 ? 'upload' : null}
                onOpenIntegrationsHub={() => setShowIntegrationsHub(true)}
              />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <h3 className="text-white font-bold flex items-center gap-2">
                      <CloudDownload size={16} className="text-blue-400" />
                      Upload / Download Activity
                    </h3>
                    <button
                      onClick={() => downloadService.cancelAll()}
                      disabled={activeDownloads.length === 0}
                      className="text-[11px] px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg"
                    >
                      Cancel Active Downloads
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Cloud Upload Queueing</p>
                      <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                        <span>{uploadProgress.total > 0 ? `${uploadProgress.current}/${uploadProgress.total} queued` : 'No active uploads'}</span>
                        {uploadProgress.total > 0 && (
                          <span className="text-blue-400 font-mono">{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
                        )}
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300"
                          style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Binary Downloads</p>
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span>{activeDownloads.length} active</span>
                        <span>{failedDownloads} failed</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">Includes image/file transfer progress and cancellation.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {assets.slice(0, 3).map(asset => {
                      const downloadState = downloadProgressByAsset[asset.id];
                      const isDownloading = downloadState?.status === 'downloading';
                      const progressPercent = downloadState?.total
                        ? Math.min(100, Math.round((downloadState.loaded / downloadState.total) * 100))
                        : 0;

                      return (
                        <div key={asset.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm text-slate-200 truncate">{asset.sqlRecord?.DOCUMENT_TITLE || `Asset ${truncateText(asset.id, 8)}`}</p>
                              <p className="text-[10px] text-slate-500">{downloadState?.status ? `Status: ${downloadState.status}` : 'Ready to download'}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              <button
                                onClick={() => handleAssetDownload(asset, 'image')}
                                className="px-2.5 py-1.5 text-[11px] bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
                              >
                                Download File
                              </button>
                              <button
                                onClick={() => handleAssetDownload(asset, 'json')}
                                className="px-2.5 py-1.5 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                              >
                                JSON
                              </button>
                              {isDownloading && (
                                <button
                                  onClick={() => handleCancelDownload(asset.id)}
                                  className="px-2.5 py-1.5 text-[11px] bg-rose-900/50 hover:bg-rose-900 text-rose-300 rounded-lg"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </div>
                          {isDownloading && (
                            <div className="mt-2">
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 transition-all duration-200" style={{ width: `${progressPercent}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {activeDownloads.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-800">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Live Download Queue</p>
                      <div className="space-y-2">
                        {activeDownloads.slice(0, 4).map(item => (
                          <div key={item.assetId} className="flex items-center justify-between gap-3 text-xs bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-slate-300 truncate">{item.filename}</p>
                              <p className="text-[10px] text-slate-500">{Math.round(item.progress)}%</p>
                            </div>
                            <button
                              onClick={() => handleCancelDownload(item.assetId)}
                              className="px-2 py-1 text-[10px] bg-rose-900/50 hover:bg-rose-900 text-rose-300 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-white font-bold flex items-center gap-2 mb-3">
                    <Server size={16} className="text-emerald-400" />
                    EDGE Runtime
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Connectivity</span>
                      <span className={isOnline ? 'text-emerald-400' : 'text-rose-400'}>{isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Server Queue Ready</span>
                      <span className={queueDiagnostics?.canProcessServer ? 'text-emerald-400' : 'text-amber-400'}>
                        {queueDiagnostics?.canProcessServer ? 'Ready' : 'Limited'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Supabase</span>
                      <span className={queueDiagnostics?.supabaseConfigured ? 'text-emerald-400' : 'text-rose-400'}>
                        {queueDiagnostics?.supabaseConfigured ? 'Configured' : 'Missing'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Session</span>
                      <span className={user?.id ? 'text-emerald-400' : 'text-amber-400'}>{user?.id ? 'Authenticated' : 'Guest'}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-500">
                      {isStandaloneMode
                        ? 'Running in app mode. Browser URL/share chrome is minimized by install mode.'
                        : 'Browser chrome is controlled by mobile browser. Install to Home Screen for app-like fullscreen mode.'}
                    </div>
                    {!isStandaloneMode && isInstallPromptAvailable && (
                      <button
                        onClick={handleInstallPWA}
                        disabled={isInstallingPWA}
                        className="mt-2 w-full px-3 py-2 text-[11px] font-semibold bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-lg disabled:opacity-60"
                      >
                        {isInstallingPWA ? 'Opening install prompt…' : 'Install App Mode'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {assets.length === 0 ? (
                <div className="h-64 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500 gap-4">
                    <Globe size={48} className="mx-auto mb-4 text-slate-600" />
                    <p>{isGlobalView ? 'Global Corpus is empty.' : 'Upload items to begin extraction.'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-white font-medium mb-4 flex items-center gap-2"><Network size={18} className="text-primary-500"/> Recent Graph Activity</h3>
                    {assets[0].graphData && <GraphVisualizer data={assets[0].graphData} height={300} width={500} />}
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-white font-medium flex items-center gap-2"><MapIcon size={18} className="text-emerald-500"/> GIS Context</h3>
                        {assets.some(a => !a.processingAnalysis || a.status === AssetStatus.PROCESSING) && (
                            <button 
                                onClick={async () => {
                                    const pending = assets.filter(a => !a.processingAnalysis || a.status === AssetStatus.PROCESSING).slice(0, 5);
                                    for (const asset of pending) {
                                        await resumeAsset(asset);
                                    }
                                }}
                                disabled={isProcessing}
                                className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded font-bold transition-all disabled:opacity-50 flex items-center gap-1"
                            >
                                <RefreshCw size={10} className={isProcessing ? 'animate-spin' : ''} />
                                Process All
                            </button>
                        )}
                    </div>
                    <div className="space-y-4">
                        {assets.slice(0, 3).map(asset => (
                            <div key={asset.id} className="flex items-start gap-4 p-3 rounded bg-slate-950/50 border border-slate-800 group relative">
                                <img src={getThumbnailSrc(asset)} className="w-16 h-16 object-cover rounded" alt="thumb" onError={(e) => handleThumbnailError(e, asset)} />
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <h4 className="text-sm font-bold text-slate-200">{asset.gisMetadata?.zoneType || 'Processing...'}</h4>
                                        <div className="flex gap-1">
                                            {asset.gisMetadata?.zoneType && (
                                                <button 
                                                    onClick={async () => {
                                                        const resetAsset = {
                                                            ...asset,
                                                            status: AssetStatus.PENDING,
                                                            processingAnalysis: '',
                                                            gisMetadata: undefined,
                                                            sqlRecord: {
                                                                ...asset.sqlRecord!,
                                                                PROCESSING_STATUS: AssetStatus.PENDING,
                                                                LOCAL_GIS_ZONE: 'Unknown',
                                                                OCR_DERIVED_GIS_ZONE: null,
                                                                NLP_DERIVED_GIS_ZONE: null
                                                            }
                                                        };
                                                        handleAssetUpdate(resetAsset);
                                                        await resumeAsset(resetAsset);
                                                    } }
                                                    disabled={isProcessing}
                                                    className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded font-bold transition-all disabled:opacity-50"
                                                    title="Reset and Re-process"
                                                >
                                                    Reset
                                                </button>
                                            )}
                                            {(!asset.processingAnalysis || asset.status === AssetStatus.PROCESSING) && (
                                                <button 
                                                    onClick={() => resumeAsset(asset)}
                                                    disabled={isProcessing}
                                                    className="text-[10px] bg-primary-600 hover:bg-primary-500 text-white px-2 py-1 rounded font-bold transition-all disabled:opacity-50"
                                                >
                                                    {isProcessing ? '...' : 'Retry'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{asset.processingAnalysis || 'Waiting for AI analysis...'}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'curator' && (
            <div className="space-y-4 sm:space-y-6 max-w-6xl mx-auto h-full flex flex-col">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-2xl font-bold text-white">Curator Mode</h3>
                  <p className="text-xs sm:text-sm text-slate-400 truncate">Manage bundles and refine annotations.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* Cluster Sync Statistics Button - Human-in-the-Loop Overview */}
                  <Suspense fallback={<div className="h-9 w-32 bg-slate-800 rounded-lg animate-pulse" />}>
                  <ClusterSyncButton 
                    onClick={() => setShowClusterSyncStats(true)}
                    stats={{
                      structured: assets.filter(a => 
                        a.sqlRecord?.STRUCTURED_TEMPORAL && 
                        a.sqlRecord?.STRUCTURED_SPATIAL && 
                        a.sqlRecord?.STRUCTURED_CONTENT && 
                        a.sqlRecord?.STRUCTURED_KNOWLEDGE_GRAPH && 
                        a.sqlRecord?.STRUCTURED_PROVENANCE && 
                        a.sqlRecord?.STRUCTURED_DISCOVERY
                      ).length,
                      total: assets.length
                    }}
                  />
                  </Suspense>
                  <FilterBadge count={0} onClick={() => setShowUnifiedFilters(true)} />
                  {selectedAssetIds.size > 0 && (
                    <button 
                      onClick={handleManualBundle}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-bold transition-all"
                    >
                      <Package size={18} />
                      Bundle Selected ({selectedAssetIds.size})
                    </button>
                  )}
                  <button 
                    onClick={() => setSelectedAssetIds(new Set())}
                    className="px-3 sm:px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs sm:text-sm font-medium"
                  >
                    Clear
                  </button>
                </div>
              </div>
              
              {/* Inline Filter Bar for Curator Mode */}
              <InlineFilterBar activeView="curator" />

              <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-400 uppercase">Asset Curation Queue</h4>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-slate-500 font-mono">{assets.length} TOTAL ASSETS</span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 border-b border-slate-800 w-10"></th>
                        {['Preview', 'Title', 'Collection', 'Status', 'Annotated', 'Action'].map(h => (
                          <th key={h} className={`px-2 sm:px-4 py-2 sm:py-3 text-[10px] font-bold text-slate-400 uppercase border-b border-r border-slate-800 whitespace-nowrap bg-slate-950 ${(h === 'Collection' || h === 'Annotated') ? 'hidden sm:table-cell' : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {assets.map(asset => (
                        <tr 
                          key={asset.id} 
                          className={`hover:bg-slate-800/50 transition-colors text-xs font-mono ${selectedAssetIds.has(asset.id) ? 'bg-primary-900/10' : ''}`}
                        >
                          <td className="px-4 py-3 border-b border-slate-800">
                            <input 
                              type="checkbox" 
                              checked={selectedAssetIds.has(asset.id)}
                              onChange={() => {
                                const next = new Set(selectedAssetIds);
                                if (next.has(asset.id)) next.delete(asset.id);
                                else next.add(asset.id);
                                setSelectedAssetIds(next);
                              }}
                              className="rounded border-slate-700 bg-slate-800 text-primary-600 focus:ring-primary-500"
                            />
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 border-r border-slate-800">
                            <img src={getThumbnailSrc(asset)} alt="Preview" className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded border border-slate-700" onError={(e) => handleThumbnailError(e, asset)} />
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-white border-r border-slate-800 font-bold truncate max-w-[120px] sm:max-w-none">{asset.sqlRecord?.DOCUMENT_TITLE || 'Untitled'}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-blue-400 border-r border-slate-800 hidden sm:table-cell">{asset.sqlRecord?.SOURCE_COLLECTION || 'Unsorted'}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 border-r border-slate-800">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${asset.status === AssetStatus.MINTED ? 'bg-green-500/20 text-green-500' : 'bg-amber-500/20 text-amber-500'}`}>
                              {asset.status}
                            </span>
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 border-r border-slate-800 text-center hidden sm:table-cell">
                            {asset.sqlRecord?.IS_USER_ANNOTATED ? (
                              <CheckCircle size={16} className="text-green-500 mx-auto" />
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                            <button 
                              onClick={() => setEditingAsset(asset)}
                              className="px-2 sm:px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold border border-slate-700"
                            >
                              <span className="hidden sm:inline">EDIT ANNOTATIONS</span>
                              <span className="sm:hidden">EDIT</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'database' && (
             <ErrorBoundary
               fallback={({ resetError }) => (
                 <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                   <AlertCircle size={32} className="text-rose-500" />
                   <p className="text-sm">The database view encountered an error.</p>
                   <button
                     onClick={() => { resetError(); setCurrentPage(1); setDbViewMode('DRILLDOWN'); setSelectedGroupKey(null); }}
                     className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-xs rounded-lg"
                   >Reset View</button>
                 </div>
               )}
             >
             <div className="h-full flex flex-col gap-4">
               {/* Processing Queue Status Banner for Master View */}
               {user?.id && isGlobalView && (
                 <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                   <QueueMonitor userId={user.id} onRequeueComplete={() => {
                     loadAssets().then(loaded => setLocalAssets(loaded));
                   }} uploadProgress={uploadProgress} />
                 </div>
               )}
               
               <div className="flex flex-col md:flex-row justify-between items-end bg-slate-900 p-4 rounded-xl border border-slate-800 gap-4">
                   <div className="space-y-1">
                      <h3 className="text-white font-bold flex items-center gap-2">
                          <Database size={18} className="text-primary-500" /> 
                          {isGlobalView ? 'Master Cloud Dataframes' : 'Local Node Dataframes'}
                      </h3>
                      <p className="text-xs text-slate-400 flex items-center gap-2">
                         <span className="text-slate-500">View:</span> Tabular Dataframes
                         <span className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300 ml-2">{drillDownAssets.length} items</span>
                      </p>
                      {dbProcessFeedback && (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <p className={`text-[11px] ${
                          dbProcessFeedback.type === 'success'
                            ? 'text-emerald-400'
                            : dbProcessFeedback.type === 'warning'
                              ? 'text-amber-400'
                              : dbProcessFeedback.type === 'error'
                                ? 'text-rose-400'
                                : 'text-blue-400'
                        }`}>
                          Last action: {dbProcessFeedback.message}
                        </p>
                        {dbProcessFeedback.action === 'settings' && (
                          <button onClick={() => setActiveTab('settings')} className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300">Open Settings</button>
                        )}
                        {dbProcessFeedback.action === 'queue' && (
                          <button onClick={() => setShowProcessingPanel(true)} className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300">Open Queue</button>
                        )}
                        {dbProcessFeedback.action === 'releaseRetry' && (
                          <button onClick={handleReleaseStaleAndRetry} className="text-[10px] px-2 py-1 bg-orange-900/40 hover:bg-orange-900/60 rounded text-orange-300">Release & Retry</button>
                        )}
                        </div>
                      )}
                      {dbProcessRun.running && (
                        <div className="mt-2 bg-slate-950 border border-slate-800 rounded-lg p-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] text-blue-300">
                              Processing {dbProcessRun.processed}/{dbProcessRun.total}
                              {dbProcessRun.currentAssetId ? ` • ${truncateText(dbProcessRun.currentAssetId, 8)}` : ''}
                              {dbProcessRun.batchPending > 0 ? ` • batch ${dbProcessRun.batchPending}` : ''}
                            </p>
                            <span className="text-[10px] text-slate-500 uppercase">{dbProcessRun.step.replace('-', ' ')}</span>
                            <button
                              onClick={handleCancelDbProcess}
                              disabled={dbProcessRun.cancelRequested}
                              className="text-[10px] px-2 py-1 bg-rose-900/50 hover:bg-rose-900 text-rose-300 rounded disabled:opacity-60"
                            >
                              {dbProcessRun.cancelRequested ? 'Stopping…' : 'Cancel'}
                            </button>
                          </div>
                          <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-200" style={{ width: `${dbProcessRun.total > 0 ? (dbProcessRun.processed / dbProcessRun.total) * 100 : 0}%` }} />
                          </div>
                        </div>
                      )}
                      {staleProcessingEligible && !dbProcessRun.running && (
                        <button
                          onClick={handleReleaseStaleAndRetry}
                          className="mt-2 text-[11px] px-3 py-1.5 bg-orange-900/40 hover:bg-orange-900/60 text-orange-300 rounded-lg"
                        >
                          Release stale locks & retry ({dbQueueStats?.processing || 0} stuck)
                        </button>
                      )}
                   </div>
                   <div className="flex flex-wrap gap-2 sm:gap-4">
                       <FilterBadge count={groupBy !== 'SOURCE' ? 1 : 0} onClick={() => setShowUnifiedFilters(true)} />
                       <button 
                          onClick={handleProcessAllPending}
                          disabled={dbProcessRun.running}
                          className="px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-2 transition-all"
                       >
                          <Zap size={14} />
                          <span className="hidden sm:inline">{dbProcessRun.running ? 'PROCESSING…' : 'PROCESS ALL PENDING'}</span>
                          <span className="sm:hidden">{dbProcessRun.running ? '…' : 'Process'}</span>
                       </button>
                       <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                            <button onClick={() => { setDbViewMode('DRILLDOWN'); setSelectedGroupKey(null); }} className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-2 transition-colors ${dbViewMode === 'DRILLDOWN' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}><List size={14} /> Table</button>
                            <button onClick={() => setDbViewMode('GROUPS')} className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-2 transition-colors ${dbViewMode === 'GROUPS' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}><FolderOpen size={14} /> Clusters</button>
                       </div>
                       <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded border border-slate-700 min-w-0">
                           <Filter size={14} className="text-primary-500" />
                           <div className="flex-1 flex flex-col">
                              <span className="text-[9px] text-slate-500 uppercase font-bold">Grouping Feature</span>
                              <select className="bg-transparent border-none text-xs text-slate-200 focus:outline-none cursor-pointer font-bold" value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}>
                                  <option value="SOURCE">Source Collection</option>
                                  <option value="ZONE">GIS Zone</option>
                                  <option value="CATEGORY">NLP Category</option>
                                  <option value="RIGHTS">Rights Statement</option>
                              </select>
                           </div>
                       </div>
                   </div>
               </div>
               
               {/* Inline Filter Bar for Structure DB */}
               <InlineFilterBar activeView="database" />

               {dbViewMode === 'GROUPS' && (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-auto pb-4">
                    {Object.entries(aggregatedGroups).map(([groupName, groupAssets]) => (
                       <button key={groupName} onClick={() => { setSelectedGroupKey(groupName); setDbViewMode('DRILLDOWN'); setCurrentPage(1); }} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-primary-500/50 hover:bg-slate-800/50 transition-all text-left group relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><FolderOpen size={64} /></div>
                          <div className="relative z-10">
                              <div className="flex items-center gap-2 mb-2"><FolderOpen size={20} className="text-primary-500" /><span className="text-xs text-slate-500 font-mono uppercase">{groupBy} Group</span></div>
                              <h4 className="text-lg font-bold text-white mb-4 line-clamp-2">{groupName}</h4>
                              <div className="space-y-2">
                                  <div className="flex justify-between text-xs"><span className="text-slate-400">Items</span><span className="text-white font-mono">{groupAssets.length}</span></div>
                              </div>
                          </div>
                       </button>
                    ))}
                 </div>
               )}

               {dbViewMode === 'DRILLDOWN' && (
                 <div className="flex-1 overflow-auto bg-slate-900 border border-slate-800 rounded-xl shadow-inner scrollbar-thin relative">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-950 sticky top-0 z-10">
                          <tr>
                            {['ID', 'TITLE', 'COLLECTION', 'ENTITIES', 'GIS ZONE', 'NODES', 'CATEGORY', 'PROGRESS', 'ACTION'].map(h => (
                                <th key={h} className={`px-2 sm:px-4 py-2 sm:py-3 text-[10px] font-bold text-slate-400 uppercase border-b border-r border-slate-800 whitespace-nowrap bg-slate-950 ${['ENTITIES', 'GIS ZONE', 'CATEGORY'].includes(h) ? 'hidden md:table-cell' : ''}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                           {paginatedAssets.map(asset => {
                               const rec = asset.sqlRecord;
                               return (
                                   <tr key={asset.id} className="hover:bg-slate-800/50 transition-colors text-xs font-mono">
                                       <td className="px-2 sm:px-4 py-2 sm:py-3 text-slate-500 border-r border-slate-800 whitespace-nowrap">{truncateText(asset.id, 8)}</td>
                                       <td className="px-2 sm:px-4 py-2 sm:py-3 text-white border-r border-slate-800 whitespace-nowrap max-w-[120px] sm:max-w-[200px] truncate">{rec?.DOCUMENT_TITLE || 'Processing...'}</td>
                                       <td className="px-2 sm:px-4 py-2 sm:py-3 text-blue-400 border-r border-slate-800 whitespace-nowrap">{rec?.SOURCE_COLLECTION || 'Pending'}</td>
                                       <td className="px-2 sm:px-4 py-2 sm:py-3 text-slate-300 border-r border-slate-800 whitespace-nowrap truncate max-w-[150px] hidden md:table-cell">{(Array.isArray(rec?.ENTITIES_EXTRACTED) ? rec.ENTITIES_EXTRACTED : []).slice(0, 3).join(', ') || '...'}</td>
                                       <td className="px-2 sm:px-4 py-2 sm:py-3 text-emerald-400 border-r border-slate-800 hidden md:table-cell">{rec?.LOCAL_GIS_ZONE || '...'}</td>
                                       <td className="px-4 py-3 text-center border-r border-slate-800">
                                         <button
                                           onClick={() => {
                                             setSelectedAssetId(asset.id);
                                             setGraphViewMode('SINGLE');
                                             setActiveTab('explore');
                                             setExploreSubTab('graph');
                                           }}
                                           className="inline-flex items-center gap-1 text-primary-400 hover:text-white underline-offset-2 hover:underline"
                                           title="Open node/edge graph for this asset"
                                         >
                                           <Network size={10} />
                                           {rec?.NODE_COUNT || 0}
                                         </button>
                                       </td>
                                       <td className="px-2 sm:px-4 py-2 sm:py-3 border-r border-slate-800 whitespace-nowrap hidden md:table-cell">{rec?.NLP_NODE_CATEGORIZATION || '...'}</td>
                                       <td className="px-2 sm:px-4 py-2 sm:py-3 border-r border-slate-800 min-w-0 sm:min-w-[120px]">
                                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                                <div 
                                                    className={`h-full transition-all duration-500 ${asset.status === AssetStatus.FAILED ? 'bg-red-500' : asset.status === AssetStatus.MINTED ? 'bg-emerald-500' : 'bg-primary-500'}`}
                                                    style={{ width: `${asset.progress || (asset.status === AssetStatus.MINTED ? 100 : 0)}%` }}
                                                />
                                            </div>
                                       </td>
                                       <td className="px-2 sm:px-4 py-2 sm:py-3 text-center flex gap-2 justify-center">
                                            {rec && <button onClick={() => handleAssetDownload(asset, 'json')} className="text-primary-500 hover:text-white"><Download size={14} /></button>}
                                       </td>
                                   </tr>
                               )
                           })}
                        </tbody>
                    </table>
                 </div>
               )}
             </div>
          </ErrorBoundary>
          )}

          {activeTab === 'batch' && (
             <div className="max-w-6xl mx-auto h-full flex flex-col">
                {/* Server Queue Status - Always visible when logged in */}
                {user?.id && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
                    <QueueMonitor userId={user.id} onRequeueComplete={() => {
                      loadAssets().then(loaded => setLocalAssets(loaded));
                    }} uploadProgress={uploadProgress} />
                  </div>
                )}
                
                {isGlobalView && !isAdmin ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                        <div className="text-center bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl">
                            <Globe size={48} className="mb-4 text-indigo-500 mx-auto animate-pulse" />
                            <h3 className="text-xl font-bold text-white mb-2">Global Contribution Mode</h3>
                            <p className="text-sm text-slate-400 max-w-xs mx-auto mb-6">You are currently in Master view. Any files processed here will be contributed to the global knowledge corpus.</p>
                            <div className="flex gap-3 justify-center">
                                <button onClick={() => setIsGlobalView(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white text-sm font-bold transition-all">Switch to Local</button>
                                <button onClick={() => setIsAdmin(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-sm font-bold shadow-lg shadow-indigo-900/20 transition-all">Enable Contribution</button>
                            </div>
                        </div>
                    </div>
                ) : (
                  <div className="flex-1 flex flex-col">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                {isAdmin && isGlobalView ? <Radio className="text-red-500 animate-pulse" /> : <Zap className="text-amber-500" />}
                                {isAdmin && isGlobalView ? ' Admin Broadcast Console' : ' Quick Processing'}
                              </h3>
                          </div>
                          <div className="text-right">
                              <p className="text-2xl font-mono text-white">{batchQueue.filter(i => i.status === 'COMPLETED').length} <span className="text-sm text-slate-500">/ {batchQueue.length}</span></p>
                              <p className="text-xs text-slate-500">Processed</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-700 rounded-lg bg-slate-950/50 gap-4">
                            <BatchImporter onFilesSelected={handleBatchFiles} isProcessing={isProcessing} />
                        </div>
                    </div>
                    <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                            <h4 className="text-xs font-bold text-slate-400 uppercase">Processing Queue</h4>
                            <button 
                                onClick={handleProcessAllPending}
                                className="px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/30 transition-all flex items-center gap-1.5"
                            >
                                <Zap size={10} />
                                PROCESS ALL PENDING
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-950 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 text-[10px] text-slate-500 uppercase">Status</th>
                                        <th className="px-4 py-2 text-[10px] text-slate-500 uppercase">File</th>
                                        <th className="px-4 py-2 text-[10px] text-slate-500 uppercase">Progress</th>
                                        <th className="px-4 py-2 text-[10px] text-slate-500 uppercase">Message</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {batchQueue.map((item) => (
                                        <tr key={item.id} className="text-xs group hover:bg-slate-800/30">
                                            <td className="px-4 py-2">
                                                {item.status === 'COMPLETED' ? (
                                                    <CheckCircle size={14} className="text-emerald-500" />
                                                ) : item.status === 'ERROR' ? (
                                                    <AlertCircle size={14} className="text-red-500" />
                                                ) : (
                                                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-slate-300 font-mono">{item.file.name}</td>
                                            <td className="px-2 sm:px-4 py-2 min-w-0 sm:min-w-[150px]">
                                                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                                    <div 
                                                        className={`h-full transition-all duration-500 ${item.status === 'ERROR' ? 'bg-red-500' : item.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-primary-500'}`}
                                                        style={{ width: `${item.progress}%` }}
                                                    />
                                                </div>
                                            </td>
                                            <td className={`px-4 py-2 ${item.status === 'ERROR' ? 'text-red-400 font-medium' : 'text-slate-500'}`}>
                                                {item.errorMsg || item.status}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                  </div>
                )}
             </div>
          )}

          {activeTab === 'assets' && (
             <div className="h-full overflow-y-auto">
                 <div className="flex justify-between items-center mb-6">
                     <h3 className="text-lg font-bold text-white">Exploratory Analysis & Bundles</h3>
                     <div className="flex gap-3">
                        {selectedAssetIds.size > 0 && (
                            <button 
                                onClick={handleManualBundle}
                                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold rounded-lg shadow-lg flex items-center gap-2 animate-in zoom-in"
                            >
                                <Package size={18} />
                                Bundle Selected ({selectedAssetIds.size})
                            </button>
                        )}
                        <button 
                            onClick={() => setSelectedAssetIds(new Set())}
                            className={`px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold rounded-lg border border-slate-700 transition-all ${selectedAssetIds.size === 0 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                        >
                            Clear Selection
                        </button>
                     </div>
                 </div>
                 
                 {/* Processing Queue Status Banner */}
                 {user?.id && (
                   <div className="mb-6">
                     <QueueMonitor userId={user.id} onRequeueComplete={() => {
                       // Refresh assets after requeue
                       loadAssets().then(loaded => setLocalAssets(loaded));
                     }} uploadProgress={uploadProgress} />
                   </div>
                 )}
                 
                 <Suspense fallback={<div className="p-4 text-slate-500 text-sm">Loading...</div>}>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8">
                    {displayItems.map(item => ('bundleId' in item) ? <BundleCard key={item.bundleId} bundle={item as ImageBundle} assetsById={assetsById} onAssetUpdated={handleAssetUpdate} /> : (
                        <div 
                            key={item.id} 
                            className={`bg-slate-900 border rounded-xl overflow-hidden hover:shadow-lg transition-all group relative ${selectedAssetIds.has(item.id) ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-slate-800'}`}
                        >
                            <div className="absolute top-2 left-2 z-10">
                                <input 
                                    type="checkbox" 
                                    checked={selectedAssetIds.has(item.id)}
                                    onChange={() => {
                                        const newSet = new Set(selectedAssetIds);
                                        if (newSet.has(item.id)) newSet.delete(item.id);
                                        else newSet.add(item.id);
                                        setSelectedAssetIds(newSet);
                                    }}
                                    className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-primary-500 focus:ring-primary-500"
                                />
                            </div>
                            <div className="relative h-48 bg-slate-950 overflow-hidden">
                                <img src={getThumbnailSrc(item)} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="doc" onError={(e) => handleThumbnailError(e, item)} />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                    <button 
                                        onClick={() => setEditingAsset(item)}
                                        className="w-full py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs font-bold rounded border border-white/20 flex items-center justify-center gap-2"
                                    >
                                        <Settings size={14} /> Edit Annotations
                                    </button>
                                </div>
                            </div>
                            <div className="p-4">
                                <h4 className="font-bold text-white text-sm mb-1 truncate">{item.sqlRecord?.DOCUMENT_TITLE || 'Processing...'}</h4>
                                <div className="flex gap-2 mt-4">
                                    <button onClick={() => { setSelectedAssetId(item.id); setActiveTab('explore'); setExploreSubTab('graph'); }} className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded border border-slate-700">View Graph</button>
                                    <ContributeButton asset={item} onAssetUpdated={handleAssetUpdate} />
                                </div>
                            </div>
                        </div>
                     ))}
                 </div>
                 </Suspense>
             </div>
          )}

          {activeTab === 'explore' && (
            <div className="h-full flex flex-col gap-0">
              {/* Sub-tab selector */}
              <div className="flex flex-wrap items-center gap-1 px-1 pb-3 flex-shrink-0">
                <div className="flex flex-wrap bg-slate-900 p-1 rounded-lg border border-slate-800 gap-1">
                  <button
                    onClick={() => setExploreSubTab('3d')}
                    className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1 sm:gap-1.5 ${exploreSubTab === '3d' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    <Globe size={13} />
                    3D World
                  </button>
                  <button
                    onClick={() => setExploreSubTab('graph')}
                    className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1 sm:gap-1.5 ${exploreSubTab === 'graph' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    <Network size={13} />
                    Graph
                  </button>
                  <button
                    onClick={() => setExploreSubTab('semantic')}
                    className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1 sm:gap-1.5 ${exploreSubTab === 'semantic' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    <Zap size={13} />
                    <span className="hidden sm:inline">Semantic</span> Canvas
                  </button>
                </div>
                <div className="ml-auto">
                  <FilterBadge count={graphFilters.category !== 'all' || graphFilters.era !== 'all' || graphFilters.contested ? 1 : 0} onClick={() => setShowUnifiedFilters(true)} />
                </div>
              </div>

              {/* Knowledge Graph sub-view */}
              {exploreSubTab === 'graph' && (
                <div className="flex gap-6 h-full flex-col flex-1 min-h-0">
                   <div className="flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
                     <h3 className="text-base sm:text-lg font-bold text-white">Knowledge Graph</h3>
                     <div className="flex items-center gap-2 sm:gap-3">
                       <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                          <button 
                            onClick={() => setGraphViewMode('SINGLE')} 
                            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${graphViewMode === 'SINGLE' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
                          >
                            Single Asset
                          </button>
                          <button 
                            onClick={() => setGraphViewMode('GLOBAL')} 
                            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${graphViewMode === 'GLOBAL' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
                          >
                            Global Corpus
                          </button>
                       </div>
                     </div>
                   </div>
                   <InlineFilterBar activeView="graph" />
                   {graphViewMode === 'SINGLE' && (
                     <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 p-4 flex flex-col min-h-0">
                       {selectedAssetId ? (
                         <>
                           <div className="flex justify-between items-center mb-4">
                             <h4 className="text-sm font-bold text-slate-400 uppercase">Asset: {assets.find(a => a.id === selectedAssetId)?.sqlRecord?.DOCUMENT_TITLE || selectedAssetId}</h4>
                             <button onClick={() => setSelectedAssetId(null)} className="text-xs text-primary-500 hover:underline">Clear Selection</button>
                           </div>
                           <div className="flex-1 relative">
                             <GraphVisualizer 
                               data={assets.find(a => a.id === selectedAssetId)?.graphData || { nodes: [], links: [] }} 
                               width={1000} 
                               height={600} 
                             />
                           </div>
                         </>
                       ) : (
                         <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-4">
                           <Network size={48} className="opacity-20" />
                           <p>Select an asset from the Assets tab to view its specific graph.</p>
                           <button onClick={() => setActiveTab('assets')} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-white text-sm">Go to Assets</button>
                         </div>
                       )}
                     </div>
                   )}
                   {graphViewMode === 'GLOBAL' && (
                      <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 p-4 flex flex-col min-h-0">
                          <div className="flex-1 relative"><GraphVisualizer data={globalGraphData} width={1000} height={600} /></div>
                      </div>
                   )}
                </div>
              )}

              {/* 3D World sub-view — only mounts when selected to avoid eager WebGL context claim */}
              {exploreSubTab === '3d' && (
                <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden min-h-0">
                  <InlineFilterBar activeView="world" />
                  <div className="h-full">
                    <WorldRenderer
                      graphData={graphViewMode === 'GLOBAL' ? globalGraphData : (assets.find(a => a.id === selectedAssetId)?.graphData || globalGraphData)}
                      assets={assets}
                      nearbyUsers={nearbyUsers}
                      currentUserId={user?.id}
                      onNodeSelect={(node) => {
                        const asset = assets.find(a => a.id === node.id);
                        if (asset) setSelectedAssetId(asset.id);
                      }}
                      onPositionChange={(pos) => {
                        if (avatar) updatePosition(pos, [0, 0, 0, 1], avatar.lastSector);
                      }}
                      onStartAdventure={() => {
                        showToast('info', 'Adventure Mode activated! Walk to discover nearby captures.');
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Semantic Canvas sub-view */}
              {exploreSubTab === 'semantic' && (
                <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden min-h-0">
                  <SemanticCanvas assets={assets} />
                </div>
              )}
            </div>
          )}

          {activeTab === 'ar' && (
            <div className="h-full rounded-xl overflow-hidden border border-slate-800 bg-black relative">
              <ARScene 
                onCapture={(file) => {
                  setArSessionQueue(prev => [...prev, file]);
                  saveArQueueItem(file).catch(() => {});
                }} 
                onFinishSession={() => {
                  if (arSessionQueue.length > 0) {
                    handleBatchFiles(arSessionQueue);
                    setArSessionQueue([]);
                    clearArQueue().catch(() => {});
                  }
                  // Do not switch tab, stay in AR view
                }}
                sessionCount={arSessionQueue.length}
                isOnline={isOnline}
                zoomEnabled={zoomEnabled}
              />
            </div>
          )}

          {activeTab === 'social' && (
            <SocialApp 
              user={user}
              communities={communities}
              admissionRequests={admissionRequests}
              messages={messages}
              localAssets={localAssets}
              displayItems={displayItems}
              selectedCommunityId={selectedCommunityId}
              onJoinCommunity={handleJoinCommunity}
              onCreateCommunity={handleCreateCommunity}
              onApproveRequest={handleApproveRequest}
              onRejectRequest={(id) => setAdmissionRequests(prev => prev.filter(r => r.id !== id))}
              onSelectCommunity={setSelectedCommunityId}
              onSendMessage={handleSendMessage}
              onClaimGift={handleClaimGift}
              setAdmissionRequests={setAdmissionRequests}
            />
          )}

          {activeTab === 'market' && (
            <div className="h-full flex flex-col gap-4 sm:gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-white">Data Marketplace</h3>
                  <p className="text-xs sm:text-sm text-slate-400 truncate">Acquire training datasets and sharded document bundles.</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-xs font-bold flex-shrink-0">
                  <ShoppingBag size={14} />
                  <span className="truncate">{marketItems.length} BUNDLES</span>
                </div>
              </div>

              <div className="flex-1 overflow-auto pr-2 custom-scrollbar">
                {marketItems.length === 0 ? (
                  <div className="h-64 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500 gap-4">
                    <Package size={48} className="opacity-20" />
                    <div className="text-center">
                      <p className="font-bold text-slate-400">No Bundles Available</p>
                      <p className="text-xs max-w-xs mt-1">Upload more related documents to trigger automatic clustering and bundle generation.</p>
                    </div>
                  </div>
                ) : (
                  <Suspense fallback={<div className="p-4 text-slate-500 text-sm">Loading bundles...</div>}>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {marketItems.map((bundle) => (
                        <BundleCard 
                          key={bundle.bundleId} 
                          bundle={bundle} 
                          assetsById={assetsById}
                          onClick={() => {
                            const byIds = (bundle.assetIds || [])
                              .map((id) => assetsById[id])
                              .filter((a): a is DigitalAsset => !!a);
                            const fallback = assets.filter(a => bundle.imageUrls.includes(a.imageUrl));
                            setPurchaseModalData({ title: bundle.title, assets: byIds.length > 0 ? byIds : fallback });
                          }}
                          onAssetUpdated={(updatedAsset) => {
                            setLocalAssets(prev => prev.map(a => a.id === updatedAsset.id ? updatedAsset : a));
                          }}
                        />
                      ))}
                  </div>
                  </Suspense>
                )}
              </div>
            </div>
          )}

          {activeTab === 'review' && isAdmin && (
            <div className="h-full flex flex-col gap-4 sm:gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-white">Super-User Review Queue</h3>
                  <p className="text-xs sm:text-sm text-slate-400 truncate">Process and validate images that failed automated extraction.</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-500 text-xs font-bold flex-shrink-0">
                  <AlertCircle size={14} />
                  <span className="truncate">{globalAssets.filter(a => a.sqlRecord?.PROCESSING_STATUS === AssetStatus.FAILED || !a.sqlRecord?.IS_ENTERPRISE).length} PENDING</span>
                </div>
              </div>

              <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-400 uppercase">Unprocessed Global Corpus</h4>
                </div>
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950 sticky top-0 z-10">
                      <tr>
                        {['Preview', 'ID', 'Timestamp', 'Status', 'Error', 'Action'].map(h => (
                          <th key={h} className={`px-2 sm:px-4 py-2 sm:py-3 text-[10px] font-bold text-slate-400 uppercase border-b border-r border-slate-800 whitespace-nowrap bg-slate-950 ${(h === 'Timestamp' || h === 'Error') ? 'hidden sm:table-cell' : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {globalAssets
                        .filter(a => a.sqlRecord?.PROCESSING_STATUS === AssetStatus.FAILED || !a.sqlRecord?.IS_ENTERPRISE)
                        .map(asset => (
                          <tr key={asset.id} className="hover:bg-slate-800/50 transition-colors text-xs font-mono">
                            <td className="px-2 sm:px-4 py-2 sm:py-3 border-r border-slate-800">
                              <img src={getThumbnailSrc(asset)} alt="Preview" className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded border border-slate-700" onError={(e) => handleThumbnailError(e, asset)} />
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-slate-500 border-r border-slate-800">{truncateText(asset.id, 8)}</td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-slate-300 border-r border-slate-800 hidden sm:table-cell">{new Date(asset.timestamp).toLocaleString()}</td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 border-r border-slate-800">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${asset.status === AssetStatus.FAILED ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>
                                {asset.status}
                              </span>
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-red-400 border-r border-slate-800 max-w-[120px] sm:max-w-[200px] truncate hidden sm:table-cell">{asset.errorMessage || 'Manual Review Required'}</td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                              <button 
                                onClick={() => setEditingAsset(asset)}
                                className="px-2 sm:px-3 py-1 bg-primary-600 hover:bg-primary-500 text-white rounded text-[10px] font-bold"
                              >
                                <span className="hidden sm:inline">REVIEW & FIX</span>
                                <span className="sm:hidden">FIX</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {globalAssets.filter(a => a.sqlRecord?.PROCESSING_STATUS === AssetStatus.FAILED || !a.sqlRecord?.IS_ENTERPRISE).length === 0 && (
                    <div className="p-12 text-center text-slate-500">
                      <CheckCircle size={48} className="mx-auto mb-4 opacity-20" />
                      <p>Review queue is empty. All global assets are processed.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <Suspense fallback={<div className="p-8 text-slate-500">Loading settings...</div>}>
            <SettingsPanel 
              onOpenPrivacy={() => setShowPrivacyPolicy(true)} 
              syncOn={syncOn}
              setSyncOn={setSyncOn}
              web3Enabled={web3Enabled}
              setWeb3Enabled={setWeb3Enabled}
              scannerConnected={scannerConnected}
              setScannerConnected={setScannerConnected}
              debugMode={debugMode}
              setDebugMode={setDebugMode}
              zoomEnabled={zoomEnabled}
              setZoomEnabled={setZoomEnabled}
              selectedLLM={selectedLLM}
              setSelectedLLM={setSelectedLLM}
            />
            </Suspense>
          )}
        </div>
        
        {expandedImage && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm" onClick={() => setExpandedImage(null)}>
                <button className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white"><X size={24} /></button>
                <img src={expandedImage} className="max-w-full max-h-full p-4 object-contain select-none" alt="Expanded Asset" />
            </div>
        )}

        {purchaseModalData && (
          <Suspense fallback={null}>
          <PurchaseModal 
            bundleTitle={purchaseModalData.title}
            assets={purchaseModalData.assets}
            ownedAssetIds={ownedAssetIds}
            onClose={() => setPurchaseModalData(null)}
            onConfirm={handlePurchase}
          />
          </Suspense>
        )}

        {showPrivacyPolicy && (
          <PrivacyPolicyModal onClose={() => setShowPrivacyPolicy(false)} />
        )}

        {showIntegrationsHub && (
          <IntegrationsHub 
            isOpen={showIntegrationsHub} 
            onClose={() => setShowIntegrationsHub(false)} 
          />
        )}

        <KeyboardShortcutsHelp 
          isOpen={isShortcutsOpen} 
          onClose={() => setIsShortcutsOpen(false)} 
        />

        {editingAsset && (
            <AnnotationEditor 
                asset={editingAsset}
                onClose={() => setEditingAsset(null)}
                onSave={(updatedAsset) => {
                    handleAssetUpdate(updatedAsset);
                    announce('Annotations saved and synced.');
                }}
            />
        )}

        {showProcessingPanel && createPortal((
          <div className="fixed inset-0 z-[60] pointer-events-none sm:p-4">
            <div
              className="bg-slate-900 border border-slate-800 sm:rounded-xl shadow-2xl flex flex-col pointer-events-auto absolute sm:relative sm:ml-auto w-full sm:w-[450px]"
              style={{
                top: 56,
                right: 0,
                bottom: 'env(safe-area-inset-bottom, 80px)',
                maxHeight: 'calc(100dvh - 56px)',
              }}
            >
                <div className="p-3 sm:p-4 border-b border-slate-800 flex items-center justify-between w-full box-border">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 min-w-0">
                        <Zap size={14} className="text-amber-500 flex-shrink-0" />
                        <span className="truncate">Processing Queue</span>
                        {(totalPendingCount > 0 || batchQueue.filter(i => i.status === 'QUEUED' || i.status === 'PROCESSING').length > 0) && (
                            <span className="ml-1 sm:ml-2 px-1.5 sm:px-2 py-0.5 bg-amber-500/20 text-amber-500 text-[10px] font-bold rounded-full flex-shrink-0">
                                {totalPendingCount + batchQueue.filter(i => i.status === 'QUEUED' || i.status === 'PROCESSING').length}
                            </span>
                        )}
                    </h3>
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 ml-2">
                        <button 
                            onClick={() => setShowDebugPanel(!showDebugPanel)}
                            className={`p-2 rounded text-xs font-mono ${showDebugPanel ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 hover:text-white'}`}
                            title="Toggle Debug Logs"
                        >
                            LOG
                        </button>
                        <button onClick={() => setShowProcessingPanel(false)} className="text-slate-500 hover:text-white"><X size={16} /></button>
                    </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-2 pb-20 sm:pb-2 space-y-4 custom-scrollbar w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {/* Debug Logs Panel */}
                    {showDebugPanel && (
                        <div className="px-2 py-2 border-b border-slate-800/50 pb-4">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <Activity size={10} />
                                    Debug Logs
                                </h4>
                                <button 
                                    onClick={() => setDebugLogs([])}
                                    className="text-[8px] text-slate-500 hover:text-white uppercase"
                                >
                                    Clear
                                </button>
                            </div>
                            <div className="bg-slate-950 border border-slate-800 rounded max-h-48 overflow-y-auto overflow-x-auto text-[8px] font-mono whitespace-pre-wrap break-all">
                                {debugLogs.length === 0 ? (
                                    <div className="p-2 text-slate-600 text-center">No logs yet</div>
                                ) : (
                                    debugLogs.map(log => (
                                        <div key={log.id} className={`p-1.5 border-b border-slate-800/30 ${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-slate-300'}`}>
                                            <span className="text-slate-500 mr-2">{log.timestamp}</span>
                                            {log.message}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {user?.id && (
                        <div className="mb-3 pb-3 border-b border-slate-800/50">
                            <QueueMonitor userId={user.id} onRequeueComplete={() => {
                                loadAssets().then(loaded => setLocalAssets(loaded));
                            }} uploadProgress={uploadProgress} />
                        </div>
                    )}

                    <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1 flex items-center gap-1.5">
                            <Activity size={10} />
                            Local & Batch Stream
                        </h4>
                        
                        {/* Batch Queue Items */}
                        {batchQueue.filter(i => i.status === 'QUEUED' || i.status === 'PROCESSING').map(item => (
                        <div key={item.id} className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-800 rounded border border-slate-700 flex items-center justify-center">
                                <ImageIcon size={16} className="text-slate-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-mono text-slate-400 truncate">{truncateText(item.file?.name, 20)}</span>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${item.status === 'PROCESSING' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-400'}`}>
                                        {item.status === 'PROCESSING' ? 'PROCESSING' : 'QUEUED'}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full transition-all duration-500 ${item.status === 'PROCESSING' ? 'bg-amber-500 animate-pulse' : 'bg-blue-500'}`}
                                        style={{ width: `${item.progress || 5}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {/* Asset Items (PENDING/PROCESSING) */}
                    {totalPendingCount === 0 && batchQueue.filter(i => i.status === 'QUEUED' || i.status === 'PROCESSING').length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-xs">
                            <CheckCircle size={24} className="mx-auto mb-2 text-emerald-500" />
                            All assets processed successfully.
                        </div>
                    ) : (
                        [...localAssets, ...globalAssets]
                            .filter(a => a.status === AssetStatus.PENDING || a.status === AssetStatus.PROCESSING)
                            .map(asset => (
                            <div key={asset.id} className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg flex items-center gap-3 group">
                                <img src={getThumbnailSrc(asset)} className="w-10 h-10 object-cover rounded border border-slate-700" alt="thumb" onError={(e) => handleThumbnailError(e, asset)} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] font-mono text-slate-400 truncate">{truncateText(asset.id, 8)}</span>
                                        <div className="flex items-center gap-1">
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${asset.status === AssetStatus.PROCESSING ? 'bg-amber-500/20 text-amber-500' : 'bg-slate-800 text-slate-400'}`}>
                                                {asset.status}
                                            </span>
                                            {asset.status === AssetStatus.PENDING && !isProcessing && (
                                                <button 
                                                    onClick={() => resumeAsset(asset)}
                                                    className="opacity-0 group-hover:opacity-100 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-all"
                                                >
                                                    Resume
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-500 ${asset.status === AssetStatus.PROCESSING ? 'bg-amber-500 animate-pulse' : 'bg-slate-600'}`}
                                            style={{ width: `${asset.progress || 0}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                    </div>
                </div>
                <div className="p-3 border-t border-slate-800 bg-slate-950/50 rounded-b-xl space-y-2">
                    {isProcessing && (
                        <div className="flex items-center justify-center gap-2 text-amber-500 text-xs py-1">
                            <RefreshCw size={12} className="animate-spin" />
                            Processing in progress...
                        </div>
                    )}
                    
                    {/* Restart Stuck button - for prior session items */}
                    {stuckAssetsCount > 0 && (
                        <button 
                            onClick={async () => {
                                const count = await restartStuckAssets();
                                if (count > 0) {
                                    announce(`Restarted ${count} stuck items. Processing will begin shortly.`);
                                }
                            }}
                            disabled={isProcessing}
                            className="w-full py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 mb-2"
                        >
                            <RefreshCw size={14} />
                            RESTART {stuckAssetsCount} STUCK FROM PRIOR SESSION
                        </button>
                    )}
                    
                    <button 
                        onClick={handleProcessAllPending}
                        disabled={isProcessing || (totalPendingCount === 0 && batchQueue.filter(i => i.status === 'QUEUED').length === 0)}
                        className="w-full py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                    >
                        <Zap size={14} />
                        {totalPendingCount + batchQueue.filter(i => i.status === 'QUEUED').length > 0 
                            ? `PROCESS ALL (${totalPendingCount + batchQueue.filter(i => i.status === 'QUEUED').length})`
                            : 'ALL PROCESSED'}
                    </button>
                    
                    {/* Open New Batch Panel button */}
                    <button 
                        onClick={() => { setShowNewBatchPanel(true); setShowProcessingPanel(false); }}
                        className="w-full py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                    >
                        <Layers size={14} />
                        Open Large Batch Manager
                    </button>
                </div>
            </div>
          </div>
        ), document.body)}

        {/* New Scalable Batch Processing Panel */}
        {showNewBatchPanel && (
          <div className="fixed inset-4 md:inset-8 lg:inset-16 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowNewBatchPanel(false)} />
            <div className="relative w-full max-w-4xl h-full max-h-[90vh]">
              <BatchProcessingPanel
                onProcessItem={handleNewBatchProcess}
                onClose={() => setShowNewBatchPanel(false)}
                maxConcurrent={3}
                defaultScanType={selectedScanType || ScanType.DOCUMENT}
                serverRetry={(jobId) => processingQueueService.retryJob(jobId)}
                downloadFromStorage={(assetId) => processingQueueService.downloadFromStorage(assetId)}
              />
            </div>
          </div>
        )}

        <div className="lg:hidden fixed left-0 right-0 z-40 px-2 pointer-events-none" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)', maxWidth: '100vw', overflowX: 'hidden' }}>
          <div className="max-w-md mx-auto pointer-events-auto bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-xl p-1.5 grid grid-cols-6 gap-1">
            {[
              { key: 'dashboard', label: 'Home', icon: Layers },
              { key: 'database', label: 'DB', icon: Database },
              { key: 'batch', label: 'Batch', icon: Zap },
              { key: 'curator', label: 'Curate', icon: ShieldCheck },
              { key: 'settings', label: 'Settings', icon: Settings },
            ].map(item => {
              const Icon = item.icon;
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    trackUXEvent('mobile_quick_nav', { to: item.key });
                    switchTab(item.key);
                  }}
                  className={`flex flex-col items-center justify-center py-1 rounded-lg text-[10px] ${active ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                  <Icon size={14} />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <button
              onClick={() => {
                toggleQueuePanel('mobile_quick_nav');
              }}
              className={`flex flex-col items-center justify-center py-1 rounded-lg text-[10px] ${showProcessingPanel ? 'bg-amber-600/30 text-amber-300' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Activity size={14} />
              <span>Queue</span>
            </button>
          </div>
        </div>

        {isDevBuild && (
          <div className="fixed top-20 right-2 z-50 w-[min(22rem,calc(100vw-1rem))] pointer-events-none">
            <div className="pointer-events-auto bg-slate-950/95 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
                <div className="text-[11px] text-slate-300 font-semibold tracking-wide">QA Debug</div>
                <button
                  onClick={() => setShowQaPanel(prev => !prev)}
                  className={`px-2 py-1 rounded text-[10px] font-bold ${showQaPanel ? 'bg-blue-600/30 text-blue-300' : 'bg-slate-800 text-slate-300 hover:text-white'}`}
                >
                  {showQaPanel ? 'Hide' : 'Show'}
                </button>
              </div>
              {showQaPanel && (
                <div className="p-3 space-y-3 text-[11px]">
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                    <div className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Safe Area</div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-200 font-mono">
                      <span>top: {safeAreaDebug.top}px</span>
                      <span>right: {safeAreaDebug.right}px</span>
                      <span>bottom: {safeAreaDebug.bottom}px</span>
                      <span>left: {safeAreaDebug.left}px</span>
                      <span>viewport: {safeAreaDebug.viewportHeight}px</span>
                      <span>inner: {safeAreaDebug.innerHeight}px</span>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                    <div className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Process Step</div>
                    <div className="text-slate-100 font-mono">
                      {dbProcessRun.running ? dbProcessRun.step : (isProcessing ? 'local-processing' : 'idle')}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400 font-mono">
                      queued: {dbProcessRun.processed}/{dbProcessRun.total} • failed: {dbProcessRun.failed} • cancel: {dbProcessRun.cancelRequested ? 'yes' : 'no'}
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                    <div className="text-slate-400 uppercase tracking-wide text-[10px] mb-1">Recent UX Events</div>
                    <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-[10px]">
                      {recentUxEvents.length === 0 ? (
                        <div className="text-slate-500">No events yet</div>
                      ) : (
                        recentUxEvents.map((entry, index) => {
                          const eventName = String(entry.event || 'unknown');
                          const timestamp = String(entry.timestamp || '');
                          return (
                            <div key={`${eventName}-${timestamp}-${index}`} className="text-slate-300 border-b border-slate-800/60 pb-1">
                              <div className="text-blue-300">{eventName}</div>
                              <div className="text-slate-500">{timestamp}</div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                    <div className="text-slate-400 uppercase tracking-wide text-[10px] mb-1 flex items-center justify-between">
                      <span>Failed Drill-Down</span>
                      <span className="text-red-400">{dbQueueStats?.failed || 0} queue failed</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-[10px]">
                      {qaFailedJobs.length === 0 && qaFailedAssets.length === 0 ? (
                        <div className="text-slate-500">No failed jobs or assets</div>
                      ) : (
                        <>
                          {qaFailedJobs.map((job) => (
                            <div key={job.id} className="text-slate-300 border-b border-slate-800/60 pb-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-red-300">{truncateText(job.assetId, 8)} • {job.stage || 'FAILED_FINAL'}</span>
                                <button
                                  onClick={() => {
                                    setSelectedAssetId(job.assetId);
                                    setActiveTab('database');
                                    setShowProcessingPanel(true);
                                  }}
                                  className="text-primary-400 hover:text-white"
                                >
                                  View
                                </button>
                              </div>
                              <div className="text-slate-500 truncate">{job.error || 'No error payload'}</div>
                            </div>
                          ))}
                          {qaFailedAssets.slice(0, Math.max(0, 8 - qaFailedJobs.length)).map((asset) => (
                            <div key={asset.id} className="text-slate-300 border-b border-slate-800/60 pb-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-amber-300">{truncateText(asset.id, 8)} • asset failed</span>
                                <button
                                  onClick={() => {
                                    setSelectedAssetId(asset.id);
                                    setActiveTab('database');
                                  }}
                                  className="text-primary-400 hover:text-white"
                                >
                                  View
                                </button>
                              </div>
                              <div className="text-slate-500 truncate">{asset.errorMessage || 'No local error message'}</div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <StatusBar 
          user={user}
          syncOn={syncOn}
          isOnline={isOnline}
          localCount={localAssets.length}
          isGlobalView={isGlobalView}
          setIsGlobalView={setIsGlobalView}
          onTabChange={(tab) => setActiveTab(tab)}
          pendingCount={totalPendingCount}
          stuckCount={stuckAssetsCount}
          onQueueClick={() => toggleQueuePanel('status_bar')}
        />
      </main>

      {/* Unified Filter Panel - Sliding */}
      {showUnifiedFilters && (
        <div className="fixed inset-0 sm:inset-auto sm:right-0 sm:top-0 sm:bottom-0 sm:w-96 bg-slate-900/95 backdrop-blur-sm sm:border-l border-slate-800 shadow-2xl z-50 overflow-y-auto">
          <div className="p-4">
            <UnifiedFilterPanel
              activeView={activeTab as any}
              isCollapsed={false}
              onCollapsedChange={(collapsed) => setShowUnifiedFilters(!collapsed)}
              showQuickFilters={true}
              showViewSync={true}
              showAnalytics={true}
            />
          </div>
        </div>
      )}

      {/* Cluster Sync Statistics Panel - Human-in-the-Loop Overview */}
      {showClusterSyncStats && (
        <ClusterSyncStatsPanel
          assets={assets}
          onClose={() => setShowClusterSyncStats(false)}
          onClassificationUpdate={(results) => {
            // Merge classification results into local asset state
            results.forEach(r => {
              setLocalAssets(prev => prev.map(a => {
                if (a.id !== r.assetId) return a;
                const updatedRecord = { ...(a.sqlRecord || {}) } as any;
                if (r.structuredTemporal) (updatedRecord as any).STRUCTURED_TEMPORAL = r.structuredTemporal;
                if (r.structuredSpatial) (updatedRecord as any).STRUCTURED_SPATIAL = r.structuredSpatial;
                if (r.structuredContent) (updatedRecord as any).STRUCTURED_CONTENT = r.structuredContent;
                if (r.structuredKnowledgeGraph) (updatedRecord as any).STRUCTURED_KNOWLEDGE_GRAPH = r.structuredKnowledgeGraph;
                if (r.structuredProvenance) (updatedRecord as any).STRUCTURED_PROVENANCE = r.structuredProvenance;
                if (r.structuredDiscovery) (updatedRecord as any).STRUCTURED_DISCOVERY = r.structuredDiscovery;
                return { ...a, sqlRecord: updatedRecord as any };
              }));
            });
          }}
        />
      )}
    </div>
    </FilterProvider>
  );
}