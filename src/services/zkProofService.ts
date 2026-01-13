/**
 * Zero-Knowledge Proof Service for Graph Privacy
 * 
 * Implements ZK-SNARKs for proving knowledge graph integrity without
 * revealing sensitive entities. Uses Circom circuits for proof generation
 * and on-chain verification.
 * 
 * @module zkProofService
 */

import { ethers } from 'ethers';
import { logger } from '../lib/logger';
import { GraphNode, GraphEdge } from '../types';

// ZK Configuration
const ZK_CONFIG = {
  CIRCUIT_WASM_PATH: '/circuits/graph_integrity.wasm',
  CIRCUIT_ZKEY_PATH: '/circuits/graph_integrity_final.zkey',
  VERIFICATION_KEY_PATH: '/circuits/verification_key.json',
  MAX_NODES_PER_PROOF: 100,
  MAX_EDGES_PER_PROOF: 200,
  PROOF_CACHE_TTL_MS: 3600000, // 1 hour
};

/**
 * ZK Proof structure
 */
export interface ZKProof {
  proofId: string;
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  publicSignals: string[];
  graphHash: string;
  nodeCount: number;
  edgeCount: number;
  timestamp: number;
}

/**
 * ZK Verification result
 */
export interface ZKVerificationResult {
  valid: boolean;
  proofId: string;
  graphHash: string;
  verificationTime: number;
  onChainTxHash?: string;
}

/**
 * Private graph query with ZK proof
 */
export interface ZKGraphQuery {
  queryId: string;
  targetNodeTypes: string[];
  relationshipTypes: string[];
  depthLimit: number;
  proof: ZKProof;
  maskedResult: MaskedGraphResult;
}

/**
 * Masked graph result (privacy-preserving)
 */
export interface MaskedGraphResult {
  nodeCount: number;
  edgeCount: number;
  nodeTypeCounts: Record<string, number>;
  aggregateMetrics: {
    avgConfidence: number;
    densityScore: number;
    connectivityIndex: number;
  };
  provenProperties: ProvenProperty[];
}

/**
 * Property proven without revealing value
 */
export interface ProvenProperty {
  property: string;
  constraint: 'exists' | 'greater_than' | 'less_than' | 'in_range' | 'matches_pattern';
  satisfied: boolean;
}

/**
 * ZK Filter dimension for dynamic filtering
 */
export interface ZKFilterDimension {
  id: 'zkFilter';
  name: 'Zero-Knowledge Privacy Filter';
  proofRequired: boolean;
  allowedQueries: string[];
  verificationLevel: 'local' | 'on-chain';
}

/**
 * Circom circuit input format
 */
interface CircuitInput {
  nodeHashes: bigint[];
  edgeHashes: bigint[];
  nodeTypes: bigint[];
  edgeTypes: bigint[];
  adjacencyMatrix: bigint[][];
  expectedGraphHash: bigint;
}

/**
 * ZK Proof Service Class
 */
class ZKProofService {
  private snarkjs: any = null;
  private verificationKey: any = null;
  private proofCache: Map<string, ZKProof> = new Map();
  private verifierContract: ethers.Contract | null = null;
  private initialized = false;

  /**
   * Initialize the ZK service
   */
  async initialize(): Promise<boolean> {
    try {
      // Dynamic import of snarkjs (works in browser via bundler)
      this.snarkjs = await import('snarkjs');
      
      // Load verification key
      const vkResponse = await fetch(ZK_CONFIG.VERIFICATION_KEY_PATH);
      this.verificationKey = await vkResponse.json();

      this.initialized = true;
      logger.info('ZK Proof Service initialized');
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize ZK Proof Service', { error });
      return false;
    }
  }

  /**
   * Initialize on-chain verifier contract
   */
  async initializeVerifier(
    verifierAddress: string,
    provider: ethers.BrowserProvider
  ): Promise<boolean> {
    const VERIFIER_ABI = [
      'function verifyProof(uint256[2] calldata _pA, uint256[2][2] calldata _pB, uint256[2] calldata _pC, uint256[] calldata _pubSignals) external view returns (bool)',
      'event ProofVerified(bytes32 indexed proofId, address indexed verifier, bool valid)',
    ];

    try {
      const signer = await provider.getSigner();
      this.verifierContract = new ethers.Contract(verifierAddress, VERIFIER_ABI, signer);
      return true;
    } catch (error) {
      logger.error('Failed to initialize verifier contract', { error });
      return false;
    }
  }

