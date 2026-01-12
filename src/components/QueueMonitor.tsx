/**
 * Queue Monitor Component
 * 
 * Displays the current status of the server-side processing queue.
 * Integrates with ProcessingQueueService to show real-time progress.
 */

import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Activity, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  RefreshCw,
  Zap
} from 'lucide-react';
import { processingQueueService, QueueStats } from '../services/processingQueueService';

interface QueueMonitorProps {
  userId?: string;
}

export const QueueMonitor: React.FC<QueueMonitorProps> = ({ userId }) => {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchStats = async () => {
    try {
      const newStats = await processingQueueService.getStats();
      setStats(newStats);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Failed to fetch queue stats', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    
    // Also listen for job completion to refresh
    processingQueueService.setCallbacks({
       onJobCompleted: () => fetchStats(),
       onJobFailed: () => fetchStats()
    });

    return () => clearInterval(interval);
  }, [userId]);

  if (!stats && loading) return (
    <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg flex items-center justify-center">
       <RefreshCw size={16} className="text-slate-500 animate-spin mr-2" />
       <span className="text-xs text-slate-500">Loading infrastructure stats...</span>
    </div>
  );

  if (!stats) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <Server size={10} />
          Server Infrastructure
        </h4>
        <div className="flex items-center gap-2">
            <span className="text-[8px] text-slate-600">Updated {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <button onClick={fetchStats} className="text-slate-500 hover:text-white transition-colors">
                <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
            </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-slate-500 uppercase">Waitlist</span>
            <Clock size={12} className="text-amber-500" />
          </div>
          <div className="text-xl font-bold text-white">{stats.pending}</div>
          <p className="text-[8px] text-slate-600 mt-1">Pending items</p>
        </div>

        <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-slate-500 uppercase">Active</span>
            <Zap size={12} className="text-blue-500 animate-pulse" />
          </div>
          <div className="text-xl font-bold text-white">{stats.processing}</div>
          <p className="text-[8px] text-slate-600 mt-1">Under analysis</p>
        </div>

        <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-slate-500 uppercase">Completed</span>
            <CheckCircle size={12} className="text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-white">{stats.completed}</div>
          <p className="text-[8px] text-slate-600 mt-1">Success today</p>
        </div>

        <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-slate-500 uppercase">Failed</span>
            <AlertCircle size={12} className="text-rose-500" />
          </div>
          <div className="text-xl font-bold text-white">{stats.failed}</div>
          <p className="text-[8px] text-slate-600 mt-1">Errors encountered</p>
        </div>
      </div>

      {stats.avgProcessingTime > 0 && (
        <div className="px-2 py-1.5 bg-slate-800/30 rounded border border-slate-800/50 flex items-center justify-between">
            <span className="text-[9px] text-slate-400">Avg. Processing Speed</span>
            <span className="text-[9px] font-mono text-slate-300">{(stats.avgProcessingTime / 1000).toFixed(1)}s / file</span>
        </div>
      )}
    </div>
  );
};
