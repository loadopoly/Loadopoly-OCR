/**
 * Shard-Aware Batch Processing Service
 * 
 * Extends the global processing queue to batch OCR jobs by semantic clusters,
 * enabling gas-efficient ERC1155 batch minting and GARD token staking for
 * priority processing.
 * 
 * @module batchProcessingService
 */

import { ethers } from 'ethers';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../lib/logger';
import { GARD_CONFIG } from '../types';

// Batch Processing Configuration
const BATCH_CONFIG = {
  MAX_BATCH_SIZE: 50,
  MIN_BATCH_SIZE: 5,
  BATCH_TIMEOUT_MS: 300000, // 5 minutes
  IPFS_PIN_TIMEOUT_MS: 60000,
  SEMANTIC_SIMILARITY_THRESHOLD: 0.75,
  GPS_PROXIMITY_METERS: 500,
  GAS_SAVINGS_TARGET: 0.70, // 70% gas reduction target
};

/**
 * Semantic cluster dimensions for batch grouping
 */
export const CLUSTER_DIMENSIONS = [
  'documentType',
  'era',
  'geographicZone',
  'category',
  'subject',
  'mediaType',
  'language',
  'verificationLevel',
  'licenseType',
  'narrativeRole',
  'researchPotential',
  'serendipityScore',
] as const;

export type ClusterDimension = typeof CLUSTER_DIMENSIONS[number];

/**
 * Batch job structure
 */
export interface BatchJob {
  batchId: string;
  clusterId: string;
  clusterDimensions: Partial<Record<ClusterDimension, string>>;
  jobs: ProcessingJob[];
  status: BatchStatus;
  priority: number;
  stakedAmount: bigint;
  createdAt: number;
  processedAt?: number;
  ipfsCid?: string;
  mintTxHash?: string;
  gasUsed?: bigint;
  estimatedGasSavings?: number;
}

/**
 * Individual processing job
 */
export interface ProcessingJob {
  jobId: string;
  assetId: string;
  userId: string;
  status: JobStatus;
  metadata: {
    entities: string[];
    keywords: string[];
    confidence: number;
    gisMetadata?: GISMetadata;
  };
  ipfsCid?: string;
  createdAt: number;
}

/**
 * GIS metadata for proximity clustering
 */
export interface GISMetadata {
  latitude: number;
  longitude: number;
  geocode?: string;
  altitude?: number;
}

export type BatchStatus = 
  | 'ACCUMULATING'
  | 'READY'
  | 'PINNING'
  | 'MINTING'
  | 'COMPLETED'
  | 'FAILED';

export type JobStatus = 
  | 'PENDING'
  | 'CLUSTERED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

/**
 * Staking record for priority processing
 */
export interface StakingRecord {
  userId: string;
  walletAddress: string;
  stakedAmount: bigint;
  batchId: string;
  stakingTxHash: string;
  createdAt: number;
  unstakedAt?: number;
}

/**
 * IPFS pinning service interface
 */
interface IPFSService {
  pin(data: object): Promise<string>;
  unpin(cid: string): Promise<void>;
  get(cid: string): Promise<object>;
}

/**
 * ERC1155 Batch Minting ABI
 */
const BATCH_MINT_ABI = [
  'function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) external',
  'function safeBatchTransferFrom(address from, address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) external',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
];

/**
 * GARD Staking ABI for priority batches
 */
const STAKING_ABI = [
  'function stake(uint256 amount, bytes32 batchId) external',
  'function unstake(bytes32 batchId) external returns (uint256)',
  'function getStakedAmount(bytes32 batchId) external view returns (uint256)',
  'event Staked(address indexed user, bytes32 indexed batchId, uint256 amount)',
  'event Unstaked(address indexed user, bytes32 indexed batchId, uint256 amount)',
];

/**
 * Batch Processing Service
 */
class BatchProcessingService {
  private supabase: SupabaseClient;
  private provider: ethers.BrowserProvider | null = null;
  private batchContract: ethers.Contract | null = null;
  private stakingContract: ethers.Contract | null = null;
  
