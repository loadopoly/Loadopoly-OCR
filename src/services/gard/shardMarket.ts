/**
 * GARD Shard Market Service
 * 
 * Handles shard trading, portfolio management, and holder rewards.
 */

import { supabase } from '../../lib/supabaseClient';
import { 
  ShardHolding, 
  RoyaltyTransaction, 
  GARDDataAsset,
  GARD_CONFIG 
} from '../../types';
import { gardRoyaltyEngine } from './royaltyEngine';

export class ShardMarketService {

  /**
   * Fetch user's shard portfolio
   */
  async getUserPortfolio(userId: string): Promise<ShardHolding[]> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('shard_holdings')
      .select('*')
      .eq('USER_ID', userId) as { data: any[] | null; error: any };
    
    if (error || !data) {
      console.error('Error fetching portfolio:', error);
      return [];
    }
    
    return data.map((h: any) => ({
      id: h.ID,
      userId: h.USER_ID,
      assetId: h.ASSET_ID,
      tokenId: h.TOKEN_ID,
      shardCount: h.SHARD_COUNT,
      acquisitionPrice: parseFloat(h.ACQUISITION_PRICE || '0'),
      acquisitionDate: h.ACQUISITION_DATE,
      currentValue: parseFloat(h.CURRENT_VALUE || '0'),
      unrealizedGain: parseFloat(h.UNREALIZED_GAIN || '0'),
    }));
  }

  /**
   * Get total shard count across all users
   */
  async getGlobalShardCount(): Promise<number> {
    if (!supabase) return 0;
    
    const { data, error } = await supabase
      .from('shard_holdings')
      .select('SHARD_COUNT') as { data: any[] | null; error: any };
    
    if (error || !data) {
      console.error('Error fetching global shards:', error);
      return 0;
    }
    
    return data.reduce((sum: number, h: any) => sum + h.SHARD_COUNT, 0);
  }

  /**
   * Calculate user's voting weight
   */
  async getUserVotingWeight(userId: string): Promise<number> {
    const portfolio = await this.getUserPortfolio(userId);
    const globalShards = await this.getGlobalShardCount();
    
    return gardRoyaltyEngine.calculateVotingWeight(portfolio, globalShards);
  }

  /**
   * Record a shard purchase
   */
  async recordShardAcquisition(
    userId: string,
    assetId: string,
    tokenId: string,
    shardCount: number,
    price: number
  ): Promise<boolean> {
    if (!supabase) return false;
    
    // Check if user already has holdings for this token
    const { data: existing } = await supabase
      .from('shard_holdings')
      .select('*')
      .eq('USER_ID', userId)
      .eq('TOKEN_ID', tokenId)
      .single() as { data: any | null; error: any };
    
    if (existing) {
      // Update existing holding
      const newCount = existing.SHARD_COUNT + shardCount;
      const avgPrice = (
        (existing.SHARD_COUNT * parseFloat(existing.ACQUISITION_PRICE || '0')) +
        (shardCount * price)
      ) / newCount;
      
      const { error } = await (supabase
        .from('shard_holdings') as any)
        .update({
          SHARD_COUNT: newCount,
          ACQUISITION_PRICE: avgPrice,
        })
        .eq('ID', existing.ID);
      
      return !error;
    } else {
      // Create new holding
      const { error } = await (supabase
        .from('shard_holdings') as any)
        .insert({
          USER_ID: userId,
          ASSET_ID: assetId,
          TOKEN_ID: tokenId,
          SHARD_COUNT: shardCount,
          ACQUISITION_PRICE: price,
        });
      
      return !error;
    }
  }

  /**
   * Record a shard sale and trigger royalty
   */
  async recordShardSale(
    sellerId: string,
    buyerId: string,
    assetId: string,
    tokenId: string,
    shardCount: number,
    salePrice: number,
    txHash?: string,
    blockNumber?: number
  ): Promise<RoyaltyTransaction | null> {
    if (!supabase) return null;
    
    // Reduce seller's holdings
    const { data: sellerHolding } = await supabase
      .from('shard_holdings')
      .select('*')
      .eq('USER_ID', sellerId)
      .eq('TOKEN_ID', tokenId)
      .single() as { data: any | null; error: any };
    
    if (!sellerHolding || sellerHolding.SHARD_COUNT < shardCount) {
      console.error('Insufficient shards to sell');
      return null;
    }
    
    const newSellerCount = sellerHolding.SHARD_COUNT - shardCount;
    
    if (newSellerCount === 0) {
      await supabase
        .from('shard_holdings')
        .delete()
        .eq('ID', sellerHolding.ID);
    } else {
      await (supabase
        .from('shard_holdings') as any)
        .update({ SHARD_COUNT: newSellerCount })
        .eq('ID', sellerHolding.ID);
    }
    
    // Record buyer acquisition
    await this.recordShardAcquisition(
      buyerId,
      assetId,
      tokenId,
      shardCount,
      salePrice / shardCount
    );
    
    // Record royalty transaction
    const transaction = await this.recordRoyaltyTransaction(
      assetId,
      tokenId,
      'SALE',
      salePrice,
      sellerId,
      buyerId,
      txHash,
      blockNumber
    );
    
    return transaction;
  }

  /**
   * Record a royalty transaction
   */
  async recordRoyaltyTransaction(
    assetId: string,
    tokenId: string,
    transactionType: 'SALE' | 'LICENSE' | 'GIFT',
    salePrice: number,
    sellerWallet: string,
    buyerWallet: string,
    txHash?: string,
    blockNumber?: number
  ): Promise<RoyaltyTransaction | null> {
    if (!supabase) return null;
    
    const txData = gardRoyaltyEngine.createTransaction(
      assetId,
      tokenId,
      transactionType,
      salePrice,
      sellerWallet,
      buyerWallet,
      txHash,
      blockNumber
    );
    
    const { data, error } = await supabase
      .from('royalty_transactions')
      .insert({
        ASSET_ID: txData.assetId,
        TOKEN_ID: txData.tokenId,
        TRANSACTION_TYPE: txData.transactionType,
        SALE_PRICE: txData.salePrice,
        ROYALTY_AMOUNT: txData.royaltyAmount,
        COMMUNITY_SHARE: txData.communityShare,
        HOLDER_SHARE: txData.holderShare,
        MAINTENANCE_SHARE: txData.maintenanceShare,
        SELLER_WALLET: txData.sellerWallet,
        BUYER_WALLET: txData.buyerWallet,
        TX_HASH: txData.txHash,
        BLOCK_NUMBER: txData.blockNumber,
        CHAIN_ID: txData.chainId,
      } as any)
      .select()
      .single() as { data: any | null; error: any };
    
    if (error || !data) {
      console.error('Error recording transaction:', error);
      return null;
    }
    
    // Trigger royalty distribution via RPC
    await (supabase as any).rpc('record_royalty_transaction', {
      p_asset_id: assetId,
      p_token_id: tokenId,
      p_transaction_type: transactionType,
      p_sale_price: salePrice,
      p_seller_wallet: sellerWallet,
      p_buyer_wallet: buyerWallet,
      p_tx_hash: txHash || null,
      p_block_number: blockNumber || null,
    });
    
    return {
      id: data.ID,
      ...txData,
    };
  }

  /**
   * Get recent royalty transactions
   */
  async getRecentTransactions(limit: number = 50): Promise<RoyaltyTransaction[]> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('royalty_transactions')
      .select('*')
      .order('CREATED_AT', { ascending: false })
      .limit(limit) as { data: any[] | null; error: any };
    
    if (error || !data) {
      console.error('Error fetching transactions:', error);
      return [];
    }
    
    return data.map((t: any) => ({
      id: t.ID,
      assetId: t.ASSET_ID,
      tokenId: t.TOKEN_ID,
      transactionType: t.TRANSACTION_TYPE,
      salePrice: parseFloat(t.SALE_PRICE),
      royaltyAmount: parseFloat(t.ROYALTY_AMOUNT),
      communityShare: parseFloat(t.COMMUNITY_SHARE),
      holderShare: parseFloat(t.HOLDER_SHARE),
      maintenanceShare: parseFloat(t.MAINTENANCE_SHARE),
      sellerWallet: t.SELLER_WALLET,
      buyerWallet: t.BUYER_WALLET,
      txHash: t.TX_HASH,
      blockNumber: t.BLOCK_NUMBER,
      chainId: t.CHAIN_ID,
      timestamp: t.CREATED_AT,
    }));
  }

  /**
   * Get pending rewards for a user
   */
  async getUserPendingRewards(userId: string): Promise<number> {
    if (!supabase) return 0;
    
    const { data, error } = await supabase
      .from('pending_rewards')
      .select('PENDING_AMOUNT')
      .eq('USER_ID', userId)
      .single() as { data: any | null; error: any };
    
    if (error || !data) {
      return 0;
    }
    
    return parseFloat(data.PENDING_AMOUNT);
  }

  /**
   * Claim pending rewards
   */
  async claimRewards(userId: string): Promise<number> {
    if (!supabase) return 0;
    
    const { data, error } = await (supabase as any).rpc('claim_rewards', {
      p_user_id: userId,
    }) as { data: any; error: any };
    
    if (error) {
      console.error('Error claiming rewards:', error);
      return 0;
    }
    
    return parseFloat(data || '0');
  }

  /**
   * Tokenize a data asset
   */
  async tokenizeAsset(
    assetId: string,
    tokenId: string,
    basePrice: number,
    contributorWallet: string,
    isGenesis: boolean = false,
    qualityScore?: number,
    gisScore?: number,
    historicalScore?: number
  ): Promise<GARDDataAsset | null> {
    if (!supabase) return null;
    
    const { data, error } = await supabase
      .from('gard_tokenized_assets')
      .insert({
        ASSET_ID: assetId,
        NFT_TOKEN_ID: tokenId,
        SHARD_PRICE_BASE: basePrice,
        CONTRIBUTOR_WALLET: contributorWallet,
        IS_GENESIS_ASSET: isGenesis,
        AI_QUALITY_SCORE: qualityScore,
        GIS_PRECISION_SCORE: gisScore,
        HISTORICAL_SIGNIFICANCE: historicalScore,
      } as any)
      .select()
      .single() as { data: any | null; error: any };
    
    if (error || !data) {
      console.error('Error tokenizing asset:', error);
      return null;
    }
    
    return {
      ASSET_ID: data.ASSET_ID,
      NFT_TOKEN_ID: data.NFT_TOKEN_ID,
      SHARD_COUNT: data.SHARD_COUNT,
      SHARD_PRICE_BASE: parseFloat(data.SHARD_PRICE_BASE),
      ROYALTY_RATE: parseFloat(data.ROYALTY_RATE),
      CONTRIBUTOR_WALLET: data.CONTRIBUTOR_WALLET,
      AI_QUALITY_SCORE: parseFloat(data.AI_QUALITY_SCORE || '0'),
      GIS_PRECISION_SCORE: parseFloat(data.GIS_PRECISION_SCORE || '0'),
      HISTORICAL_SIGNIFICANCE: parseFloat(data.HISTORICAL_SIGNIFICANCE || '0'),
      IS_GENESIS_ASSET: data.IS_GENESIS_ASSET,
      RETAIL_DEMAND_DRIVEN: data.RETAIL_DEMAND_DRIVEN,
      TOKENIZED_AT: data.TOKENIZED_AT,
      LAST_TRADED_AT: data.LAST_TRADED_AT,
    };
  }

  /**
   * Get all tokenized assets
   */
  async getTokenizedAssets(): Promise<GARDDataAsset[]> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('gard_tokenized_assets')
      .select('*')
      .order('TOKENIZED_AT', { ascending: false }) as { data: any[] | null; error: any };
    
    if (error || !data) {
      console.error('Error fetching tokenized assets:', error);
      return [];
    }
    
    return data.map((a: any) => ({
      ASSET_ID: a.ASSET_ID,
      NFT_TOKEN_ID: a.NFT_TOKEN_ID,
      SHARD_COUNT: a.SHARD_COUNT,
      SHARD_PRICE_BASE: parseFloat(a.SHARD_PRICE_BASE),
      ROYALTY_RATE: parseFloat(a.ROYALTY_RATE),
      CONTRIBUTOR_WALLET: a.CONTRIBUTOR_WALLET,
      AI_QUALITY_SCORE: parseFloat(a.AI_QUALITY_SCORE || '0'),
      GIS_PRECISION_SCORE: parseFloat(a.GIS_PRECISION_SCORE || '0'),
      HISTORICAL_SIGNIFICANCE: parseFloat(a.HISTORICAL_SIGNIFICANCE || '0'),
      IS_GENESIS_ASSET: a.IS_GENESIS_ASSET,
      RETAIL_DEMAND_DRIVEN: a.RETAIL_DEMAND_DRIVEN,
      TOKENIZED_AT: a.TOKENIZED_AT,
      LAST_TRADED_AT: a.LAST_TRADED_AT,
    }));
  }
}

export const shardMarketService = new ShardMarketService();
