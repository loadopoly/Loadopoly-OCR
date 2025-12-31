/**
 * useGARDRoyalties Hook
 * 
 * React hook for accessing GARD royalty data and statistics.
 */

import { useState, useEffect, useCallback } from 'react';
import { shardMarketService, communityFundService, gardRoyaltyEngine } from '../services/gard';
import { 
  GARDSystemStats, 
  RoyaltyTransaction, 
  CommunityFund,
  GARD_CONFIG 
} from '../types';

interface UseGARDRoyaltiesReturn {
  stats: GARDSystemStats;
  recentTransactions: RoyaltyTransaction[];
  communityFund: CommunityFund | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const DEFAULT_STATS: GARDSystemStats = {
  totalRoyaltiesGenerated: 0,
  communityFundBalance: 0,
  holderRewardsPool: 0,
  pendingUserRewards: 0,
  transactionCount: 0,
  activeShardHolders: 0,
  selfSustainabilityRatio: 0,
  totalAssetsTokenized: 0,
};

export function useGARDRoyalties(userId?: string): UseGARDRoyaltiesReturn {
  const [stats, setStats] = useState<GARDSystemStats>(DEFAULT_STATS);
  const [recentTransactions, setRecentTransactions] = useState<RoyaltyTransaction[]>([]);
  const [communityFund, setCommunityFund] = useState<CommunityFund | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch all data in parallel
      const [transactions, fund, holdings, pendingRewards] = await Promise.all([
        shardMarketService.getRecentTransactions(100),
        communityFundService.getFundBalance(),
        userId ? shardMarketService.getUserPortfolio(userId) : Promise.resolve([]),
        userId ? shardMarketService.getUserPendingRewards(userId) : Promise.resolve(0),
      ]);
      
      setRecentTransactions(transactions);
      setCommunityFund(fund);
      
      // Generate stats
      const generatedStats = gardRoyaltyEngine.generateSystemStats(
        transactions,
        holdings,
        fund?.balance || 0,
        pendingRewards
      );
      
      setStats(generatedStats);
    } catch (err) {
      console.error('Error fetching GARD data:', err);
      setError('Failed to load royalty data');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    stats,
    recentTransactions,
    communityFund,
    isLoading,
    error,
    refresh: fetchData,
  };
}

export default useGARDRoyalties;
