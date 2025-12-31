/**
 * GARD Royalty Dashboard Component
 * 
 * Displays real-time GARD royalty statistics, sustainability metrics,
 * and recent transaction history.
 */

import React from 'react';
import { 
  TrendingUp, 
  Landmark, 
  Gift, 
  Sparkles, 
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { useGARDRoyalties } from '../../hooks/useGARDRoyalties';
import { GARD_CONFIG } from '../../types';

interface RoyaltyDashboardProps {
  userId?: string;
  onClaimRewards?: () => void;
}

const formatCurrency = (value: number): string => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
};

const formatPercentage = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

export default function RoyaltyDashboard({ userId, onClaimRewards }: RoyaltyDashboardProps) {
  const { stats, recentTransactions, communityFund, isLoading, error, refresh } = useGARDRoyalties(userId);

  const isSelfSustaining = stats.selfSustainabilityRatio >= 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="text-3xl">🌱</span>
            Social Return System
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            GARD Tokenomics • Royalty Recycling • Community Fund
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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<TrendingUp className="text-emerald-500" size={24} />}
          label="Total Royalties Generated"
          value={formatCurrency(stats.totalRoyaltiesGenerated)}
          sublabel={`${stats.transactionCount} transactions`}
          color="emerald"
        />
        <StatCard
          icon={<Landmark className="text-indigo-500" size={24} />}
          label="Community Fund"
          value={formatCurrency(stats.communityFundBalance)}
          sublabel={`${GARD_CONFIG.COMMUNITY_ALLOCATION * 100}% allocation`}
          color="indigo"
        />
        <StatCard
          icon={<Gift className="text-amber-500" size={24} />}
          label="Holder Rewards Pool"
          value={formatCurrency(stats.holderRewardsPool)}
          sublabel={`${stats.activeShardHolders} active holders`}
          color="amber"
        />
        <StatCard
          icon={<Sparkles className="text-purple-500" size={24} />}
          label="Your Pending Rewards"
          value={formatCurrency(stats.pendingUserRewards)}
          action={
            stats.pendingUserRewards > 0 && onClaimRewards && (
              <button 
                onClick={onClaimRewards}
                className="mt-2 px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition-colors"
              >
                Claim
              </button>
            )
          }
          color="purple"
        />
      </div>

      {/* Sustainability Meter */}
      <SustainabilityMeter 
        ratio={stats.selfSustainabilityRatio} 
        isSustaining={isSelfSustaining}
      />

      {/* Formula Display */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">
          GARD Liquidity Formula
        </h4>
        <div className="font-mono text-sm text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800">
          <span className="text-emerald-400">G_t</span> = 
          <span className="text-blue-400"> R_t</span> + 
          <span className="text-amber-400"> L_collateral,t</span> + 
          <span className="text-purple-400"> ROA_t</span>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-3 text-xs">
          <div className="text-slate-500">
            <span className="text-blue-400 font-mono">R_t</span> = T × {GARD_CONFIG.ROYALTY_RATE * 100}%
          </div>
          <div className="text-slate-500">
            <span className="text-amber-400 font-mono">L</span> = R × {GARD_CONFIG.LTV_RATIO * 100}% LTV
          </div>
          <div className="text-slate-500">
            <span className="text-emerald-400 font-mono">Multiplier</span> = 1.7×
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
            <Activity size={14} />
            Recent Royalty Transactions
          </h4>
          <span className="text-[10px] text-slate-500 font-mono">
            LAST {recentTransactions.length}
          </span>
        </div>
        <div className="max-h-64 overflow-auto custom-scrollbar">
          {recentTransactions.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No transactions recorded yet.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-950/50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-slate-500 font-medium">Type</th>
                  <th className="px-4 py-2 text-left text-slate-500 font-medium">Amount</th>
                  <th className="px-4 py-2 text-left text-slate-500 font-medium">Royalty</th>
                  <th className="px-4 py-2 text-left text-slate-500 font-medium">Distribution</th>
                  <th className="px-4 py-2 text-left text-slate-500 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {recentTransactions.slice(0, 10).map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        tx.transactionType === 'SALE' 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : tx.transactionType === 'LICENSE'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {tx.transactionType}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-white font-mono">
                      {formatCurrency(tx.salePrice)}
                    </td>
                    <td className="px-4 py-2 text-emerald-400 font-mono">
                      +{formatCurrency(tx.royaltyAmount)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <span className="text-indigo-400" title="Community">
                          {formatCurrency(tx.communityShare)}
                        </span>
                        <span className="text-slate-600">/</span>
                        <span className="text-amber-400" title="Holders">
                          {formatCurrency(tx.holderShare)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {new Date(tx.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// Sub-components
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  action?: React.ReactNode;
  color: 'emerald' | 'indigo' | 'amber' | 'purple';
}

function StatCard({ icon, label, value, sublabel, action, color }: StatCardProps) {
  const bgColors = {
    emerald: 'from-emerald-900/20 to-emerald-900/5',
    indigo: 'from-indigo-900/20 to-indigo-900/5',
    amber: 'from-amber-900/20 to-amber-900/5',
    purple: 'from-purple-900/20 to-purple-900/5',
  };

  return (
    <div className={`bg-gradient-to-br ${bgColors[color]} border border-slate-800 rounded-xl p-4`}>
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 bg-slate-900/50 rounded-lg">{icon}</div>
      </div>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
      {sublabel && <p className="text-[10px] text-slate-500 mt-1">{sublabel}</p>}
      {action}
    </div>
  );
}

interface SustainabilityMeterProps {
  ratio: number;
  isSustaining: boolean;
}

function SustainabilityMeter({ ratio, isSustaining }: SustainabilityMeterProps) {
  const displayRatio = Math.min(ratio, 200);
  const percentage = (displayRatio / 200) * 100;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-300">System Sustainability</span>
          {isSustaining ? (
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full flex items-center gap-1">
              <CheckCircle size={10} /> Self-Sustaining
            </span>
          ) : (
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-full flex items-center gap-1">
              <Activity size={10} /> Building Momentum
            </span>
          )}
        </div>
        <span className={`text-lg font-bold font-mono ${isSustaining ? 'text-emerald-400' : 'text-amber-400'}`}>
          {formatPercentage(ratio)}
        </span>
      </div>

      <div className="relative">
        <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${
              isSustaining 
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' 
                : 'bg-gradient-to-r from-amber-600 to-amber-400'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        
        {/* Inflection point marker at 100% (50% of bar) */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-slate-400"
          style={{ left: '50%' }}
        />
        <div 
          className="absolute -bottom-5 text-[9px] text-slate-500 transform -translate-x-1/2"
          style={{ left: '50%' }}
        >
          100% (Inflection)
        </div>
      </div>

      <p className="text-[10px] text-slate-500 mt-6">
        When G_t ≥ N_t, the system generates more liquidity than it needs for operations.
      </p>
    </div>
  );
}
