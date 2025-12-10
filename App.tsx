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
  Code
} from 'lucide-react';
import { AssetStatus, DigitalAsset, LocationData } from './types';
import { processImageWithGemini, simulateNFTMinting } from './services/geminiService';
import GraphVisualizer from './components/GraphVisualizer';

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
    
    // Create placeholder asset
    const newAsset: DigitalAsset = {
      id: Math.random().toString(36).substring(7),
      imageUrl: URL.createObjectURL(file),
      timestamp: new Date().toISOString(),
      ocrText: "",
      status: AssetStatus.PROCESSING
    };

    setAssets(prev => [newAsset, ...prev]);
    setActiveTab('assets');
    setSelectedAssetId(newAsset.id);

    try {
      // Get Location
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

      // Process with Gemini
      const analysis = await processImageWithGemini(file, location);
      
      // Update Asset with Result
      setAssets(prev => prev.map(a => {
        if (a.id === newAsset.id) {
          return {
            ...a,
            status: AssetStatus.MINTED,
            ocrText: analysis.ocrText,
            gisMetadata: analysis.gisMetadata,
            graphData: analysis.graphData,
            tokenization: analysis.tokenization,
            processingAnalysis: analysis.analysis,
            location: location ? { latitude: location.lat, longitude: location.lng, accuracy: 1 } : undefined,
            nft: simulateNFTMinting(a.id)
          };
        }
        return a;
      }));

    } catch (err) {
      console.error(err);
      setAssets(prev => prev.map(a => a.id === newAsset.id ? { ...a, status: AssetStatus.FAILED } : a));
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadJSON = (asset: DigitalAsset) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(asset, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `geograph-asset-${asset.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const selectedAsset = assets.find(a => a.id === selectedAssetId);

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
          <h2 className="text-lg font-semibold text-white capitalize">{activeTab === 'database' ? 'Structured Data Repository' : activeTab}</h2>
          <div className="flex items-center gap-4">
             <label className={`flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg cursor-pointer transition-all ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                {isProcessing ? <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div> : <Camera size={18} />}
                <span>{isProcessing ? 'Processing...' : 'Scan / Upload'}</span>
                <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={isProcessing} />
             </label>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8">
          
          {/* Dashboard View */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8 max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Total Assets" value={assets.length} icon={FileText} color="text-blue-500" />
                <StatCard label="Knowledge Nodes" value={assets.reduce((a,c) => a + (c.graphData?.nodes.length || 0), 0)} icon={Network} color="text-purple-500" />
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

          {/* Structured Database View */}
          {activeTab === 'database' && (
             <div className="max-w-6xl mx-auto space-y-6">
               <div className="flex flex-col gap-2">
                 <div className="flex items-center gap-2">
                   <Code className="text-primary-500" size={24}/>
                   <h2 className="text-2xl font-bold text-white">Repository Database</h2>
                 </div>
                 <p className="text-slate-400">Query and export structured relational data derived from unstructured inputs.</p>
               </div>

               {/* Mock Query Interface */}
               <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex gap-4 items-center shadow-lg">
                  <span className="text-primary-500 font-mono font-bold">{`>`}</span>
                  <input type="text" placeholder="SELECT * FROM assets WHERE zone_type = 'Urban' AND token_count > 500" className="flex-1 bg-transparent border-none focus:outline-none text-slate-200 font-mono text-sm placeholder:text-slate-600" />
                  <button className="p-2 bg-slate-800 rounded hover:bg-slate-700 text-slate-300 transition-colors"><Search size={18}/></button>
               </div>

               {/* Table */}
               <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                      <thead className="bg-slate-950 text-slate-200 uppercase font-bold text-xs">
                        <tr>
                          <th className="px-6 py-4">Asset ID</th>
                          <th className="px-6 py-4">Timestamp</th>
                          <th className="px-6 py-4">GIS Zone</th>
                          <th className="px-6 py-4 text-center">Nodes</th>
                          <th className="px-6 py-4 text-center">Tokens</th>
                          <th className="px-6 py-4 text-center">Shards</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {assets.map(asset => (
                          <tr key={asset.id} className="hover:bg-slate-800/50 transition-colors">
                            <td className="px-6 py-4 font-mono text-xs text-slate-500">{asset.id.substring(0,8)}...</td>
                            <td className="px-6 py-4">{new Date(asset.timestamp).toLocaleDateString()}</td>
                            <td className="px-6 py-4">
                               <span className={`px-2 py-1 rounded text-xs ${asset.gisMetadata ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-600 bg-slate-800'}`}>
                                 {asset.gisMetadata?.zoneType || 'N/A'}
                               </span>
                            </td>
                            <td className="px-6 py-4 text-center font-mono">{asset.graphData?.nodes.length || '-'}</td>
                            <td className="px-6 py-4 text-center font-mono">{asset.tokenization?.tokenCount || '-'}</td>
                            <td className="px-6 py-4 text-center font-mono">{asset.nft?.totalShards || '-'}</td>
                            <td className="px-6 py-4">
                               <span className={`flex items-center gap-2 ${asset.status === 'MINTED' ? 'text-blue-400' : 'text-amber-400'}`}>
                                  {asset.status === 'MINTED' ? <CheckCircle size={14}/> : <div className="w-2 h-2 rounded-full bg-current animate-pulse"/>}
                                  {asset.status}
                               </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                               <button 
                                  onClick={() => downloadJSON(asset)}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors border border-slate-700 hover:border-slate-500"
                               >
                                   <Download size={14} /> JSON
                               </button>
                            </td>
                          </tr>
                        ))}
                        {assets.length === 0 && (
                           <tr>
                               <td colSpan={8} className="px-6 py-12 text-center text-slate-600 italic">
                                   <div className="flex flex-col items-center gap-2">
                                      <Database className="opacity-20" size={32}/>
                                      <p>No records found in database.</p>
                                   </div>
                               </td>
                           </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-slate-950 px-6 py-3 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
                     <span>Showing {assets.length} records</span>
                     <div className="flex gap-2">
                        <button className="px-3 py-1 bg-slate-900 border border-slate-700 rounded hover:bg-slate-800 transition-colors">Previous</button>
                        <button className="px-3 py-1 bg-slate-900 border border-slate-700 rounded hover:bg-slate-800 transition-colors">Next</button>
                     </div>
                  </div>
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
                         <span className="text-xs font-mono text-slate-500">ID: {asset.id}</span>
                         {asset.status === AssetStatus.MINTED && <CheckCircle size={12} className="text-emerald-500"/>}
                         {asset.status === AssetStatus.PROCESSING && <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"/>}
                       </div>
                       <div className="w-full h-24 bg-slate-950 rounded mb-2 overflow-hidden">
                          <img src={asset.imageUrl} className="w-full h-full object-cover opacity-80" alt="asset" />
                       </div>
                       <p className="text-xs text-slate-400 truncate">{asset.gisMetadata?.zoneType || 'Unknown Zone'}</p>
                     </button>
                   ))}
                 </div>
               </div>

               {/* Detail Panel */}
               {selectedAsset ? (
                 <div className="flex-1 overflow-y-auto pr-2">
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-1">Asset Analysis</h2>
                            <p className="text-slate-400 text-sm flex items-center gap-2">
                                <Map size={14} /> {selectedAsset.location ? `${selectedAsset.location.latitude.toFixed(4)}, ${selectedAsset.location.longitude.toFixed(4)}` : 'No Geo-Tag'}
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
                                            <span className="text-slate-500">Environment</span>
                                            <span className="text-slate-300">{selectedAsset.gisMetadata?.environmentalContext}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-slate-800 pb-2">
                                            <span className="text-slate-500">Elevation Estimate</span>
                                            <span className="text-slate-300">{selectedAsset.gisMetadata?.estimatedElevation}</span>
                                        </div>
                                        <div className="flex flex-col gap-2 mt-4">
                                            <span className="text-slate-500 text-xs">Identified Landmarks</span>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedAsset.gisMetadata?.nearbyLandmarks.map(l => (
                                                    <span key={l} className="px-2 py-1 bg-slate-800 rounded text-xs text-slate-300 border border-slate-700">{l}</span>
                                                ))}
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
                                             {selectedAsset.tokenization?.topTokens.map((t, i) => (
                                                 <span key={i} className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-xs cursor-help" title={`Freq: ${t.frequency}`}>
                                                     {t.token}
                                                 </span>
                                             ))}
                                         </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-slate-800">
                                        <div className="text-xs text-slate-500 mb-2">Vector Embedding Preview</div>
                                        <div className="flex gap-1 h-8 items-end">
                                            {selectedAsset.tokenization?.embeddingVectorPreview.map((v, i) => (
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
                                    <span className="text-xs text-slate-500">{selectedAsset.graphData?.nodes.length} Nodes • {selectedAsset.graphData?.links.length} Links</span>
                                </div>
                                {selectedAsset.graphData && <GraphVisualizer data={selectedAsset.graphData} width={800} height={400} />}
                            </div>

                            {/* OCR Text */}
                            <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Raw OCR Transcription</h3>
                                <p className="font-mono text-sm text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-950 p-4 rounded border border-slate-800">
                                    {selectedAsset.ocrText}
                                </p>
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
                                          <h4 className="text-white font-bold">{asset.gisMetadata?.zoneType || 'Unknown Data Asset'}</h4>
                                          <p className="text-xs text-slate-500">{asset.location ? 'Geospatial Verified' : 'Standard OCR'}</p>
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