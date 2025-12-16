import React, { useMemo, useRef, useState, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { DigitalAsset } from '../types';
import { Download, ZoomIn, ZoomOut, RotateCcw, Filter } from 'lucide-react';

interface SemanticCanvasProps {
  assets: DigitalAsset[];
}

const SemanticCanvas: React.FC<SemanticCanvasProps> = ({ assets }) => {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };

    window.addEventListener('resize', updateDimensions);
    updateDimensions();
    
    // Small timeout to ensure container is rendered
    setTimeout(updateDimensions, 100);

    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // 1. Extract Dynamic Categories from LLM Data
  const categories = useMemo(() => {
    const cats = new Set<string>();
    assets.forEach(a => {
        const c = a.sqlRecord?.NLP_NODE_CATEGORIZATION;
        if (c) cats.add(c);
    });
    return Array.from(cats).sort();
  }, [assets]);

  // Filters State
  const [filters, setFilters] = useState({
    era: 'all',
    category: 'all',
    rights: 'all',
    contested: false,
  });

  const { nodes, links } = useMemo(() => {
    const n: any[] = [];
    const l: any[] = [];

    const eraMap = new Map<string, any>();
    const catMap = new Map<string, any>();
    const rightsMap = new Map<string, any>();

    assets.forEach(asset => {
      const r = asset.sqlRecord;
      if (!r) return;

      // --- FILTER LOGIC ---
      // 1. Category Filter
      if (filters.category !== 'all' && r.NLP_NODE_CATEGORIZATION !== filters.category) return;
      
      // 2. Era Filter
      const eraKey = r.NLP_DERIVED_TIMESTAMP?.match(/\d{4}/)?.[0]?.slice(0,3) + '0s' || 'Unknown';
      if (filters.era !== 'all' && eraKey !== filters.era) return;

      // 3. Contested Filter
      const contested = r.ACCESS_RESTRICTIONS || /controversy|removed|relocated/i.test(r.DOCUMENT_DESCRIPTION);
      if (filters.contested && !contested) return;

      // --- NODE CREATION ---
      const cat = r.NLP_NODE_CATEGORIZATION || 'Uncategorized';
      const right = r.RIGHTS_STATEMENT || 'Unknown';

      // Super nodes (Only create if we aren't filtering them out specifically)
      if (!eraMap.has(eraKey)) {
        eraMap.set(eraKey, { id: `ERA_${eraKey}`, label: eraKey, type: 'ERA', val: 45, color: '#8b5cf6' });
        n.push(eraMap.get(eraKey));
      }
      
      // Only show category supernode if we aren't filtered to a specific one (otherwise it's redundant/cluttered)
      if (filters.category === 'all') {
          if (!catMap.has(cat)) {
            catMap.set(cat, { id: `CAT_${cat}`, label: cat, type: 'CATEGORY', val: 38, color: '#06b6d4' });
            n.push(catMap.get(cat));
          }
      }

      if (!rightsMap.has(right)) {
        rightsMap.set(right, { id: `RIGHT_${right}`, label: right, type: 'RIGHTS', val: 32, color: '#f59e0b' });
        n.push(rightsMap.get(right));
      }

      // Document node
      n.push({
        id: asset.id,
        label: r.DOCUMENT_TITLE,
        type: 'DOCUMENT',
        val: 10 + (r.NODE_COUNT || 0) / 4,
        color: contested ? '#ef4444' : right === 'Public Domain' ? '#10b981' : '#3b82f6',
        asset,
        contested,
      });

      // Links
      l.push({ source: asset.id, target: `ERA_${eraKey}`, strength: 1 });
      if (filters.category === 'all') {
         l.push({ source: asset.id, target: `CAT_${cat}`, strength: 1.2 });
      }
      l.push({ source: asset.id, target: `RIGHT_${right}`, strength: 0.8 });
    });

    return { nodes: n.filter(Boolean), links: l };
  }, [assets, filters]);

  const handleZoomIn = () => fgRef.current?.zoom(fgRef.current.zoom() * 1.5, 300);
  const handleZoomOut = () => fgRef.current?.zoom(fgRef.current.zoom() / 1.5, 300);
  const handleReset = () => fgRef.current?.zoomToFit(400);

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

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden rounded-xl">
      <ForceGraph2D
        ref={fgRef}
        graphData={{ nodes, links }}
        nodeLabel={(node: any) => `<div class="bg-slate-900/90 text-white px-3 py-1 rounded text-sm">${node.label}</div>`}
        nodeAutoColorBy="type"
        nodeRelSize={8}
        linkWidth={1.5}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.005}
        onNodeClick={setSelected}
        cooldownTicks={100}
        onEngineStop={() => fgRef.current?.zoomToFit(600)}
        width={dimensions.width}
        height={dimensions.height}
      />

      {/* Floating Controls */}
      <div className="absolute top-4 left-4 space-y-3 z-10 w-64">
        <div className="bg-slate-900/90 backdrop-blur p-4 rounded-xl border border-slate-700 shadow-xl">
          <div className="flex items-center gap-2 mb-3 text-primary-400">
             <Filter size={16} />
             <h3 className="font-bold text-xs uppercase tracking-wider">Universe Filters</h3>
          </div>
          
          {/* Era Filter */}
          <div className="mb-3">
            <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Timeline Era</label>
            <select 
                className="w-full bg-slate-950 text-white text-xs px-3 py-2 rounded border border-slate-800 focus:border-primary-500 outline-none"
                value={filters.era}
                onChange={e => setFilters(f => ({...f, era: e.target.value}))}
            >
                <option value="all">All Eras</option>
                {Array.from(new Set(assets.map(a => a.sqlRecord?.NLP_DERIVED_TIMESTAMP?.match(/\d{4}/)?.[0]?.slice(0,3)+'0s'))).filter(Boolean).sort().map(e => (
                <option key={e}>{e}</option>
                ))}
            </select>
          </div>

          {/* Dynamic Category Filter */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">LLM Category</label>
            <select 
                className="w-full bg-slate-950 text-white text-xs px-3 py-2 rounded border border-slate-800 focus:border-primary-500 outline-none"
                value={filters.category}
                onChange={e => setFilters(f => ({...f, category: e.target.value}))}
            >
                <option value="all">All Categories</option>
                {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                ))}
            </select>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800">
              <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={filters.contested} 
                    onChange={e => setFilters(f => ({...f, contested: e.target.checked}))}
                    className="rounded border-slate-700 bg-slate-900 text-primary-500"
                  />
                  <span className="text-xs text-slate-400">Show Contested Items Only</span>
              </label>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button onClick={handleZoomIn} className="p-2 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 text-slate-400 hover:text-white transition-colors"><ZoomIn size={20} /></button>
          <button onClick={handleZoomOut} className="p-2 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 text-slate-400 hover:text-white transition-colors"><ZoomOut size={20} /></button>
          <button onClick={handleReset} className="p-2 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 text-slate-400 hover:text-white transition-colors"><RotateCcw size={20} /></button>
        </div>
      </div>

      {/* Inspector */}
      {selected && selected.asset && (
        <div className="absolute top-4 right-4 bg-slate-900/95 backdrop-blur p-6 rounded-xl border border-slate-700 max-w-md shadow-2xl z-10 animate-in slide-in-from-right-10">
          <button onClick={() => setSelected(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white">
              <RotateCcw size={14} />
          </button>
          <h3 className="text-xl font-bold text-white mb-2">{selected.label}</h3>
          <p className="text-sm text-slate-300 mb-4">{selected.asset.sqlRecord?.NLP_NODE_CATEGORIZATION}</p>
          <img src={selected.asset.imageUrl} className="w-full h-48 object-cover rounded-lg mb-4 border border-slate-700" alt="Selected Node" />
          <div className="flex gap-2">
            <button className="flex-1 py-2 bg-primary-600 hover:bg-primary-500 rounded text-white text-sm font-bold">
              View Full Record
            </button>
            <button onClick={() => downloadJSON(selected.asset)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm flex items-center gap-2 font-bold">
              <Download size={16} /> JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SemanticCanvas;