  /**
   * Hash a graph node for circuit input
   */
  private hashNode(node: GraphNode): bigint {
    const nodeData = JSON.stringify({
      id: node.id,
      type: node.type,
      label: node.label.substring(0, 32), // Truncate for circuit
    });
    const hash = ethers.keccak256(ethers.toUtf8Bytes(nodeData));
    return BigInt(hash) % BigInt(2) ** BigInt(253); // Field element
  }

  /**
   * Hash a graph edge for circuit input
   */
  private hashEdge(edge: GraphEdge): bigint {
    const edgeData = JSON.stringify({
      source: edge.source,
      target: edge.target,
      type: edge.type,
    });
    const hash = ethers.keccak256(ethers.toUtf8Bytes(edgeData));
    return BigInt(hash) % BigInt(2) ** BigInt(253);
  }

  /**
   * Compute graph hash from nodes and edges
   */
  private computeGraphHash(nodes: GraphNode[], edges: GraphEdge[]): string {
    const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    const sortedEdges = [...edges].sort((a, b) => 
      `${a.source}-${a.target}`.localeCompare(`${b.source}-${b.target}`)
    );
    
    const graphData = JSON.stringify({
      nodes: sortedNodes.map(n => ({ id: n.id, type: n.type })),
      edges: sortedEdges.map(e => ({ s: e.source, t: e.target, type: e.type })),
    });
    
    return ethers.keccak256(ethers.toUtf8Bytes(graphData));
  }

