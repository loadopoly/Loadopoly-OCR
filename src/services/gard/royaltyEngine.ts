/**
 * GARD Royalty Engine
 * 
 * Core calculation logic for the SocialReturnSystem (GARD) tokenomics.
 * Implements royalty recycling, DeFi loan potential, and distribution formulas.
 * 
 * Key Formulas:
 * - G_t = R_t + L_collateral,t + ROA_t (Total liquidity generation)
 * - Self-sustainability: G_t >= N_t
 */

import { 
  GARD_CONFIG, 
  RoyaltyDistribution, 
  RoyaltyTransaction, 
  GARDSystemStats,
  ShardHolding 
} from '../../types';

export class GARDRoyaltyEngine {
  private readonly config = GARD_CONFIG;

  /**
   * Calculate royalty amount for a transaction
   * @param salePrice The sale price of the transaction
   * @returns The royalty amount (10% of sale price)
   */
  calculateRoyalty(salePrice: number): number {
    return salePrice * this.config.ROYALTY_RATE;
  }

  /**
   * Calculate potential DeFi loan liquidity from royalties
   * Using 70% loan-to-value ratio
   * @param royaltyAmount The royalty amount to use as collateral
   * @returns Potential loan amount
   */
  calculateDeFiLoanPotential(royaltyAmount: number): number {
    return royaltyAmount * this.config.LTV_RATIO;
  }

  /**
   * Calculate total liquidity generation (G_t)
   * G_t = R_t + L_collateral,t + ROA_t
   * 
   * @param royalty The royalty amount (R_t)
   * @param assetYield Return on real-world assets (ROA_t), default 0
   * @returns Total liquidity generation
   */
  calculateTotalLiquidity(royalty: number, assetYield: number = 0): number {
    const collateralLoan = this.calculateDeFiLoanPotential(royalty);
    return royalty + collateralLoan + assetYield;
  }

  /**
   * Calculate the liquidity multiplier effect
   * With 10% royalty and 70% LTV, effective multiplier is 1.7x
   */
  getLiquidityMultiplier(): number {
    return 1 + this.config.LTV_RATIO;
  }

  /**
   * Distribute royalty according to GARD allocation
   * - 50% to Community Fund
   * - 30% to Shard Holders
   * - 20% to System Maintenance
   * 
   * @param royaltyAmount The total royalty to distribute
   * @returns Distribution breakdown
   */
  distributeRoyalty(royaltyAmount: number): RoyaltyDistribution {
    return {
      communityFund: royaltyAmount * this.config.COMMUNITY_ALLOCATION,
      shardHolderRewards: royaltyAmount * this.config.HOLDER_ALLOCATION,
      systemMaintenance: royaltyAmount * this.config.MAINTENANCE_ALLOCATION,
    };
  }

  /**
   * Check if the system has reached self-sustainability
   * Condition: G_t >= N_t
   * 
   * @param transactionVolume Total transaction volume in period
   * @param assetYield Return on real-world assets
   * @param liquidityNeeds Operational liquidity requirements
   * @returns Whether the system is self-sustaining
   */
  isSystemSelfSustaining(
    transactionVolume: number,
    assetYield: number,
    liquidityNeeds: number
  ): boolean {
    const royalties = this.calculateRoyalty(transactionVolume);
    const totalGeneration = this.calculateTotalLiquidity(royalties, assetYield);
    return totalGeneration >= liquidityNeeds;
  }

  /**
   * Calculate the self-sustainability ratio
   * @returns Ratio as percentage (100 = break-even, >100 = sustainable)
   */
  calculateSustainabilityRatio(
    transactionVolume: number,
    assetYield: number,
    liquidityNeeds: number
  ): number {
    if (liquidityNeeds === 0) return Infinity;
    
    const royalties = this.calculateRoyalty(transactionVolume);
    const totalGeneration = this.calculateTotalLiquidity(royalties, assetYield);
    return (totalGeneration / liquidityNeeds) * 100;
  }

  /**
   * Calculate holder reward for a specific shard position
   * @param totalRoyalties Total accumulated royalties for the token
   * @param holderShards Number of shards held by the user
   * @param totalShards Total shards for the asset (usually 1000)
   * @param alreadyClaimed Amount already claimed by this holder
   * @returns Claimable reward amount
   */
  calculateHolderReward(
    totalRoyalties: number,
    holderShards: number,
    totalShards: number = this.config.SHARDS_PER_ASSET,
    alreadyClaimed: number = 0
  ): number {
    const holderAllocation = totalRoyalties * this.config.HOLDER_ALLOCATION;
    const proRataShare = (holderAllocation * holderShards) / totalShards;
    return Math.max(0, proRataShare - alreadyClaimed);
  }

