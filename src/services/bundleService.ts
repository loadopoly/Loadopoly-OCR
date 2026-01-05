import { DigitalAsset, ImageBundle, HistoricalDocumentMetadata, AssetStatus } from '../types';

export const createBundles = (assets: DigitalAsset[]): (DigitalAsset | ImageBundle)[] => {
  const bundles: Record<string, DigitalAsset[]> = {};
  const singles: DigitalAsset[] = [];

  // Filter out assets that are already in a user-defined bundle
  const autoBundleAssets = assets.filter(a => !a.sqlRecord?.USER_BUNDLE_ID);
  const userBundledAssets = assets.filter(a => !!a.sqlRecord?.USER_BUNDLE_ID);

  autoBundleAssets.forEach(asset => {
    try {
        const key = generateBundleKey(asset, autoBundleAssets);
        // Only bundle if we have a valid key and decent confidence
        if (key && asset.sqlRecord?.CONFIDENCE_SCORE && asset.sqlRecord.CONFIDENCE_SCORE > 0.6) {
            if (!bundles[key]) bundles[key] = [];
            bundles[key].push(asset);
        } else {
            singles.push(asset);
        }
    } catch (e) {
        console.warn("Failed to generate bundle key for asset", asset.id, e);
        singles.push(asset);
    }
  });

  // Explicitly type the array to handle the union of DigitalAsset and ImageBundle
  const bundledItems: (DigitalAsset | ImageBundle)[] = [];
  
  Object.values(bundles).forEach(group => {
    try {
        if (group.length > 1) {
            bundledItems.push(createBundleFromGroup(group));
        } else {
            // If a group only has 1 item, treat it as a single asset
            bundledItems.push(...group);
        }
    } catch (e) {
        console.error("Failed to create bundle from group:", group, e);
        // Fallback: treat all items in failed bundle as singles
        bundledItems.push(...group);
    }
  });

  // Group user-defined bundles
  const userBundlesMap: Record<string, DigitalAsset[]> = {};
  userBundledAssets.forEach(asset => {
    const bid = asset.sqlRecord!.USER_BUNDLE_ID!;
    if (!userBundlesMap[bid]) userBundlesMap[bid] = [];
    userBundlesMap[bid].push(asset);
  });

  Object.entries(userBundlesMap).forEach(([bid, group]) => {
    const bundle = createBundleFromGroup(group);
    bundle.bundleId = bid;
    bundle.isUserDefined = true;
    bundledItems.push(bundle);
  });

  return [...bundledItems, ...singles];
};

const extractYear = (ts: string | null | undefined): number => {
  if (!ts) return 9999;
  const match = ts.match(/\d{4}/);
  return match ? parseInt(match[0]) : 9999;
};

const normalizeTitle = (t: string) => {
  // Remove numbers and special chars to group "Aircraft 1" and "Aircraft 2"
  return t.replace(/[^a-z]/gi, '').slice(0, 20).toLowerCase();
};

const generateBundleKey = (asset: DigitalAsset, allAssets: DigitalAsset[]): string | null => {
  const rec = asset.sqlRecord;
  if (!rec) return null;

  // Strategy 1: Exact location match (GPS ±10m)
  if (asset.location) {
    const matches = allAssets.filter(a =>
      a.location &&
      Math.abs(a.location.latitude - asset.location!.latitude) < 0.0001 &&
      Math.abs(a.location.longitude - asset.location!.longitude) < 0.0001
    );
    if (matches.length > 1) {
        return `gps_${asset.location.latitude.toFixed(4)}_${asset.location.longitude.toFixed(4)}`;
    }
  }

  // Strategy 2: Shared Entities (High confidence clustering)
  const entities = rec.ENTITIES_EXTRACTED || [];
  if (entities.length >= 2) {
      // Use the top 2 entities as a cluster key
      const topEntities = [...entities].sort().slice(0, 2).map(e => e.replace(/[^a-z0-9]/gi, '').toLowerCase());
      return `entities_${topEntities.join('_')}`;
  }

  // Strategy 3: Title similarity (Fuzzy)
  const title = rec.DOCUMENT_TITLE || "Untitled";
  if (title.length < 3) return null;
  
  const year = extractYear(rec.NLP_DERIVED_TIMESTAMP);
  // Use a larger window for years (25 years) to group related historical items
  const era = Math.floor(year / 25) * 25;
  
  const normalized = normalizeTitle(title);
  if (normalized.length < 3) return null;

  return `title_${normalized.substring(0, 10)}_${era}`;
};

