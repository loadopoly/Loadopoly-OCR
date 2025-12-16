import React, { useMemo } from 'react';
import { DigitalAsset } from '../types';
import { X, AlertTriangle, Layers, CheckCircle, Database, Coins, Filter, DownloadCloud } from 'lucide-react';

interface PurchaseModalProps {
  bundleTitle: string;
  assets: DigitalAsset[]; // The assets in the bundle being purchased
  ownedAssetIds: Set<string>; // IDs the user already owns
  onClose: () => void;
  onConfirm: (subset: DigitalAsset[]) => void;
}

export default function PurchaseModal({ bundleTitle, assets, ownedAssetIds, onClose, onConfirm }: PurchaseModalProps) {
  
  // Calculate Overlap Logic
  const analysis = useMemo(() => {
    const totalCount = assets.length;
    const existing = assets.filter(a => ownedAssetIds.has(a.id));
    const newItems = assets.filter(a => !ownedAssetIds.has(a.id));
    
    const overlapCount = existing.length;
    const newCount = newItems.length;
    
    // Check if this is a FREE bundle (CC0 license)
    // We assume if the first item is CC0, the whole bundle is likely free/broadcast
    const isFree = assets.some(a => a.sqlRecord?.DATA_LICENSE === 'CC0');

    // Pricing Model: 0.05 ETH per item if paid, 0 if free
    const PRICE_PER_ITEM = isFree ? 0 : 0.05;
    const fullPrice = totalCount * PRICE_PER_ITEM;
    const deltaPrice = newCount * PRICE_PER_ITEM;
    const savings = fullPrice - deltaPrice;

    return { totalCount, overlapCount, newCount, fullPrice, deltaPrice, savings, existing, newItems, isFree };
  }, [assets, ownedAssetIds]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 w-full max-w-2xl rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-start bg-slate-950/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-white">
                    {analysis.isFree ? "Sync Community Airdrop" : "Purchase Bundle"}
                </h2>
                {analysis.isFree && <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">FREE</span>}
            </div>
            <p className="text-slate-400 text-sm">{bundleTitle}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
            
          {/* Overlap Detection Banner */}
          {analysis.overlapCount > 0 ? (
             <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4 flex gap-3">
                <AlertTriangle className="text-amber-500 flex-shrink-0" size={24} />
                <div>
                   <h3 className="text-amber-400 font-bold text-sm">Duplicate Data Detected</h3>
                   <p className="text-amber-200/70 text-xs mt-1">
                      You already own <strong className="text-white">{analysis.overlapCount}</strong> assets contained in this bundle. 
                      {analysis.isFree ? " We will only sync the new items." : " Purchasing the full package will result in redundant data in your local node."}
                   </p>
                </div>
             </div>
          ) : (
             <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-4 flex gap-3">
                <CheckCircle className="text-emerald-500 flex-shrink-0" size={24} />
                <div>
                   <h3 className="text-emerald-400 font-bold text-sm">Clean Dataset</h3>
                   <p className="text-emerald-200/70 text-xs mt-1">
                      This bundle contains entirely new data for your collection.
                   </p>
                </div>
             </div>
          )}

          {/* Visualization of Data Split */}
          <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2 mb-2 text-slate-400 text-xs uppercase font-bold">
                      <Database size={14} /> Total Bundle
                  </div>
                  <div className="text-2xl font-mono text-white">{analysis.totalCount} <span className="text-sm text-slate-500">items</span></div>
                  <div className="text-sm font-mono text-slate-500">Ξ {analysis.fullPrice.toFixed(3)}</div>
              </div>
              
              <div className={`p-4 rounded-xl border transition-colors ${analysis.overlapCount > 0 ? 'bg-primary-900/10 border-primary-500/30' : 'bg-slate-950 border-slate-800'}`}>
                  <div className="flex items-center gap-2 mb-2 text-primary-400 text-xs uppercase font-bold">
                      <Filter size={14} /> New Unique Items
                  </div>
                  <div className="text-2xl font-mono text-white">{analysis.newCount} <span className="text-sm text-slate-500">items</span></div>
                  <div className="text-sm font-mono text-emerald-400">Ξ {analysis.deltaPrice.toFixed(3)}</div>
              </div>
          </div>

          <div className="h-px bg-slate-800 my-2"></div>

          {/* Action Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Option 1: Buy Full */}
             <button
                onClick={() => onConfirm(assets)}
                className="group relative flex flex-col items-start p-4 rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-800/50 hover:bg-slate-800 transition-all text-left"
             >
                <div className="flex items-center gap-2 mb-2">
                    <Layers size={18} className="text-slate-400 group-hover:text-white" />
                    <span className="font-bold text-slate-200 group-hover:text-white">{analysis.isFree ? "Force Sync All" : "Purchase Full Set"}</span>
                </div>
                <p className="text-xs text-slate-500 mb-4 h-8">
                    Best for archival completeness. You will receive shards for duplicates.
                </p>
                <div className="mt-auto flex items-center gap-2 text-white font-mono bg-black/30 px-3 py-1 rounded">
                    <Coins size={14} className={analysis.isFree ? "text-emerald-500" : "text-amber-500"} />
                    {analysis.isFree ? "FREE" : `Ξ ${analysis.fullPrice.toFixed(3)}`}
                </div>
             </button>

             {/* Option 2: Buy Delta */}
             <button
                onClick={() => onConfirm(analysis.newItems)}
                disabled={analysis.newCount === 0}
                className={`group relative flex flex-col items-start p-4 rounded-xl border transition-all text-left ${
                    analysis.newCount === 0 
                    ? 'border-slate-800 bg-slate-900 opacity-50 cursor-not-allowed'
                    : 'border-primary-500/50 hover:border-primary-500 bg-primary-900/10 hover:bg-primary-900/20'
                }`}
             >
                {analysis.overlapCount > 0 && analysis.newCount > 0 && !analysis.isFree && (
                    <span className="absolute -top-3 right-4 px-2 py-0.5 bg-emerald-500 text-black text-[10px] font-bold rounded-full">
                        SAVE Ξ {analysis.savings.toFixed(3)}
                    </span>
                )}
                <div className="flex items-center gap-2 mb-2">
                    <Filter size={18} className={`${analysis.newCount > 0 ? 'text-primary-400' : 'text-slate-600'}`} />
                    <span className={`font-bold ${analysis.newCount > 0 ? 'text-primary-100' : 'text-slate-500'}`}>
                        {analysis.isFree ? "Smart Sync (Delta)" : "Smart Filter Purchase"}
                    </span>
                </div>
                <p className={`text-xs mb-4 h-8 ${analysis.newCount > 0 ? 'text-primary-200/70' : 'text-slate-600'}`}>
                    {analysis.newCount === 0 
                        ? "You own everything in this bundle." 
                        : "Only grab what you are missing. Duplicates are filtered out."}
                </p>
                <div className={`mt-auto flex items-center gap-2 font-mono px-3 py-1 rounded ${analysis.newCount > 0 ? 'bg-primary-950/50 text-emerald-400' : 'bg-slate-950 text-slate-600'}`}>
                    {analysis.isFree ? <DownloadCloud size={14} /> : <Coins size={14} />}
                    {analysis.isFree ? "FREE" : `Ξ ${analysis.deltaPrice.toFixed(3)}`}
                </div>
             </button>
          </div>

        </div>
      </div>
    </div>
  );
}