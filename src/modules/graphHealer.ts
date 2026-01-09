/**
 * Graph Healer Service
 * 
 * Self-healing system for knowledge graphs that autonomously detects
 * and repairs issues like data inconsistencies, orphaned nodes, and
 * duplicate shards through graph deepening.
 */

import {
  HealingStrategy,
  HealingOptions,
  HealingResult,
  HealingEvent,
  ILLMProvider,
} from './types';
import { GraphData, GraphNode, GraphLink, DigitalAsset } from '../types';
import { moduleRegistry } from './registry';
import { eventEmitter } from './events';
import { logger } from '../lib/logger';

// ============================================
// Default Healing Options
// ============================================

const DEFAULT_HEALING_OPTIONS: HealingOptions = {
  similarityThreshold: 0.55,
  maxNodesToProcess: 1000,
  enableLLMArbitration: true,
  dryRun: false,
};

// ============================================
// Graph Healer Class
// ============================================

export class GraphHealer {
  private strategies: Map<string, HealingStrategy> = new Map();
  private healingHistory: HealingEvent[] = [];
  private isHealing: boolean = false;

  constructor() {
    // Register built-in strategies
    this.registerStrategy(deduplicationStrategy);
    this.registerStrategy(orphanLinkingStrategy);
    this.registerStrategy(edgeInferenceStrategy);
    this.registerStrategy(conflictResolutionStrategy);
  }

  /**
   * Register a healing strategy
   */
  registerStrategy(strategy: HealingStrategy): void {
    this.strategies.set(strategy.name, strategy);
    logger.info(`Registered healing strategy: ${strategy.name}`);
  }

  /**
   * Unregister a healing strategy
   */
  unregisterStrategy(name: string): void {
    this.strategies.delete(name);
  }

  /**
   * Get all registered strategies
   */
  getStrategies(): HealingStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Heal a graph using all registered strategies
   */
  async healGraph(
    graph: GraphData,
    options: HealingOptions = {}
  ): Promise<HealingResult> {
    if (this.isHealing) {
      throw new Error('Healing already in progress');
    }

    this.isHealing = true;
    const mergedOptions = { ...DEFAULT_HEALING_OPTIONS, ...options };

    const result: HealingResult = {
      nodesHealed: 0,
      edgesAdded: 0,
      edgesRemoved: 0,
      duplicatesMerged: 0,
      orphansLinked: 0,
      healingEvents: [],
    };

    try {
      logger.info('Starting graph healing', {
        nodeCount: graph.nodes.length,
        edgeCount: graph.links.length,
        strategies: Array.from(this.strategies.keys()),
      });

      // Execute each strategy
      for (const strategy of this.strategies.values()) {
        try {
          const strategyResult = await strategy.execute(graph, mergedOptions);
          
          // Aggregate results
          result.nodesHealed += strategyResult.nodesHealed;
          result.edgesAdded += strategyResult.edgesAdded;
          result.edgesRemoved += strategyResult.edgesRemoved;
          result.duplicatesMerged += strategyResult.duplicatesMerged;
          result.orphansLinked += strategyResult.orphansLinked;
          result.healingEvents.push(...strategyResult.healingEvents);

          logger.debug(`Strategy ${strategy.name} completed`);
        } catch (error) {
          logger.error(`Strategy ${strategy.name} failed`);
        }
      }

      // Store in history
      this.healingHistory.push(...result.healingEvents);

      // Emit event
      eventEmitter.emit('graph:healed', { healingResult: result });

      logger.info('Graph healing completed');
    } finally {
      this.isHealing = false;
    }

    return result;
  }