  /**
   * Calculate voting weight based on shard holdings
   * V_u = S_u / S_total
   * 
   * @param userHoldings Array of user's shard holdings
   * @param globalTotalShards Total shards in circulation
   * @returns Voting weight as decimal (0-1)
   */
  calculateVotingWeight(
    userHoldings: ShardHolding[],
    globalTotalShards: number
  ): number {
    if (globalTotalShards === 0) return 0;
    
    const userTotalShards = userHoldings.reduce(
      (sum, holding) => sum + holding.shardCount, 
      0
    );
    return userTotalShards / globalTotalShards;
  }

  /**
   * Derive shard price from market activity (NFTx6-10 pattern)
   * P_shard = (Average_shard_price_NFT6-10 × Total_shards) / 1000
   * 
   * @param recentTransactions Recent shard transactions
   * @returns Derived shard price
   */
  deriveShardPrice(recentTransactions: RoyaltyTransaction[]): number {
    if (recentTransactions.length === 0) return 0;
    
    const totalVolume = recentTransactions.reduce(
      (sum, tx) => sum + tx.salePrice, 
      0
    );
    const avgPrice = totalVolume / recentTransactions.length;
    return avgPrice / this.config.SHARDS_PER_ASSET;
  }

  /**
   * Calculate genesis asset premium price
   * @param basePrice The standard shard price
   * @param isGenesis Whether the asset is a genesis asset
   * @returns Adjusted price with premium if applicable
   */
  calculateGenesisPrice(basePrice: number, isGenesis: boolean): number {
    if (isGenesis) {
      return basePrice * this.config.GENESIS_MULTIPLIER;
    }
    return basePrice;
  }

  /**
   * Generate system statistics from transaction history
   */
  generateSystemStats(
    transactions: RoyaltyTransaction[],
    holdings: ShardHolding[],
    communityFundBalance: number,
    pendingUserRewards: number
  ): GARDSystemStats {
    const totalRoyalties = transactions.reduce(
      (sum, tx) => sum + tx.royaltyAmount, 
      0
    );
    
    const holderRewardsPool = transactions.reduce(
      (sum, tx) => sum + tx.holderShare, 
      0
    );
    
    const uniqueHolders = new Set(holdings.map(h => h.userId)).size;
    
    // Estimate sustainability (simplified)
    const monthlyAvg = totalRoyalties / Math.max(1, transactions.length) * 30;
    const estimatedNeeds = 1000; // Placeholder for operational costs
    const sustainabilityRatio = this.calculateSustainabilityRatio(
      monthlyAvg / this.config.ROYALTY_RATE,
      0,
      estimatedNeeds
    );

    return {
      totalRoyaltiesGenerated: totalRoyalties,
      communityFundBalance,
      holderRewardsPool,
      pendingUserRewards,
      transactionCount: transactions.length,
      activeShardHolders: uniqueHolders,
      selfSustainabilityRatio: sustainabilityRatio,
      totalAssetsTokenized: new Set(transactions.map(t => t.assetId)).size,
    };
  }

  /**
   * Validate a royalty transaction before processing
   */
  validateTransaction(transaction: Partial<RoyaltyTransaction>): string[] {
    const errors: string[] = [];
    
    if (!transaction.assetId) errors.push('Asset ID is required');
    if (!transaction.tokenId) errors.push('Token ID is required');
    if (!transaction.salePrice || transaction.salePrice <= 0) {
      errors.push('Sale price must be positive');
    }
    if (!transaction.sellerWallet) errors.push('Seller wallet is required');
    if (!transaction.buyerWallet) errors.push('Buyer wallet is required');
    if (transaction.sellerWallet === transaction.buyerWallet) {
      errors.push('Seller and buyer cannot be the same');
    }
    
    return errors;
  }

  /**
   * Create a complete royalty transaction record
   */
  createTransaction(
    assetId: string,
    tokenId: string,
    transactionType: 'SALE' | 'LICENSE' | 'GIFT',
    salePrice: number,
    sellerWallet: string,
    buyerWallet: string,
    txHash?: string,
    blockNumber?: number
  ): Omit<RoyaltyTransaction, 'id'> {
    const royaltyAmount = this.calculateRoyalty(salePrice);
    const distribution = this.distributeRoyalty(royaltyAmount);
    
    return {
      assetId,
      tokenId,
      transactionType,
      salePrice,
      royaltyAmount,
      communityShare: distribution.communityFund,
      holderShare: distribution.shardHolderRewards,
      maintenanceShare: distribution.systemMaintenance,
      sellerWallet,
      buyerWallet,
      txHash,
      blockNumber,
      chainId: this.config.POLYGON_CHAIN_ID,
      timestamp: new Date().toISOString(),
    };
  }
}

// Singleton instance
export const gardRoyaltyEngine = new GARDRoyaltyEngine();

// Export individual functions for convenience
export const calculateRoyalty = (price: number) => 
  gardRoyaltyEngine.calculateRoyalty(price);

export const distributeRoyalty = (amount: number) => 
  gardRoyaltyEngine.distributeRoyalty(amount);

export const isSystemSelfSustaining = (
  volume: number, 
  yield_: number, 
  needs: number
) => gardRoyaltyEngine.isSystemSelfSustaining(volume, yield_, needs);
