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
  Zap,
  Upload,
  RotateCcw,
  TestTube2
} from 'lucide-react';
import { processingQueueService, QueueStats } from '../services/processingQueueService';
import { loadAssets } from '../lib/indexeddb';
import { AssetStatus } from '../types';

interface QueueMonitorProps {
  userId?: string;
  onRequeueComplete?: () => void;
}

interface ConnectionTestResult {
  storageUpload: { success: boolean; error?: string };
  queueInsert: { success: boolean; error?: string };
  queueSelect: { success: boolean; error?: string };
}

export const QueueMonitor: React.FC<QueueMonitorProps> = ({ userId, onRequeueComplete }) => {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [localPendingCount, setLocalPendingCount] = useState(0);
  const [isRequeuing, setIsRequeuing] = useState(false);
  const [requeueProgress, setRequeueProgress] = useState({ done: 0, total: 0 });
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [connectionTest, setConnectionTest] = useState<ConnectionTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const fetchStats = async () => {
    try {
      const newStats = await processingQueueService.getStats();
      setStats(newStats);
      setLastUpdate(new Date());
      
      // Get service diagnostics
      const diag = processingQueueService.getDiagnostics();
      setDiagnostics(diag);
      
      // Count local unprocessed assets
      const localAssets = await loadAssets();
      const unprocessed = localAssets.filter(a => 
        a.status === AssetStatus.PENDING || 
        a.status === AssetStatus.PROCESSING ||
        (a.status !== AssetStatus.MINTED && !a.sqlRecord?.CONFIDENCE_SCORE)
      );
      setLocalPendingCount(unprocessed.length);
    } catch (err) {
      console.error('Failed to fetch queue stats', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRequeueAll = async () => {
    if (isRequeuing) return;
    
    // Check diagnostics first
    const diag = processingQueueService.getDiagnostics();
    if (!diag.canProcessServer) {
      const reasons = [];
      if (!diag.userId) reasons.push('Not logged in');
      if (!diag.isOnline) reasons.push('Offline');
      if (!diag.supabaseConfigured) reasons.push('Supabase not configured');
      alert(`Cannot queue to server:\n• ${reasons.join('\n• ')}\n\nPlease login first.`);
      return;
    }
    
    setIsRequeuing(true);
    setRequeueProgress({ done: 0, total: 0 });
    
    try {
      // Load all local assets
      const localAssets = await loadAssets();
      
      // Filter for unprocessed ones
      const unprocessed = localAssets.filter(a => 
        a.status === AssetStatus.PENDING || 
        a.status === AssetStatus.PROCESSING ||
        (a.status !== AssetStatus.MINTED && !a.sqlRecord?.CONFIDENCE_SCORE)
      );
      
      if (unprocessed.length === 0) {
        alert('No pending local assets to re-queue');
        setIsRequeuing(false);
        return;
      }
      
      setRequeueProgress({ done: 0, total: unprocessed.length });
      
      const result = await processingQueueService.requeueLocalAssets(
        unprocessed.map(a => ({ 
          id: a.id, 
          imageBlob: a.imageBlob, 
          scanType: a.scanType 
        })),
        (done, total) => setRequeueProgress({ done, total })
      );
      
      // Show result
      if (result.failed > 0) {
        alert(`Re-queued ${result.queued} assets. ${result.failed} failed.\n\nErrors:\n${result.errors.slice(0, 5).join('\n')}`);
      } else {
        alert(`Successfully queued ${result.queued} assets for server processing!`);
      }
      
      // Refresh stats
      await fetchStats();
      onRequeueComplete?.();
    } catch (err) {
      console.error('Requeue failed:', err);
      alert('Failed to re-queue assets. Check console for details.');
    } finally {
      setIsRequeuing(false);
    }
  };

  const handleReleaseStale = async () => {
    try {
      const released = await processingQueueService.releaseStaleJobs();
      if (released > 0) {
        alert(`Released ${released} stale jobs back to pending queue.`);
        await fetchStats();
      } else {
        alert('No stale jobs to release.');
      }
    } catch (err) {
      console.error('Failed to release stale jobs:', err);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setConnectionTest(null);
    try {
      const result = await processingQueueService.testConnection();
      setConnectionTest(result);
    } catch (err) {
      console.error('Connection test failed:', err);
      setConnectionTest({
        storageUpload: { success: false, error: 'Test failed' },
        queueInsert: { success: false, error: 'Test failed' },
        queueSelect: { success: false, error: 'Test failed' },
      });
    } finally {
      setIsTesting(false);
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

      {/* Diagnostics Panel - Collapsible */}
      <div className="border border-slate-800 rounded-lg overflow-hidden">
        <button 
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="w-full px-2 py-1.5 bg-slate-900 text-[9px] text-slate-400 flex items-center justify-between hover:bg-slate-800"
        >
          <span className="flex items-center gap-1">
            <Activity size={10} />
            Service Status
          </span>
          <span className={`transform transition-transform ${showDiagnostics ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {showDiagnostics && diagnostics && (
          <div className="p-2 bg-slate-950 text-[8px] font-mono space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">User ID:</span>
              <span className={diagnostics.userId ? 'text-emerald-400' : 'text-rose-400'}>
                {diagnostics.userId ? `${diagnostics.userId.slice(0,8)}...` : 'NOT SET'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Online:</span>
              <span className={diagnostics.isOnline ? 'text-emerald-400' : 'text-rose-400'}>
                {diagnostics.isOnline ? 'YES' : 'NO'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Supabase:</span>
              <span className={diagnostics.supabaseConfigured ? 'text-emerald-400' : 'text-rose-400'}>
                {diagnostics.supabaseConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-800 pt-1 mt-1">
              <span className="text-slate-400 font-bold">Can Process:</span>
              <span className={diagnostics.canProcessServer ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {diagnostics.canProcessServer ? '✓ READY' : '✗ BLOCKED'}
              </span>
            </div>
            
            {/* Test Connection Button */}
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !diagnostics.canProcessServer}
              className="w-full mt-2 py-1 px-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-300 text-[8px] rounded flex items-center justify-center gap-1 transition-colors"
            >
              {isTesting ? (
                <>
                  <RefreshCw size={8} className="animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <TestTube2 size={8} />
                  Test Connection & RLS
                </>
              )}
            </button>
            
            {/* Connection Test Results */}
            {connectionTest && (
              <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
                <div className="text-[7px] text-slate-500 uppercase mb-1">Connection Test Results</div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Storage Upload:</span>
                  <span className={connectionTest.storageUpload.success ? 'text-emerald-400' : 'text-rose-400'}>
                    {connectionTest.storageUpload.success ? '✓ OK' : '✗ FAIL'}
                  </span>
                </div>
                {connectionTest.storageUpload.error && (
                  <div className="text-[7px] text-rose-400 bg-rose-900/20 p-1 rounded">
                    {connectionTest.storageUpload.error}
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Queue Insert:</span>
                  <span className={connectionTest.queueInsert.success ? 'text-emerald-400' : 'text-rose-400'}>
                    {connectionTest.queueInsert.success ? '✓ OK' : '✗ FAIL'}
                  </span>
                </div>
                {connectionTest.queueInsert.error && (
                  <div className="text-[7px] text-rose-400 bg-rose-900/20 p-1 rounded">
                    {connectionTest.queueInsert.error}
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Queue Select:</span>
                  <span className={connectionTest.queueSelect.success ? 'text-emerald-400' : 'text-rose-400'}>
                    {connectionTest.queueSelect.success ? '✓ OK' : '✗ FAIL'}
                  </span>
                </div>
                {connectionTest.queueSelect.error && (
                  <div className="text-[7px] text-rose-400 bg-rose-900/20 p-1 rounded">
                    {connectionTest.queueSelect.error}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Local pending assets indicator */}
      {localPendingCount > 0 && (
        <div className="px-2 py-2 bg-amber-900/20 border border-amber-700/30 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-amber-400 font-medium">
              {localPendingCount} local assets waiting
            </span>
            <Activity size={12} className="text-amber-500" />
          </div>
          <p className="text-[8px] text-amber-600/80 mb-2">
            These items are stored locally and need to be sent to server for OCR processing.
          </p>
          <button
            onClick={handleRequeueAll}
            disabled={isRequeuing}
            className="w-full py-1.5 px-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-[10px] font-medium rounded flex items-center justify-center gap-1.5 transition-colors"
          >
            {isRequeuing ? (
              <>
                <RefreshCw size={10} className="animate-spin" />
                Re-queuing... {requeueProgress.done}/{requeueProgress.total}
              </>
            ) : (
              <>
                <Upload size={10} />
                Re-queue All to Server
              </>
            )}
          </button>
          {diagnostics && !diagnostics.canProcessServer && (
            <p className="text-[8px] text-rose-400 mt-1 text-center">
              {!diagnostics.userId ? 'Login required' : !diagnostics.isOnline ? 'Offline' : 'Check configuration'}
            </p>
          )}
        </div>
      )}

      {/* Actions for stuck jobs */}
      {(stats.processing > 0 || stats.failed > 0) && (
        <div className="flex gap-2">
          {stats.processing > 0 && (
            <button
              onClick={handleReleaseStale}
              className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] rounded flex items-center justify-center gap-1 transition-colors"
            >
              <RotateCcw size={10} />
              Release Stuck Jobs
            </button>
          )}
        </div>
      )}
    </div>
  );
};
