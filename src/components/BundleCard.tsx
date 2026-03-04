import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImageBundle, DigitalAsset } from '../types';
import { Package, ImageOff } from 'lucide-react';
import ContributeButton from './ContributeButton';
import { downloadService } from '../services/downloadService';

interface BundleCardProps {
  bundle: ImageBundle;
  onClick?: () => void;
  onAssetUpdated?: (asset: DigitalAsset) => void;
  assetsById?: Record<string, DigitalAsset>;
}

function resolvePreviewCandidates(
  url: string,
  assetId: string | undefined,
  assetsById: Record<string, DigitalAsset> | undefined,
  primaryImageUrl: string,
): string[] {
  const asset = assetId ? assetsById?.[assetId] : undefined;
  const original = typeof asset?.sqlRecord?.ORIGINAL_IMAGE_URL === 'string'
    ? asset.sqlRecord.ORIGINAL_IMAGE_URL : '';

  return [asset?.imageUrl || '', original, url, primaryImageUrl]
    .filter((candidate, index, arr) => !!candidate && arr.indexOf(candidate) === index);
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
      const candidates = resolvePreviewCandidates(url, assetId, assetsById, bundle.primaryImageUrl);
      return {
        key: `${assetId || 'bundle'}-${i}`,
        assetId,
        candidates,
      };
    });
  }, [bundle.imageUrls, bundle.assetIds, bundle.primaryImageUrl, assetsById]);

  const [slotSources, setSlotSources] = useState<Record<string, string>>({});
  const [failedSlots, setFailedSlots] = useState<Record<string, boolean>>({});
  const pendingSignedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const next: Record<string, string> = {};
    previewSlots.forEach((slot) => {
      next[slot.key] = slot.candidates[0] || '';
    });
    setSlotSources(next);
    setFailedSlots({});
  }, [previewSlots]);

  const handleImageError = async (slot: { key: string; assetId?: string; candidates: string[] }) => {
    const current = slotSources[slot.key] || '';
    const next = slot.candidates.find((candidate) => candidate && candidate !== current);

    if (next) {
      setSlotSources((prev) => ({ ...prev, [slot.key]: next }));
      return;
    }

    if (slot.assetId && !pendingSignedRef.current.has(slot.assetId)) {
      pendingSignedRef.current.add(slot.assetId);
      try {
        const signed = await downloadService.getPreviewUrl(slot.assetId);
        if (signed) {
          setSlotSources((prev) => ({ ...prev, [slot.key]: signed }));
          return;
        }
      } catch {
      } finally {
        pendingSignedRef.current.delete(slot.assetId);
      }
    }

    setFailedSlots((prev) => ({ ...prev, [slot.key]: true }));
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
        {previewSlots.map((slot) => (
          <div key={slot.key} className="w-full h-full rounded border border-purple-500/30 bg-slate-900/60 overflow-hidden">
            {slotSources[slot.key] && !failedSlots[slot.key] ? (
              <img
                src={slotSources[slot.key]}
                className="w-full h-full object-cover"
                alt=""
                onError={() => { void handleImageError(slot); }}
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