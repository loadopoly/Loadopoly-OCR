import { HealingStrategy, HealingOptions, HealingResult } from './types';
import { GraphData, GraphNode, GraphLink } from '../types';
import { logger } from '../lib/logger';

/**
 * Relational Sizing Strategy
 * Processes graph links that connect known reference objects to unknown objects.
 * Uses bounding box ratios or distance comparisons to "propagate" sizes.
 */
export const relationalSizingStrategy: HealingStrategy = {
  name: 'relationalSizing',
  description: 'Infers object size through reference scaling (e.g. tree vs bottle)',
  execute: async (graph: GraphData, options?: HealingOptions): Promise<HealingResult> => {
    const result: HealingResult = {
      nodesHealed: 0,
      edgesAdded: 0,
      edgesRemoved: 0,
      duplicatesMerged: 0,
      orphansLinked: 0,
      healingEvents: [],
    };

    // Find all reference objects (e.g. Water Bottles)
    const referenceNodes = graph.nodes.filter(n => (n as any).IS_REFERENCE_OBJECT || n.CANONICAL_ID?.startsWith('ref_'));
    
    if (referenceNodes.length === 0) {
      return result;
    }

    logger.info(`Propagating sizing from ${referenceNodes.length} reference objects`);

    for (const refNode of referenceNodes) {
      // Find targets connected to this reference
      const targets = graph.links.filter(l => l.source === refNode.id || l.target === refNode.id);

      for (const edge of targets) {
        const otherNodeId = edge.source === refNode.id ? edge.target : edge.source;
        const targetNode = graph.nodes.find(n => n.id === otherNodeId);

        if (targetNode && !(targetNode as any).PHYSICAL_HEIGHT_M) {
          // If we have a relative scale from the vision pass
          const relativeScale = (edge as any).RELATIVE_SCALE;
          const refHeight = (refNode as any).PHYSICAL_HEIGHT_M || 0.2; // Default to 20cm if unknown

          if (relativeScale && refHeight) {
            const inferredHeight = refHeight * relativeScale;
            (targetNode as any).PHYSICAL_HEIGHT_M = inferredHeight;
            result.nodesHealed++;
            
            result.healingEvents.push({
              type: 'infer',
              nodeIds: [targetNode.id, refNode.id],
              description: `Inferred height ${inferredHeight.toFixed(2)}m from reference ${refNode.LABEL || refNode.label}`,
              confidence: 0.8,
              timestamp: new Date()
            });
            
            logger.info(`Inferred size for ${targetNode.label}: ${inferredHeight}m`);
          }
        }
      }
    }

    return result;
  }
};
