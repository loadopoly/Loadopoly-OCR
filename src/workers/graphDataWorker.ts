/**
 * Graph Data Worker — Off-main-thread knowledge graph construction
 *
 * Builds the unified globalGraphData (docNodes + entity nodes + SKG nodes + links)
 * from asset data. This performs ~30,000-42,000 string operations and Map lookups
 * for ~387 assets — 5-10s on mobile. Running in a worker keeps the UI responsive.
 *
 * Protocol:
 *   Main→Worker  { gen, assets: MinAsset[], graphFilters }
 *   Worker→Main  { gen, graphData: { nodes, links } }
 */

interface MinAsset {
  id: string;
  sqlRecord: any;
  graphData?: { nodes: any[]; links: any[] };
}

interface GraphFilters {
  era: string;
  category: string;
  contested: boolean;
}

interface GraphNode {
  id: string;
  label: string;
  type: string;
  relevance: number;
  license?: string;
  confidence?: number;
  // Physical grounding fields carried through from STRUCTURED_PHYSICAL_SCALE
  PHYSICAL_HEIGHT_M?: number;
  PHYSICAL_WIDTH_M?: number;
  PHYSICAL_DEPTH_M?: number;
  IS_REFERENCE_OBJECT?: boolean;
  LAT?: number;
  LNG?: number;
  GPS_SOURCE?: string;
}

interface GraphLink {
  source: string;
  target: string;
  relationship: string;
  relativeScale?: number;
  // Physical realization fields
  isPhysicallyRealized?: boolean;
  physicalDistanceM?: number;
  bearingDeg?: number;
  realizationConfidence?: number;
  realizationMethod?: string;
  realizationContext?: Record<string, unknown>;
}

export interface GraphWorkerRequest {
  gen: number;
  assets: MinAsset[];
  graphFilters: GraphFilters;
}

