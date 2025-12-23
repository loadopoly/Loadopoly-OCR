import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  CloudDownload
} from 'lucide-react';
import { AssetStatus, DigitalAsset, LocationData, HistoricalDocumentMetadata, BatchItem, ImageBundle, ScanType, SCAN_TYPE_CONFIG, GraphData, GraphNode } from './types';
import { processImageWithGemini } from './services/geminiService';
import { createBundles } from './services/bundleService';
import { initSync, isSyncEnabled } from './lib/syncEngine';
import { loadAssets, saveAsset, deleteAsset } from './lib/indexeddb';
import { redeemPhygitalCertificate } from './services/web3Service';
import { getCurrentUser } from './lib/auth';
import { fetchGlobalCorpus, contributeAssetToGlobalCorpus, fetchUserAssets } from './services/supabaseService';
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
import StatusBar from './components/StatusBar';
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp } from './components/KeyboardShortcuts';
import { announce } from './lib/accessibility';

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
  const assets = isGlobalView ? globalAssets : localAssets;
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
  const [selectedScanType, setSelectedScanType] = useState<ScanType | null>(null);
  const [isPublicBroadcast, setIsPublicBroadcast] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [arSessionQueue, setArSessionQueue] = useState<File[]>([]);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [ownedAssetIds, setOwnedAssetIds] = useState<Set<string>>(new Set());
  const [purchaseModalData, setPurchaseModalData] = useState<{title: string, assets: DigitalAsset[]} | null>(null);
  const [debugMode, setDebugMode] = useState(localStorage.getItem('geograph-debug-mode') === 'true');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isOpen: isShortcutsOpen, setIsOpen: setIsShortcutsOpen } = useKeyboardShortcutsHelp() as any;
  const isOnline = useOnlineStatus();
  const [syncOn, setSyncOn] = useState(false);
  const [web3Enabled, setWeb3Enabled] = useState(false);
  const [scannerConnected, setScannerConnected] = useState(false);

  const totalTokens = assets.reduce((acc, curr) => acc + (curr.tokenization?.tokenCount || 0), 0);

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
    if (!isGlobalView) {
        setLocalAssets(prev => prev.map(a => a.id === updatedAsset.id ? updatedAsset : a));
        if (user?.id) {
          // Authenticated users: update in Supabase
          const license = isPublicBroadcast ? 'CC0' : 'GEOGRAPH_CORPUS_1.0';
          contributeAssetToGlobalCorpus(updatedAsset, user.id, license as any, true)
            .catch(err => console.error("Failed to update asset in Supabase", err));
        } else {
          // Unauthenticated users: save to IndexedDB only
          await saveAsset(updatedAsset);
        }
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
              setArSessionQueue([]);
          }
      }
      setActiveTab(newTab);
  };

  const createInitialAsset = async (file: File): Promise<DigitalAsset> => {
      const checksum = await calculateSHA256(file);
      const ingestDate = new Date().toISOString();
      const id = Math.random().toString(36).substring(7);
      const scanType = (file as any).scanType || ScanType.DOCUMENT;

      return {
        id,
        imageUrl: URL.createObjectURL(file),
        imageBlob: file,
        timestamp: ingestDate,
        ocrText: "",
        status: AssetStatus.PROCESSING,
        progress: 10,
        sqlRecord: {
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
          LAST_MODIFIED: ingestDate,
          PROCESSING_STATUS: AssetStatus.PROCESSING,
          CONFIDENCE_SCORE: 0,
          ENTITIES_EXTRACTED: [],
          RELATED_ASSETS: [],
          PRESERVATION_EVENTS: [{ eventType: "INGESTION", timestamp: ingestDate, agent: "SYSTEM_USER", outcome: "SUCCESS" }],
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
      let location: {lat: number, lng: number} | null = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2000 }));
          location = { lat: position.coords.latitude, lng: position.coords.longitude };
        } catch (e) {}
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
            CREATOR_AGENT: analysis.creatorAgent,
            RIGHTS_STATEMENT: analysis.rightsStatement,
            LANGUAGE_CODE: analysis.languageCode,
            LAST_MODIFIED: new Date().toISOString(),
            PROCESSING_STATUS: AssetStatus.MINTED,
            CONFIDENCE_SCORE: analysis.confidenceScore,
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
              { eventType: "GEMINI_PROCESSING", timestamp: new Date().toISOString(), agent: "Gemini 2.5 Flash", outcome: "SUCCESS" }
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

      // Auto-store to Supabase (Automatic Cloud Sync)
      const license = isPublicBroadcast ? 'CC0' : 'GEOGRAPH_CORPUS_1.0';
      contributeAssetToGlobalCorpus(resultAsset, user?.id, license as any, true).then(syncResult => {
        if (syncResult.success && syncResult.publicUrl) {
          // Update local state with the permanent cloud URL
          const updatedAsset = { ...resultAsset, imageUrl: syncResult.publicUrl || resultAsset.imageUrl };
          setLocalAssets(prev => prev.map(a => a.id === asset.id ? updatedAsset : a));
        }
      }).catch(err => console.error("Auto-sync to Supabase failed", err));

      return resultAsset;
  };

  const ingestFile = async (file: File, source: string = "Upload") => {
    setIsProcessing(true);
    try {
      const newAsset = await createInitialAsset(file);
      if (newAsset.sqlRecord) {
        newAsset.sqlRecord.SOURCE_COLLECTION = source;
        newAsset.sqlRecord.IS_ENTERPRISE = false; // Initially not enterprise
      }
      setLocalAssets(prev => [newAsset, ...prev]);
      
      // Initial upload to Supabase as PENDING (Automatic Cloud Sync)
      // SKIPPED: We skip initial Supabase upload to avoid RLS update errors (no UPDATE policy).
      // The asset will be uploaded once processing is complete.
      await saveAsset(newAsset);

      if (source !== "Batch Folder" && source !== "Auto-Sync") setActiveTab('assets');
      
      try {
        const processedAsset = await processAssetPipeline(newAsset, file);
        setLocalAssets(prev => prev.map(a => a.id === newAsset.id ? processedAsset : a));
        if (!user) await saveAsset(processedAsset);
      } catch (processErr) {
        console.error("Processing failed, marking for super-user review:", processErr);
        const failedAsset: DigitalAsset = {
          ...newAsset,
          status: AssetStatus.FAILED,
          progress: 100,
          errorMessage: processErr instanceof Error ? processErr.message : String(processErr),
          sqlRecord: {
            ...newAsset.sqlRecord!,
            PROCESSING_STATUS: AssetStatus.FAILED,
            IS_ENTERPRISE: false, // Keep in global corpus for super-user
            PRESERVATION_EVENTS: [
              ...(newAsset.sqlRecord?.PRESERVATION_EVENTS || []),
              { eventType: "GEMINI_PROCESSING", timestamp: new Date().toISOString(), agent: "Gemini 2.5 Flash", outcome: "FAILURE" }
            ]
          }
        };
        setLocalAssets(prev => prev.map(a => a.id === newAsset.id ? failedAsset : a));
        
        // Sync the failure to Supabase so it can be reviewed by admins (Automatic Cloud Sync)
        const license = isPublicBroadcast ? 'CC0' : 'GEOGRAPH_CORPUS_1.0';
        contributeAssetToGlobalCorpus(failedAsset, user?.id, license as any, true).catch(e => console.error("Failed to sync error state", e));
      }
    } catch (err) {
      console.error("Ingestion failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchFiles = (files: File[]) => {
      const newQueueItems: BatchItem[] = files.map(file => ({
          id: Math.random().toString(36).substring(7),
          file,
          status: 'QUEUED',
          progress: 0,
          scanType: (file as any).scanType || selectedScanType || ScanType.DOCUMENT
      }));
      setBatchQueue(prev => [...prev, ...newQueueItems]);
      setActiveTab('batch');
      setTimeout(() => processNextBatchItem(), 100);
  };

  const processNextBatchItem = async () => {
      setBatchQueue(currentQueue => {
          const nextItemIndex = currentQueue.findIndex(i => i.status === 'QUEUED');
          if (nextItemIndex === -1) return currentQueue;
          const itemToProcess = currentQueue[nextItemIndex];
          (async () => {
             try {
                setBatchQueue(q => q.map(i => i.id === itemToProcess.id ? { ...i, status: 'PROCESSING', progress: 10 } : i));
                if (itemToProcess.scanType) (itemToProcess.file as any).scanType = itemToProcess.scanType;
                const newAsset = await createInitialAsset(itemToProcess.file);
                if (newAsset.sqlRecord) {
                  newAsset.sqlRecord.SOURCE_COLLECTION = "Batch Ingest";
                  newAsset.sqlRecord.IS_ENTERPRISE = false;
                }
                setLocalAssets(prev => [newAsset, ...prev]);
                
                // Initial upload to Supabase as PENDING if authenticated
                // SKIPPED: We skip initial Supabase upload to avoid RLS update errors (no UPDATE policy).
                // The asset will be uploaded once processing is complete.
                await saveAsset(newAsset);

                try {
                  const processedAsset = await processAssetPipeline(newAsset, itemToProcess.file);
                  setLocalAssets(prev => prev.map(a => a.id === newAsset.id ? processedAsset : a));
                  if (!user) await saveAsset(processedAsset);
                  setBatchQueue(q => q.map(i => i.id === itemToProcess.id ? { ...i, status: 'COMPLETED', progress: 100, assetId: newAsset.id } : i));
                } catch (processErr: any) {
                  console.error("Batch processing failed for item:", processErr);
                  const failedAsset: DigitalAsset = {
                    ...newAsset,
                    status: AssetStatus.FAILED,
                    progress: 100,
                    errorMessage: processErr.message || String(processErr),
                    sqlRecord: {
                      ...newAsset.sqlRecord!,
                      PROCESSING_STATUS: AssetStatus.FAILED,
                      IS_ENTERPRISE: false,
                      PRESERVATION_EVENTS: [
                        ...(newAsset.sqlRecord?.PRESERVATION_EVENTS || []),
                        { eventType: "GEMINI_PROCESSING", timestamp: new Date().toISOString(), agent: "Gemini 2.5 Flash", outcome: "FAILURE" }
                      ]
                    }
                  };
                  setLocalAssets(prev => prev.map(a => a.id === newAsset.id ? failedAsset : a));
                  
                  if (user?.id) {
                    const license = isPublicBroadcast ? 'CC0' : 'GEOGRAPH_CORPUS_1.0';
                    await contributeAssetToGlobalCorpus(failedAsset, user.id, license as any, true);
                  } else {
                    await saveAsset(failedAsset);
                  }
                  setBatchQueue(q => q.map(i => i.id === itemToProcess.id ? { ...i, status: 'ERROR', progress: 100, errorMsg: processErr.message || "Failed" } : i));
                }
             } catch (e: any) {
                 setBatchQueue(q => q.map(i => i.id === itemToProcess.id ? { ...i, status: 'ERROR', progress: 100, errorMsg: e.message || "Failed" } : i));
             } finally {
                 processNextBatchItem();
             }
          })();
          return currentQueue;
      });
  };

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

        <nav className="flex-1 space-y-1">
          <SidebarItem icon={Layers} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => switchTab('dashboard')} />
          <SidebarItem icon={Zap} label="Quick Processing" active={activeTab === 'batch'} onClick={() => switchTab('batch')} />
          <SidebarItem icon={Scan} label="AR Scanner" active={activeTab === 'ar'} onClick={() => switchTab('ar')} />
          <SidebarItem icon={ImageIcon} label="Assets & Bundles" active={activeTab === 'assets'} onClick={() => switchTab('assets')} />
          <SidebarItem icon={Network} label="Knowledge Graph" active={activeTab === 'graph'} onClick={() => switchTab('graph')} />
          <SidebarItem icon={Zap} label="Semantic View" active={activeTab === 'semantic'} onClick={() => switchTab('semantic')} />
          <SidebarItem icon={TableIcon} label="Structured DB" active={activeTab === 'database'} onClick={() => switchTab('database')} />
          <SidebarItem icon={ShoppingBag} label="Marketplace" active={activeTab === 'market'} onClick={() => switchTab('market')} />
          {isAdmin && <SidebarItem icon={ShieldCheck} label="Review Queue" active={activeTab === 'review'} onClick={() => switchTab('review')} />}
          <div className="pt-4 mt-4 border-t border-slate-800">
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
               <span>Gemini 2.5 Flash</span>
               <span className="text-green-500">●</span>
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
            <nav className="flex-1 px-2 space-y-1">
              <SidebarItem icon={Layers} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => { switchTab('dashboard'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={Zap} label="Quick Processing" active={activeTab === 'batch'} onClick={() => { switchTab('batch'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={Scan} label="AR Scanner" active={activeTab === 'ar'} onClick={() => { switchTab('ar'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={ImageIcon} label="Assets & Bundles" active={activeTab === 'assets'} onClick={() => { switchTab('assets'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={Network} label="Knowledge Graph" active={activeTab === 'graph'} onClick={() => { switchTab('graph'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={Zap} label="Semantic View" active={activeTab === 'semantic'} onClick={() => { switchTab('semantic'); setIsMobileMenuOpen(false); }} />
              <SidebarItem icon={TableIcon} label="Structured DB" active={activeTab === 'database'} onClick={() => { switchTab('database'); setIsMobileMenuOpen(false); }} />
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
             {!isGlobalView && activeTab !== 'batch' && activeTab !== 'ar' && (
                <>
                  <CameraCapture onCapture={(file) => ingestFile(file, "Mobile Camera")} />
                  <label className={`flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-medium rounded-lg cursor-pointer transition-all ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                      {isProcessing ? <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div> : <Upload size={18} />}
                      <span>Upload</span>
                      <input type="file" className="hidden" accept="image/*, application/pdf" onChange={(e) => e.target.files?.[0] && ingestFile(e.target.files[0], "Direct Upload")} disabled={isProcessing} />
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
                    <h3 className="text-white font-medium mb-4 flex items-center gap-2"><MapIcon size={18} className="text-emerald-500"/> GIS Context</h3>
                    <div className="space-y-4">
                        {assets.slice(0, 3).map(asset => (
                            <div key={asset.id} className="flex items-start gap-4 p-3 rounded bg-slate-950/50 border border-slate-800">
                                <img src={asset.imageUrl} className="w-16 h-16 object-cover rounded" alt="thumb" />
                                <div>
                                    <h4 className="text-sm font-bold text-slate-200">{asset.gisMetadata?.zoneType || 'Processing...'}</h4>
                                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{asset.processingAnalysis}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
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
                {isGlobalView ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                        {isAdmin ? (
                            <div className="w-full max-w-4xl p-6">
                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Radio className="text-red-500 animate-pulse" /> Admin Broadcast Console</h3>
                                    {!selectedScanType ? <SmartUploadSelector onTypeSelected={setSelectedScanType} /> : (
                                        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-700 rounded-lg bg-slate-950/50 gap-4">
                                            <h4 className="text-white font-bold mb-2">Broadcasting Type: {SCAN_TYPE_CONFIG[selectedScanType].label}</h4>
                                            <BatchImporter onFilesSelected={(files) => handleBatchFiles(files)} isProcessing={isProcessing} />
                                            <button onClick={() => setSelectedScanType(null)} className="text-xs text-slate-500 underline mt-2">Change Type</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center">
                                <Lock size={48} className="mb-4 opacity-50 mx-auto" />
                                <h3 className="text-xl font-bold text-white mb-2">Ingestion Locked</h3>
                                <button onClick={() => setIsGlobalView(false)} className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-white text-sm">Return to Local</button>
                            </div>
                        )}
                    </div>
                ) : !selectedScanType ? <SmartUploadSelector onTypeSelected={setSelectedScanType} /> : (
                  <div className="flex-1 flex flex-col">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                              <button onClick={() => setSelectedScanType(null)} className="mb-2 text-slate-400 hover:text-white flex items-center gap-2 text-sm">← Selection</button>
                              <h3 className="text-lg font-bold text-white flex items-center gap-2"><Zap className="text-amber-500" /> Batch Processor: <span className="text-primary-400">{SCAN_TYPE_CONFIG[selectedScanType].label}</span></h3>
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
                        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center"><h4 className="text-xs font-bold text-slate-400 uppercase">Processing Queue</h4></div>
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
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8">
                     {displayItems.map(item => ('bundleId' in item) ? <BundleCard key={item.bundleId} bundle={item as ImageBundle} onAssetUpdated={handleAssetUpdate} /> : (
                        <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:shadow-lg transition-all group">
                            <div className="relative h-48 bg-slate-950 overflow-hidden">
                                <img src={item.imageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="doc" />
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

          {activeTab === 'semantic' && (
            <div className="h-full bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <SemanticCanvas assets={assets} />
            </div>
          )}

          {activeTab === 'ar' && (
            <div className="h-full rounded-xl overflow-hidden border border-slate-800 bg-black relative">
              <ARScene 
                onCapture={(file) => setArSessionQueue(prev => [...prev, file])} 
                sessionCount={arSessionQueue.length}
              />
              {arSessionQueue.length > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
                  <button 
                    onClick={() => switchTab('batch')}
                    className="px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-full font-bold shadow-xl flex items-center gap-2 animate-bounce"
                  >
                    <CheckCircle size={20} />
                    Process {arSessionQueue.length} Captures
                  </button>
                </div>
              )}
            </div>
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
                                onClick={() => {
                                  // Logic to re-process or manually edit
                                  alert("Manual processing interface would open here.");
                                }}
                                className="px-3 py-1 bg-primary-600 hover:bg-primary-500 text-white rounded text-[10px] font-bold"
                              >
                                PROCESS
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

        <KeyboardShortcutsHelp 
          isOpen={isShortcutsOpen} 
          onClose={() => setIsShortcutsOpen(false)} 
        />

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
    </div>
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