/**
 * Cluster Sync Button
 *
 * Lightweight trigger for opening the (heavy) ClusterSyncStatsPanel.
 *
 * PERF: This button used to live next to `ClusterSyncStatsPanel` in
 * `ClusterSyncStatsPanel.tsx`, which statically imports the 120 KB
 * (33 KB gz) `ClusterSynchronizer` component. Because the Dashboard
 * renders this button eagerly, Rollup pulled `chunk-cluster-sync` onto
 * the critical path of every first page load — even for users who never
 * open the panel. Extracting the button into its own tiny module keeps
 * the heavy panel out of the initial chunk graph; it is still lazy-loaded
 * via `React.lazy` from `App.tsx` the first time the user clicks it.
 */

import React from 'react';
import { GitMerge } from 'lucide-react';

export interface ClusterSyncButtonProps {
  onClick: () => void;
  stats?: { structured: number; total: number };
}

export function ClusterSyncButton({ onClick, stats }: ClusterSyncButtonProps) {
  const percentage =
    stats && stats.total > 0 ? Math.round((stats.structured / stats.total) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600/20 to-violet-600/20 hover:from-primary-600/30 hover:to-violet-600/30 border border-primary-500/30 hover:border-primary-500/50 rounded-lg transition-all duration-200"
      title="Open Corpus Classification Overview"
    >
      <GitMerge size={18} className="text-primary-400 group-hover:scale-110 transition-transform" />
      <span className="text-sm font-medium text-white">Sync Clusters</span>
      {stats && stats.total > 0 && (
        <span
          className={`
            px-1.5 py-0.5 rounded text-[10px] font-bold
            ${
              percentage >= 80
                ? 'bg-emerald-500/20 text-emerald-400'
                : percentage >= 50
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-slate-700/50 text-slate-400'
            }
          `}
        >
          {percentage}%
        </span>
      )}
    </button>
  );
}

export default ClusterSyncButton;
