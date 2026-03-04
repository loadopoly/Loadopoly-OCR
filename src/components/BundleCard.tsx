import React, { useMemo } from 'react';
import { ImageBundle, DigitalAsset } from '../types';
import { Package } from 'lucide-react';
import ContributeButton from './ContributeButton';

interface BundleCardProps {
  bundle: ImageBundle;
  onClick?: () => void;
  onAssetUpdated?: (asset: DigitalAsset) => void;
  assetsById?: Record<string, DigitalAsset>;
}

const BundleCard: React.FC<BundleCardProps> = ({ bundle, onClick, onAssetUpdated, assetsById }) => {
  // We adapt the bundle to look like a DigitalAsset for the contribute button
  const adaptedAsset: DigitalAsset = {
      id: bundle.bundleId,
      imageUrl: bundle.primaryImageUrl,
      timestamp: new Date().toISOString(),
      ocrText: "",
      status: bundle.status,
      sqlRecord: bundle.combinedRecord
  };

  const previewSources = useMemo(() => {
    return bundle.imageUrls.slice(0, 4).map((url, i) => {
      const assetId = Array.isArray(bundle.assetIds) ? bundle.assetIds[i] : undefined;
      const asset = assetId ? assetsById?.[assetId] : undefined;
      const original = typeof asset?.sqlRecord?.ORIGINAL_IMAGE_URL === 'string'
        ? asset.sqlRecord.ORIGINAL_IMAGE_URL
        : '';

      const candidates = [
        url,
        asset?.imageUrl,
        original,
        bundle.primaryImageUrl,
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

      return {
        key: `${assetId || 'bundle'}-${i}`,
        src: candidates[0] || '',
        fallbackList: candidates,
      };
    });
  }, [bundle.imageUrls, bundle.assetIds, bundle.primaryImageUrl, assetsById]);

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
        {previewSources.map((preview, i) => (
          <div key={preview.key} className="w-full h-full rounded border border-purple-500/30 bg-slate-900/60 flex items-center justify-center overflow-hidden">
            <img
              src={preview.src}
              data-fallbacks={JSON.stringify(preview.fallbackList)}
              className="w-full h-full object-cover"
              alt={`Bundle part ${i}`}
              onError={(event) => {
                const img = event.currentTarget;
                const currentSrc = img.src;
                const raw = img.dataset.fallbacks;
                const fallbacks = raw ? JSON.parse(raw) as string[] : [];
                const next = fallbacks.find((candidate) => candidate && candidate !== currentSrc);

                if (next) {
                  img.src = next;
                  img.dataset.fallbacks = JSON.stringify(fallbacks.filter((candidate) => candidate !== next));
                  return;
                }

                img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%234A5568" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
              }}
            />
            <Package size={20} className="text-purple-400/40" />
          </div>
        ))}
      </div>
      
      <div className="flex justify-between items-center mt-4">
        <span className="text-emerald-400 font-mono text-sm">{bundle.combinedTokens.toLocaleString()} tokens</span>
        <div onClick={(e) => e.stopPropagation()}>
            <ContributeButton asset={adaptedAsset} onAssetUpdated={onAssetUpdated} />
        </div>
      </div>
    </div>
  );
};

export default BundleCard;