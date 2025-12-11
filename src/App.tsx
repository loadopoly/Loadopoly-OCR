import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  Map, 
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
  Settings
} from 'lucide-react';
import { AssetStatus, DigitalAsset, LocationData, HistoricalDocumentMetadata, BatchItem, ImageBundle } from './types';
import { processImageWithGemini, simulateNFTMinting } from './services/geminiService';
import { createBundles } from './services/bundleService';
import { initSync } from './lib/syncEngine';
import GraphVisualizer from './components/GraphVisualizer';
import ContributeButton from './components/ContributeButton';
import BundleCard from './components/BundleCard';
import ARScene from './components/ARScene';
import SemanticCanvas from './components/SemanticCanvas';
import CameraCapture from './components/CameraCapture';
import BatchImporter from './components/BatchImporter';
import SettingsPanel from './components/SettingsPanel';

// --- Helper Functions ---
async function calculateSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const bitmapToFile = async (bitmap: ImageBitmap, fileName: string): Promise<File> => {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if(ctx) ctx.drawImage(bitmap, 0, 0);
    
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob) throw new Error("Failed to convert bitmap to blob");
    return new File([blob], fileName, { type: 'image/jpeg' });
};

// --- Sub-components ---

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

const StatCard = ({ label, value, icon: Icon, color }: any) => (
  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
    <div>
      <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
    <div className={`p-3 rounded-lg bg-opacity-10 ${color.replace('text-', 'bg-')}`}>
      <Icon className={color} size={24} />
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [assets, setAssets] = useState<DigitalAsset[]>([]);
  // Combined list of Single Assets AND Bundles for display
  const [displayItems, setDisplayItems] = useState<(DigitalAsset | ImageBundle)[]>([]);
  
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [geoPermission, setGeoPermission] = useState<boolean>(false);
  
  // Database & Grouping State
  const [groupBy, setGroupBy] = useState<'SOURCE' | 'ZONE' | 'CATEGORY' | 'RIGHTS'>('SOURCE');
  const [dbViewMode, setDbViewMode] = useState<'GROUPS' | 'DRILLDOWN'>('GROUPS');
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  // Graph View State
  const [graphViewMode, setGraphViewMode] = useState<'SINGLE' | 'GLOBAL'>('SINGLE');

  // Batch Processing State
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);

  // Asset View State
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  // AR State
  const arScanThrottleRef = useRef<number>(0);
  const [arStatus, setArStatus] = useState<string>('Ready');

  // Stats derivation
  const totalTokens = assets.reduce((acc, curr) => acc + (curr.tokenization?.tokenCount || 0), 0);

  useEffect(() => {
    // Check Geo permissions on mount
    navigator.permissions.query({ name: 'geolocation' }).then((result) => {
      setGeoPermission(result.state === 'granted');
    });

    // Initialize Auto Sync
    initSync();

    // Listen for background file events
    const handleNewFile = (event: CustomEvent<File>) => {
        // Automatically add to batch queue or direct ingest?
        // Let's use direct ingest for immediate feedback, but keep it robust
        ingestFile(event.detail, "Auto-Sync");
    };

    // @ts-ignore
    window.addEventListener('geograph-new-file', handleNewFile);

    return () => {
        // @ts-ignore
        window.removeEventListener('geograph-new-file', handleNewFile);
    }
  }, []); // Note: ingestFile dependency is omitted but safe here as ingestFile is defined below

  // --- Bundling Effect ---
  // When assets change, re-run bundling logic
  useEffect(() => {
    if (assets.length > 0) {
        // Only bundle assets that have been processed (MINTED)
        const mintedAssets = assets.filter(a => a.status === AssetStatus.MINTED);
        const processingAssets = assets.filter(a => a.status !== AssetStatus.MINTED);
        
        // Create bundles from minted assets
        const bundles = createBundles(mintedAssets);
        
        // Combine bundles with assets that are still processing
        setDisplayItems([...processingAssets, ...bundles]);
    } else {
        setDisplayItems([]);
    }
  }, [assets]);

  // --- Processing Logic ---

  const createInitialAsset = async (file: File): Promise<DigitalAsset> => {
      const checksum = await calculateSHA256(file);
      const ingestDate = new Date().toISOString();
      const fileSize = file.size;
      const fileType = file.type;
      const id = Math.random().toString(36).substring(7);

      return {
        id: id,
        imageUrl: URL.createObjectURL(file),
        timestamp: ingestDate,
        ocrText: "",
        status: AssetStatus.PROCESSING,
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
          SOURCE_COLLECTION: "Batch Ingest",
          DOCUMENT_TITLE: file.name,
          DOCUMENT_DESCRIPTION: "Pending Analysis",
          FILE_FORMAT: fileType,
          FILE_SIZE_BYTES: fileSize,
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
          PRESERVATION_EVENTS: [{
             eventType: "INGESTION",
             timestamp: ingestDate,
             agent: "SYSTEM_USER",
             outcome: "SUCCESS"
          }],
          KEYWORDS_TAGS: [],
          ACCESS_RESTRICTIONS: false,
          CONTRIBUTOR_ID: null,
          CONTRIBUTED_AT: null,
          DATA_LICENSE: 'GEOGRAPH_CORPUS_1.0',
          CONTRIBUTOR_NFT_MINTED: false
        }
      };
  };

  const processAssetPipeline = async (asset: DigitalAsset, file: File, customLocation?: {lat: number, lng: number}) => {
      let location: {lat: number, lng: number} | null = customLocation || null;
      
      if (!location && navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
             navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2000 });
          });
          location = { lat: position.coords.latitude, lng: position.coords.longitude };
        } catch (e) { /* ignore */ }
      }

      const analysis = await processImageWithGemini(file, location);
      
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
            CREATOR_AGENT: analysis.creatorAgent,
            RIGHTS_STATEMENT: analysis.rightsStatement,
            LANGUAGE_CODE: analysis.languageCode,
            LAST_MODIFIED: new Date().toISOString(),
            PROCESSING_STATUS: AssetStatus.MINTED,
            CONFIDENCE_SCORE: analysis.confidenceScore,
            ENTITIES_EXTRACTED: analysis.graphData?.nodes ? analysis.graphData.nodes.map(n => n.label) : [],
            KEYWORDS_TAGS: analysis.keywordsTags || [],
            ACCESS_RESTRICTIONS: analysis.accessRestrictions,
            PRESERVATION_EVENTS: [
              ...(asset.sqlRecord?.PRESERVATION_EVENTS || []),
              { eventType: "GEMINI_PROCESSING", timestamp: new Date().toISOString(), agent: "Gemini 2.5 Flash", outcome: "SUCCESS" }
            ]
      };

      return {
            ...asset,
            status: AssetStatus.MINTED,
            ocrText: analysis.ocrText,
            gisMetadata: analysis.gisMetadata,
            graphData: analysis.graphData,
            tokenization: analysis.tokenization,
            processingAnalysis: analysis.analysis,
            location: location ? { latitude: location.lat, longitude: location.lng, accuracy: 1 } : undefined,
            nft: simulateNFTMinting(asset.id),
            sqlRecord: updatedSqlRecord
      };
  };

  // --- Unified Ingestion Handler ---
  // Works for Single Upload, Camera Capture, and Batch processing
  const ingestFile = async (file: File, source: string = "Upload") => {
    setIsProcessing(true);
    try {
      const newAsset = await createInitialAsset(file);
      // Update source if needed
      if (newAsset.sqlRecord) newAsset.sqlRecord.SOURCE_COLLECTION = source;

      setAssets(prev => [newAsset, ...prev]);
      
      // Auto-switch to assets tab if it's a single upload or camera capture
      // But NOT for Auto-Sync (background)
      if (source !== "Batch Folder" && source !== "Auto-Sync") {
        setActiveTab('assets');
      }
      
      const processedAsset = await processAssetPipeline(newAsset, file);
      setAssets(prev => prev.map(a => a.id === newAsset.id ? processedAsset : a));

    } catch (err) {
      console.error(err);
      setAssets(prev => prev.map(a => a.status === AssetStatus.PROCESSING ? { ...a, status: AssetStatus.FAILED } : a));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCameraCapture = (file: File) => {
    ingestFile(file, "Mobile Camera");
  };

  const handleSingleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) ingestFile(file, "Direct Upload");
  };

  // --- Unified Batch File Handler ---
  const handleBatchFiles = (files: File[]) => {
      if (!files || files.length === 0) return;

      const newQueueItems: BatchItem[] = files.map(file => ({
          id: Math.random().toString(36).substring(7),
          file,
          status: 'QUEUED',
          progress: 0
      }));

      setBatchQueue(prev => [...prev, ...newQueueItems]);
      // Trigger processing queue
      setTimeout(() => processNextBatchItem(), 100);
  };

  const processNextBatchItem = async () => {
      setBatchQueue(currentQueue => {
          const nextItemIndex = currentQueue.findIndex(i => i.status === 'QUEUED');
          if (nextItemIndex === -1) return currentQueue; // Done

          const itemToProcess = currentQueue[nextItemIndex];
          
          (async () => {
             try {
                setBatchQueue(q => q.map(i => i.id === itemToProcess.id ? { ...i, status: 'PROCESSING', progress: 10 } : i));
                const newAsset = await createInitialAsset(itemToProcess.file);
                if (newAsset.sqlRecord) newAsset.sqlRecord.SOURCE_COLLECTION = "Batch Ingest"; 
                setAssets(prev => [newAsset, ...prev]);
                const processedAsset = await processAssetPipeline(newAsset, itemToProcess.file);
                setAssets(prev => prev.map(a => a.id === newAsset.id ? processedAsset : a));
                setBatchQueue(q => q.map(i => i.id === itemToProcess.id ? { ...i, status: 'COMPLETED', progress: 100, assetId: newAsset.id } : i));
             } catch (e) {
                 console.error("Batch Error", e);
                 setBatchQueue(q => q.map(i => i.id === itemToProcess.id ? { ...i, status: 'ERROR', progress: 100, errorMsg: "Processing Failed" } : i));
             } finally {
                 processNextBatchItem();
             }
          })();
          return currentQueue;
      });
  };

  const handleARFrame = async (bitmap: ImageBitmap) => {
      // Throttle: process only every 5 seconds
      const now = Date.now();
      if (now - arScanThrottleRef.current < 5000) return;
      
      arScanThrottleRef.current = now;
      setArStatus('Processing...');

      try {
          const file = await bitmapToFile(bitmap, `AR_Scan_${now}.jpg`);
          ingestFile(file, "AR Live Scan");
          setArStatus('Match Found!');
          setTimeout(() => setArStatus('Ready'), 2000);
      } catch (e) {
          console.error("AR Error", e);
          setArStatus('Error');
      }
  };


  const retryBatchItem = (itemId: string) => {
      setBatchQueue(prev => prev.map(i => i.id === itemId ? { ...i, status: 'QUEUED', progress: 0, errorMsg: undefined } : i));
      processNextBatchItem();
  };

  const removeBatchItem = (itemId: string) => {
      setBatchQueue(prev => prev.filter(i => i.id !== itemId));
  };


  const downloadJSON = (asset: DigitalAsset) => {
    if (!asset.sqlRecord) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(asset.sqlRecord, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `GEOGRAPH_DB_${asset.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const selectedAsset = assets.find(a => a.id === selectedAssetId);
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
  const drillDownAssets = selectedGroupKey ? (aggregatedGroups[selectedGroupKey] || []) : [];
  const totalPages = Math.ceil(drillDownAssets.length / ITEMS_PER_PAGE);
  const paginatedAssets = drillDownAssets.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const getGlobalGraphData = () => {
      const categories = Array.from(new Set(assets.map(a => a.sqlRecord?.NLP_NODE_CATEGORIZATION || 'Uncategorized')));
      const clusterNodes = categories.map((cat, idx) => ({
          id: `CLUSTER_${idx}`,
          label: cat,
          type: 'CLUSTER' as any,
          relevance: 1.0
      }));
      const docNodes = assets.map(a => ({
          id: a.id,
          label: a.sqlRecord?.DOCUMENT_TITLE || 'Untitled',
          type: 'DOCUMENT' as any,
          relevance: 0.8
      }));
      const links: any[] = [];
      assets.forEach(a => {
         const catIndex = categories.indexOf(a.sqlRecord?.NLP_NODE_CATEGORIZATION || 'Uncategorized');
         if (catIndex >= 0) {
             links.push({ source: a.id, target: `CLUSTER_${catIndex}`, relationship: "BELONGS_TO" });
         }
      });
      return { nodes: [...clusterNodes, ...docNodes], links };
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans selection:bg-primary-500/30">
      
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-2 text-primary-500 mb-1">
            <Database size={24} />
            <h1 className="text-xl font-bold tracking-tight text-white">GeoGraph<span className="text-slate-500">Node</span></h1>
          </div>
          <p className="text-xs text-slate-500">OCR • GIS • Graph • NFT</p>
        </div>

        <nav className="flex-1 space-y-1">
          <SidebarItem icon={Layers} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <SidebarItem icon={Zap} label="Quick Processing" active={activeTab === 'batch'} onClick={() => setActiveTab('batch')} />
          <SidebarItem icon={Scan} label="AR Scanner" active={activeTab === 'ar'} onClick={() => setActiveTab('ar')} />
          <SidebarItem icon={ImageIcon} label="Assets & Bundles" active={activeTab === 'assets'} onClick={() => setActiveTab('assets')} />
          <SidebarItem icon={Network} label="Knowledge Graph" active={activeTab === 'graph'} onClick={() => setActiveTab('graph')} />
          <SidebarItem icon={Zap} label="Semantic View" active={activeTab === 'semantic'} onClick={() => setActiveTab('semantic')} />
          <SidebarItem icon={TableIcon} label="Structured DB" active={activeTab === 'database'} onClick={() => setActiveTab('database')} />
          <SidebarItem icon={ShoppingBag} label="Marketplace" active={activeTab === 'market'} onClick={() => setActiveTab('market')} />
          <div className="pt-4 mt-4 border-t border-slate-800">
             <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          </div>
        </nav>

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

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Header */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-950/80 backdrop-blur z-10">
          <h2 className="text-lg font-semibold text-white capitalize">{activeTab === 'database' ? 'HISTORICAL DOCUMENTS DATABASE' : activeTab === 'batch' ? 'HIGH THROUGHPUT INGESTION' : activeTab}</h2>
          <div className="flex items-center gap-2">
             {activeTab !== 'batch' && activeTab !== 'ar' && (
                <>
                  <CameraCapture onCapture={handleCameraCapture} />
                  
                  {/* Keep standard upload but hidden/alternative if needed */}
                  <label className={`flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-medium rounded-lg cursor-pointer transition-all ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                      {isProcessing ? <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div> : <Upload size={18} />}
                      <span>Upload</span>
                      <input type="file" className="hidden" accept="image/*, application/pdf" onChange={handleSingleFileUpload} disabled={isProcessing} />
                  </label>
                </>
             )}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8 relative">
          
          {/* Dashboard View */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8 max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Total Assets" value={assets.length} icon={FileText} color="text-blue-500" />
                <StatCard label="Knowledge Nodes" value={assets.reduce((a,c) => a + (c.graphData?.nodes?.length || 0), 0)} icon={Network} color="text-purple-500" />
                <StatCard label="Training Tokens" value={totalTokens.toLocaleString()} icon={Cpu} color="text-emerald-500" />
                <StatCard label="Active Bundles" value={displayItems.filter(i => 'bundleId' in i).length} icon={Package} color="text-amber-500" />
              </div>

              {assets.length === 0 ? (
                <div className="h-64 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500 gap-4">
                  <div className="flex gap-4">
                     <CameraCapture onCapture={handleCameraCapture} />
                     <label className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer transition-all border border-slate-700">
                        <Upload size={20} />
                        <span>Upload File</span>
                        <input type="file" className="hidden" accept="image/*, application/pdf" onChange={handleSingleFileUpload} />
                     </label>
                  </div>
                  <p className="mt-2">Use the Camera or Upload to begin extraction</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                       <Network size={18} className="text-primary-500"/> Recent Graph Activity
                    </h3>
                    {assets[0].graphData && <GraphVisualizer data={assets[0].graphData} height={300} width={500} />}
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                      <Map size={18} className="text-emerald-500"/> GIS Context
                    </h3>
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

          {/* AR View */}
          {activeTab === 'ar' && (
              <div className="h-full flex flex-col bg-black rounded-2xl overflow-hidden relative border border-slate-800">
                  <ARScene onFrame={handleARFrame} />
                  <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur px-4 py-2 rounded-full border border-slate-700 text-white font-mono text-sm">
                      Status: <span className={arStatus === 'Match Found!' ? 'text-emerald-400' : 'text-slate-300'}>{arStatus}</span>
                  </div>
              </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
              <SettingsPanel />
          )}

          {/* Quick Processing / Batch Tab */}
          {activeTab === 'batch' && (
             <div className="max-w-6xl mx-auto h-full flex flex-col">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
                    <div className="flex justify-between items-start mb-4">
                       <div>
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                             <Zap className="text-amber-500" /> Batch Processor
                          </h3>
                          <p className="text-slate-400 text-sm mt-1">
                             Optimized for 500+ documents/hr. Automatic bundling by time & location.
                          </p>
                       </div>
                       <div className="text-right">
                          <p className="text-2xl font-mono text-white">{batchQueue.filter(i => i.status === 'COMPLETED').length} <span className="text-sm text-slate-500">/ {batchQueue.length}</span></p>
                          <p className="text-xs text-slate-500">Processed</p>
                       </div>
                    </div>
                    
                    {/* Replaced Upload Area with BatchImporter */}
                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-700 rounded-lg bg-slate-950/50 gap-4">
                        <BatchImporter 
                            onFilesSelected={handleBatchFiles}
                            isProcessing={isProcessing}
                        />
                    </div>
                </div>

                {/* Queue Table */}
                <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                        <h4 className="text-xs font-bold text-slate-400 uppercase">Processing Queue</h4>
                        {batchQueue.length > 0 && (
                            <button onClick={() => setBatchQueue([])} className="text-xs text-red-500 hover:text-red-400 flex items-center gap-1">
                                <Trash2 size={12} /> Clear All
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-950 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-[10px] text-slate-500 font-bold uppercase">Status</th>
                                    <th className="px-4 py-2 text-[10px] text-slate-500 font-bold uppercase">File Name</th>
                                    <th className="px-4 py-2 text-[10px] text-slate-500 font-bold uppercase">Size</th>
                                    <th className="px-4 py-2 text-[10px] text-slate-500 font-bold uppercase">Message</th>
                                    <th className="px-4 py-2 text-[10px] text-slate-500 font-bold uppercase text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {batchQueue.map((item) => (
                                    <tr key={item.id} className="text-xs group hover:bg-slate-800/30">
                                        <td className="px-4 py-2">
                                            {item.status === 'QUEUED' && <span className="inline-block w-2 h-2 rounded-full bg-slate-600" title="Queued"></span>}
                                            {item.status === 'PROCESSING' && <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Processing"></div>}
                                            {item.status === 'COMPLETED' && <CheckCircle size={14} className="text-emerald-500" />}
                                            {item.status === 'ERROR' && <AlertCircle size={14} className="text-red-500" />}
                                        </td>
                                        <td className="px-4 py-2 text-slate-300 font-mono">{item.file.name}</td>
                                        <td className="px-4 py-2 text-slate-500">{(item.file.size / 1024).toFixed(1)} KB</td>
                                        <td className="px-4 py-2">
                                            {item.status === 'ERROR' ? (
                                                <span className="text-red-400">{item.errorMsg}</span>
                                            ) : item.status === 'COMPLETED' ? (
                                                <span className="text-emerald-500/70">Ingested to DB</span>
                                            ) : (
                                                <span className="text-slate-600">Waiting for worker...</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            {item.status === 'ERROR' && (
                                                <button onClick={() => retryBatchItem(item.id)} className="text-primary-500 hover:text-white mr-2" title="Retry">
                                                    <RefreshCw size={14} />
                                                </button>
                                            )}
                                            <button onClick={() => removeBatchItem(item.id)} className="text-slate-600 hover:text-red-500" title="Remove">
                                                <X size={14} />
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

          {/* Semantic View */}
          {activeTab === 'semantic' && (
             <div className="h-full p-4 md:p-8 flex flex-col">
               <h2 className="text-2xl font-bold text-white mb-6">Semantic Knowledge Universe</h2>
               <div className="flex-1 min-h-0 border border-slate-800 rounded-xl bg-black">
                  <SemanticCanvas assets={assets} />
               </div>
             </div>
          )}

          {/* Assets Exploratory View with BUNDLES */}
          {activeTab === 'assets' && (
             <div className="h-full overflow-y-auto">
                 <div className="flex justify-between items-center mb-6">
                     <h3 className="text-lg font-bold text-white">Exploratory Analysis & Bundles</h3>
                     <div className="flex gap-2 text-xs text-slate-400 bg-slate-900 px-3 py-1 rounded border border-slate-800">
                         <span>Showing {displayItems.length} items</span>
                     </div>
                 </div>

                 {/* Masonry Grid Simulation */}
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8">
                     {displayItems.map(item => {
                         if ('bundleId' in item) {
                             // Render Bundle Card
                             return (
                                 <BundleCard key={item.bundleId} bundle={item as ImageBundle} onClick={() => console.log('View bundle details')} />
                             );
                         } else {
                             // Render Single Asset Card
                             const asset = item as DigitalAsset;
                             return (
                                <div key={asset.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:shadow-lg hover:shadow-primary-900/10 transition-all hover:-translate-y-1 group">
                                    {/* Image Header */}
                                    <div className="relative h-48 bg-slate-950 group overflow-hidden">
                                        <img src={asset.imageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="doc" />
                                        <button 
                                           onClick={() => setExpandedImage(asset.imageUrl)}
                                           className="absolute top-2 right-2 p-1.5 bg-black/60 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black"
                                        >
                                            <Maximize2 size={14} />
                                        </button>
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-12">
                                            <div className="flex justify-between items-end">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${asset.sqlRecord?.CONFIDENCE_SCORE && asset.sqlRecord.CONFIDENCE_SCORE > 0.8 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>
                                                    Conf: {(asset.sqlRecord?.CONFIDENCE_SCORE || 0) * 100}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card Body */}
                                    <div className="p-4">
                                        <h4 className="font-bold text-white text-sm mb-1 truncate" title={asset.sqlRecord?.DOCUMENT_TITLE}>{asset.sqlRecord?.DOCUMENT_TITLE || 'Processing...'}</h4>
                                        <p className="text-xs text-slate-500 mb-3">{asset.sqlRecord?.NLP_NODE_CATEGORIZATION}</p>

                                        {/* Key Stats Row */}
                                        <div className="flex justify-between items-center py-3 border-t border-b border-slate-800 mb-3">
                                            <div className="text-center">
                                                <p className="text-[10px] text-slate-500 uppercase">Nodes</p>
                                                <p className="text-sm font-mono text-primary-400">{asset.sqlRecord?.NODE_COUNT || 0}</p>
                                            </div>
                                            <div className="h-6 w-px bg-slate-800"></div>
                                            <div className="text-center">
                                                <p className="text-[10px] text-slate-500 uppercase">Year</p>
                                                <p className="text-sm font-mono text-indigo-400">{asset.sqlRecord?.NLP_DERIVED_TIMESTAMP?.substring(0, 4) || 'N/A'}</p>
                                            </div>
                                            <div className="h-6 w-px bg-slate-800"></div>
                                            <div className="text-center">
                                                <p className="text-[10px] text-slate-500 uppercase">Zone</p>
                                                <p className="text-sm font-mono text-emerald-400 max-w-[80px] truncate" title={asset.sqlRecord?.LOCAL_GIS_ZONE}>{asset.sqlRecord?.LOCAL_GIS_ZONE || 'N/A'}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex gap-2 mt-auto">
                                            <button onClick={() => { setSelectedAssetId(asset.id); setActiveTab('graph'); }} className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded border border-slate-700 transition-colors">
                                                View Graph
                                            </button>
                                            <button onClick={() => downloadJSON(asset)} className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 transition-colors">
                                                <Download size={14} />
                                            </button>
                                            <ContributeButton asset={asset} />
                                        </div>
                                    </div>
                                </div>
                             );
                         }
                     })}
                     
                     {displayItems.length === 0 && (
                         <div className="col-span-full py-20 text-center">
                             <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-800">
                                 <ImageIcon className="text-slate-600" size={32} />
                             </div>
                             <h3 className="text-slate-400 font-bold">No assets found</h3>
                             <p className="text-slate-600 text-sm mt-2">Upload items in Dashboard or Batch Processing to populate the grid.</p>
                         </div>
                     )}
                 </div>
             </div>
          )}

          {/* Structured Database View - HIERARCHICAL REFACTOR */}
          {activeTab === 'database' && (
             <div className="h-full flex flex-col gap-4">
               {/* Controls */}
               <div className="flex flex-col md:flex-row justify-between items-end bg-slate-900 p-4 rounded-xl border border-slate-800 gap-4">
                   <div className="space-y-1">
                      <h3 className="text-white font-bold flex items-center gap-2">
                          <Database size={18} className="text-primary-500" /> Repository Master List
                      </h3>
                      {dbViewMode === 'GROUPS' ? (
                          <p className="text-xs text-slate-400">Select a feature to group the repository by.</p>
                      ) : (
                          <p className="text-xs text-slate-400 flex items-center gap-2">
                             <span className="text-slate-500">Group:</span> {selectedGroupKey} 
                             <span className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">{drillDownAssets.length} items</span>
                          </p>
                      )}
                   </div>
                   
                   <div className="flex flex-wrap gap-4">
                       <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded border border-slate-700 min-w-[240px]">
                           <Filter size={14} className="text-primary-500" />
                           <div className="flex-1 flex flex-col">
                              <span className="text-[9px] text-slate-500 uppercase font-bold">Grouping Feature</span>
                              <select 
                                className="bg-transparent border-none text-xs text-slate-200 focus:outline-none cursor-pointer font-bold"
                                value={groupBy}
                                onChange={(e) => {
                                    setGroupBy(e.target.value as any);
                                    setDbViewMode('GROUPS');
                                    setSelectedGroupKey(null);
                                }}
                              >
                                  <option value="SOURCE">Source Collection</option>
                                  <option value="ZONE">GIS Zone</option>
                                  <option value="CATEGORY">NLP Category</option>
                                  <option value="RIGHTS">Rights Statement</option>
                              </select>
                           </div>
                       </div>
                   </div>
               </div>

               {/* VIEW 1: DATASET GROUPS (FOLDERS) */}
               {dbViewMode === 'GROUPS' && (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-auto pb-4">
                    {Object.entries(aggregatedGroups).map(([groupName, groupAssets]) => (
                       <button 
                           key={groupName} 
                           onClick={() => { setSelectedGroupKey(groupName); setDbViewMode('DRILLDOWN'); setCurrentPage(1); }}
                           className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-primary-500/50 hover:bg-slate-800/50 transition-all text-left group relative overflow-hidden"
                       >
                          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                              <FolderOpen size={64} />
                          </div>
                          
                          <div className="relative z-10">
                              <div className="flex items-center gap-2 mb-2">
                                  <FolderOpen size={20} className="text-primary-500" />
                                  <span className="text-xs text-slate-500 font-mono uppercase">{groupBy} Group</span>
                              </div>
                              <h4 className="text-lg font-bold text-white mb-4 line-clamp-2">{groupName}</h4>
                              
                              <div className="space-y-2 mb-4">
                                  <div className="flex justify-between text-xs">
                                     <span className="text-slate-400">Items</span>
                                     <span className="text-white font-mono">{groupAssets.length}</span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                     <span className="text-slate-400">Est. Tokens</span>
                                     <span className="text-emerald-400 font-mono">
                                        {groupAssets.reduce((acc, curr) => acc + (curr.tokenization?.tokenCount || 0), 0).toLocaleString()}
                                     </span>
                                  </div>
                              </div>
                          </div>
                       </button>
                    ))}
                    {Object.keys(aggregatedGroups).length === 0 && (
                        <div className="col-span-full py-20 text-center text-slate-500">
                            No data available. Ingest assets to create groups.
                        </div>
                    )}
                 </div>
               )}

               {/* VIEW 2: DRILL DOWN LIST */}
               {dbViewMode === 'DRILLDOWN' && (
               <>
                 <div className="flex items-center gap-2 mb-2">
                     <button 
                        onClick={() => setDbViewMode('GROUPS')}
                        className="flex items-center gap-1 text-xs text-primary-400 hover:text-white transition-colors"
                     >
                        <ArrowLeft size={14} /> Back to Groups
                     </button>
                 </div>

                 <div className="flex-1 overflow-auto bg-slate-900 border border-slate-800 rounded-xl shadow-inner scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900 relative">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-950 sticky top-0 z-10 shadow-sm">
                          <tr>
                            {['ASSET_ID', 'DOC_TITLE', 'LOCAL_TIMESTAMP', 'OCR_TIMESTAMP', 'NLP_TIMESTAMP', 'LOCAL_GIS', 'OCR_GIS', 'NLP_GIS', 'NODES', 'CATEGORY', 'RIGHTS', 'FORMAT', 'SIZE (B)', 'FIXITY (SHA256)', 'CONFIDENCE', 'ACCESS', 'ACTION'].map(h => (
                                <th key={h} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-r border-slate-800 whitespace-nowrap bg-slate-950">
                                    {h}
                                </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                           {paginatedAssets.map(asset => {
                               const rec = asset.sqlRecord;
                               if (!rec) return null;
                               return (
                                   <tr key={asset.id} className="hover:bg-slate-800/50 transition-colors text-xs font-mono">
                                       <td className="px-4 py-3 text-slate-500 border-r border-slate-800 whitespace-nowrap">{rec.ASSET_ID.substring(0,8)}...</td>
                                       <td className="px-4 py-3 text-white border-r border-slate-800 whitespace-nowrap max-w-[200px] truncate" title={rec.DOCUMENT_TITLE}>{rec.DOCUMENT_TITLE}</td>
                                       <td className="px-4 py-3 text-slate-400 border-r border-slate-800 whitespace-nowrap">{new Date(rec.LOCAL_TIMESTAMP).toLocaleDateString()}</td>
                                       <td className="px-4 py-3 text-primary-400 border-r border-slate-800 whitespace-nowrap">{rec.OCR_DERIVED_TIMESTAMP || '-'}</td>
                                       <td className="px-4 py-3 text-indigo-400 border-r border-slate-800 whitespace-nowrap">{rec.NLP_DERIVED_TIMESTAMP || '-'}</td>
                                       <td className="px-4 py-3 text-emerald-400 border-r border-slate-800 whitespace-nowrap">{rec.LOCAL_GIS_ZONE}</td>
                                       <td className="px-4 py-3 text-slate-400 border-r border-slate-800 whitespace-nowrap">{rec.OCR_DERIVED_GIS_ZONE || '-'}</td>
                                       <td className="px-4 py-3 text-slate-400 border-r border-slate-800 whitespace-nowrap">{rec.NLP_DERIVED_GIS_ZONE || '-'}</td>
                                       <td className="px-4 py-3 text-center border-r border-slate-800">{rec.NODE_COUNT}</td>
                                       <td className="px-4 py-3 border-r border-slate-800 whitespace-nowrap max-w-[150px] truncate">{rec.NLP_NODE_CATEGORIZATION}</td>
                                       <td className="px-4 py-3 border-r border-slate-800 whitespace-nowrap">{rec.RIGHTS_STATEMENT}</td>
                                       <td className="px-4 py-3 border-r border-slate-800">{rec.FILE_FORMAT}</td>
                                       <td className="px-4 py-3 border-r border-slate-800 text-right">{rec.FILE_SIZE_BYTES.toLocaleString()}</td>
                                       <td className="px-4 py-3 border-r border-slate-800 whitespace-nowrap text-[9px] text-slate-600" title={rec.FIXITY_CHECKSUM}>{rec.FIXITY_CHECKSUM.substring(0,8)}...</td>
                                       <td className="px-4 py-3 border-r border-slate-800 text-center">
                                           <span className={`px-1.5 py-0.5 rounded ${rec.CONFIDENCE_SCORE > 0.8 ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
                                               {(rec.CONFIDENCE_SCORE * 100).toFixed(0)}%
                                           </span>
                                       </td>
                                       <td className="px-4 py-3 border-r border-slate-800 text-center">
                                           {rec.ACCESS_RESTRICTIONS ? <EyeOff size={12} className="text-red-500 mx-auto"/> : <Eye size={12} className="text-green-500 mx-auto"/>}
                                       </td>
                                       <td className="px-4 py-3 text-center">
                                          <button onClick={() => downloadJSON(asset)} className="text-primary-500 hover:text-white">
                                              <Download size={14} />
                                          </button>
                                       </td>
                                   </tr>
                               )
                           })}
                        </tbody>
                    </table>
                 </div>
                 
                 {/* Pagination Controls */}
                 <div className="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800 text-xs text-slate-400">
                    <div>
                        Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, drillDownAssets.length)} of {drillDownAssets.length} entries
                    </div>
                    <div className="flex gap-2">
                        <button 
                           onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                           disabled={currentPage === 1}
                           className="p-1 rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="flex items-center px-2 font-mono text-white">Page {currentPage} of {totalPages || 1}</span>
                        <button 
                           onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                           disabled={currentPage === totalPages || totalPages === 0}
                           className="p-1 rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                 </div>
               </>
               )}
             </div>
          )}

          {/* Graph Tab */}
          {activeTab === 'graph' && (
            <div className="flex gap-6 h-full flex-col">
               {/* Controls */}
               <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">Knowledge Graph</h3>
                  <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                      <button 
                        onClick={() => setGraphViewMode('SINGLE')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${graphViewMode === 'SINGLE' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      >
                        Single Asset Focus
                      </button>
                      <button 
                        onClick={() => setGraphViewMode('GLOBAL')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${graphViewMode === 'GLOBAL' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      >
                        Global Corpus
                      </button>
                  </div>
               </div>

               {/* GLOBAL VIEW */}
               {graphViewMode === 'GLOBAL' && (
                  <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 p-4 flex flex-col">
                      <div className="flex justify-between items-center mb-2">
                         <h4 className="text-sm font-bold text-slate-400">Semantic Bundling (All Assets)</h4>
                         <p className="text-xs text-slate-500">Clusters based on NLP Categories</p>
                      </div>
                      <div className="flex-1 relative">
                          <GraphVisualizer data={getGlobalGraphData()} width={1000} height={600} />
                      </div>
                  </div>
               )}

               {/* SINGLE VIEW */}
               {graphViewMode === 'SINGLE' && (
                <div className="flex gap-6 h-full">
                    {/* List */}
                    <div className="w-72 flex-shrink-0 border-r border-slate-800 pr-6 overflow-y-auto">
                        <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">Select Asset</h3>
                        <div className="space-y-2">
                        {assets.map(asset => (
                            <button 
                                key={asset.id}
                                onClick={() => setSelectedAssetId(asset.id)}
                                className={`w-full text-left p-3 rounded-lg border transition-all ${selectedAssetId === asset.id ? 'bg-primary-600/10 border-primary-500/50' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                            >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-mono text-slate-500">ID: {asset.id.substring(0,8)}</span>
                                {asset.status === AssetStatus.MINTED && <CheckCircle size={12} className="text-emerald-500"/>}
                            </div>
                            <p className="text-xs text-slate-400 truncate font-bold">{asset.sqlRecord?.DOCUMENT_TITLE || 'Processing...'}</p>
                            </button>
                        ))}
                        </div>
                    </div>

                    {/* Detail Panel */}
                    {selectedAsset ? (
                        <div className="flex-1 overflow-y-auto pr-2">
                            {selectedAsset.status === AssetStatus.MINTED && (
                                <div className="space-y-8 animate-in fade-in duration-500">
                                    <div className="bg-slate-900 p-1 rounded-xl border border-slate-800">
                                        <div className="p-4 border-b border-slate-800 mb-2 flex justify-between items-center">
                                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Semantic Knowledge Graph</h3>
                                            <span className="text-xs text-slate-500">{selectedAsset.graphData?.nodes?.length || 0} Nodes</span>
                                        </div>
                                        {selectedAsset.graphData && <GraphVisualizer data={selectedAsset.graphData} width={800} height={500} />}
                                    </div>
                                    <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
                                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Extracted Entities</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedAsset.graphData?.nodes?.map((node, i) => (
                                                <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs ${
                                                    node.type === 'PERSON' ? 'bg-blue-900/20 border-blue-800 text-blue-300' :
                                                    node.type === 'LOCATION' ? 'bg-emerald-900/20 border-emerald-800 text-emerald-300' :
                                                    'bg-slate-800 border-slate-700 text-slate-300'
                                                }`}>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>
                                                    <span className="font-bold">{node.label}</span>
                                                    <span className="opacity-50 ml-1 text-[10px] uppercase">{node.type}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-slate-600">
                            <p>Select an asset to view its specific graph</p>
                        </div>
                    )}
                </div>
               )}
            </div>
          )}

          {/* Marketplace / NFT View - AGGREGATED BUNDLES */}
          {activeTab === 'market' && (
              <div className="max-w-6xl mx-auto">
                  <div className="flex justify-between items-end mb-8">
                      <div>
                          <h2 className="text-3xl font-bold text-white mb-2">Sharded Data Bundles</h2>
                          <p className="text-slate-400 max-w-2xl">
                             Purchase fractional ownership of entire curated datasets. 
                             <span className="text-primary-400 block mt-1">
                               Dynamic Sharding: Total shard supply increases automatically as more data is added to the background database.
                             </span>
                          </p>
                      </div>
                      
                      <div className="bg-slate-900 px-4 py-2 rounded-lg border border-slate-800 text-right">
                          <p className="text-xs text-slate-500 uppercase">Current Grouping</p>
                          <p className="text-lg font-bold text-white">{groupBy}</p>
                      </div>
                  </div>

                  {/* Bundle Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {Object.entries(aggregatedGroups).map(([groupName, groupAssets]) => {
                          const bundleSize = groupAssets.length;
                          const totalShards = bundleSize * 1000;
                          const bundlePriceEth = (bundleSize * 0.05).toFixed(3);
                          const totalTokens = groupAssets.reduce((acc, curr) => acc + (curr.tokenization?.tokenCount || 0), 0);
                          
                          return (
                            <div key={groupName} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group hover:border-primary-500/50 transition-all flex flex-col">
                                <div className="h-32 bg-gradient-to-br from-slate-800 to-slate-950 relative p-6 flex flex-col justify-between">
                                    <div className="absolute top-0 right-0 p-4 opacity-10">
                                        <Package size={80} />
                                    </div>
                                    <div className="relative z-10">
                                        <div className="flex justify-between items-start">
                                            <span className="px-2 py-1 bg-black/40 rounded text-[10px] font-mono text-slate-300 border border-white/10 uppercase tracking-wide">
                                                {groupBy} Bundle
                                            </span>
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-bold text-white relative z-10 truncate">{groupName}</h3>
                                </div>
                                
                                <div className="p-6 flex-1 flex flex-col">
                                    <div className="grid grid-cols-2 gap-4 mb-6">
                                        <div>
                                            <p className="text-[10px] text-slate-500 uppercase">Documents</p>
                                            <p className="text-lg font-mono text-white">{bundleSize}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 uppercase">Total Tokens</p>
                                            <p className="text-lg font-mono text-emerald-400">{totalTokens.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 uppercase">Dynamic Shards</p>
                                            <p className="text-lg font-mono text-purple-400">{totalShards.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 uppercase">Bundle Price</p>
                                            <p className="text-lg font-mono text-amber-500">Ξ {bundlePriceEth}</p>
                                        </div>
                                    </div>

                                    <div className="mt-auto">
                                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-4">
                                            <div className="bg-gradient-to-r from-primary-500 to-purple-600 h-full w-3/4"></div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                                                <Coins size={16} /> Buy Shards
                                            </button>
                                            <button className="px-3 border border-slate-700 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                                                <Share2 size={18} />
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-center text-slate-500 mt-2">
                                            Contract updates automatically on ingest
                                        </p>
                                    </div>
                                </div>
                            </div>
                          );
                      })}
                      
                      {Object.keys(aggregatedGroups).length === 0 && (
                          <div className="col-span-3 py-12 text-center text-slate-500">
                              <AlertCircle className="mx-auto mb-2 opacity-50" size={32}/>
                              No bundles available. Go to Quick Processing to ingest data.
                          </div>
                      )}
                  </div>
              </div>
          )}

        </div>
        
        {/* Full Screen Image Modal */}
        {expandedImage && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm" onClick={() => setExpandedImage(null)}>
                <button className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white">
                    <X size={24} />
                </button>
                <img src={expandedImage} className="max-w-full max-h-full p-4 object-contain select-none" alt="Expanded Asset" />
            </div>
        )}

      </main>
    </div>
  );
}