const createBundleFromGroup = (group: DigitalAsset[]): ImageBundle => {
  if (!group || group.length === 0) throw new Error("Empty group passed to bundle creator");

  const sorted = group.sort((a, b) => 
    (extractYear(a.sqlRecord?.NLP_DERIVED_TIMESTAMP) || 0) - 
    (extractYear(b.sqlRecord?.NLP_DERIVED_TIMESTAMP) || 0)
  );

  const lastItem = sorted[sorted.length - 1];

  const timeRange = {
    earliest: sorted[0].sqlRecord?.OCR_DERIVED_TIMESTAMP || sorted[0].sqlRecord?.NLP_DERIVED_TIMESTAMP || null,
    latest: lastItem?.sqlRecord?.OCR_DERIVED_TIMESTAMP || lastItem?.sqlRecord?.NLP_DERIVED_TIMESTAMP || null
  };

  // Merge graphs intelligently
  const allNodes = new Map<string, any>();
  const allLinks: any[] = [];

  group.forEach(asset => {
    asset.graphData?.nodes.forEach(n => {
      // Use ID as key to dedupe
      if (!allNodes.has(n.id)) {
          allNodes.set(n.id, { ...n });
      } else {
          // Boost relevance if found in multiple docs
          const existing = allNodes.get(n.id);
          existing.relevance = Math.min(1, existing.relevance + 0.1);
      }
    });
    
    // Annotate links with the year of the document they came from
    const year = extractYear(asset.sqlRecord?.NLP_DERIVED_TIMESTAMP);
    allLinks.push(...(asset.graphData?.links || []).map(l => ({
      ...l,
      relationship: `${l.relationship} (${year !== 9999 ? year : 'Unknown'})`,
    })));
  });

  // Create a combined record representing the whole bundle
  const validRecords = group.map(a => a.sqlRecord!).filter(r => !!r);
  if (validRecords.length === 0) throw new Error("No valid SQL records in group");
  
  const combinedRecord = mergeRecords(validRecords);

  return {
    bundleId: `BUNDLE_${sorted[0].id}`,
    title: `${sorted[0].sqlRecord?.DOCUMENT_TITLE.split(' – ')[0] || 'Untitled Collection'}`,
    primaryImageUrl: sorted[0].imageUrl,
    imageUrls: group.map(a => a.imageUrl),
    timeRange,
    combinedTokens: group.reduce((sum, a) => sum + (a.tokenization?.tokenCount || 0), 0),
    combinedGraph: { nodes: Array.from(allNodes.values()), links: allLinks },
    combinedRecord: combinedRecord,
    status: AssetStatus.MINTED
  };
};

export const createUserBundle = (assets: DigitalAsset[], title: string): ImageBundle => {
  if (!assets || assets.length === 0) throw new Error("Cannot create empty bundle");
  
  const bundle = createBundleFromGroup(assets);
  return {
    ...bundle,
    title: title || bundle.title,
    isUserDefined: true
  };
};

const mergeRecords = (records: HistoricalDocumentMetadata[]): HistoricalDocumentMetadata => {
  if (records.length === 0) throw new Error("Cannot bundle empty records");

  // Use the record with highest confidence as the base
  const best = records.reduce((prev, current) => 
    (prev.CONFIDENCE_SCORE || 0) > (current.CONFIDENCE_SCORE || 0) ? prev : current
  );

  return {
    ...best,
    ASSET_ID: `BUNDLE_${best.ASSET_ID}`,
    DOCUMENT_TITLE: `${best.DOCUMENT_TITLE} (Bundle)`,
    DOCUMENT_DESCRIPTION: `${best.DOCUMENT_DESCRIPTION}\n\n[BUNDLED with ${records.length - 1} other images spanning ${records.length > 2 ? 'multiple periods' : 'similar era'}]`,
    NODE_COUNT: records.reduce((s, r) => s + r.NODE_COUNT, 0),
    FILE_SIZE_BYTES: records.reduce((s, r) => s + r.FILE_SIZE_BYTES, 0),
    SOURCE_COLLECTION: best.SOURCE_COLLECTION + " (Bundled)"
  };
};