  private pendingBatches: Map<string, BatchJob> = new Map();
  private clusterIndex: Map<string, string[]> = new Map(); // clusterId -> batchIds
  private batchTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Initialize blockchain connections
   */
  async initialize(
    batchContractAddress: string,
    stakingContractAddress: string
  ): Promise<boolean> {
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        this.provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await this.provider.getSigner();
        
        this.batchContract = new ethers.Contract(
          batchContractAddress,
          BATCH_MINT_ABI,
          signer
        );
        
        this.stakingContract = new ethers.Contract(
          stakingContractAddress,
          STAKING_ABI,
          signer
        );

        logger.info('Batch Processing Service initialized', {
          batchContract: batchContractAddress,
          stakingContract: stakingContractAddress,
        });
        
        return true;
      }
      
      logger.warn('No Web3 provider found');
      return false;
    } catch (error) {
      logger.error('Failed to initialize batch processing', { error });
      return false;
    }
  }

  /**
   * Generate cluster ID from job metadata dimensions
   */
  generateClusterId(
    dimensions: Partial<Record<ClusterDimension, string>>
  ): string {
    const sortedKeys = Object.keys(dimensions).sort() as ClusterDimension[];
    const values = sortedKeys.map(k => `${k}:${dimensions[k]}`).join('|');
    return ethers.keccak256(ethers.toUtf8Bytes(values)).slice(0, 18);
  }

  /**
   * Calculate GPS proximity between two points (Haversine formula)
   */
  private calculateDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  /**
   * Calculate semantic similarity between two jobs
   */
  private calculateSemanticSimilarity(
    job1: ProcessingJob,
    job2: ProcessingJob
  ): number {
    const entities1 = new Set(job1.metadata.entities);
    const entities2 = new Set(job2.metadata.entities);
    const keywords1 = new Set(job1.metadata.keywords);
    const keywords2 = new Set(job2.metadata.keywords);

    const entityIntersection = [...entities1].filter(e => entities2.has(e)).length;
    const entityUnion = new Set([...entities1, ...entities2]).size;
    const entitySimilarity = entityUnion > 0 ? entityIntersection / entityUnion : 0;

    const keywordIntersection = [...keywords1].filter(k => keywords2.has(k)).length;
    const keywordUnion = new Set([...keywords1, ...keywords2]).size;
    const keywordSimilarity = keywordUnion > 0 ? keywordIntersection / keywordUnion : 0;

    return (entitySimilarity * 0.6) + (keywordSimilarity * 0.4);
  }

  /**
   * Check if two jobs should be in the same cluster
   */
  private shouldClusterTogether(job1: ProcessingJob, job2: ProcessingJob): boolean {
    // Check semantic similarity
    const semanticSim = this.calculateSemanticSimilarity(job1, job2);
    if (semanticSim < BATCH_CONFIG.SEMANTIC_SIMILARITY_THRESHOLD) {
      return false;
    }

    // Check GPS proximity if both have GIS data
    if (job1.metadata.gisMetadata && job2.metadata.gisMetadata) {
      const distance = this.calculateDistance(
        job1.metadata.gisMetadata.latitude,
        job1.metadata.gisMetadata.longitude,
        job2.metadata.gisMetadata.latitude,
        job2.metadata.gisMetadata.longitude
      );
      if (distance > BATCH_CONFIG.GPS_PROXIMITY_METERS) {
        return false;
      }
    }

    return true;
  }

  /**
   * Add job to appropriate batch cluster
   */
  async addJobToBatch(
    job: ProcessingJob,
    dimensions: Partial<Record<ClusterDimension, string>>
  ): Promise<string> {
    const clusterId = this.generateClusterId(dimensions);
    
    // Find or create batch for this cluster
    let batch = this.findMatchingBatch(job, clusterId);
    
    if (!batch) {
      batch = this.createNewBatch(clusterId, dimensions);
    }

    // Add job to batch
    batch.jobs.push({
      ...job,
      status: 'CLUSTERED',
    });

    // Update batch status
    this.updateBatchStatus(batch);
    
    // Store in pending batches
    this.pendingBatches.set(batch.batchId, batch);
    
    // Update cluster index
    const clusterBatches = this.clusterIndex.get(clusterId) || [];
    if (!clusterBatches.includes(batch.batchId)) {
      clusterBatches.push(batch.batchId);
      this.clusterIndex.set(clusterId, clusterBatches);
    }

    // Persist to database
    await this.persistBatchState(batch);

    logger.info('Job added to batch', {
      jobId: job.jobId,
      batchId: batch.batchId,
      clusterId,
      batchSize: batch.jobs.length,
    });

    return batch.batchId;
  }

  /**
   * Find existing batch that matches the job
   */
  private findMatchingBatch(job: ProcessingJob, clusterId: string): BatchJob | null {
    const clusterBatches = this.clusterIndex.get(clusterId) || [];
    
    for (const batchId of clusterBatches) {
      const batch = this.pendingBatches.get(batchId);
      if (
        batch &&
        batch.status === 'ACCUMULATING' &&
        batch.jobs.length < BATCH_CONFIG.MAX_BATCH_SIZE
      ) {
        // Verify job can cluster with existing jobs
        const canCluster = batch.jobs.every(existingJob => 
          this.shouldClusterTogether(existingJob, job)
        );
        
        if (canCluster) {
          return batch;
        }
      }
    }
    
    return null;
  }

  /**
   * Create new batch for cluster
   */
  private createNewBatch(
    clusterId: string,
    dimensions: Partial<Record<ClusterDimension, string>>
  ): BatchJob {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const batch: BatchJob = {
      batchId,
      clusterId,
      clusterDimensions: dimensions,
      jobs: [],
      status: 'ACCUMULATING',
      priority: 0,
      stakedAmount: BigInt(0),
      createdAt: Date.now(),
    };

    // Set timeout for batch processing
    const timeout = setTimeout(
      () => this.processBatchOnTimeout(batchId),
      BATCH_CONFIG.BATCH_TIMEOUT_MS
    );
    this.batchTimeouts.set(batchId, timeout);

    return batch;
  }

  /**
   * Update batch status based on size
   */
  private updateBatchStatus(batch: BatchJob): void {
    if (batch.jobs.length >= BATCH_CONFIG.MIN_BATCH_SIZE) {
      if (batch.jobs.length >= BATCH_CONFIG.MAX_BATCH_SIZE) {
        batch.status = 'READY';
        // Clear timeout as batch is full
        const timeout = this.batchTimeouts.get(batch.batchId);
        if (timeout) {
          clearTimeout(timeout);
          this.batchTimeouts.delete(batch.batchId);
        }
      }
    }
  }

  /**
   * Process batch when timeout expires
   */
  private async processBatchOnTimeout(batchId: string): Promise<void> {
    const batch = this.pendingBatches.get(batchId);
    if (batch && batch.status === 'ACCUMULATING') {
      if (batch.jobs.length >= BATCH_CONFIG.MIN_BATCH_SIZE) {
        batch.status = 'READY';
        await this.processBatch(batchId);
      } else {
        // Merge with another batch or process individually
        await this.handleSmallBatch(batch);
      }
    }
    this.batchTimeouts.delete(batchId);
  }

  /**
   * Handle batches that didn't reach minimum size
   */
  private async handleSmallBatch(batch: BatchJob): Promise<void> {
    // Try to merge with another compatible batch
    const clusterBatches = this.clusterIndex.get(batch.clusterId) || [];
    
    for (const batchId of clusterBatches) {
      if (batchId === batch.batchId) continue;
      
      const otherBatch = this.pendingBatches.get(batchId);
      if (
        otherBatch &&
        otherBatch.status === 'ACCUMULATING' &&
        otherBatch.jobs.length + batch.jobs.length <= BATCH_CONFIG.MAX_BATCH_SIZE
      ) {
        // Merge batches
        otherBatch.jobs.push(...batch.jobs);
        this.pendingBatches.delete(batch.batchId);
        
        logger.info('Merged small batch', {
          fromBatch: batch.batchId,
          toBatch: batchId,
          newSize: otherBatch.jobs.length,
        });
        
        return;
      }
    }

    // Process individually if no merge possible
    batch.status = 'READY';
    await this.processBatch(batch.batchId);
  }

  /**
   * Stake GARD tokens to prioritize a batch
   */
  async stakeForPriority(
    batchId: string,
    amount: bigint,
    walletAddress: string
  ): Promise<StakingRecord | null> {
    const batch = this.pendingBatches.get(batchId);
    if (!batch || batch.status !== 'ACCUMULATING') {
      logger.warn('Cannot stake for non-accumulating batch', { batchId });
      return null;
    }

    if (!this.stakingContract) {
      logger.error('Staking contract not initialized');
      return null;
    }

    try {
      const tx = await this.stakingContract.stake(
        amount,
        ethers.encodeBytes32String(batchId)
      );
      const receipt = await tx.wait();

      batch.stakedAmount += amount;
      batch.priority = this.calculatePriority(batch);

      const stakingRecord: StakingRecord = {
        userId: '', // Would be fetched from auth
        walletAddress,
        stakedAmount: amount,
        batchId,
        stakingTxHash: receipt.hash,
        createdAt: Date.now(),
      };

      // Persist staking record
      await this.supabase.from('staking_records').insert({
        wallet_address: walletAddress,
        batch_id: batchId,
        staked_amount: amount.toString(),
        tx_hash: receipt.hash,
      });

      logger.info('Staked for batch priority', {
        batchId,
        amount: amount.toString(),
        newPriority: batch.priority,
      });

      return stakingRecord;
    } catch (error) {
      logger.error('Failed to stake for priority', { error, batchId });
      return null;
    }
  }

  /**
   * Calculate batch priority based on staked amount and age
   */
  private calculatePriority(batch: BatchJob): number {
    const ageMinutes = (Date.now() - batch.createdAt) / 60000;
    const stakedGARD = Number(batch.stakedAmount) / 1e18;
    
    // Priority formula: staked amount + age bonus
    return stakedGARD + (ageMinutes * 0.1);
  }

  /**
   * Process a ready batch - pin to IPFS and batch mint
   */
  async processBatch(batchId: string): Promise<boolean> {
    const batch = this.pendingBatches.get(batchId);
    if (!batch || batch.status !== 'READY') {
      logger.warn('Batch not ready for processing', { batchId });
      return false;
    }

    try {
      // Step 1: Pin batch data to IPFS
      batch.status = 'PINNING';
      await this.persistBatchState(batch);

      const ipfsCid = await this.pinBatchToIPFS(batch);
      batch.ipfsCid = ipfsCid;

      // Step 2: Batch mint NFTs
      batch.status = 'MINTING';
      await this.persistBatchState(batch);

      const mintResult = await this.executeBatchMint(batch);
      batch.mintTxHash = mintResult.txHash;
      batch.gasUsed = mintResult.gasUsed;
      batch.estimatedGasSavings = this.calculateGasSavings(batch);

      // Step 3: Update job statuses
      batch.jobs.forEach(job => {
        job.status = 'COMPLETED';
        job.ipfsCid = ipfsCid;
      });

      batch.status = 'COMPLETED';
      batch.processedAt = Date.now();
      
      await this.persistBatchState(batch);

      // Cleanup
      this.pendingBatches.delete(batchId);

      logger.info('Batch processed successfully', {
        batchId,
        jobCount: batch.jobs.length,
        ipfsCid,
        gasUsed: batch.gasUsed?.toString(),
        gasSavings: `${(batch.estimatedGasSavings! * 100).toFixed(1)}%`,
      });

      return true;
    } catch (error) {
      logger.error('Batch processing failed', { error, batchId });
      batch.status = 'FAILED';
      await this.persistBatchState(batch);
      return false;
    }
  }

  /**
   * Pin batch metadata to IPFS
   */
  private async pinBatchToIPFS(batch: BatchJob): Promise<string> {
    const batchMetadata = {
      batchId: batch.batchId,
      clusterId: batch.clusterId,
      dimensions: batch.clusterDimensions,
      jobCount: batch.jobs.length,
      createdAt: batch.createdAt,
      assets: batch.jobs.map(job => ({
        assetId: job.assetId,
        entities: job.metadata.entities,
        keywords: job.metadata.keywords,
        confidence: job.metadata.confidence,
        gis: job.metadata.gisMetadata,
      })),
    };

    // Use Pinata or IPFS HTTP API
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataContent: batchMetadata,
        pinataMetadata: {
          name: `batch_${batch.batchId}`,
        },
      }),
    });

    const result = await response.json();
    return result.IpfsHash;
  }

  /**
   * Execute batch mint transaction
   */
  private async executeBatchMint(batch: BatchJob): Promise<{
    txHash: string;
    gasUsed: bigint;
  }> {
    if (!this.batchContract || !this.provider) {
      throw new Error('Batch contract not initialized');
    }

    const signer = await this.provider.getSigner();
    const walletAddress = await signer.getAddress();

    // Prepare batch mint parameters
    const tokenIds = batch.jobs.map((_, index) => 
      BigInt(batch.createdAt + index)
    );
    const amounts = batch.jobs.map(() => 
      BigInt(GARD_CONFIG.SHARDS_PER_ASSET)
    );
    const data = ethers.toUtf8Bytes(batch.ipfsCid || '');

    // Execute multicall batch mint
    const tx = await this.batchContract.mintBatch(
      walletAddress,
      tokenIds,
      amounts,
      data
    );

    const receipt = await tx.wait();

    return {
      txHash: receipt.hash,
      gasUsed: receipt.gasUsed,
    };
  }

  /**
   * Calculate gas savings compared to individual mints
   */
  private calculateGasSavings(batch: BatchJob): number {
    const INDIVIDUAL_MINT_GAS = BigInt(150000); // Estimated gas per individual mint
    const expectedIndividualGas = INDIVIDUAL_MINT_GAS * BigInt(batch.jobs.length);
    const actualGas = batch.gasUsed || BigInt(0);
    
    if (expectedIndividualGas === BigInt(0)) return 0;
    
    const savings = Number(expectedIndividualGas - actualGas) / Number(expectedIndividualGas);
    return Math.max(0, savings);
  }

  /**
   * Persist batch state to database
   */
  private async persistBatchState(batch: BatchJob): Promise<void> {
    await this.supabase.from('batch_jobs').upsert({
      batch_id: batch.batchId,
      cluster_id: batch.clusterId,
      cluster_dimensions: batch.clusterDimensions,
      status: batch.status,
      priority: batch.priority,
      staked_amount: batch.stakedAmount.toString(),
      job_count: batch.jobs.length,
      ipfs_cid: batch.ipfsCid,
      mint_tx_hash: batch.mintTxHash,
      gas_used: batch.gasUsed?.toString(),
      gas_savings: batch.estimatedGasSavings,
      created_at: new Date(batch.createdAt).toISOString(),
      processed_at: batch.processedAt ? new Date(batch.processedAt).toISOString() : null,
    });
  }

  /**
   * Get all pending batches sorted by priority
   */
  getPendingBatches(): BatchJob[] {
    return Array.from(this.pendingBatches.values())
      .filter(b => b.status === 'ACCUMULATING' || b.status === 'READY')
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get batch statistics
   */
  async getBatchStats(): Promise<{
    totalBatches: number;
    pendingBatches: number;
    processedBatches: number;
    totalGasSaved: bigint;
    averageGasSavings: number;
  }> {
    const { data, error } = await this.supabase
      .from('batch_jobs')
      .select('status, gas_used, gas_savings');

    if (error || !data) {
      return {
        totalBatches: 0,
        pendingBatches: 0,
        processedBatches: 0,
        totalGasSaved: BigInt(0),
        averageGasSavings: 0,
      };
    }

    const completed = data.filter(b => b.status === 'COMPLETED');
    const totalGasSavings = completed.reduce((sum, b) => sum + (b.gas_savings || 0), 0);

    return {
      totalBatches: data.length,
      pendingBatches: data.filter(b => ['ACCUMULATING', 'READY'].includes(b.status)).length,
      processedBatches: completed.length,
      totalGasSaved: BigInt(0), // Would calculate from individual gas estimates
      averageGasSavings: completed.length > 0 ? totalGasSavings / completed.length : 0,
    };
  }
}

// Factory function
export const createBatchProcessingService = (supabase: SupabaseClient) => 
  new BatchProcessingService(supabase);

export default BatchProcessingService;
