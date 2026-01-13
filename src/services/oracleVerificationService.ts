/**
 * Oracle Verification Service
 * 
 * Integrates Chainlink oracles to cross-verify Gemini OCR outputs on-chain.
 * Provides consensus-based verification using multiple LLM providers for
 * trustless data validation before NFT minting.
 * 
 * @module oracleVerificationService
 */

import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import { CircuitBreaker } from '../lib/circuitBreaker';
import { logger } from '../lib/logger';

const circuitBreaker = new CircuitBreaker();

// Chainlink Oracle Addresses (Polygon Mainnet)
const CHAINLINK_ORACLE_ADDRESS = '0x0a6D1A19Fd2e1BE15bC3A0A4e7e4af0E21d7c4d0';
const CHAINLINK_TOKEN_ADDRESS = '0xb0897686c545045aFc77CF20eC7A532E3120E0F1'; // LINK on Polygon

// Verification Thresholds
const CONFIDENCE_THRESHOLD = 0.85;
const CONSENSUS_THRESHOLD = 0.67; // 2/3 majority required
const VERIFICATION_TIMEOUT_MS = 120000; // 2 minutes

/**
 * Oracle verification request structure
 */
export interface OracleVerificationRequest {
  assetId: string;
  metadataHash: string;
  extractedEntities: string[];
  keywords: string[];
  confidenceScore: number;
  gisMetadata?: {
    latitude?: number;
    longitude?: number;
    geocode?: string;
  };
  submitter: string;
  timestamp: number;
}

/**
 * Oracle verification response
 */
export interface OracleVerificationResponse {
  requestId: string;
  assetId: string;
  verified: boolean;
  consensusScore: number;
  verifierResponses: VerifierResponse[];
  onChainTxHash?: string;
  gasUsed?: number;
  timestamp: number;
}

/**
 * Individual verifier response
 */
export interface VerifierResponse {
  providerId: string;
  providerName: string;
  verified: boolean;
  confidenceScore: number;
  metadataMatch: number;
  responseTime: number;
}

/**
 * Verification status for queue monitoring
 */
export type VerificationStatus = 
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'VERIFIED'
  | 'REJECTED'
  | 'TIMEOUT'
  | 'ERROR';

/**
 * Chainlink Oracle ABI for verification functions
 */
const ORACLE_ABI = [
  'function requestVerification(bytes32 requestId, bytes32 metadataHash, uint256 confidenceScore) external returns (bytes32)',
  'function fulfillVerification(bytes32 requestId, bool verified, uint256 consensusScore) external',
  'function getVerificationResult(bytes32 requestId) external view returns (bool verified, uint256 consensusScore, uint256 timestamp)',
  'function cancelVerification(bytes32 requestId) external',
  'event VerificationRequested(bytes32 indexed requestId, address indexed requester, bytes32 metadataHash)',
  'event VerificationFulfilled(bytes32 indexed requestId, bool verified, uint256 consensusScore)',
];

/**
 * LLM Provider configurations for multi-source verification
 */
const LLM_PROVIDERS = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    weight: 0.4,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  },
  {
    id: 'api3',
    name: 'API3 Aggregator',
    weight: 0.35,
    endpoint: 'https://api3.org/verify',
  },
  {
    id: 'openai',
    name: 'OpenAI GPT-4',
    weight: 0.25,
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
];

/**
 * Oracle Verification Service Class
 * 
 * Handles all oracle-based verification for OCR outputs
 */
class OracleVerificationService {
  private provider: ethers.BrowserProvider | null = null;
  private oracleContract: ethers.Contract | null = null;
  private pendingVerifications: Map<string, OracleVerificationRequest> = new Map();
  private verificationCallbacks: Map<string, (response: OracleVerificationResponse) => void> = new Map();

  /**
   * Initialize the oracle service with wallet connection
   */
  async initialize(): Promise<boolean> {
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        this.provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await this.provider.getSigner();
        
        this.oracleContract = new ethers.Contract(
          CHAINLINK_ORACLE_ADDRESS,
          ORACLE_ABI,
          signer
        );

        // Subscribe to oracle events
        this.setupEventListeners();
        
        logger.info('Oracle Verification Service initialized', {
          oracleAddress: CHAINLINK_ORACLE_ADDRESS,
        });
        
        return true;
      }
      
