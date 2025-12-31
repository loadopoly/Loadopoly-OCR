/**
 * useShardPortfolio Hook
 * 
 * React hook for managing user's shard portfolio.
 */

import { useState, useEffect, useCallback } from 'react';
import { shardMarketService } from '../services/gard';
import { ShardHolding, GARDDataAsset, GARD_CONFIG } from '../types';

interface PortfolioSummary {
  totalShards: number;
  totalValue: number;
  unrealizedGain: number;
  assetCount: number;
  votingWeight: number;
}

interface UseShardPortfolioReturn {
  holdings: ShardHolding[];
  summary: PortfolioSummary;
  pendingRewards: number;
  isLoading: boolean;
  error: string | null;
  claimRewards: () => Promise<number>;
  refresh: () => Promise<void>;
}

const DEFAULT_SUMMARY: PortfolioSummary = {
  totalShards: 0,
  totalValue: 0,
  unrealizedGain: 0,
  assetCount: 0,
  votingWeight: 0,
};

export function useShardPortfolio(userId: string | null): UseShardPortfolioReturn {
  const [holdings, setHoldings] = useState<ShardHolding[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary>(DEFAULT_SUMMARY);
  const [pendingRewards, setPendingRewards] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) {
      setHoldings([]);
      setSummary(DEFAULT_SUMMARY);
      setPendingRewards(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [portfolio, rewards, votingWeight] = await Promise.all([
        shardMarketService.getUserPortfolio(userId),
        shardMarketService.getUserPendingRewards(userId),
        shardMarketService.getUserVotingWeight(userId),
      ]);

      setHoldings(portfolio);
      setPendingRewards(rewards);

      // Calculate summary
      const totalShards = portfolio.reduce((sum, h) => sum + h.shardCount, 0);
      const totalValue = portfolio.reduce((sum, h) => sum + h.currentValue, 0);
      const unrealizedGain = portfolio.reduce((sum, h) => sum + h.unrealizedGain, 0);

      setSummary({
        totalShards,
        totalValue,
        unrealizedGain,
        assetCount: portfolio.length,
        votingWeight,
      });
    } catch (err) {
      console.error('Error fetching portfolio:', err);
      setError('Failed to load portfolio');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const claimRewards = useCallback(async (): Promise<number> => {
    if (!userId) return 0;
    
    try {
      const claimed = await shardMarketService.claimRewards(userId);
      setPendingRewards(0);
      return claimed;
    } catch (err) {
      console.error('Error claiming rewards:', err);
      throw err;
    }
  }, [userId]);

  return {
    holdings,
    summary,
    pendingRewards,
    isLoading,
    error,
    claimRewards,
    refresh: fetchData,
  };
}

export default useShardPortfolio;