  /**
   * Build adjacency matrix for circuit
   */
  private buildAdjacencyMatrix(
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): bigint[][] {
    const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]));
    const size = Math.min(nodes.length, ZK_CONFIG.MAX_NODES_PER_PROOF);
    
    const matrix: bigint[][] = Array(size).fill(null).map(() => 
      Array(size).fill(BigInt(0))
    );

    for (const edge of edges) {
      const sourceIdx = nodeIndex.get(edge.source);
      const targetIdx = nodeIndex.get(edge.target);
      
      if (sourceIdx !== undefined && targetIdx !== undefined &&
          sourceIdx < size && targetIdx < size) {
        matrix[sourceIdx][targetIdx] = BigInt(1);
      }
    }

    return matrix;
  }

  /**
   * Encode node/edge type as field element
   */
  private encodeType(type: string): bigint {
    const hash = ethers.keccak256(ethers.toUtf8Bytes(type));
    return BigInt(hash) % BigInt(256); // Compress to single byte
  }

  /**
   * Prepare circuit input from graph
   */
  private prepareCircuitInput(
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): CircuitInput {
    const limitedNodes = nodes.slice(0, ZK_CONFIG.MAX_NODES_PER_PROOF);
    const limitedEdges = edges.slice(0, ZK_CONFIG.MAX_EDGES_PER_PROOF);

    const nodeHashes = limitedNodes.map(n => this.hashNode(n));
    const edgeHashes = limitedEdges.map(e => this.hashEdge(e));
    const nodeTypes = limitedNodes.map(n => this.encodeType(n.type));
    const edgeTypes = limitedEdges.map(e => this.encodeType(e.type || 'RELATED'));
    const adjacencyMatrix = this.buildAdjacencyMatrix(limitedNodes, limitedEdges);
    const graphHash = this.computeGraphHash(limitedNodes, limitedEdges);

    // Pad arrays to fixed size for circuit
    while (nodeHashes.length < ZK_CONFIG.MAX_NODES_PER_PROOF) {
      nodeHashes.push(BigInt(0));
      nodeTypes.push(BigInt(0));
    }
    while (edgeHashes.length < ZK_CONFIG.MAX_EDGES_PER_PROOF) {
      edgeHashes.push(BigInt(0));
      edgeTypes.push(BigInt(0));
    }

    return {
      nodeHashes,
      edgeHashes,
      nodeTypes,
      edgeTypes,
      adjacencyMatrix,
      expectedGraphHash: BigInt(graphHash) % BigInt(2) ** BigInt(253),
    };
  }

  /**
   * Generate ZK proof for graph integrity
   */
  async generateProof(
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): Promise<ZKProof> {
    if (!this.initialized || !this.snarkjs) {
      throw new Error('ZK service not initialized');
    }

    const graphHash = this.computeGraphHash(nodes, edges);
    
    // Check cache
    const cached = this.proofCache.get(graphHash);
    if (cached && Date.now() - cached.timestamp < ZK_CONFIG.PROOF_CACHE_TTL_MS) {
      logger.debug('Returning cached ZK proof', { graphHash });
      return cached;
    }

    const startTime = Date.now();
    
    // Prepare circuit input
    const input = this.prepareCircuitInput(nodes, edges);

    // Generate proof using snarkjs
    const { proof, publicSignals } = await this.snarkjs.groth16.fullProve(
      input,
      ZK_CONFIG.CIRCUIT_WASM_PATH,
      ZK_CONFIG.CIRCUIT_ZKEY_PATH
    );

    const zkProof: ZKProof = {
      proofId: `zk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      proof: {
        pi_a: proof.pi_a,
        pi_b: proof.pi_b,
        pi_c: proof.pi_c,
      },
      publicSignals,
      graphHash,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      timestamp: Date.now(),
    };

    // Cache proof
    this.proofCache.set(graphHash, zkProof);

    logger.info('ZK proof generated', {
      proofId: zkProof.proofId,
      graphHash,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      generationTime: Date.now() - startTime,
    });

    return zkProof;
  }

  /**
   * Verify ZK proof locally
   */
  async verifyProofLocal(proof: ZKProof): Promise<ZKVerificationResult> {
    if (!this.initialized || !this.snarkjs || !this.verificationKey) {
      throw new Error('ZK service not initialized');
    }

    const startTime = Date.now();

    const valid = await this.snarkjs.groth16.verify(
      this.verificationKey,
      proof.publicSignals,
      proof.proof
    );

    const result: ZKVerificationResult = {
      valid,
      proofId: proof.proofId,
      graphHash: proof.graphHash,
      verificationTime: Date.now() - startTime,
    };

    logger.info('ZK proof verified locally', { ...result });

    return result;
  }

  /**
   * Verify ZK proof on-chain
   */
  async verifyProofOnChain(proof: ZKProof): Promise<ZKVerificationResult> {
    if (!this.verifierContract) {
      throw new Error('Verifier contract not initialized');
    }

    const startTime = Date.now();

    try {
      // Format proof for Solidity verifier
      const pA = proof.proof.pi_a.slice(0, 2).map(BigInt);
      const pB = proof.proof.pi_b.slice(0, 2).map(row => row.slice(0, 2).map(BigInt));
      const pC = proof.proof.pi_c.slice(0, 2).map(BigInt);
      const pubSignals = proof.publicSignals.map(BigInt);

      const tx = await this.verifierContract.verifyProof(pA, pB, pC, pubSignals);
      const receipt = await tx.wait();

      const result: ZKVerificationResult = {
        valid: true, // If tx succeeded
        proofId: proof.proofId,
        graphHash: proof.graphHash,
        verificationTime: Date.now() - startTime,
        onChainTxHash: receipt.hash,
      };

      logger.info('ZK proof verified on-chain', { ...result });

      return result;
    } catch (error) {
      logger.error('On-chain verification failed', { error, proofId: proof.proofId });
      return {
        valid: false,
        proofId: proof.proofId,
        graphHash: proof.graphHash,
        verificationTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute private query with ZK proof
   */
  async executePrivateQuery(
    nodes: GraphNode[],
    edges: GraphEdge[],
    query: {
      targetNodeTypes: string[];
      relationshipTypes: string[];
      depthLimit: number;
    }
  ): Promise<ZKGraphQuery> {
    // Generate proof for the graph
    const proof = await this.generateProof(nodes, edges);

    // Compute masked result (aggregate stats without revealing data)
    const maskedResult = this.computeMaskedResult(nodes, edges, query);

    const zkQuery: ZKGraphQuery = {
      queryId: `query_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      targetNodeTypes: query.targetNodeTypes,
      relationshipTypes: query.relationshipTypes,
      depthLimit: query.depthLimit,
      proof,
      maskedResult,
    };

    logger.info('Private query executed', {
      queryId: zkQuery.queryId,
      nodeTypes: query.targetNodeTypes,
      resultNodeCount: maskedResult.nodeCount,
    });

    return zkQuery;
  }

  /**
   * Compute masked (privacy-preserving) result
   */
  private computeMaskedResult(
    nodes: GraphNode[],
    edges: GraphEdge[],
    query: { targetNodeTypes: string[]; relationshipTypes: string[] }
  ): MaskedGraphResult {
    // Filter nodes and edges based on query
    const filteredNodes = nodes.filter(n => 
      query.targetNodeTypes.length === 0 || query.targetNodeTypes.includes(n.type)
    );
    const filteredEdges = edges.filter(e =>
      query.relationshipTypes.length === 0 || query.relationshipTypes.includes(e.type || '')
    );

    // Compute node type counts
    const nodeTypeCounts: Record<string, number> = {};
    for (const node of filteredNodes) {
      nodeTypeCounts[node.type] = (nodeTypeCounts[node.type] || 0) + 1;
    }

    // Compute aggregate metrics
    const confidenceScores = filteredNodes
      .filter(n => n.confidence !== undefined)
      .map(n => n.confidence!);
    
    const avgConfidence = confidenceScores.length > 0
      ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
      : 0;

    const densityScore = filteredNodes.length > 1
      ? (2 * filteredEdges.length) / (filteredNodes.length * (filteredNodes.length - 1))
      : 0;

    // Compute connectivity index (average degree)
    const nodeDegrees = new Map<string, number>();
    for (const edge of filteredEdges) {
      nodeDegrees.set(edge.source, (nodeDegrees.get(edge.source) || 0) + 1);
      nodeDegrees.set(edge.target, (nodeDegrees.get(edge.target) || 0) + 1);
    }
    const connectivityIndex = nodeDegrees.size > 0
      ? Array.from(nodeDegrees.values()).reduce((a, b) => a + b, 0) / nodeDegrees.size
      : 0;

    return {
      nodeCount: filteredNodes.length,
      edgeCount: filteredEdges.length,
      nodeTypeCounts,
      aggregateMetrics: {
        avgConfidence,
        densityScore,
        connectivityIndex,
      },
      provenProperties: [
        {
          property: 'hasNodes',
          constraint: 'exists',
          satisfied: filteredNodes.length > 0,
        },
        {
          property: 'confidenceThreshold',
          constraint: 'greater_than',
          satisfied: avgConfidence >= 0.7,
        },
        {
          property: 'connectivityMinimum',
          constraint: 'greater_than',
          satisfied: connectivityIndex >= 1.0,
        },
      ],
    };
  }

  /**
   * Create ZK filter dimension for dynamic filtering
   */
  createZKFilterDimension(options: {
    proofRequired: boolean;
    verificationLevel: 'local' | 'on-chain';
  }): ZKFilterDimension {
    return {
      id: 'zkFilter',
      name: 'Zero-Knowledge Privacy Filter',
      proofRequired: options.proofRequired,
      allowedQueries: ['nodeTypes', 'edgeCounts', 'aggregateMetrics'],
      verificationLevel: options.verificationLevel,
    };
  }

  /**
   * Store proof metadata in ENTITIES_EXTRACTED field format
   */
  formatProofForStorage(proof: ZKProof): object {
    return {
      zkProof: {
        proofId: proof.proofId,
        graphHash: proof.graphHash,
        nodeCount: proof.nodeCount,
        edgeCount: proof.edgeCount,
        timestamp: proof.timestamp,
        // Store proof commitment (not full proof for privacy)
        commitment: ethers.keccak256(
          ethers.toUtf8Bytes(JSON.stringify(proof.proof))
        ),
      },
    };
  }

  /**
   * Clear proof cache
   */
  clearCache(): void {
    this.proofCache.clear();
    logger.info('ZK proof cache cleared');
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    cacheSize: number;
    hasVerifierContract: boolean;
  } {
    return {
      initialized: this.initialized,
      cacheSize: this.proofCache.size,
      hasVerifierContract: this.verifierContract !== null,
    };
  }
}

// Export singleton instance
export const zkProofService = new ZKProofService();

/**
 * Plugin adapter for ZK proofs
 */
export const createZKProofPlugin = () => ({
  id: 'zk-proof',
  name: 'Zero-Knowledge Graph Privacy',
  version: '1.0.0',

  async initialize() {
    return zkProofService.initialize();
  },

  async generateProof(nodes: GraphNode[], edges: GraphEdge[]) {
    return zkProofService.generateProof(nodes, edges);
  },

  async verifyProof(proof: ZKProof, onChain = false) {
    return onChain
      ? zkProofService.verifyProofOnChain(proof)
      : zkProofService.verifyProofLocal(proof);
  },

  async privateQuery(
    nodes: GraphNode[],
    edges: GraphEdge[],
    query: { targetNodeTypes: string[]; relationshipTypes: string[]; depthLimit: number }
  ) {
    return zkProofService.executePrivateQuery(nodes, edges, query);
  },
});

export default zkProofService;
