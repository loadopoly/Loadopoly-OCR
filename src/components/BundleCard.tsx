import React from 'react';
import { ImageBundle, DigitalAsset } from '../types';
import { Package } from 'lucide-react';
import ContributeButton from './ContributeButton';

interface BundleCardProps {
  bundle: ImageBundle;
  onClick?: () => void;
}

const BundleCard: React.FC<BundleCardProps> = ({ bundle, onClick }) => {
  // We adapt the bundle to look like a DigitalAsset for the contribute button
  const adaptedAsset: DigitalAsset = {
      id: bundle.bundleId,
      imageUrl: bundle.primaryImageUrl,
      timestamp: new Date().toISOString(),
      ocrText: "",
      status: bundle.status,
      sqlRecord: bundle.combinedRecord
  };

  return (
    <div 
      onClick={onClick}
      className="bg-gradient-to-br from-purple-900/20 to-emerald-900/20 border-2 border-purple-500/50 rounded-xl p-6 cursor-pointer hover:shadow-lg hover:shadow-purple-900/20 transition-all hover:-translate-y-1"
    >
      <div className="flex items-center gap-3 mb-4">
        <Package size={28} className="text-purple-400" />
        <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-white truncate" title={bundle.title}>{bundle.title}</h3>
            <p className="text-xs text-purple-300">
                {bundle.timeRange.earliest?.substring(0,4) || '?'} — {bundle.timeRange.latest?.substring(0,4) || '?'}
            </p>
        </div>
        <span className="ml-auto bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-bold whitespace-nowrap">
          {bundle.imageUrls.length} images
        </span>
      </div>
      
      <div className="grid grid-cols-4 gap-2 mb-4 h-24">
        {bundle.imageUrls.slice(0, 4).map((url, i) => (
          <img key={i} src={url} className="w-full h-full object-cover rounded border border-purple-500/30" alt={`Bundle part ${i}`} />
        ))}
      </div>
      
      <div className="flex justify-between items-center mt-4">
        <span className="text-emerald-400 font-mono text-sm">{bundle.combinedTokens.toLocaleString()} tokens</span>
        <div onClick={(e) => e.stopPropagation()}>
            <ContributeButton asset={adaptedAsset} />
        </div>
      </div>
    </div>
  );
};

export default BundleCard;