import React, { useState } from 'react';
import { contributeAssetToGlobalCorpus } from '../services/supabaseService';
import { mintShardClientSide, getShardBalance } from '../services/web3Service';
import { DigitalAsset, AssetStatus } from '../types';
import { Coins, Sparkles, AlertCircle, Wallet, CloudUpload, Link as LinkIcon } from 'lucide-react';

interface ContributeButtonProps {
    asset: DigitalAsset;
    onAssetUpdated?: (updatedAsset: DigitalAsset) => void;
}

export default function ContributeButton({ asset, onAssetUpdated }: ContributeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(!!asset.nft); // If NFT data exists, we consider it done/minted
  const [error, setError] = useState<string | null>(null);

  // Check preference
  const web3Enabled = localStorage.getItem('geograph-web3-enabled') === 'true';

  const handle = async (e: React.MouseEvent) => {
    e.stopPropagation(); 
    setLoading(true);
    setError(null);
    try {
      // 1. Upload Data to Corpus (Supabase)
      await contributeAssetToGlobalCorpus(asset);
      
      let nftData = null;

      if (web3Enabled) {
          // 2. Real Web3 Interaction
          // This handles connection, network switching, and minting
          const receiptData = await mintShardClientSide(asset.id);
          
          // 3. Construct Real NFT Data Object
          nftData = {
              contractAddress: receiptData.contractAddress,
              tokenId: receiptData.numericId,
              totalShards: 1000, // Fixed supply in this contract model
              availableShards: 1000, 
              pricePerShard: 0.00, // Free mint for contributors
              ownership: [{ holder: receiptData.owner, percentage: 100 }],
              dcc1: {
                  shardsCollected: 1000, // Initial mint gives full set or partial? Assuming full for contrib.
                  shardsRequired: 1000,
                  isRedeemable: true,
              }
          };

      } else {
          // Virtual Contribution (No Blockchain)
          await new Promise(resolve => setTimeout(resolve, 600)); 
      }
      
      setDone(true);

      // 4. Propagate Update to Parent (App.tsx)
      if (onAssetUpdated) {
          const updatedAsset: DigitalAsset = {
              ...asset,
              status: web3Enabled ? AssetStatus.MINTED : asset.status, // Keep status or update
              nft: nftData ? nftData : undefined,
              // Update SQL record to show mint status
              sqlRecord: asset.sqlRecord ? { ...asset.sqlRecord, CONTRIBUTOR_NFT_MINTED: !!nftData } : undefined
          };
          onAssetUpdated(updatedAsset);
      }

    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold px-2 py-1.5 bg-emerald-950/30 rounded border border-emerald-500/30">
        {web3Enabled ? <Sparkles size={12} /> : <CheckCircle size={12} />}
        <span>{web3Enabled ? 'Shard Minted' : 'Contributed'}</span>
      </div>
    );
  }

  if (error) {
     return (
      <button 
        onClick={handle}
        className="flex items-center gap-1 text-red-400 text-[10px] font-bold px-2 py-1.5 bg-red-950/30 rounded border border-red-500/30 hover:bg-red-900/50 transition-colors"
        title={error}
      >
        <AlertCircle size={12} />
        <span>{error.includes("reject") ? "Rejected" : "Retry"}</span>
      </button>
    );
  }

  return (
    <button
      onClick={handle}
      disabled={loading || !asset.sqlRecord}
      className={`flex items-center gap-2 px-3 py-1.5 rounded font-medium text-[10px] transition-all disabled:opacity-70 shadow-lg ${
        web3Enabled 
          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-900/20'
          : 'bg-slate-700 hover:bg-slate-600 border border-slate-600'
      } text-white`}
      title={web3Enabled ? "Connect Wallet & Mint Shard (Polygon)" : "Contribute to Corpus"}
    >
      {loading ? (
        <span className="animate-pulse flex items-center gap-2">
            {web3Enabled ? <Wallet size={12} /> : <CloudUpload size={12} />} 
            {web3Enabled ? 'Confirming...' : 'Uploading...'}
        </span>
      ) : (
        <>
          {web3Enabled ? <Coins size={12} /> : <CloudUpload size={12} />}
          <span>{web3Enabled ? 'Earn Shard' : 'Contribute'}</span>
        </>
      )}
    </button>
  );
}

// Helper icon for non-web3 mode
function CheckCircle({ size }: { size: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>;
}