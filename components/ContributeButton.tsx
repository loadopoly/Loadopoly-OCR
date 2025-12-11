import React, { useState } from 'react';
import { contributeAssetToGlobalCorpus } from '../services/supabaseService';
import { DigitalAsset } from '../types';
import { Coins, Sparkles, AlertCircle } from 'lucide-react';

export default function ContributeButton({ asset }: { asset: DigitalAsset }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  const handle = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent bubbling to card click
    setLoading(true);
    setError(false);
    try {
      await contributeAssetToGlobalCorpus(asset);
      setDone(true);
      // Optional: Add toast notification here
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold px-2 py-1.5 bg-emerald-950/30 rounded border border-emerald-500/30">
        <Sparkles size={12} />
        <span>Contributed</span>
      </div>
    );
  }

  if (error) {
     return (
      <div className="flex items-center gap-1 text-red-400 text-[10px] font-bold px-2 py-1.5 bg-red-950/30 rounded border border-red-500/30">
        <AlertCircle size={12} />
        <span>Failed</span>
      </div>
    );
  }

  return (
    <button
      onClick={handle}
      disabled={loading || !asset.sqlRecord}
      className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded font-medium text-[10px] transition-all disabled:opacity-70 shadow-lg shadow-emerald-900/20"
      title="Contribute to Global Corpus & Earn Shard"
    >
      {loading ? (
        <span className="animate-pulse">Sending...</span>
      ) : (
        <>
          <Coins size={12} />
          <span>Earn Shard</span>
        </>
      )}
    </button>
  );
}