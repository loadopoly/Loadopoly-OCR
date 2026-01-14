import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  Sliders
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
import { processImageWithGemini } from './services/geminiService';
import { createBundles, createUserBundle } from './services/bundleService';
import { initSync, isSyncEnabled } from './lib/syncEngine';
import { loadAssets, saveAsset, deleteAsset } from './lib/indexeddb';
import { redeemPhygitalCertificate } from './services/web3Service';
import { getCurrentUser } from './lib/auth';
import { fetchGlobalCorpus, contributeAssetToGlobalCorpus, fetchUserAssets, subscribeToAssetUpdates } from './services/supabaseService';
import { processingQueueService } from './services/processingQueueService';
import { compressImage } from './lib/imageCompression';
import { WorkerPool } from './lib/workerPool';
import GraphVisualizer from './components/GraphVisualizer';
import ContributeButton from './components/ContributeButton';
import BundleCard from './components/BundleCard';
import ARScene from './components/ARScene';
import SemanticCanvas from './components/SemanticCanvas';
import CameraCapture from './components/CameraCapture';
import BatchImporter from './components/BatchImporter';
import SettingsPanel from './components/SettingsPanel';
import SmartUploadSelector from './components/SmartUploadSelector';
import PrivacyPolicyModal from './components/PrivacyPolicyModal';
import PurchaseModal from './components/PurchaseModal';
import SmartSuggestions from './components/SmartSuggestions';
import SocialApp from './components/SocialApp';
import StatusBar from './components/StatusBar';
import AnnotationEditor from './components/AnnotationEditor';
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp } from './components/KeyboardShortcuts';
import { announce } from './lib/accessibility';
import { WorldRenderer } from './components/metaverse';
import { useAvatar } from './hooks/useAvatar';
import IntegrationsHub from './components/IntegrationsHub';
import { FilterProvider, useFilterContext } from './contexts/FilterContext';
import UnifiedFilterPanel, { InlineFilterBar, FilterBadge } from './components/UnifiedFilterPanel';
import { ClusterSyncStatsPanel, ClusterSyncButton } from './components/ClusterSyncStatsPanel';
import { QueueMonitor } from './components/QueueMonitor';
import BatchProcessingPanel from './components/BatchProcessingPanel';
import { batchProcessor } from './services/batchProcessorService';

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
    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
      active 
        ? 'bg-primary-600/10 text-primary-500 border-r-2 border-primary-500' 
        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
    }`}
  >
    <Icon size={18} />
    {label}
  </button>
);

const StatCard = ({ label, value, icon: Icon, color, onClick }: any) => (
  <div 
    onClick={onClick}
    className={`bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between ${onClick ? 'cursor-pointer hover:bg-slate-800/50 hover:border-slate-700 transition-all active:scale-[0.98]' : ''}`}
  >
    <div>
      <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
    <div className={`p-3 rounded-lg bg-opacity-10 ${color.replace('text-', 'bg-')}`}>
      <Icon className={color} size={24} />
    </div>
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
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
  const [groupBy, setGroupBy] = useState<'SOURCE' | 'ZONE' | 'CATEGORY' | 'RIGHTS'>('SOURCE');
  const [dbViewMode, setDbViewMode] = useState<'GROUPS' | 'DRILLDOWN'>('DRILLDOWN');
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;
  const [graphViewMode, setGraphViewMode] = useState<'SINGLE' | 'GLOBAL'>('SINGLE');
  const [graphFilters, setGraphFilters] = useState({ era: 'all', category: 'all', contested: false });
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);
  const [selectedScanType, setSelectedScanType] = useState<ScanType | null>(ScanType.DOCUMENT);
  const [isPublicBroadcast, setIsPublicBroadcast] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [arSessionQueue, setArSessionQueue] = useState<File[]>([]);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showProcessingPanel, setShowProcessingPanel] = useState(false);
  const [showNewBatchPanel, setShowNewBatchPanel] = useState(false);
  
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isOpen: isShortcutsOpen, setIsOpen: setIsShortcutsOpen } = useKeyboardShortcutsHelp() as any;
  const isOnline = useOnlineStatus();
  const [syncOn, setSyncOn] = useState(false);
  const [web3Enabled, setWeb3Enabled] = useState(false);
  const [scannerConnected, setScannerConnected] = useState(false);
  const [showIntegrationsHub, setShowIntegrationsHub] = useState(false);
  const [showUnifiedFilters, setShowUnifiedFilters] = useState(false);
  const [showClusterSyncStats, setShowClusterSyncStats] = useState(false);
  const [worldViewMode, setWorldViewMode] = useState<'3d' | 'semantic'>('3d');

  // Initialize Worker Pool for parallel processing
  const workerPool = useMemo(() => new WorkerPool('../workers/parallelWorker.ts', { maxWorkers: 4 }), []);

  // Initialize Processing Queue Service with simplified callbacks
  // The heavy lifting is done by the direct Realtime subscription below
  useEffect(() => {
    if (user?.id) {
      processingQueueService.init(user.id);
      
      // Lightweight callbacks for progress updates only
      processingQueueService.setCallbacks({
        onJobStarted: (job) => {
          setLocalAssets(prev => prev.map(a => 
            a.id === job.assetId ? { ...a, status: AssetStatus.PROCESSING, progress: 10 } : a
          ));
        },
        onJobProgress: (job) => {
          setLocalAssets(prev => prev.map(a => 
            a.id === job.assetId ? { ...a, progress: Math.min(90, job.progress) } : a
          ));
        },
        // onJobCompleted is now handled by the direct Realtime subscription below
        // This avoids double-fetching and redundant sync
        onJobCompleted: (job) => {
          // Mark as completed in UI immediately - Realtime will provide full data
          setLocalAssets(prev => prev.map(a => 
            a.id === job.assetId ? { ...a, progress: 100 } : a
          ));
        },
        onJobFailed: (job) => {
          setLocalAssets(prev => prev.map(a => 
            a.id === job.assetId ? { ...a, status: AssetStatus.FAILED, progress: 0, errorMessage: job.error } : a
          ));
        }
      });
    }
  }, [user?.id]);

  // Direct Realtime subscription to historical_documents_global
  // This is more efficient - edge function saves directly to this table,
  // and we get the full asset data in one step without re-fetching
  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = subscribeToAssetUpdates(
      user.id,
      // On asset UPDATE (e.g., edge processing completed)
      (updatedAsset) => {
        setLocalAssets(prev => {
          const exists = prev.some(a => a.id === updatedAsset.id);
          if (exists) {
            return prev.map(a => a.id === updatedAsset.id ? updatedAsset : a);
          }
          return prev;
        });
        // Also persist to local IndexedDB
        saveAsset(updatedAsset).catch(e => console.error('Failed to persist updated asset', e));
      },
      // On asset INSERT (e.g., new asset from edge function)
      (newAsset) => {
        setLocalAssets(prev => {
          // Avoid duplicates
          if (prev.some(a => a.id === newAsset.id)) {
            return prev.map(a => a.id === newAsset.id ? newAsset : a);
          }
          return [newAsset, ...prev];
        });
        saveAsset(newAsset).catch(e => console.error('Failed to persist new asset', e));
      }
    );

    return () => unsubscribe();
  }, [user?.id]);

  // Avatar & Metaverse state
  const { avatar, nearbyUsers, currentSector, updatePosition } = useAvatar(user?.id || null);

  const totalTokens = assets.reduce((acc, curr) => acc + (curr.tokenization?.tokenCount || 0), 0);
  const pendingLocalCount = localAssets.filter(a => a.status === AssetStatus.PENDING || a.status === AssetStatus.PROCESSING).length;
  const pendingGlobalCount = globalAssets.filter(a => a.status === AssetStatus.PENDING || a.status === AssetStatus.PROCESSING).length;
  const totalPendingCount = pendingLocalCount + pendingGlobalCount;
  
  // Count stuck assets (PROCESSING but likely from prior session)
  const stuckAssetsCount = localAssets.filter(a => a.status === AssetStatus.PROCESSING).length;

  useEffect(() => {
    const handleShortcuts = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      switch(e.key.toLowerCase()) {
        case '1': setActiveTab('dashboard'); break;
        case '2': setActiveTab('batch'); break;
        case '3': setActiveTab('ar'); break;
        case '4': setActiveTab('assets'); break;
        case '5': setActiveTab('graph'); break;
        case '6': setActiveTab('database'); break;
        case '7': if (isAdmin) setActiveTab('review'); break;
        case 's': setActiveTab('settings'); break;
        case 'g': setIsGlobalView(prev => !prev); break;
        case 'r': if (isGlobalView) refreshGlobalData(); break;
        case 'w': setActiveTab('world'); break;
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [isGlobalView]);

  useEffect(() => {
    navigator.permissions.query({ name: 'geolocation' }).then((result) => setGeoPermission(result.state === 'granted'));
    
    initSync();
    isSyncEnabled().then(setSyncOn);
    setWeb3Enabled(localStorage.getItem('geograph-web3-enabled') === 'true');
    setScannerConnected(!!localStorage.getItem('geograph-scanner-url'));

    const storedPurchases = localStorage.getItem('geograph-owned-assets');
    if (storedPurchases) setOwnedAssetIds(new Set(JSON.parse(storedPurchases)));
    
    const handleNewFile = (event: CustomEvent<File>) => ingestFile(event.detail, "Auto-Sync");
    window.addEventListener('geograph-new-file', handleNewFile as any);

    getCurrentUser().then(async ({ data }) => { 
      if(data.user) { 
        setUser(data.user); 
        
        // Baseline Super User Assignment
        const isSuperUser = data.user.email === 'loadopoly@gmail.com';
        setIsAdmin(isSuperUser);
        setIsEnterprise(true); // Authenticated users are treated as enterprise-tier
        
        // 1. Sync local assets to cloud if they aren't there yet
        const local = await loadAssets();
        const syncPromises = local.map(async (asset) => {
          if (asset.status === AssetStatus.MINTED && !asset.sqlRecord?.USER_ID) {
            try {
              await contributeAssetToGlobalCorpus(asset, data.user.id, 'GEOGRAPH_CORPUS_1.0', true);
              // Update local record to show it's synced (optional, but good for UI)
              if (asset.sqlRecord) asset.sqlRecord.USER_ID = data.user.id;
              await saveAsset(asset);
            } catch (e) {
              console.error("Failed to sync local asset to cloud:", e);
            }
          }
          return asset;
        });
        
        await Promise.all(syncPromises);

        // 2. Load user's assets from Supabase and MERGE with local
        try {
          const remoteAssets = await fetchUserAssets(data.user.id);
          const localAssetsAfterSync = await loadAssets();
          
          // Create a map of assets by ID
          const assetMap = new Map<string, DigitalAsset>();
          
          // Add local assets first
          localAssetsAfterSync.forEach(a => assetMap.set(a.id, a));
          
          // Merge remote assets (overwriting local if they exist, as remote is "truth" for synced items)
          // BUT preserve local-only items (like pending uploads or guest work)
          remoteAssets.forEach(a => assetMap.set(a.id, a));
          
          const mergedAssets = Array.from(assetMap.values()).sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          setLocalAssets(mergedAssets);
          
          // Update IndexedDB with the merged state to ensure consistency
          for (const asset of mergedAssets) {
            await saveAsset(asset);
          }
          
        } catch (err) {
          console.error('Failed to load user assets:', err);
          // Fallback to just local assets if remote fetch fails
          loadAssets().then(setLocalAssets);
        }
      } else {
        // Unauthenticated: load from IndexedDB only
        loadAssets().then(setLocalAssets);
        
        // Clear session data when page unloads for unauthenticated users
        const handleUnload = () => {
          // Mark for cleanup on next load if still unauthenticated
          sessionStorage.setItem('geograph-cleanup-needed', 'true');
        };
        window.addEventListener('beforeunload', handleUnload);
        
        // Cleanup from previous session if needed
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
      loadAssets().then(setLocalAssets);
    });

    return () => {
      window.removeEventListener('geograph-new-file', handleNewFile as any);
    };
  }, []);

  const refreshGlobalData = async () => {
    setIsProcessing(true);
    try {
      // If not admin, only fetch enterprise-ready assets
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

  useEffect(() => {
    if (assets.length > 0) {
        const processedAssets = assets.filter(a => !!a.sqlRecord);
        const processingAssets = assets.filter(a => !a.sqlRecord);
        const bundles = createBundles(processedAssets);
        setDisplayItems([...processingAssets, ...bundles]);
    } else {
        setDisplayItems([]);
    }
  }, [assets]);

  const handleAssetUpdate = async (updatedAsset: DigitalAsset) => {
    if (isGlobalView) {
        setGlobalAssets(prev => prev.map(a => a.id === updatedAsset.id ? updatedAsset : a));
    } else {
        setLocalAssets(prev => prev.map(a => a.id === updatedAsset.id ? updatedAsset : a));
    }
    
    if (user?.id || isGlobalView) {
      // Authenticated users or global view: update in Supabase
      const license = isPublicBroadcast ? 'CC0' : 'GEOGRAPH_CORPUS_1.0';
      contributeAssetToGlobalCorpus(updatedAsset, user?.id, license as any, true)
        .catch(err => console.error("Failed to update asset in Supabase", err));
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
      if (activeTab === 'ar' && newTab !== 'ar' && arSessionQueue.length > 0) {
          if (window.confirm(`Process ${arSessionQueue.length} items from your AR Session?`)) {
              handleBatchFiles(arSessionQueue);
              setArSessionQueue([]);
          } else {
              // If user cancels, stay on AR tab and keep the queue
              return;
          }
      }
      setActiveTab(newTab);
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
      contributeAssetToGlobalCorpus(resultAsset, user?.id, license as any, true).then(syncResult => {
        if (syncResult.success && syncResult.publicUrl) {
          // Update state with the permanent cloud URL
          const updatedAsset = { ...resultAsset, imageUrl: syncResult.publicUrl || resultAsset.imageUrl };
          if (isGlobalView) {
            setGlobalAssets(prev => prev.map(a => a.id === asset.id ? updatedAsset : a));
          } else {
            setLocalAssets(prev => prev.map(a => a.id === asset.id ? updatedAsset : a));
          }
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

  const ingestFile = async (file: File, source: string = "Upload") => {
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

      if (source !== "Batch Folder" && source !== "Auto-Sync") setActiveTab('assets');
      
      if (!isOnline) {
        announce("Offline: Asset saved locally. Processing will resume when online.");
        setIsProcessing(false);
        return;
      }

      // Background Processing Queue Integration
      try {
        const scanType = (file as any).scanType || selectedScanType || ScanType.DOCUMENT;
        
        await processingQueueService.queueFile(file, {
          scanType,
          metadata: {
            DOCUMENT_TITLE: newAsset.sqlRecord?.DOCUMENT_TITLE,
            SOURCE_COLLECTION: source
          }
        }, newAsset.id);
        
        announce("Asset queued for background processing.");
      } catch (queueErr) {
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
      
      // Create local asset
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
      
      onProgress(15, 'Getting location...');
      
      // Get location
      let location: { lat: number; lng: number } | null = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => 
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2000 })
          );
          location = { lat: position.coords.latitude, lng: position.coords.longitude };
        } catch (e) {}
      }
      
      onProgress(25, 'AI analysis...');
      
      // Process with Gemini
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
        const syncResult = await contributeAssetToGlobalCorpus(resultAsset, user?.id, license as any, true);
        if (syncResult.success && syncResult.publicUrl) {
          setLocalAssets(prev => prev.map(a => 
            a.id === itemId ? { ...a, imageUrl: syncResult.publicUrl || a.imageUrl } : a
          ));
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
  }, [user?.id, debugMode, selectedLLM, isPublicBroadcast]);

  // Legacy batch handler - now delegates to new system
  const handleBatchFiles = (files: File[]) => {
    // Add files to new batch processor
    batchProcessor.addFiles(files, selectedScanType || ScanType.DOCUMENT);
    
    // Show the new batch panel
    setShowNewBatchPanel(true);
    setActiveTab('batch');
    
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
      // Include both PENDING and PROCESSING (stuck) assets - unified state check
      let pendingAssets = (isGlobalView ? globalAssets : localAssets).filter(
          a => a.status === AssetStatus.PENDING || a.status === AssetStatus.PROCESSING
      );
      
      // Also check batch queue for queued items not yet in assets
      const batchPendingCount = batchQueue.filter(i => i.status === 'QUEUED' || i.status === 'PROCESSING').length;
      
      // If in global view and no global pending, but there are local pending, offer to process local
      if (isGlobalView && pendingAssets.length === 0 && pendingLocalCount > 0) {
          if (window.confirm(`No pending global assets, but there are ${pendingLocalCount} pending local assets. Process them now?`)) {
              pendingAssets = localAssets.filter(
                  a => a.status === AssetStatus.PENDING || a.status === AssetStatus.PROCESSING
              );
          } else {
              return;
          }
      }

      if (pendingAssets.length === 0 && batchPendingCount === 0) {
          announce("All assets have been processed.");
          return;
      }
      
      const totalToProcess = pendingAssets.length + batchPendingCount;
      if (!window.confirm(`Process ${totalToProcess} pending asset${totalToProcess !== 1 ? 's' : ''}?`)) return;
      
      setIsProcessing(true);
      let processedCount = 0;
      let failedCount = 0;
      
      // Process assets from localAssets/globalAssets
      for (const asset of pendingAssets) {
          try {
              if (asset.imageBlob || (asset.imageUrl && asset.imageUrl.startsWith('http'))) {
                  let file: File;
                  if (asset.imageBlob) {
                      file = new File([asset.imageBlob], `reprocess_${asset.id}.jpg`, { type: 'image/jpeg' });
                  } else {
                      const response = await fetch(asset.imageUrl);
                      const blob = await response.blob();
                      file = new File([blob], `reprocess_${asset.id}.jpg`, { type: blob.type });
                  }

                  if (isOnline) {
                      // Use background queue
                      try {
                          await processingQueueService.queueFile(file, {
                              scanType: (asset.sqlRecord?.SCAN_TYPE as ScanType) || ScanType.DOCUMENT,
                              metadata: {
                                  DOCUMENT_TITLE: asset.sqlRecord?.DOCUMENT_TITLE,
                                  SOURCE_COLLECTION: asset.sqlRecord?.SOURCE_COLLECTION || "Reprocess"
                              }
                          }, asset.id);
                          processedCount++;
                      } catch (queueErr) {
                          // Fallback to client-side
                          const processedAsset = await processAssetPipeline(asset, file);
                          if (isGlobalView) {
                              setGlobalAssets(prev => prev.map(a => a.id === asset.id ? processedAsset : a));
                          } else {
                              setLocalAssets(prev => prev.map(a => a.id === asset.id ? processedAsset : a));
                          }
                          processedCount++;
                      }
                  } else {
                      // Offline: manual client-side processing
                      const processedAsset = await processAssetPipeline(asset, file);
                      if (isGlobalView) {
                          setGlobalAssets(prev => prev.map(a => a.id === asset.id ? processedAsset : a));
                      } else {
                          setLocalAssets(prev => prev.map(a => a.id === asset.id ? processedAsset : a));
                      }
                      processedCount++;
                  }
              } else {
                  console.warn(`Asset ${asset.id} has no image data to process`);
                  failedCount++;
              }
          } catch (err) {
              console.error(`Failed to process asset ${asset.id}:`, err);
              failedCount++;
          }
      }
      
      // Trigger batch queue processing if there are items
      if (batchPendingCount > 0) {
          processNextBatchItem();
      }
      
      setIsProcessing(false);
      announce(`Processed ${processedCount} asset${processedCount !== 1 ? 's' : ''}${failedCount > 0 ? `, ${failedCount} failed` : ''}.`);
  };

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
    for (const asset of updatedAssets) {
      contributeAssetToGlobalCorpus(asset, user?.id, license as any, true).catch(e => console.error("Failed to sync manual bundle", e));
    }

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
          
          await processingQueueService.queueFile(item.file, {
            scanType: item.scanType || selectedScanType || ScanType.DOCUMENT,
            priority: 3, 
            metadata: {
              DOCUMENT_TITLE: newAsset.sqlRecord?.DOCUMENT_TITLE,
              SOURCE_COLLECTION: "Batch Ingest"
            }
          }, newAsset.id);
          
          debugLogger(`Successfully queued ${item.file.name}`);
          setBatchQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'COMPLETED', progress: 100, assetId: newAsset.id } : i));
        } catch (queueErr) {
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
    
  }, [isOnline, selectedScanType, user, debugLogger]);

  const getAggregatedGroups = () => {
    const groups: Record<string, DigitalAsset[]> = {};
    assets.forEach(asset => {
        let key = 'Unknown';
        if (groupBy === 'SOURCE') key = asset.sqlRecord?.SOURCE_COLLECTION || 'Unknown';
        if (groupBy === 'ZONE') key = asset.sqlRecord?.LOCAL_GIS_ZONE || 'Unknown';
        if (groupBy === 'CATEGORY') key = asset.sqlRecord?.NLP_NODE_CATEGORIZATION || 'Uncategorized';
        if (groupBy === 'RIGHTS') key = asset.sqlRecord?.RIGHTS_STATEMENT || 'Unknown';
        if (!groups[key]) groups[key] = [];
        groups[key].push(asset);
    });
    return groups;
  };

  const aggregatedGroups = getAggregatedGroups();
  const drillDownAssets = selectedGroupKey ? (aggregatedGroups[selectedGroupKey] || []) : assets;
  const paginatedAssets = drillDownAssets.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const globalGraphData = useMemo<GraphData>(() => {
      const filteredAssets = assets.filter(asset => {
          const r = asset.sqlRecord;
          if (!r) return false;
          if (graphFilters.category !== 'all' && r.NLP_NODE_CATEGORIZATION !== graphFilters.category) return false;
          const eraKey = r.NLP_DERIVED_TIMESTAMP?.match(/\d{4}/)?.[0]?.slice(0,3) + '0s' || 'Unknown';
          if (graphFilters.era !== 'all' && eraKey !== graphFilters.era) return false;
          const isContested = r.ACCESS_RESTRICTIONS || /controversy|removed|relocated/i.test(r.DOCUMENT_DESCRIPTION);
          if (graphFilters.contested && !isContested) return false;
          return true;
      });
      const docNodes = filteredAssets.map(a => ({ id: a.id, label: a.sqlRecord?.DOCUMENT_TITLE || 'Untitled', type: 'DOCUMENT' as const, relevance: 1.0, license: a.sqlRecord?.DATA_LICENSE }));
      const entityNodesMap = new Map<string, GraphNode>();
      const links: any[] = [];
      filteredAssets.forEach(asset => {
         const cat = asset.sqlRecord?.NLP_NODE_CATEGORIZATION || 'Uncategorized';
         const catId = `CAT_${cat.replace(/\s+/g, '_')}`;
         if (!entityNodesMap.has(catId)) entityNodesMap.set(catId, { id: catId, label: cat, type: 'CLUSTER', relevance: 0.8 });
         links.push({ source: asset.id, target: catId, relationship: "CATEGORIZED_AS" });
         if (asset.graphData?.nodes) {
             asset.graphData.nodes.forEach(node => {
                 const entityId = `ENT_${node.label.replace(/\s+/g, '_').toUpperCase()}`;
                 if (!entityNodesMap.has(entityId)) entityNodesMap.set(entityId, { ...node, id: entityId });
                 links.push({ source: asset.id, target: entityId, relationship: "CONTAINS" });
             });
         }
      });
      return { nodes: [...docNodes, ...Array.from(entityNodesMap.values())], links };
  }, [assets, graphFilters]);

  return (
    <FilterProvider initialAssets={assets} initialGraphData={globalGraphData}>
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans selection:bg-primary-500/30">
      
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
          <SidebarItem icon={Network} label="Knowledge Graph" active={activeTab === 'graph'} onClick={() => switchTab('graph')} />
          <SidebarItem icon={Globe} label="3D World" active={activeTab === 'world'} onClick={() => switchTab('world')} />
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

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 border-r border-slate-800 flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary-500">
                <Database size={24} />
                <h1 className="text-xl font-bold tracking-tight text-white">GeoGraph</h1>
              </div>
              <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 px-2 space-y-1 overflow-y-auto custom-scrollbar">
              <SidebarItem icon={Layers} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => { switchTab('dashboard'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={Zap} label="Quick Processing" active={activeTab === 'batch'} onClick={() => { switchTab('batch'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={Scan} label="AR Scanner" active={activeTab === 'ar'} onClick={() => { switchTab('ar'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={ImageIcon} label="Assets & Bundles" active={activeTab === 'assets'} onClick={() => { switchTab('assets'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={ShieldCheck} label="Curator Mode" active={activeTab === 'curator'} onClick={() => { switchTab('curator'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={Network} label="Knowledge Graph" active={activeTab === 'graph'} onClick={() => { switchTab('graph'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={Globe} label="3D World" active={activeTab === 'world'} onClick={() => { switchTab('world'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={TableIcon} label="Structured DB" active={activeTab === 'database'} onClick={() => { switchTab('database'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={Users} label="Social Hub" active={activeTab === 'social'} onClick={() => { switchTab('social'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={ShoppingBag} label="Marketplace" active={activeTab === 'market'} onClick={() => { switchTab('market'); setIsMobileMenuOpen(false); }} />
              <div className="pt-4 mt-4 border-t border-slate-800">
                <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => { switchTab('settings'); setIsMobileMenuOpen(false); }} />
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
                        onClick={() => { setIsGlobalView(!isGlobalView); setIsMobileMenuOpen(false); }}
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
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-4 lg:px-8 bg-slate-950/80 backdrop-blur z-10">
            <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <List size={24} />
                </button>
                <h2 className="text-lg font-semibold text-white capitalize hidden sm:block">
                  {activeTab === 'database' ? (isGlobalView ? 'CLOUD DATAFRAMES' : 'LOCAL DATAFRAMES') : activeTab}
                </h2>
                <div className="flex items-center bg-slate-900 rounded-lg p-1 border border-slate-800 ml-2">
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
          <div className="flex items-center gap-2">
             {totalPendingCount > 0 && (
                <button 
                    onClick={() => setShowProcessingPanel(!showProcessingPanel)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${showProcessingPanel ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
                >
                    <div className={`w-2 h-2 rounded-full bg-amber-500 ${isProcessing ? 'animate-pulse' : ''}`}></div>
                    <span className="text-xs font-bold">{totalPendingCount} PENDING</span>
                </button>
             )}
             {activeTab !== 'batch' && activeTab !== 'ar' && (
                <>
                  <CameraCapture 
                    onCapture={(file) => ingestFile(file, isGlobalView ? "Global Contribution" : "Mobile Camera")} 
                    isOnline={isOnline}
                    zoomEnabled={zoomEnabled}
                  />
                  <label className={`flex items-center gap-2 px-4 py-2 ${isGlobalView ? 'bg-indigo-900/40 border-indigo-500/50 hover:bg-indigo-900/60' : 'bg-slate-800 hover:bg-slate-700 border-slate-700'} border text-slate-200 text-sm font-medium rounded-lg cursor-pointer transition-all ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                      {isProcessing ? <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div> : <Upload size={18} />}
                      <span>{isGlobalView ? 'Contribute' : 'Upload'}</span>
                      <input type="file" className="hidden" accept="image/*, application/pdf" onChange={(e) => e.target.files?.[0] && ingestFile(e.target.files[0], isGlobalView ? "Global Contribution" : "Direct Upload")} disabled={isProcessing} />
                  </label>
                </>
             )}
             {isGlobalView && (
                 <button 
                    onClick={refreshGlobalData}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                 >
                     <RefreshCw size={18} className={isProcessing ? 'animate-spin' : ''} />
                     <span>Refresh Cloud</span>
                 </button>
             )}
             <button 
                onClick={() => setActiveTab('settings')}
                className={`p-2 rounded-full border transition-all ${user ? 'bg-primary-900/20 border-primary-500/50 text-primary-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
             >
                <User size={20} />
             </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8 relative">
          
          {activeTab === 'dashboard' && (
            <div className="space-y-8 max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Total Assets" value={assets.length} icon={FileText} color="text-blue-500" onClick={() => setActiveTab('assets')} />
                <StatCard label="Knowledge Nodes" value={assets.reduce((a,c) => a + (c.graphData?.nodes?.length || 0), 0)} icon={Network} color="text-purple-500" onClick={() => setActiveTab('graph')} />
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
                                <img src={asset.imageUrl} className="w-16 h-16 object-cover rounded" alt="thumb" />
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
            <div className="space-y-6 max-w-6xl mx-auto h-full flex flex-col">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-bold text-white">Curator Mode</h3>
                  <p className="text-sm text-slate-400">Manually manage bundles and refine AI-extracted annotations.</p>
                </div>
                <div className="flex gap-2">
                  {/* Cluster Sync Statistics Button - Human-in-the-Loop Overview */}
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
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium"
                  >
                    Clear Selection
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
                          <th key={h} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase border-b border-r border-slate-800 whitespace-nowrap bg-slate-950">{h}</th>
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
                          <td className="px-4 py-3 border-r border-slate-800">
                            <img src={asset.imageUrl} alt="Preview" className="w-12 h-12 object-cover rounded border border-slate-700" />
                          </td>
                          <td className="px-4 py-3 text-white border-r border-slate-800 font-bold">{asset.sqlRecord?.DOCUMENT_TITLE || 'Untitled'}</td>
                          <td className="px-4 py-3 text-blue-400 border-r border-slate-800">{asset.sqlRecord?.SOURCE_COLLECTION || 'Unsorted'}</td>
                          <td className="px-4 py-3 border-r border-slate-800">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${asset.status === AssetStatus.MINTED ? 'bg-green-500/20 text-green-500' : 'bg-amber-500/20 text-amber-500'}`}>
                              {asset.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 border-r border-slate-800 text-center">
                            {asset.sqlRecord?.IS_USER_ANNOTATED ? (
                              <CheckCircle size={16} className="text-green-500 mx-auto" />
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button 
                              onClick={() => setEditingAsset(asset)}
                              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold border border-slate-700"
                            >
                              EDIT ANNOTATIONS
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
             <div className="h-full flex flex-col gap-4">
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
                   </div>
                   <div className="flex flex-wrap gap-4">
                       <FilterBadge count={groupBy !== 'SOURCE' ? 1 : 0} onClick={() => setShowUnifiedFilters(true)} />
                       <button 
                          onClick={handleProcessAllPending}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-2 transition-all"
                       >
                          <Zap size={14} />
                          PROCESS ALL PENDING
                       </button>
                       <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                            <button onClick={() => { setDbViewMode('DRILLDOWN'); setSelectedGroupKey(null); }} className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-2 transition-colors ${dbViewMode === 'DRILLDOWN' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}><List size={14} /> Table</button>
                            <button onClick={() => setDbViewMode('GROUPS')} className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-2 transition-colors ${dbViewMode === 'GROUPS' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}><FolderOpen size={14} /> Clusters</button>
                       </div>
                       <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded border border-slate-700 min-w-[200px]">
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
                                <th key={h} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase border-b border-r border-slate-800 whitespace-nowrap bg-slate-950">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                           {paginatedAssets.map(asset => {
                               const rec = asset.sqlRecord;
                               return (
                                   <tr key={asset.id} className="hover:bg-slate-800/50 transition-colors text-xs font-mono">
                                       <td className="px-4 py-3 text-slate-500 border-r border-slate-800 whitespace-nowrap">{asset.id.substring(0,8)}</td>
                                       <td className="px-4 py-3 text-white border-r border-slate-800 whitespace-nowrap max-w-[200px] truncate">{rec?.DOCUMENT_TITLE || 'Processing...'}</td>
                                       <td className="px-4 py-3 text-blue-400 border-r border-slate-800 whitespace-nowrap">{rec?.SOURCE_COLLECTION || 'Pending'}</td>
                                       <td className="px-4 py-3 text-slate-300 border-r border-slate-800 whitespace-nowrap truncate max-w-[150px]">{rec?.ENTITIES_EXTRACTED.slice(0, 3).join(', ') || '...'}</td>
                                       <td className="px-4 py-3 text-emerald-400 border-r border-slate-800">{rec?.LOCAL_GIS_ZONE || '...'}</td>
                                       <td className="px-4 py-3 text-center border-r border-slate-800">{rec?.NODE_COUNT || 0}</td>
                                       <td className="px-4 py-3 border-r border-slate-800 whitespace-nowrap">{rec?.NLP_NODE_CATEGORIZATION || '...'}</td>
                                       <td className="px-4 py-3 border-r border-slate-800 min-w-[120px]">
                                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                                <div 
                                                    className={`h-full transition-all duration-500 ${asset.status === AssetStatus.FAILED ? 'bg-red-500' : asset.status === AssetStatus.MINTED ? 'bg-emerald-500' : 'bg-primary-500'}`}
                                                    style={{ width: `${asset.progress || (asset.status === AssetStatus.MINTED ? 100 : 0)}%` }}
                                                />
                                            </div>
                                       </td>
                                       <td className="px-4 py-3 text-center flex gap-2 justify-center">
                                          {rec && <button onClick={() => downloadJSON(asset)} className="text-primary-500 hover:text-white"><Download size={14} /></button>}
                                       </td>
                                   </tr>
                               )
                           })}
                        </tbody>
                    </table>
                 </div>
               )}
             </div>
          )}

          {activeTab === 'batch' && (
             <div className="max-w-6xl mx-auto h-full flex flex-col">
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
                                            <td className="px-4 py-2 min-w-[150px]">
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
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8">
                     {displayItems.map(item => ('bundleId' in item) ? <BundleCard key={item.bundleId} bundle={item as ImageBundle} onAssetUpdated={handleAssetUpdate} /> : (
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
                                <img src={item.imageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="doc" />
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
                                    <button onClick={() => { setSelectedAssetId(item.id); setActiveTab('graph'); }} className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded border border-slate-700">View Graph</button>
                                    <ContributeButton asset={item} onAssetUpdated={handleAssetUpdate} />
                                </div>
                            </div>
                        </div>
                     ))}
                 </div>
             </div>
          )}

          {activeTab === 'graph' && (
            <div className="flex gap-6 h-full flex-col">
               <div className="flex items-center justify-between">
                 <h3 className="text-lg font-bold text-white">Knowledge Graph</h3>
                 <div className="flex items-center gap-3">
                   <FilterBadge count={graphFilters.category !== 'all' || graphFilters.era !== 'all' || graphFilters.contested ? 1 : 0} onClick={() => setShowUnifiedFilters(true)} />
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
               
               {/* Inline Filter Bar for Knowledge Graph */}
               <InlineFilterBar activeView="graph" />
               
               {graphViewMode === 'SINGLE' && (
                 <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 p-4 flex flex-col">
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
                  <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 p-4 flex flex-col">
                      <div className="flex-1 relative"><GraphVisualizer data={globalGraphData} width={1000} height={600} /></div>
                  </div>
               )}
            </div>
          )}

          {activeTab === 'world' && (
            <div className="h-full flex flex-col bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              {/* Header with view mode toggle and filter integration */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-bold text-white">{worldViewMode === '3d' ? '3D World' : 'Semantic Canvas'}</h3>
                  <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                    <button 
                      onClick={() => setWorldViewMode('3d')} 
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${worldViewMode === '3d' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      <Globe size={14} />
                      3D View
                    </button>
                    <button 
                      onClick={() => setWorldViewMode('semantic')} 
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${worldViewMode === 'semantic' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      <Zap size={14} />
                      Semantic
                    </button>
                  </div>
                </div>
                <FilterBadge count={0} onClick={() => setShowUnifiedFilters(true)} />
              </div>
              <InlineFilterBar activeView="world" />
              <div className="flex-1">
                {worldViewMode === '3d' ? (
                  <WorldRenderer
                    graphData={graphViewMode === 'GLOBAL' ? globalGraphData : (assets.find(a => a.id === selectedAssetId)?.graphData || { nodes: [], links: [] })}
                    nearbyUsers={nearbyUsers}
                    currentUserId={user?.id}
                    onNodeSelect={(node) => {
                      const asset = assets.find(a => a.id === node.id);
                      if (asset) {
                        setSelectedAssetId(asset.id);
                      }
                    }}
                    onPositionChange={(pos) => {
                      if (avatar) {
                        updatePosition(pos, [0, 0, 0, 1], avatar.lastSector);
                      }
                    }}
                  />
                ) : (
                  <SemanticCanvas assets={assets} />
                )}
              </div>
            </div>
          )}

          {activeTab === 'ar' && (
            <div className="h-full rounded-xl overflow-hidden border border-slate-800 bg-black relative">
              <ARScene 
                onCapture={(file) => setArSessionQueue(prev => [...prev, file])} 
                onFinishSession={() => switchTab('batch')}
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
            <div className="h-full flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Data Marketplace</h3>
                  <p className="text-sm text-slate-400">Acquire high-quality training datasets and sharded document bundles.</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-xs font-bold">
                  <ShoppingBag size={14} />
                  {displayItems.filter(i => 'bundleId' in i).length} BUNDLES AVAILABLE
                </div>
              </div>

              <div className="flex-1 overflow-auto pr-2 custom-scrollbar">
                {displayItems.filter(i => 'bundleId' in i).length === 0 ? (
                  <div className="h-64 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500 gap-4">
                    <Package size={48} className="opacity-20" />
                    <div className="text-center">
                      <p className="font-bold text-slate-400">No Bundles Available</p>
                      <p className="text-xs max-w-xs mt-1">Upload more related documents to trigger automatic clustering and bundle generation.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {displayItems
                      .filter((item): item is ImageBundle => 'bundleId' in item)
                      .map((bundle) => (
                        <BundleCard 
                          key={bundle.bundleId} 
                          bundle={bundle} 
                          onClick={() => setPurchaseModalData({ title: bundle.title, assets: assets.filter(a => bundle.imageUrls.includes(a.imageUrl)) })}
                          onAssetUpdated={(updatedAsset) => {
                            setLocalAssets(prev => prev.map(a => a.id === updatedAsset.id ? updatedAsset : a));
                          }}
                        />
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'review' && isAdmin && (
            <div className="h-full flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Super-User Review Queue</h3>
                  <p className="text-sm text-slate-400">Process and validate images that failed automated extraction.</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-500 text-xs font-bold">
                  <AlertCircle size={14} />
                  {globalAssets.filter(a => a.sqlRecord?.PROCESSING_STATUS === AssetStatus.FAILED || !a.sqlRecord?.IS_ENTERPRISE).length} PENDING REVIEW
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
                          <th key={h} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase border-b border-r border-slate-800 whitespace-nowrap bg-slate-950">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {globalAssets
                        .filter(a => a.sqlRecord?.PROCESSING_STATUS === AssetStatus.FAILED || !a.sqlRecord?.IS_ENTERPRISE)
                        .map(asset => (
                          <tr key={asset.id} className="hover:bg-slate-800/50 transition-colors text-xs font-mono">
                            <td className="px-4 py-3 border-r border-slate-800">
                              <img src={asset.imageUrl} alt="Preview" className="w-12 h-12 object-cover rounded border border-slate-700" />
                            </td>
                            <td className="px-4 py-3 text-slate-500 border-r border-slate-800">{asset.id.substring(0, 8)}</td>
                            <td className="px-4 py-3 text-slate-300 border-r border-slate-800">{new Date(asset.timestamp).toLocaleString()}</td>
                            <td className="px-4 py-3 border-r border-slate-800">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${asset.status === AssetStatus.FAILED ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>
                                {asset.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-red-400 border-r border-slate-800 max-w-[200px] truncate">{asset.errorMessage || 'Manual Review Required'}</td>
                            <td className="px-4 py-3 text-center">
                              <button 
                                onClick={() => setEditingAsset(asset)}
                                className="px-3 py-1 bg-primary-600 hover:bg-primary-500 text-white rounded text-[10px] font-bold"
                              >
                                REVIEW & FIX
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
          )}
        </div>
        
        {expandedImage && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm" onClick={() => setExpandedImage(null)}>
                <button className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white"><X size={24} /></button>
                <img src={expandedImage} className="max-w-full max-h-full p-4 object-contain select-none" alt="Expanded Asset" />
            </div>
        )}

        {purchaseModalData && (
          <PurchaseModal 
            bundleTitle={purchaseModalData.title}
            assets={purchaseModalData.assets}
            ownedAssetIds={ownedAssetIds}
            onClose={() => setPurchaseModalData(null)}
            onConfirm={handlePurchase}
          />
        )}

        {showPrivacyPolicy && (
          <PrivacyPolicyModal onClose={() => setShowPrivacyPolicy(false)} />
        )}

        <IntegrationsHub 
          isOpen={showIntegrationsHub} 
          onClose={() => setShowIntegrationsHub(false)} 
        />

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

        {showProcessingPanel && (
            <div className="absolute top-16 right-8 w-96 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-40 flex flex-col max-h-[calc(100vh-120px)] animate-in slide-in-from-top-4 duration-200">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Zap size={14} className="text-amber-500" />
                        Processing Queue
                        {(totalPendingCount > 0 || batchQueue.filter(i => i.status === 'QUEUED' || i.status === 'PROCESSING').length > 0) && (
                            <span className="ml-2 px-2 py-0.5 bg-amber-500/20 text-amber-500 text-[10px] font-bold rounded-full">
                                {totalPendingCount + batchQueue.filter(i => i.status === 'QUEUED' || i.status === 'PROCESSING').length}
                            </span>
                        )}
                    </h3>
                    <div className="flex items-center gap-2">
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
                <div className="flex-1 overflow-auto p-2 space-y-4 custom-scrollbar">
                    {/* Server-Side Monitor Section */}
                    {user?.id && (
                        <div className="px-2 py-2 border-b border-slate-800/50 pb-4">
                            <QueueMonitor userId={user.id} />
                        </div>
                    )}

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
                            <div className="bg-slate-950 border border-slate-800 rounded max-h-32 overflow-y-auto text-[8px] font-mono">
                                {debugLogs.length === 0 ? (
                                    <div className="p-2 text-slate-600 text-center">No logs yet</div>
                                ) : (
                                    debugLogs.map(log => (
                                        <div key={log.id} className={`p-1 border-b border-slate-800/30 ${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-slate-300'}`}>
                                            <span className="text-slate-500">{log.timestamp}</span> {log.message}
                                        </div>
                                    ))
                                )}
                            </div>
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
                                    <span className="text-[10px] font-mono text-slate-400 truncate">{item.file.name.slice(0, 20)}</span>
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
                                <img src={asset.imageUrl} className="w-10 h-10 object-cover rounded border border-slate-700" alt="thumb" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] font-mono text-slate-400 truncate">{asset.id.slice(0,8)}</span>
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
        )}

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
              />
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
        />
      </main>

      {/* Unified Filter Panel - Sliding */}
      {showUnifiedFilters && (
        <div className="fixed right-0 top-0 bottom-0 w-96 bg-slate-900/95 backdrop-blur-sm border-l border-slate-800 shadow-2xl z-50 overflow-y-auto">
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
        />
      )}
    </div>
    </FilterProvider>
  );
}

function downloadJSON(asset: DigitalAsset) {
  if (!asset.sqlRecord) return;
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(asset.sqlRecord, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", `GEOGRAPH_DB_${asset.id}.json`);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}