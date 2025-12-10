import React, { useState, useEffect, useCallback } from 'react';
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
  Code,
  Filter,
  ShieldCheck,
  Eye,
  EyeOff
} from 'lucide-react';
import { AssetStatus, DigitalAsset, LocationData, PreservationEvent, HistoricalDocumentMetadata } from './types';
import { processImageWithGemini, simulateNFTMinting } from './services/geminiService';
import GraphVisualizer from './components/GraphVisualizer';

// --- Helper Functions ---
async function calculateSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [geoPermission, setGeoPermission] = useState<boolean>(false);
  const [sourceCollectionFilter, setSourceCollectionFilter] = useState('ALL');

  // Stats derivation
  const totalTokens = assets.reduce((acc, curr) => acc + (curr.tokenization?.tokenCount || 0), 0);
  const totalValue = assets.reduce((acc, curr) => acc + (curr.nft ? curr.nft.availableShards * curr.nft.pricePerShard : 0), 0);

  useEffect(() => {
    // Check Geo permissions on mount
    navigator.permissions.query({ name: 'geolocation' }).then((result) => {
      setGeoPermission(result.state === 'granted');
    });
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    
    try {
      // 1. Calculate Technical Metadata (PREMIS)
      const checksum = await calculateSHA256(file);
      const ingestDate = new Date().toISOString();
      const fileSize = file.size;
      const fileType = file.type;

      // 2. Create placeholder asset
      const newAsset: DigitalAsset = {
        id: Math.random().toString(36).substring(7),
        imageUrl: URL.createObjectURL(file),
        timestamp: ingestDate,
        ocrText: "",
        status: AssetStatus.PROCESSING,
        // Init SQL record with empty processing fields but populated tech metadata
        sqlRecord: {
          ASSET_ID: "", // Set later
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
          SOURCE_COLLECTION: "General Upload", // Default
          DOCUMENT_TITLE: "Processing...",
          DOCUMENT_DESCRIPTION: "Pending Analysis",
          FILE_FORMAT: fileType,
          FILE_SIZE_BYTES: fileSize,
          RESOLUTION_DPI: 72, // Placeholder
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
          ACCESS_RESTRICTIONS: false
        }
      };

      // Set ID correctly in sub-object
      if (newAsset.sqlRecord) newAsset.sqlRecord.ASSET_ID = newAsset.id;

      setAssets(prev => [newAsset, ...prev]);
      setActiveTab('database');
      setSelectedAssetId(newAsset.id);

      // 3. Get Location
      let location: {lat: number, lng: number} | null = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
        } catch (e) {
          console.warn("Geolocation failed or denied", e);
        }
      }

      // 4. Process with Gemini
      const analysis = await processImageWithGemini(file, location);
      
      // 5. Update Asset with Result
      setAssets(prev => prev.map(a => {
        if (a.id === newAsset.id) {
          
          // Construct the final SQL record
          const updatedSqlRecord: HistoricalDocumentMetadata = {
            ...a.sqlRecord!,
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
              ...a.sqlRecord!.PRESERVATION_EVENTS,
              { eventType: "GEMINI_PROCESSING", timestamp: new Date().toISOString(), agent: "Gemini 2.5 Flash", outcome: "SUCCESS" }
            ]
          };

          return {
            ...a,
            status: AssetStatus.MINTED,
            ocrText: analysis.ocrText,
            gisMetadata: analysis.gisMetadata,
            graphData: analysis.graphData,
            tokenization: analysis.tokenization,
            processingAnalysis: analysis.analysis,
            location: location ? { latitude: location.lat, longitude: location.lng, accuracy: 1 } : undefined,
            nft: simulateNFTMinting(a.id),
            sqlRecord: updatedSqlRecord
          };
        }
        return a;
      }));

    } catch (err) {
      console.error(err);
      setAssets(prev => prev.map(a => a.id === selectedAssetId ? { ...a, status: AssetStatus.FAILED } : a));
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadJSON = (asset: DigitalAsset) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(asset.sqlRecord, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `GEOGRAPH_DB_${asset.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const selectedAsset = assets.find(a => a.id === selectedAssetId);

  // Filter for Database view
  const filteredAssets = sourceCollectionFilter === 'ALL' 
    ? assets 
    : assets.filter(a => a.sqlRecord?.SOURCE_COLLECTION === sourceCollectionFilter);

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
          <SidebarItem icon={FileText} label="Assets & OCR" active={activeTab === 'assets'} onClick={() => setActiveTab('assets')} />
          <SidebarItem icon={Network} label="Knowledge Graph" active={activeTab === 'graph'} onClick={() => setActiveTab('graph')} />
          <SidebarItem icon={TableIcon} label="Structured DB" active={activeTab === 'database'} onClick={() => setActiveTab('database')} />
          <SidebarItem icon={Coins} label="Data Marketplace" active={activeTab === 'market'} onClick={() => setActiveTab('market')} />
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
          <h2 className="text-lg font-semibold text-white capitalize">{activeTab === 'database' ? 'HISTORICAL DOCUMENTS DATABASE' : activeTab}</h2>
          <div className="flex items-center gap-4">
             <label className={`flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg cursor-pointer transition-all ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                {isProcessing ? <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div> : <Camera size={18} />}
                <span>{isProcessing ? 'Ingest & Process' : 'New Ingest'}</span>
                <input type="file" className="hidden" accept="image/*, application/pdf" onChange={handleFileUpload} disabled={isProcessing} />
             </label>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8">
          
          {/* Dashboard View */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8 max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Total Assets" value={assets.length} icon={FileText} color="text-blue-500" />
                <StatCard label="Knowledge Nodes" value={assets.reduce((a,c) => a + (c.graphData?.nodes?.length || 0), 0)} icon={Network} color="text-purple-500" />
                <StatCard label="Training Tokens" value={totalTokens.toLocaleString()} icon={Cpu} color="text-emerald-500" />
                <StatCard label="Market Cap (ETH)" value={`Ξ ${totalValue.toFixed(2)}`} icon={Coins} color="text-amber-500" />
              </div>

              {assets.length === 0 ? (
                <div className="h-64 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500 gap-4">
                  <Upload size={48} className="opacity-50" />
                  <p>Upload a document or photo to begin extraction</p>
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
                        {assets.map(asset => (
                            <div key={asset.id} className="flex items-start gap-4 p-3 rounded bg-slate-950/50 border border-slate-800">
                                <img src={asset.imageUrl} className="w-16 h-16 object-cover rounded" alt="thumb" />
                                <div>
                                    <h4 className="text-sm font-bold text-slate-200">{asset.gisMetadata?.zoneType || 'Processing...'}</h4>
                                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{asset.processingAnalysis}</p>
                                    <div className="mt-2 flex gap-2">
                                        <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded border border-emerald-500/20">
                                            {asset.gisMetadata?.coordinateSystem || 'NO GPS'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Structured Database View - UPDATED TO SQL STYLE */}
          {activeTab === 'database' && (
             <div className="h-full flex flex-col gap-4">
               {/* Controls */}
               <div className="flex justify-between items-end bg-slate-900 p-4 rounded-xl border border-slate-800">
                   <div className="space-y-1">
                      <h3 className="text-white font-bold flex items-center gap-2">
                          <Database size={18} className="text-primary-500" /> Repository Master List
                      </h3>
                      <p className="text-xs text-slate-400">Manage, query, and sell datum derived from unstructured inputs.</p>
                   </div>
                   <div className="flex gap-4">
                       <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded border border-slate-700">
                           <Filter size={14} className="text-slate-400" />
                           <select 
                             className="bg-transparent border-none text-xs text-slate-300 focus:outline-none"
                             value={sourceCollectionFilter}
                             onChange={(e) => setSourceCollectionFilter(e.target.value)}
                           >
                               <option value="ALL">All Sources</option>
                               <option value="General Upload">General Upload</option>
                               <option value="Texas THC Archive">Texas THC Archive</option>
                           </select>
                       </div>
                       <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded border border-slate-700 w-64">
                          <Search size={14} className="text-slate-400" />
                          <input type="text" placeholder="SQL Query..." className="bg-transparent border-none text-xs text-slate-300 focus:outline-none w-full" />
                       </div>
                   </div>
               </div>

               {/* SQL GRID */}
               <div className="flex-1 overflow-auto bg-slate-900 border border-slate-800 rounded-xl shadow-inner scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
                  <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-950 sticky top-0 z-10">
                        <tr>
                          {['ASSET_ID', 'DOC_TITLE', 'LOCAL_TIMESTAMP', 'OCR_TIMESTAMP', 'NLP_TIMESTAMP', 'LOCAL_GIS', 'OCR_GIS', 'NLP_GIS', 'NODES', 'CATEGORY', 'RIGHTS', 'FORMAT', 'SIZE (B)', 'FIXITY (SHA256)', 'CONFIDENCE', 'ACCESS', 'ACTION'].map(h => (
                              <th key={h} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-r border-slate-800 whitespace-nowrap">
                                  {h}
                              </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                         {filteredAssets.map(asset => {
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
                         {filteredAssets.length === 0 && (
                            <tr>
                                <td colSpan={17} className="px-6 py-12 text-center text-slate-600 italic">
                                    No records match the current filter.
                                </td>
                            </tr>
                         )}
                      </tbody>
                  </table>
               </div>
             </div>
          )}

          {/* Assets View (Detailed) */}
          {(activeTab === 'assets' || activeTab === 'graph') && (
            <div className="flex gap-6 h-full">
               {/* List */}
               <div className="w-72 flex-shrink-0 border-r border-slate-800 pr-6 overflow-y-auto">
                 <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">Repository Assets</h3>
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
                         {asset.status === AssetStatus.PROCESSING && <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"/>}
                       </div>
                       <div className="w-full h-24 bg-slate-950 rounded mb-2 overflow-hidden relative">
                          <img src={asset.imageUrl} className="w-full h-full object-cover opacity-80" alt="asset" />
                          {asset.sqlRecord?.ACCESS_RESTRICTIONS && (
                              <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                                  <ShieldCheck className="text-red-500" />
                              </div>
                          )}
                       </div>
                       <p className="text-xs text-slate-400 truncate">{asset.sqlRecord?.DOCUMENT_TITLE || 'Processing...'}</p>
                     </button>
                   ))}
                 </div>
               </div>

               {/* Detail Panel */}
               {selectedAsset ? (
                 <div className="flex-1 overflow-y-auto pr-2">
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-1">{selectedAsset.sqlRecord?.DOCUMENT_TITLE || 'Loading...'}</h2>
                            <p className="text-slate-400 text-sm flex items-center gap-2">
                                <Map size={14} /> {selectedAsset.location ? `${selectedAsset.location.latitude.toFixed(4)}, ${selectedAsset.location.longitude.toFixed(4)}` : 'No Geo-Tag'}
                                <span className="text-slate-600">|</span>
                                <span className="font-mono text-xs text-primary-400">{selectedAsset.sqlRecord?.NLP_DERIVED_TIMESTAMP || 'Time Period Unknown'}</span>
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300">
                                {selectedAsset.nft?.tokenId || 'NOT TOKENIZED'}
                            </span>
                        </div>
                    </div>

                    {selectedAsset.status === AssetStatus.PROCESSING && (
                        <div className="flex flex-col items-center justify-center h-64 text-center">
                            <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <h3 className="text-lg font-medium text-white">Running Modular NLP Pipeline</h3>
                            <p className="text-slate-500 mt-2">Extracting entities, inferring GIS data, and minting shards...</p>
                        </div>
                    )}

                    {selectedAsset.status === AssetStatus.MINTED && (
                        <div className="space-y-8 animate-in fade-in duration-500">
                            
                            {/* GIS & Context Section */}
                            <div className="grid grid-cols-2 gap-6">
                                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
                                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <Layers size={16}/> GIS Metadata Layer
                                    </h3>
                                    <div className="space-y-3 font-mono text-sm">
                                        <div className="flex justify-between border-b border-slate-800 pb-2">
                                            <span className="text-slate-500">Zone Classification</span>
                                            <span className="text-emerald-400">{selectedAsset.gisMetadata?.zoneType}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-slate-800 pb-2">
                                            <span className="text-slate-500">Text-Derived Location</span>
                                            <span className="text-slate-300">{selectedAsset.sqlRecord?.OCR_DERIVED_GIS_ZONE || 'N/A'}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-slate-800 pb-2">
                                            <span className="text-slate-500">Inferred Region</span>
                                            <span className="text-indigo-400">{selectedAsset.sqlRecord?.NLP_DERIVED_GIS_ZONE || 'N/A'}</span>
                                        </div>
                                        <div className="flex flex-col gap-2 mt-4">
                                            <span className="text-slate-500 text-xs">Identified Landmarks</span>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedAsset.gisMetadata?.nearbyLandmarks?.map(l => (
                                                    <span key={l} className="px-2 py-1 bg-slate-800 rounded text-xs text-slate-300 border border-slate-700">{l}</span>
                                                ))}
                                                {(!selectedAsset.gisMetadata?.nearbyLandmarks || selectedAsset.gisMetadata.nearbyLandmarks.length === 0) && (
                                                    <span className="text-slate-600 text-xs italic">No landmarks identified</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex flex-col">
                                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <Cpu size={16}/> LLM Training Tokens
                                    </h3>
                                    <div className="flex-1 overflow-auto max-h-48">
                                         <div className="flex flex-wrap gap-1">
                                             {selectedAsset.tokenization?.topTokens?.map((t, i) => (
                                                 <span key={i} className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-xs cursor-help" title={`Freq: ${t.frequency}`}>
                                                     {t.token}
                                                 </span>
                                             ))}
                                         </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-slate-800">
                                        <div className="text-xs text-slate-500 mb-2">Vector Embedding Preview</div>
                                        <div className="flex gap-1 h-8 items-end">
                                            {selectedAsset.tokenization?.embeddingVectorPreview?.map((v, i) => (
                                                <div key={i} style={{ height: `${(v + 1) * 50}%` }} className="flex-1 bg-indigo-600 rounded-t opacity-70 hover:opacity-100 transition-opacity"></div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Graph Viz */}
                            <div className="bg-slate-900 p-1 rounded-xl border border-slate-800">
                                <div className="p-4 border-b border-slate-800 mb-2 flex justify-between items-center">
                                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Semantic Knowledge Graph</h3>
                                    <span className="text-xs text-slate-500">{selectedAsset.graphData?.nodes?.length || 0} Nodes • {selectedAsset.graphData?.links?.length || 0} Links</span>
                                </div>
                                {selectedAsset.graphData && <GraphVisualizer data={selectedAsset.graphData} width={800} height={400} />}
                            </div>

                            {/* OCR Text */}
                            <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
                                <div className="flex justify-between items-center mb-4">
                                   <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Provenance & Transcription</h3>
                                   <span className="text-xs text-slate-500">Rights: {selectedAsset.sqlRecord?.RIGHTS_STATEMENT}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                   <div>
                                      <h4 className="text-xs text-slate-500 mb-2">RAW OCR</h4>
                                      <p className="font-mono text-xs text-slate-400 leading-relaxed whitespace-pre-wrap bg-slate-950 p-4 rounded border border-slate-800 h-64 overflow-y-auto">
                                          {selectedAsset.ocrText}
                                      </p>
                                   </div>
                                   <div>
                                      <h4 className="text-xs text-slate-500 mb-2">PREPROCESSED (CLEAN)</h4>
                                      <p className="font-mono text-xs text-emerald-400/80 leading-relaxed whitespace-pre-wrap bg-slate-950 p-4 rounded border border-slate-800 h-64 overflow-y-auto">
                                          {selectedAsset.sqlRecord?.PREPROCESS_OCR_TRANSCRIPTION}
                                      </p>
                                   </div>
                                </div>
                            </div>
                        </div>
                    )}
                 </div>
               ) : (
                 <div className="flex-1 flex items-center justify-center text-slate-600">
                    <p>Select an asset to view details</p>
                 </div>
               )}
            </div>
          )}

          {/* Marketplace / NFT View */}
          {activeTab === 'market' && (
              <div className="max-w-5xl mx-auto">
                  <div className="mb-8">
                      <h2 className="text-3xl font-bold text-white mb-2">Sharded Data Marketplace</h2>
                      <p className="text-slate-400">Lease or purchase fractional ownership of processed datasets for LLM training.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {assets.filter(a => a.nft).map(asset => (
                          <div key={asset.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group hover:border-primary-500/50 transition-all">
                              <div className="h-40 relative">
                                  <img src={asset.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="nft" />
                                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs font-mono text-white border border-white/10">
                                      {asset.nft?.tokenId}
                                  </div>
                              </div>
                              <div className="p-5">
                                  <div className="flex justify-between items-start mb-4">
                                      <div>
                                          <h4 className="text-white font-bold">{asset.sqlRecord?.DOCUMENT_TITLE || 'Unnamed Asset'}</h4>
                                          <p className="text-xs text-slate-500">{asset.sqlRecord?.NLP_NODE_CATEGORIZATION}</p>
                                      </div>
                                      <div className="text-right">
                                          <p className="text-amber-500 font-bold">Ξ {asset.nft?.pricePerShard}</p>
                                          <p className="text-[10px] text-slate-500">per shard</p>
                                      </div>
                                  </div>

                                  <div className="space-y-2 mb-4">
                                      <div className="flex justify-between text-xs text-slate-400">
                                          <span>Availability</span>
                                          <span>{asset.nft?.availableShards} / {asset.nft?.totalShards}</span>
                                      </div>
                                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                          <div className="h-full bg-gradient-to-r from-primary-500 to-purple-500 w-1/3"></div>
                                      </div>
                                  </div>

                                  <div className="flex gap-2">
                                      <button className="flex-1 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded transition-colors">
                                          Mint Shard
                                      </button>
                                      <button className="px-3 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded transition-colors">
                                          <Share2 size={16} />
                                      </button>
                                  </div>
                              </div>
                          </div>
                      ))}
                      {assets.length === 0 && (
                          <div className="col-span-3 py-12 text-center text-slate-500">
                              <AlertCircle className="mx-auto mb-2 opacity-50" size={32}/>
                              No tokenized assets found. Upload and process a document first.
                          </div>
                      )}
                  </div>
              </div>
          )}

        </div>
      </main>
    </div>
  );
}