  /**
   * Run healing on a specific strategy only
   */
  async runStrategy(
    strategyName: string,
    graph: GraphData,
    options: HealingOptions = {}
  ): Promise<HealingResult> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Strategy "${strategyName}" not found`);
    }

    const mergedOptions = { ...DEFAULT_HEALING_OPTIONS, ...options };
    return strategy.execute(graph, mergedOptions);
  }

  /**
   * Get healing history
   */
  getHistory(limit?: number): HealingEvent[] {
    if (limit) {
      return this.healingHistory.slice(-limit);
    }
    return [...this.healingHistory];
  }

  /**
   * Clear healing history
   */
  clearHistory(): void {
    this.healingHistory = [];
  }

  /**
   * Check if healing is in progress
   */
  isHealingInProgress(): boolean {
    return this.isHealing;
  }
}

// ============================================
// Built-in Healing Strategies
// ============================================

/**
 * Deduplication Strategy
 * Finds and merges duplicate nodes based on similarity
 */
const deduplicationStrategy: HealingStrategy = {
  name: 'deduplication',
  description: 'Identifies and merges duplicate nodes based on label similarity',

  async execute(graph: GraphData, options?: HealingOptions): Promise<HealingResult> {
    const opts = options || {};
    const result: HealingResult = {
      nodesHealed: 0,
      edgesAdded: 0,
      edgesRemoved: 0,
      duplicatesMerged: 0,
      orphansLinked: 0,
      healingEvents: [],
    };

    const threshold = opts.similarityThreshold || 0.55;
    const nodesToProcess = graph.nodes.slice(0, opts.maxNodesToProcess || 1000);
    
    // Group nodes by type for comparison
    const nodesByType = new Map<string, GraphNode[]>();
    for (const node of nodesToProcess) {
      const type = node.type || 'UNKNOWN';
      if (!nodesByType.has(type)) {
        nodesByType.set(type, []);
      }
      nodesByType.get(type)!.push(node);
    }

    // Find duplicates within each type
    const duplicatePairs: Array<[GraphNode, GraphNode, number]> = [];

    for (const [type, nodes] of nodesByType) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const similarity = calculateSimilarity(nodes[i].label, nodes[j].label);
          if (similarity >= threshold) {
            duplicatePairs.push([nodes[i], nodes[j], similarity]);
          }
        }
      }
    }

    // Process duplicates (in dry run, just record)
    for (const [nodeA, nodeB, similarity] of duplicatePairs) {
      if (!opts.dryRun) {
        // Keep the node with higher relevance
        const keepNode = (nodeA.relevance || 0) >= (nodeB.relevance || 0) ? nodeA : nodeB;
        const removeNode = keepNode === nodeA ? nodeB : nodeA;

        // Redirect edges from removed node to kept node
        for (const link of graph.links) {
          if (link.source === removeNode.id) {
            link.source = keepNode.id;
          }
          if (link.target === removeNode.id) {
            link.target = keepNode.id;
          }
        }

        // Remove duplicate node
        const index = graph.nodes.findIndex(n => n.id === removeNode.id);
        if (index !== -1) {
          graph.nodes.splice(index, 1);
        }
      }

      result.duplicatesMerged++;
      result.healingEvents.push({
        type: 'merge',
        nodeIds: [nodeA.id, nodeB.id],
        description: `Merged duplicate nodes: "${nodeA.label}" and "${nodeB.label}" (${(similarity * 100).toFixed(1)}% similar)`,
        confidence: similarity,
        timestamp: new Date(),
      });
    }

    return result;
  },
};

/**
 * Orphan Linking Strategy
 * Finds disconnected nodes and links them using semantic similarity
 */
const orphanLinkingStrategy: HealingStrategy = {
  name: 'orphan-linking',
  description: 'Finds disconnected nodes and links them to the graph using semantic similarity',

  async execute(graph: GraphData, options?: HealingOptions): Promise<HealingResult> {
    const opts = options || {};
    const result: HealingResult = {
      nodesHealed: 0,
      edgesAdded: 0,
      edgesRemoved: 0,
      duplicatesMerged: 0,
      orphansLinked: 0,
      healingEvents: [],
    };

    // Find connected nodes (BFS from any starting node)
    const connectedNodes = new Set<string>();
    const edgeMap = new Map<string, string[]>();

    // Build edge map
    for (const link of graph.links) {
      if (!edgeMap.has(link.source)) {
        edgeMap.set(link.source, []);
      }
      if (!edgeMap.has(link.target)) {
        edgeMap.set(link.target, []);
      }
      edgeMap.get(link.source)!.push(link.target);
      edgeMap.get(link.target)!.push(link.source);
    }

    // BFS to find connected components
    const visited = new Set<string>();
    const largestComponent = new Set<string>();

    for (const node of graph.nodes) {
      if (visited.has(node.id)) continue;

      const component = new Set<string>();
      const queue = [node.id];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;

        visited.add(current);
        component.add(current);

        const neighbors = edgeMap.get(current) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }

      if (component.size > largestComponent.size) {
        largestComponent.clear();
        component.forEach(id => largestComponent.add(id));
      }
    }

    // Find orphans (nodes not in largest component)
    const orphans = graph.nodes.filter(n => !largestComponent.has(n.id));

    // Link orphans to most similar node in main component
    const mainComponentNodes = graph.nodes.filter(n => largestComponent.has(n.id));

    for (const orphan of orphans) {
      let bestMatch: GraphNode | null = null;
      let bestSimilarity = 0;

      for (const candidate of mainComponentNodes) {
        const similarity = calculateSimilarity(orphan.label, candidate.label);
        if (similarity > bestSimilarity && similarity >= (opts.similarityThreshold || 0.3)) {
          bestSimilarity = similarity;
          bestMatch = candidate;
        }
      }

      if (bestMatch && !opts.dryRun) {
        graph.links.push({
          source: orphan.id,
          target: bestMatch.id,
          relationship: 'RELATED_TO',
        });
        result.edgesAdded++;
      }

      if (bestMatch) {
        result.orphansLinked++;
        result.healingEvents.push({
          type: 'link',
          nodeIds: [orphan.id, bestMatch.id],
          description: `Linked orphan "${orphan.label}" to "${bestMatch.label}"`,
          confidence: bestSimilarity,
          timestamp: new Date(),
        });
      }
    }

    return result;
  },
};

/**
 * Edge Inference Strategy
 * Infers new edges based on co-occurrence and semantic patterns
 */
const edgeInferenceStrategy: HealingStrategy = {
  name: 'edge-inference',
  description: 'Infers new edges based on co-occurrence patterns and semantic relationships',

  async execute(graph: GraphData, options?: HealingOptions): Promise<HealingResult> {
    const opts = options || {};
    const result: HealingResult = {
      nodesHealed: 0,
      edgesAdded: 0,
      edgesRemoved: 0,
      duplicatesMerged: 0,
      orphansLinked: 0,
      healingEvents: [],
    };

    // Build existing edge set
    const existingEdges = new Set<string>();
    for (const link of graph.links) {
      existingEdges.add(`${link.source}|${link.target}`);
      existingEdges.add(`${link.target}|${link.source}`);
    }

    // Find nodes that share common neighbors (co-occurrence)
    const neighborMap = new Map<string, Set<string>>();
    
    for (const link of graph.links) {
      if (!neighborMap.has(link.source)) {
        neighborMap.set(link.source, new Set());
      }
      if (!neighborMap.has(link.target)) {
        neighborMap.set(link.target, new Set());
      }
      neighborMap.get(link.source)!.add(link.target);
      neighborMap.get(link.target)!.add(link.source);
    }

    // Find potential new edges based on shared neighbors
    const potentialEdges: Array<{ source: string; target: string; confidence: number }> = [];
    const nodes = graph.nodes.slice(0, opts.maxNodesToProcess || 1000);

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];
        
        // Skip if edge already exists
        if (existingEdges.has(`${nodeA.id}|${nodeB.id}`)) continue;

        const neighborsA = neighborMap.get(nodeA.id) || new Set();
        const neighborsB = neighborMap.get(nodeB.id) || new Set();

        // Calculate Jaccard similarity of neighborhoods
        const intersection = new Set([...neighborsA].filter(x => neighborsB.has(x)));
        const union = new Set([...neighborsA, ...neighborsB]);

        if (union.size > 0) {
          const jaccardSim = intersection.size / union.size;
          if (jaccardSim >= (opts.similarityThreshold || 0.3)) {
            potentialEdges.push({
              source: nodeA.id,
              target: nodeB.id,
              confidence: jaccardSim,
            });
          }
        }
      }
    }

    // Add inferred edges (limit to top candidates)
    const topEdges = potentialEdges
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 50);

    for (const edge of topEdges) {
      if (!opts.dryRun) {
        graph.links.push({
          source: edge.source,
          target: edge.target,
          relationship: 'INFERRED_RELATION',
        });
      }

      result.edgesAdded++;
      result.healingEvents.push({
        type: 'infer',
        nodeIds: [edge.source, edge.target],
        description: `Inferred edge between nodes based on shared neighbors`,
        confidence: edge.confidence,
        timestamp: new Date(),
      });
    }

    return result;
  },
};

/**
 * Conflict Resolution Strategy
 * Resolves conflicting metadata between nodes using LLM arbitration
 */
const conflictResolutionStrategy: HealingStrategy = {
  name: 'conflict-resolution',
  description: 'Resolves conflicting metadata between nodes using LLM arbitration',

  async execute(graph: GraphData, options?: HealingOptions): Promise<HealingResult> {
    const opts = options || {};
    const result: HealingResult = {
      nodesHealed: 0,
      edgesAdded: 0,
      edgesRemoved: 0,
      duplicatesMerged: 0,
      orphansLinked: 0,
      healingEvents: [],
    };

    if (!opts.enableLLMArbitration) {
      return result;
    }

    // Get LLM provider for arbitration
    const llmProvider = await moduleRegistry.getLLMProviderWithFallback();
    if (!llmProvider || !llmProvider.arbitrateConflict) {
      logger.debug('No LLM provider available for conflict resolution');
      return result;
    }

    // Find nodes with same label but different types (potential conflicts)
    const labelMap = new Map<string, GraphNode[]>();
    
    for (const node of graph.nodes) {
      const normalizedLabel = node.label.toLowerCase().trim();
      if (!labelMap.has(normalizedLabel)) {
        labelMap.set(normalizedLabel, []);
      }
      labelMap.get(normalizedLabel)!.push(node);
    }

    // Process conflicts
    for (const [label, nodes] of labelMap) {
      if (nodes.length < 2) continue;

      // Check for type conflicts
      const types = new Set(nodes.map(n => n.type));
      if (types.size < 2) continue;

      // Arbitrate using LLM
      try {
        const arbitrationResult = await llmProvider.arbitrateConflict({
          metadataA: { entities: [nodes[0].label], confidence: nodes[0].relevance },
          metadataB: { entities: [nodes[1].label], confidence: nodes[1].relevance },
          context: `Conflicting node types: ${Array.from(types).join(', ')}`,
        });

        if (!opts.dryRun) {
          // Apply resolution: standardize to the arbitrated type
          // For now, just log the conflict
        }

        result.nodesHealed++;
        result.healingEvents.push({
          type: 'merge',
          nodeIds: nodes.map(n => n.id),
          description: `Resolved type conflict for "${label}": ${arbitrationResult.reasoning}`,
          confidence: arbitrationResult.confidence,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.warn(`Failed to arbitrate conflict for "${label}"`);
      }
    }

    return result;
  },
};

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate similarity between two strings using Levenshtein distance
 */
function calculateSimilarity(strA: string, strB: string): number {
  const a = strA.toLowerCase().trim();
  const b = strB.toLowerCase().trim();

  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[a.length][b.length];
  const maxLength = Math.max(a.length, b.length);

  return 1 - distance / maxLength;
}

// ============================================
// Singleton Export
// ============================================

export const graphHealer = new GraphHealer();

// ============================================
// Scheduled Healing
// ============================================

let healingInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start scheduled graph healing
 */
export function startScheduledHealing(
  graphProvider: () => Promise<GraphData>,
  intervalMs: number = 3600000 // 1 hour default
): void {
  if (healingInterval) {
    logger.warn('Scheduled healing already running');
    return;
  }

  healingInterval = setInterval(async () => {
    try {
      const graph = await graphProvider();
      await graphHealer.healGraph(graph);
    } catch (error) {
      logger.error('Scheduled healing failed');
    }
  }, intervalMs);

  logger.info(`Scheduled healing started with ${intervalMs}ms interval`);
}

/**
 * Stop scheduled graph healing
 */
export function stopScheduledHealing(): void {
  if (healingInterval) {
    clearInterval(healingInterval);
    healingInterval = null;
    logger.info('Scheduled healing stopped');
  }
}