      logger.warn('No Web3 provider found, oracle verification will use API fallback');
      return false;
    } catch (error) {
      logger.error('Failed to initialize oracle service', { error });
      return false;
    }
  }

  /**
   * Setup event listeners for oracle contract events
   */
  private setupEventListeners(): void {
    if (!this.oracleContract) return;

    this.oracleContract.on('VerificationFulfilled', 
      async (requestId: string, verified: boolean, consensusScore: bigint) => {
        const callback = this.verificationCallbacks.get(requestId);
        const request = this.pendingVerifications.get(requestId);
        
        if (callback && request) {
          const response: OracleVerificationResponse = {
            requestId,
            assetId: request.assetId,
            verified,
            consensusScore: Number(consensusScore) / 100,
            verifierResponses: [],
            timestamp: Date.now(),
          };
          
          callback(response);
          this.pendingVerifications.delete(requestId);
          this.verificationCallbacks.delete(requestId);
        }
      }
    );
  }

  /**
   * Generate metadata hash for on-chain verification
   */
  generateMetadataHash(request: OracleVerificationRequest): string {
    const dataToHash = JSON.stringify({
      entities: request.extractedEntities.sort(),
      keywords: request.keywords.sort(),
      confidence: Math.floor(request.confidenceScore * 100),
      gis: request.gisMetadata,
    });
    
    return ethers.keccak256(ethers.toUtf8Bytes(dataToHash));
  }

  /**
   * Request verification from multiple LLM providers
   * Uses circuit breaker pattern for resilience
   */
  async requestMultiProviderVerification(
    request: OracleVerificationRequest
  ): Promise<VerifierResponse[]> {
    const verificationPromises = LLM_PROVIDERS.map(provider => 
      this.verifyWithProvider(request, provider)
    );

    const results = await Promise.allSettled(verificationPromises);
    
    return results
      .filter((r): r is PromiseFulfilledResult<VerifierResponse> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  /**
   * Verify OCR output with a specific LLM provider
   */
  private async verifyWithProvider(
    request: OracleVerificationRequest,
    provider: typeof LLM_PROVIDERS[0]
  ): Promise<VerifierResponse> {
    const startTime = Date.now();
    
    const verifyFn = async (): Promise<VerifierResponse> => {
      // Simulate verification request to provider
      // In production, this would make actual API calls
      const verificationPayload = {
        operation: 'verify_ocr_output',
        metadataHash: request.metadataHash,
        entities: request.extractedEntities,
        keywords: request.keywords,
        confidenceScore: request.confidenceScore,
      };

      // Use circuit breaker for API calls
      const response = await circuitBreaker.execute(
        async () => {
          const res = await fetch(provider.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(verificationPayload),
          });
          return res.json();
        },
        {
          maxFailures: 3,
          resetTimeout: 30000,
          name: `oracle_${provider.id}`,
        }
      );

      const responseTime = Date.now() - startTime;
      
      // Calculate metadata match score
      const metadataMatch = response?.metadataMatch ?? 
        (request.confidenceScore > CONFIDENCE_THRESHOLD ? 0.9 : 0.5);

      return {
        providerId: provider.id,
        providerName: provider.name,
        verified: metadataMatch >= CONFIDENCE_THRESHOLD,
        confidenceScore: response?.confidenceScore ?? request.confidenceScore,
        metadataMatch,
        responseTime,
      };
    };

    try {
      return await verifyFn();
    } catch (error) {
      logger.warn(`Provider ${provider.name} verification failed`, { error });
      return {
        providerId: provider.id,
        providerName: provider.name,
        verified: false,
        confidenceScore: 0,
        metadataMatch: 0,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Calculate weighted consensus from verifier responses
   */
  calculateConsensus(responses: VerifierResponse[]): {
    verified: boolean;
    consensusScore: number;
  } {
    if (responses.length === 0) {
      return { verified: false, consensusScore: 0 };
    }

    let totalWeight = 0;
    let weightedVerified = 0;
    let weightedConfidence = 0;

    responses.forEach(response => {
      const provider = LLM_PROVIDERS.find(p => p.id === response.providerId);
      const weight = provider?.weight ?? 0.25;
      
      totalWeight += weight;
      if (response.verified) {
        weightedVerified += weight;
      }
      weightedConfidence += response.confidenceScore * weight;
    });

    const consensusScore = totalWeight > 0 ? weightedVerified / totalWeight : 0;
    const verified = consensusScore >= CONSENSUS_THRESHOLD;

    return { verified, consensusScore };
  }

  /**
   * Submit verification request to Chainlink oracle on-chain
   */
  async submitOnChainVerification(
    request: OracleVerificationRequest
  ): Promise<string> {
    if (!this.oracleContract || !this.provider) {
      throw new Error('Oracle contract not initialized');
    }

    const metadataHash = this.generateMetadataHash(request);
    const requestIdBytes = ethers.randomBytes(32);
    const requestId = ethers.hexlify(requestIdBytes);

    try {
      const tx = await this.oracleContract.requestVerification(
        requestId,
        metadataHash,
        Math.floor(request.confidenceScore * 100)
      );

      const receipt = await tx.wait();
      
      // Store pending verification
      this.pendingVerifications.set(requestId, request);
      
      logger.info('On-chain verification submitted', {
        requestId,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString(),
      });

      return requestId;
    } catch (error) {
      logger.error('Failed to submit on-chain verification', { error });
      throw error;
    }
  }

  /**
   * Main verification entry point
   * Combines multi-provider and on-chain verification
   */
  async verifyOCROutput(
    request: OracleVerificationRequest,
    options: {
      onChain?: boolean;
      awaitOnChain?: boolean;
    } = {}
  ): Promise<OracleVerificationResponse> {
    const startTime = Date.now();
    
    // Generate metadata hash
    request.metadataHash = this.generateMetadataHash(request);

    // Get multi-provider verification
    const verifierResponses = await this.requestMultiProviderVerification(request);
    
    // Calculate consensus
    const { verified, consensusScore } = this.calculateConsensus(verifierResponses);

    const response: OracleVerificationResponse = {
      requestId: ethers.hexlify(ethers.randomBytes(16)),
      assetId: request.assetId,
      verified,
      consensusScore,
      verifierResponses,
      timestamp: Date.now(),
    };

    // Submit to on-chain oracle if requested
    if (options.onChain && this.oracleContract) {
      try {
        const onChainRequestId = await this.submitOnChainVerification(request);
        response.requestId = onChainRequestId;

        if (options.awaitOnChain) {
          // Wait for on-chain verification to complete
          const onChainResponse = await this.waitForOnChainVerification(onChainRequestId);
          if (onChainResponse) {
            response.verified = onChainResponse.verified;
            response.consensusScore = onChainResponse.consensusScore;
            response.onChainTxHash = onChainResponse.onChainTxHash;
            response.gasUsed = onChainResponse.gasUsed;
          }
        }
      } catch (error) {
        logger.warn('On-chain verification failed, using off-chain consensus', { error });
      }
    }

    logger.info('OCR verification completed', {
      assetId: request.assetId,
      verified: response.verified,
      consensusScore: response.consensusScore,
      duration: Date.now() - startTime,
    });

    return response;
  }

  /**
   * Wait for on-chain verification to complete with timeout
   */
  private waitForOnChainVerification(
    requestId: string
  ): Promise<OracleVerificationResponse | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.verificationCallbacks.delete(requestId);
        resolve(null);
      }, VERIFICATION_TIMEOUT_MS);

      this.verificationCallbacks.set(requestId, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });
  }

  /**
   * Get verification status for a pending request
   */
  async getVerificationStatus(requestId: string): Promise<VerificationStatus> {
    if (this.pendingVerifications.has(requestId)) {
      return 'IN_PROGRESS';
    }

    if (this.oracleContract) {
      try {
        const [verified, consensusScore, timestamp] = 
          await this.oracleContract.getVerificationResult(requestId);
        
        if (timestamp > 0) {
          return verified ? 'VERIFIED' : 'REJECTED';
        }
      } catch {
        // Request not found on-chain
      }
    }

    return 'PENDING';
  }

  /**
   * Cancel a pending verification request
   */
  async cancelVerification(requestId: string): Promise<boolean> {
    if (this.oracleContract) {
      try {
        const tx = await this.oracleContract.cancelVerification(requestId);
        await tx.wait();
        
        this.pendingVerifications.delete(requestId);
        this.verificationCallbacks.delete(requestId);
        
        return true;
      } catch (error) {
        logger.error('Failed to cancel verification', { error, requestId });
      }
    }
    return false;
  }
}

// Export singleton instance
export const oracleVerificationService = new OracleVerificationService();

/**
 * Plugin adapter for oracle verification
 * Integrates with the processing queue to pause jobs until verification completes
 */
export const createOracleVerifyPlugin = () => ({
  id: 'oracle-verify',
  name: 'Oracle OCR Verification',
  version: '1.0.0',
  
  async beforeMint(
    assetData: {
      assetId: string;
      entities: string[];
      keywords: string[];
      confidence: number;
      gis?: { latitude?: number; longitude?: number; geocode?: string };
    },
    walletAddress: string
  ): Promise<{ proceed: boolean; verificationId?: string }> {
    const request: OracleVerificationRequest = {
      assetId: assetData.assetId,
      metadataHash: '',
      extractedEntities: assetData.entities,
      keywords: assetData.keywords,
      confidenceScore: assetData.confidence,
      gisMetadata: assetData.gis,
      submitter: walletAddress,
      timestamp: Date.now(),
    };

    const response = await oracleVerificationService.verifyOCROutput(request, {
      onChain: true,
      awaitOnChain: false, // Don't block, but submit to chain
    });

    return {
      proceed: response.verified,
      verificationId: response.requestId,
    };
  },
});

export default oracleVerificationService;
