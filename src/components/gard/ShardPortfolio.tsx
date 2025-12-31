/**
 * GARD Shard Portfolio Component
 * 
 * Displays user's shard holdings, portfolio value, and rewards.
 */

import React from 'react';
import { 
  Wallet,
  TrendingUp,
  TrendingDown,
  Vote,
  Gift,
  RefreshCw,
  AlertCircle,
  Coins
} from 'lucide-react';
import { useShardPortfolio } from '../../hooks/useShardPortfolio';
import { GARD_CONFIG } from '../../types';

interface ShardPortfolioProps {
  userId: string | null;
}

const formatCurrency = (value: number): string => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
};

const formatPercentage = (value: number): string => {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${(value * 100).toFixed(2)}%`;
};

export default function ShardPortfolio({ userId }: ShardPortfolioProps) {
  const { 
    holdings, 
    summary, 
    pendingRewards, 
    isLoading, 
    error, 
    claimRewards, 
    refresh 
  } = useShardPortfolio(userId);

  const handleClaimRewards = async () => {
    try {
      const claimed = await claimRewards();
      if (claimed > 0) {
        alert(`Successfully claimed ${formatCurrency(claimed)}!`);
      }
    } catch (err) {
      alert('Failed to claim rewards. Please try again.');
    }
  };

  if (!userId) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
        <Wallet size={48} className="text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-white mb-2">Connect Wallet</h3>
        <p className="text-sm text-slate-400">
          Sign in to view your shard portfolio and claim rewards.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Wallet className="text-primary-500" size={24} />
            Shard Portfolio
          </h3>
          <p className="text-sm text-slate-400">
            Your fractional data asset ownership
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="text-red-500" size={20} />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Coins className="text-primary-500" size={20} />}
          label="Total Shards"
          value={summary.totalShards.toLocaleString()}
          sublabel={`${summary.assetCount} assets`}
        />
        <SummaryCard
          icon={<TrendingUp className="text-emerald-500" size={20} />}
          label="Portfolio Value"
          value={formatCurrency(summary.totalValue)}
        />
        <SummaryCard
          icon={
            summary.unrealizedGain >= 0 
              ? <TrendingUp className="text-emerald-500" size={20} />
              : <TrendingDown className="text-red-500" size={20} />
          }
          label="Unrealized Gain"
          value={formatCurrency(Math.abs(summary.unrealizedGain))}
          valueColor={summary.unrealizedGain >= 0 ? 'text-emerald-400' : 'text-red-400'}
          sublabel={formatPercentage(summary.unrealizedGain / Math.max(summary.totalValue, 1))}
        />
        <SummaryCard
          icon={<Vote className="text-indigo-500" size={20} />}
          label="Voting Weight"
          value={`${(summary.votingWeight * 100).toFixed(2)}%`}
          sublabel="DAO governance power"
        />
      </div>

      {/* Pending Rewards */}
      {pendingRewards > 0 && (
        <div className="bg-gradient-to-r from-amber-900/20 to-amber-800/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Gift className="text-amber-500" size={24} />
            </div>
            <div>
              <p className="text-white font-bold">{formatCurrency(pendingRewards)} Available</p>
              <p className="text-xs text-slate-400">Pending royalty rewards</p>
            </div>
          </div>
          <button
            onClick={handleClaimRewards}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors"
          >
            Claim Rewards
          </button>
        </div>
      )}

      {/* Holdings Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800">
          <h4 className="text-xs font-bold text-slate-400 uppercase">Holdings</h4>
        </div>
        
        {holdings.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <Coins size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium text-slate-400">No shard holdings yet</p>
            <p className="text-sm mt-1">
              Purchase shards from the marketplace to start earning royalties.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-950/50">
                <tr>
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Asset</th>
                  <th className="px-4 py-3 text-right text-slate-500 font-medium">Shards</th>
                  <th className="px-4 py-3 text-right text-slate-500 font-medium">Avg. Cost</th>
                  <th className="px-4 py-3 text-right text-slate-500 font-medium">Current Value</th>
                  <th className="px-4 py-3 text-right text-slate-500 font-medium">Gain/Loss</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {holdings.map(holding => {
                  const gainLoss = holding.currentValue - (holding.acquisitionPrice * holding.shardCount);
                  const gainLossPct = gainLoss / (holding.acquisitionPrice * holding.shardCount);
                  
                  return (
                    <tr key={holding.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-white font-medium">{holding.assetId.slice(0, 12)}...</p>
                          <p className="text-slate-500 text-[10px]">Token: {holding.tokenId.slice(0, 8)}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-white font-mono">{holding.shardCount.toLocaleString()}</span>
                        <span className="text-slate-500 text-[10px] ml-1">
                          / {GARD_CONFIG.SHARDS_PER_ASSET}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400 font-mono">
                        {formatCurrency(holding.acquisitionPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-white font-mono">
                        {formatCurrency(holding.currentValue)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className={gainLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          <span className="font-mono">{formatCurrency(Math.abs(gainLoss))}</span>
                          <span className="text-[10px] ml-1">
                            ({formatPercentage(gainLossPct)})
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  valueColor?: string;
}

function SummaryCard({ icon, label, value, sublabel, valueColor = 'text-white' }: SummaryCardProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
      {sublabel && <p className="text-[10px] text-slate-500 mt-1">{sublabel}</p>}
    </div>
  );
}
