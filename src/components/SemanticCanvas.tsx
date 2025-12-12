import React, { useMemo, useRef, useState, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { DigitalAsset } from '../types';
import { Download, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

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

  // Filters
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

      const eraKey = r.NLP_DERIVED_TIMESTAMP?.match(/\d{4}/)?.[0]?.slice(0,3) + '0s' || 'Unknown';
      const cat = r.NLP_NODE_CATEGORIZATION || 'Uncategorized';
      const right = r.RIGHTS_STATEMENT || 'Unknown';
      const contested = r.ACCESS_RESTRICTIONS || /controversy|removed|relocated/i.test(r.DOCUMENT_DESCRIPTION);

      // Super nodes
      if (!eraMap.has(eraKey)) {
        eraMap.set(eraKey, { id: `ERA_${eraKey}`, label: eraKey, type: 'ERA', val: 45, color: '#8b5cf6' });
        n.push(eraMap.get(eraKey));
      }
      if (!catMap.has(cat)) {
        catMap.set(cat, { id: `CAT_${cat}`, label: cat, type: 'CATEGORY', val: 38, color: '#06b6d4' });
        n.push(catMap.get(cat));
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
      l.push({ source: asset.id, target: `CAT_${cat}`, strength: 1.2 });
      l.push({ source: asset.id, target: `RIGHT_${right}`, strength: 0.8 });
    });

    return { nodes: n.filter(Boolean), links: l };
  }, [assets]);

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
      <div className="absolute top-4 left-4 space-y-3">
        <div className="bg-slate-900/90 backdrop-blur p-4 rounded-xl border border-slate-700">
          <h3 className="text-white font-bold mb-3 text-sm">Semantic Filters</h3>
          <select className="w-full bg-slate-800 text-white text-xs px-3 py-2 rounded mb-2"
            onChange={e => setFilters(f => ({...f, era: e.target.value}))}>
            <option value="all">All Eras</option>
            {Array.from(new Set(assets.map(a => a.sqlRecord?.NLP_DERIVED_TIMESTAMP?.match(/\d{4}/)?.[0]?.slice(0,3)+'0s'))).filter(Boolean).map(e => (
              <option key={e}>{e}</option>
            ))}
          </select>
          {/* Add more filters here if you want */}
        </div>

        <div className="flex flex-col gap-2">
          <button onClick={handleZoomIn} className="p-2 bg-slate-800 hover:bg-slate-700 rounded"><ZoomIn size={20} /></button>
          <button onClick={handleZoomOut} className="p-2 bg-slate-800 hover:bg-slate-700 rounded"><ZoomOut size={20} /></button>
          <button onClick={handleReset} className="p-2 bg-slate-800 hover:bg-slate-700 rounded"><RotateCcw size={20} /></button>
        </div>
      </div>

      {/* Inspector */}
      {selected && selected.asset && (
        <div className="absolute top-4 right-4 bg-slate-900/95 backdrop-blur p-6 rounded-xl border border-slate-700 max-w-md">
          <h3 className="text-xl font-bold text-white mb-2">{selected.label}</h3>
          <p className="text-sm text-slate-300 mb-4">{selected.asset.sqlRecord?.NLP_NODE_CATEGORIZATION}</p>
          <img src={selected.asset.imageUrl} className="w-full rounded-lg mb-4" />
          <div className="flex gap-2">
            <button className="flex-1 py-2 bg-primary-600 hover:bg-primary-500 rounded text-white text-sm">
              View Full Record
            </button>
            <button onClick={() => downloadJSON(selected.asset)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm flex items-center gap-2">
              <Download size={16} /> JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SemanticCanvas;