export interface GraphWorkerResponse {
  gen: number;
  graphData: { nodes: GraphNode[]; links: GraphLink[] };
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

self.onmessage = (e: MessageEvent<GraphWorkerRequest>) => {
  const { gen, assets, graphFilters } = e.data;

  const filteredAssets = assets.filter(asset => {
    const r = asset.sqlRecord;
    if (!r) return false;
    const category = asText(r.NLP_NODE_CATEGORIZATION, '');
    if (graphFilters.category !== 'all' && category !== graphFilters.category) return false;
    const derivedTimestamp = asText(r.NLP_DERIVED_TIMESTAMP, '');
    const eraKey = derivedTimestamp.match(/\d{4}/)?.[0]?.slice(0, 3) + '0s' || 'Unknown';
    if (graphFilters.era !== 'all' && eraKey !== graphFilters.era) return false;
    const documentDescription = asText(r.DOCUMENT_DESCRIPTION, '');
    const isContested = r.ACCESS_RESTRICTIONS || /controversy|removed|relocated/i.test(documentDescription);
    if (graphFilters.contested && !isContested) return false;
    return true;
  });

  const docNodes: GraphNode[] = filteredAssets.map(a => ({
    id: a.id,
    label: asText(a.sqlRecord?.DOCUMENT_TITLE, 'Untitled') || 'Untitled',
    type: 'DOCUMENT' as const,
    relevance: 1.0,
    license: a.sqlRecord?.DATA_LICENSE,
  }));

  const entityNodesMap = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  for (const asset of filteredAssets) {
    const cat = asText(asset.sqlRecord?.NLP_NODE_CATEGORIZATION, 'Uncategorized') || 'Uncategorized';
    const catId = `CAT_${cat.replace(/\s+/g, '_')}`;
    if (!entityNodesMap.has(catId)) {
      entityNodesMap.set(catId, { id: catId, label: cat, type: 'CLUSTER', relevance: 0.8 });
    }
    links.push({ source: asset.id, target: catId, relationship: 'CATEGORIZED_AS' });

    // Merge entity nodes from local graphData (client-side processing path)
    if (Array.isArray(asset.graphData?.nodes)) {
      for (const node of asset.graphData.nodes) {
        const safeLabel = asText((node as any)?.label, 'UNKNOWN') || 'UNKNOWN';
        const entityId = `ENT_${safeLabel.replace(/\s+/g, '_').toUpperCase()}`;
        if (!entityNodesMap.has(entityId)) entityNodesMap.set(entityId, { ...node, id: entityId });
        links.push({ source: asset.id, target: entityId, relationship: 'CONTAINS' });
      }
    }

    // Merge richer graph data from STRUCTURED_KNOWLEDGE_GRAPH (server-side processing path)
    const skg = asset.sqlRecord?.STRUCTURED_KNOWLEDGE_GRAPH as any;
    if (Array.isArray(skg?.nodes)) {
      for (const node of skg.nodes as any[]) {
        const rawNodeKey = asText(node?.id, '') || asText(node?.label, '');
        const nodeId = `SKG_${rawNodeKey.replace(/\s+/g, '_').toUpperCase()}`;
        if (!entityNodesMap.has(nodeId)) {
          entityNodesMap.set(nodeId, {
            id: nodeId,
            label: asText(node?.label, asText(node?.id, 'Unknown')) || 'Unknown',
            type: (node.type as any) || 'CONCEPT',
            relevance: node.relevance ?? 0.75,
            PHYSICAL_HEIGHT_M: node.estimatedHeightM ?? undefined,
            IS_REFERENCE_OBJECT: node.isReference ?? undefined,
          });
        }
        links.push({ source: asset.id, target: nodeId, relationship: 'STRUCTURED_ENTITY' });
      }
      if (Array.isArray(skg.links)) {
        for (const link of skg.links as any[]) {
          const sourceId = `SKG_${asText(link?.source, '').replace(/\s+/g, '_').toUpperCase()}`;
          const targetId = `SKG_${asText(link?.target, '').replace(/\s+/g, '_').toUpperCase()}`;
          if (entityNodesMap.has(sourceId) && entityNodesMap.has(targetId)) {
            links.push({
              source: sourceId,
              target: targetId,
              relationship: link.relationship || 'RELATED',
              relativeScale: link.relativeScale ?? undefined,
              // Carry through any realization data persisted from prior healing
              isPhysicallyRealized: link.isPhysicallyRealized ?? undefined,
              physicalDistanceM: link.physicalDistanceM ?? undefined,
              bearingDeg: link.bearingDeg ?? undefined,
              realizationConfidence: link.realizationConfidence ?? undefined,
              realizationMethod: link.realizationMethod ?? undefined,
              realizationContext: link.realizationContext ?? undefined,
            });
          }
        }
      }
    }

    // Enrich entity nodes with physical scale data from STRUCTURED_PHYSICAL_SCALE.
    // This ensures sizing data flows from the SQL record through to the graph
    // so the physicalRealization healing strategy can detect GPS+dims grounding.
    const physScale = asset.sqlRecord?.STRUCTURED_PHYSICAL_SCALE as any;
    if (physScale?.scaleRelationships && Array.isArray(physScale.scaleRelationships)) {
      for (const rel of physScale.scaleRelationships as any[]) {
        // Find the target entity node and annotate with inferred physical height
        const targetKey = asText(rel?.targetLabel, '').replace(/\s+/g, '_').toUpperCase();
        for (const prefix of ['SKG_', 'ENT_']) {
          const candidateId = `${prefix}${targetKey}`;
          const node = entityNodesMap.get(candidateId);
          if (node && !node.PHYSICAL_HEIGHT_M && rel.inferredHeightM) {
            node.PHYSICAL_HEIGHT_M = rel.inferredHeightM;
          }
        }
        // Mark reference objects
        const refKey = asText(rel?.referenceLabel, '').replace(/\s+/g, '_').toUpperCase();
        for (const prefix of ['SKG_', 'ENT_']) {
          const candidateId = `${prefix}${refKey}`;
          const node = entityNodesMap.get(candidateId);
          if (node) {
            node.IS_REFERENCE_OBJECT = true;
            if (!node.PHYSICAL_HEIGHT_M && rel.referenceHeightM) {
              node.PHYSICAL_HEIGHT_M = rel.referenceHeightM;
            }
          }
        }
      }
    }

    // Propagate asset GPS onto entity nodes that lack their own coordinates.
    // P1: Mark propagated GPS as DEVICE_INHERITED so realization can distinguish
    // from natively geocoded or Wikidata-sourced coordinates.
    const spatialCluster = asset.sqlRecord?.STRUCTURED_SPATIAL as any;
    const assetLat = spatialCluster?.deviceLat
      ?? spatialCluster?.coordinates?.lat
      ?? null;
    const assetLng = spatialCluster?.deviceLng
      ?? spatialCluster?.coordinates?.lng
      ?? null;
    if (assetLat != null && assetLng != null) {
      // Find all nodes linked to this asset and give them GPS if missing
      for (const link of links) {
        if (link.source !== asset.id) continue;
        const node = entityNodesMap.get(link.target);
        if (node && node.LAT == null) {
          node.LAT = assetLat;
          node.LNG = assetLng;
          node.GPS_SOURCE = 'DEVICE_INHERITED';
        }
      }
    }
  }

  const graphData = {
    nodes: [...docNodes, ...Array.from(entityNodesMap.values())],
    links,
  };

  (self as any).postMessage({ gen, graphData } satisfies GraphWorkerResponse);
};
