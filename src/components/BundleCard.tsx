import React, { useMemo } from 'react';
import { ImageBundle, DigitalAsset } from '../types';
import { Package, ImageOff } from 'lucide-react';
import ContributeButton from './ContributeButton';

interface BundleCardProps {
  bundle: ImageBundle;
  onClick?: () => void;
  onAssetUpdated?: (asset: DigitalAsset) => void;
  assetsById?: Record<string, DigitalAsset>;
}

/** Pick the best available image URL for a bundle slot */
function resolvePreviewSrc(
  url: string,
  assetId: string | undefined,
  assetsById: Record<string, DigitalAsset> | undefined,
  primaryImageUrl: string,
): string {
  // 1. Live asset from assetsById (may include signed URL or fresh blob)
  const asset = assetId ? assetsById?.[assetId] : undefined;
  if (asset?.imageUrl && asset.imageUrl.length > 0) return asset.imageUrl;
  // 2. ORIGINAL_IMAGE_URL from database
  const original = typeof asset?.sqlRecord?.ORIGINAL_IMAGE_URL === 'string'
    ? asset.sqlRecord.ORIGINAL_IMAGE_URL : '';
  if (original.length > 0) return original;
  // 3. URL stored in bundle at creation time
  if (url && url.length > 0) return url;
  // 4. Bundle primary image
  if (primaryImageUrl && primaryImageUrl.length > 0) return primaryImageUrl;
  return '';
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

  const previewSlots = useMemo(() => {
    return bundle.imageUrls.slice(0, 4).map((url, i) => {
      const assetId = Array.isArray(bundle.assetIds) ? bundle.assetIds[i] : undefined;
      const src = resolvePreviewSrc(url, assetId, assetsById, bundle.primaryImageUrl);
      return { key: `${assetId || 'bundle'}-${i}`, src };
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
        {previewSlots.map((slot) => (
          <div key={slot.key} className="w-full h-full rounded border border-purple-500/30 bg-slate-900/60 overflow-hidden">
            {slot.src ? (
              <img
                src={slot.src}
                className="w-full h-full object-cover"
                alt=""
                onError={(e) => {
                  // Hide the broken img and let the container background show
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageOff size={20} className="text-purple-400/40" />
              </div>
            )}
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