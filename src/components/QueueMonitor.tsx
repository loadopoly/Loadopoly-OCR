/**
 * Queue Monitor Component
 * 
 * Displays the current status of the server-side processing queue.
 * Integrates with ProcessingQueueService to show real-time progress.
 * 
 * Features:
 * - Real-time queue statistics
 * - Detailed job list with processing stages
 * - Stage breakdown and filtering
 * - Interactive job management
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  TestTube2,
  ChevronDown,
  ChevronRight,
  Eye,
  Filter,
  List,
  Layers,
  FileText,
  Image,
  Mountain,
  X
} from 'lucide-react';
import { processingQueueService, QueueStats, QueueJob, JobStatus } from '../services/processingQueueService';
import { loadAssets, resetStuckAssets } from '../lib/indexeddb';
import { AssetStatus, ScanType } from '../types';

// ============================================
// Types
// ============================================

/**
 * Upload progress represents client-side upload state (syncing to cloud)
 * This is separate from server-side queue processing stats
 */
interface UploadProgress {
  current: number;
  total: number;
}

interface QueueMonitorProps {
  userId?: string;
  onRequeueComplete?: () => void;
  compact?: boolean;
  /** Client-side upload progress - shown separately from server queue */
  uploadProgress?: UploadProgress;
}

interface ConnectionTestResult {
  storageUpload: { success: boolean; error?: string };
  queueInsert: { success: boolean; error?: string };
  queueSelect: { success: boolean; error?: string };
}

export const QueueMonitor: React.FC<QueueMonitorProps> = ({ userId, onRequeueComplete, compact = false, uploadProgress }) => {
  const truncateText = useCallback((value: unknown, length: number) => {
    if (typeof value !== 'string') return '';
    return value.slice(0, length);
  }, []);

  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [localPendingCount, setLocalPendingCount] = useState(0);
  const [isRequeuing, setIsRequeuing] = useState(false);
  const [requeueProgress, setRequeueProgress] = useState({ done: 0, total: 0 });
  const [lastRequeueResult, setLastRequeueResult] = useState<{ queued: number; failed: number; time: Date } | null>(null);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [connectionTest, setConnectionTest] = useState<ConnectionTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<{ processed: number; succeeded: number; failed: number } | null>(null);
  const [localNeedsUploadCount, setLocalNeedsUploadCount] = useState(0);
  const [localOnServerCount, setLocalOnServerCount] = useState(0);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<{ recovered: number; failed: number; orphaned: number; stillActive: number } | null>(null);
  
  // New state for detailed job list
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [showJobList, setShowJobList] = useState(false);
  const [selectedStageFilter, setSelectedStageFilter] = useState<string | null>(null);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<JobStatus | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);

  // Derived: stage breakdown from jobs
  const stageBreakdown = useMemo(() => {
    const breakdown: Record<string, { count: number; status: JobStatus }> = {};
    jobs.forEach(job => {
      const stage = job.stage || 'Waiting';
      if (!breakdown[stage]) {
        breakdown[stage] = { count: 0, status: job.status };
      }
      breakdown[stage].count++;
    });
    return breakdown;
  }, [jobs]);

  // Filtered jobs based on selected filters
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      if (selectedStatusFilter && job.status !== selectedStatusFilter) return false;
      if (selectedStageFilter && job.stage !== selectedStageFilter) return false;
      return true;
    });
  }, [jobs, selectedStatusFilter, selectedStageFilter]);

  const fetchJobs = useCallback(async () => {
    if (!userId) return;
    setJobsLoading(true);
    try {
      const userJobs = await processingQueueService.getUserJobs({ limit: 100 });
      setJobs(userJobs);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setJobsLoading(false);
    }
  }, [userId]);

  const fetchStats = async () => {
    try {
      const newStats = await processingQueueService.getStats();
      setStats(newStats);
      setLastUpdate(new Date());
      
      // Get service diagnostics
      const diag = processingQueueService.getDiagnostics();
      setDiagnostics(diag);
      
      // Count local unprocessed assets - split into needs-upload vs on-server-queue
      const localAssets = await loadAssets();
      const unprocessed = localAssets.filter(a => 
        a.status === AssetStatus.PENDING ||
        a.status === AssetStatus.PROCESSING
      );
      
      // Split: assets with serverJobId are tracked on server
      // Assets without serverJobId need to be uploaded
      const needsUpload = unprocessed.filter(a => !a.serverJobId);
      const onServerQueue = unprocessed.filter(a => !!a.serverJobId);
      
      setLocalNeedsUploadCount(needsUpload.length);
      setLocalOnServerCount(onServerQueue.length);
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
      
      // Filter for items that need upload (don't have serverJobId yet)
      const needsUpload = localAssets.filter(a => 
        !a.serverJobId && (
          a.status === AssetStatus.PENDING || 
          a.status === AssetStatus.PROCESSING ||
          (a.status === AssetStatus.FAILED && !a.sqlRecord?.CONFIDENCE_SCORE)
        )
      );
      
      if (needsUpload.length === 0) {
        // Check if there are items on server that need processing
        const onServer = localAssets.filter(a => a.serverJobId && a.status !== AssetStatus.MINTED);
        if (onServer.length > 0) {
          alert(`All items already uploaded to server queue (${onServer.length} waiting).\n\nTry "Trigger Processing" to start the OCR.`);
        } else {
          alert('No pending local assets to re-queue.\n\nAll items have been processed.');
        }
        setIsRequeuing(false);
        return;
      }
      
      const unprocessed = needsUpload; // Rename for compatibility below
      
      setRequeueProgress({ done: 0, total: unprocessed.length });
      
      const result = await processingQueueService.requeueLocalAssets(
        unprocessed.map(a => ({ 
          id: a.id, 
          imageBlob: a.imageBlob, 
          imageUrl: a.imageUrl,  // Pass URL as fallback for fetching
          scanType: a.scanType 
        })),
        (done, total) => setRequeueProgress({ done, total })
      );
      
      // Save result for display
      setLastRequeueResult({ queued: result.queued, failed: result.failed, time: new Date() });
      
      // Build result message
      const recoveredCount = (result as any).skippedRecovered || 0;
      
      // Show result with more context
      if (result.failed > 0) {
        // Group errors by type for cleaner display instead of listing each UUID
        const errorGroups = new Map<string, number>();
        result.errors.forEach((err: string) => {
          // Extract the error type after the asset ID prefix
          const match = err.match(/Asset [^:]+: (.+)/);
          const errorType = match ? match[1] : err;
          errorGroups.set(errorType, (errorGroups.get(errorType) || 0) + 1);
        });
        const groupedSummary = Array.from(errorGroups.entries())
          .map(([type, count]) => `  ${count}x: ${type}`)
          .join('\n');
        const recoveredMsg = recoveredCount > 0 ? `\n\n✓ ${recoveredCount} already completed on server (recovered).` : '';
        alert(`Uploaded ${result.queued} to server queue. ${result.failed} failed.${recoveredMsg}\n\nError summary:\n${groupedSummary}`);
      } else if (result.queued > 0 || recoveredCount > 0) {
        const parts = [];
        if (result.queued > 0) parts.push(`${result.queued} uploaded to server queue`);
        if (recoveredCount > 0) parts.push(`${recoveredCount} already completed (recovered from server)`);
        alert(`✓ ${parts.join(', ')}!\n\nJobs will be processed by the Edge Function.`);
      } else {
        alert('No items were queued. All assets may be missing image data.');
      }
      
      // Refresh stats and jobs immediately to show the new queue items
      await fetchStats();
      await fetchJobs();
      onRequeueComplete?.();
    } catch (err) {
      console.error('Requeue failed:', err);
      alert('Failed to re-queue assets. Check console for details.');
    } finally {
      setIsRequeuing(false);
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

  /**
   * Manually trigger the Edge Function to process the server queue.
   * Use this when WAITLIST has items but ACTIVE is 0.
   */
  const handleTriggerProcessing = async () => {
    setIsTriggering(true);
    setTriggerResult(null);
    try {
      const result = await processingQueueService.invokeEdgeFunction(10); // Process up to 10 jobs
      setTriggerResult(result);
      if (result) {
        if (result.succeeded > 0 || result.failed > 0) {
          alert(`Edge Function processed ${result.processed} jobs:\n✓ ${result.succeeded} succeeded\n✗ ${result.failed} failed`);
        } else if (result.processed === 0) {
          if ((result as any).claimError) {
            alert(`Edge Function could not claim jobs:\n${(result as any).claimError}\n\nThe claim_processing_job function may need to be deployed. Run CONSOLIDATED_SCHEMA.sql in the Supabase SQL editor.`);
          } else if ((stats?.processing || 0) > 0) {
            // Jobs are stuck in PROCESSING — offer to release locks
            const shouldRelease = confirm(
              `Edge Function found 0 PENDING jobs, but ${stats?.processing} jobs are stuck in PROCESSING.\n\n` +
              `These are likely from a previous failed attempt. Release them so they can be retried?`
            );
            if (shouldRelease) {
              await handleReleaseStale();
            }
          } else {
            alert('Edge Function found 0 pending jobs.\n\nAll jobs may already be processed, or the queue may be empty.');
          }
        }
      } else {
        alert('Edge Function returned no response. It may not be deployed.');
      }
      // Refresh stats after processing
      await fetchStats();
      await fetchJobs();
    } catch (err: any) {
      console.error('Trigger processing failed:', err);
      alert(`Failed to trigger processing:\n${err.message}\n\nThe Edge Function may not be deployed or may be missing the GEMINI_API_KEY secret.`);
    } finally {
      setIsTriggering(false);
    }
  };



  /**
   * Reset stuck PROCESSING items back to PENDING (local only).
   * Use this to retry items without losing them.
   */
  const handleResetLocalStuck = async () => {
    try {
      // Load assets and find stuck ones
      const localAssets = await loadAssets();
      const stuckAssets = localAssets.filter(a => 
        a.status === AssetStatus.PROCESSING && !a.serverJobId
      );
      
      if (stuckAssets.length === 0) {
        alert('No stuck local items to reset.\n\nTip: Items that have already been uploaded to server won\'t appear here.');
        return;
      }
      
      // Reset their status to PENDING
      const resetCount = await resetStuckAssets();
      if (resetCount > 0) {
        alert(`Reset ${resetCount} stuck items back to pending.\n\nClick "Upload to Server" to process them.`);
        await fetchStats();
        onRequeueComplete?.();
      } else {
        alert('No stuck local items to reset.');
      }
    } catch (err) {
      console.error('Failed to reset stuck items:', err);
      alert('Failed to reset stuck items.');
    }
  };



  /**
   * Release stale locks - frees jobs stuck in PROCESSING state
   */
  const handleReleaseStale = async () => {
    try {
      setLoading(true);
      const released = await processingQueueService.releaseStaleJobs();
      
      if (released > 0) {
        alert(`✅ Released ${released} stale locks.\n\nThese jobs are now available for processing.`);
        await fetchStats();
        await fetchJobs();
      } else {
        alert('No stale locks found.');
      }
    } catch (err) {
      console.error('Failed to release stale locks:', err);
      alert('❌ Failed to release stale locks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchJobs();
    
    // Refresh stats every 30 seconds
    const interval = setInterval(() => {
      fetchStats();
      if (showJobList) fetchJobs();
    }, 30000);
    
    // Also listen for job completion to refresh
    processingQueueService.setCallbacks({
       onJobCompleted: () => { fetchStats(); fetchJobs(); },
       onJobFailed: () => { fetchStats(); fetchJobs(); },
       onJobStarted: () => { if (showJobList) fetchJobs(); },
       onJobProgress: () => { if (showJobList) fetchJobs(); }
    });

    return () => clearInterval(interval);
  }, [userId, showJobList, fetchJobs]);

  // Helper to get total queued count
  const totalQueued = stats ? (stats.pending + stats.processing) : 0;

  if (!stats && loading) return (
    <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg flex items-center justify-center">
       <RefreshCw size={16} className="text-slate-500 animate-spin mr-2" />
       <span className="text-xs text-slate-500">Loading infrastructure stats...</span>
    </div>
  );

  if (!stats) return null;

  return (
    <div className="space-y-3">
      {/* ============================================
          Client-Side Upload Progress (Syncing to Cloud)
          This shows local → server upload status, separate from server processing
          ============================================ */}
      {uploadProgress && uploadProgress.total > 0 && (
        <div className="p-3 bg-gradient-to-r from-blue-950/50 to-slate-900 border border-blue-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Upload size={12} className="text-blue-400" />
              <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider">Syncing to Cloud</span>
            </div>
            <span className="text-[10px] font-mono text-blue-400">
              {uploadProgress.current}/{uploadProgress.total}
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300"
              style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-[8px] text-slate-500 mt-1.5">
            Uploading files to server queue. Processing will continue in background.
          </p>
        </div>
      )}

      {/* Header with prominent queue count */}
      <div className="flex items-center justify-between px-1 w-full max-w-full min-w-0 gap-1">
        <div className="flex items-center gap-1 sm:gap-3 flex-wrap sm:flex-nowrap min-w-0">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 flex-shrink-0">
            <Server size={10} />
            Processing Queue
          </h4>
          {/* Prominent queue badge */}
          {totalQueued > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-600 rounded-full animate-pulse">
              <Activity size={10} className="text-white" />
              <span className="text-[10px] font-bold text-white">{totalQueued} queued</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 ml-1">
            <button 
              onClick={() => { setShowJobList(!showJobList); if (!showJobList) fetchJobs(); }}
              className={`text-[8px] px-1.5 sm:px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${showJobList ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              <List size={8} className="hidden sm:block" />
              {showJobList ? 'Hide' : 'Show'} <span className="hidden sm:inline">Jobs</span>
            </button>
            <span className="text-[8px] text-slate-600 hidden sm:inline">Updated {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <button onClick={() => { fetchStats(); fetchJobs(); }} className="text-slate-500 hover:text-white transition-colors p-1">
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

      {/* Background Processing Info */}
      {stats.pending > 0 && stats.processing === 0 && (
        <div className="px-2 py-1.5 bg-amber-950/30 rounded border border-amber-800/30 flex items-center gap-2">
          <Clock size={10} className="text-amber-500 flex-shrink-0" />
          <p className="text-[8px] text-amber-400/80">
            Jobs queued but not processing. Use "Trigger Processing" or close app — server will auto-process.
          </p>
        </div>
      )}

      {stats.processing > 0 && (
        <div className="px-2 py-1.5 bg-emerald-950/30 rounded border border-emerald-800/30 flex items-center gap-2">
          <Zap size={10} className="text-emerald-500 flex-shrink-0 animate-pulse" />
          <p className="text-[8px] text-emerald-400/80">
            Processing active. You can close the app — server will continue in background.
          </p>
        </div>
      )}

      {stats.avgProcessingTime > 0 && (
        <div className="px-2 py-1.5 bg-slate-800/30 rounded border border-slate-800/50 flex items-center justify-between">
            <span className="text-[9px] text-slate-400">Avg. Processing Speed</span>
            <span className="text-[9px] font-mono text-slate-300">{(stats.avgProcessingTime / 1000).toFixed(1)}s / file</span>
        </div>
      )}

      {/* Stage Breakdown Panel - Shows what stages items are in */}
      {Object.keys(stageBreakdown).length > 0 && (
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <button 
            onClick={() => setShowJobList(!showJobList)}
            className="w-full px-2 py-1.5 bg-slate-900 text-[9px] text-slate-400 flex items-center justify-between hover:bg-slate-800"
          >
            <span className="flex items-center gap-1">
              <Layers size={10} />
              Processing Stages ({Object.keys(stageBreakdown).length})
            </span>
            <ChevronDown size={12} className={`transform transition-transform ${showJobList ? 'rotate-180' : ''}`} />
          </button>
          {showJobList && (
            <div className="p-2 bg-slate-950 space-y-1">
              {Object.entries(stageBreakdown).map(([stage, data]) => (
                <button
                  key={stage}
                  onClick={() => setSelectedStageFilter(selectedStageFilter === stage ? null : stage)}
                  className={`w-full flex items-center justify-between px-2 py-1 rounded text-[9px] transition-colors ${
                    selectedStageFilter === stage 
                      ? 'bg-blue-600/20 border border-blue-500/50 text-blue-300' 
                      : 'bg-slate-800/50 hover:bg-slate-800 text-slate-400'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {data.status === 'PROCESSING' && <Zap size={10} className="text-blue-400 animate-pulse" />}
                    {data.status === 'PENDING' && <Clock size={10} className="text-amber-400" />}
                    {data.status === 'COMPLETED' && <CheckCircle size={10} className="text-emerald-400" />}
                    {data.status === 'FAILED' && <AlertCircle size={10} className="text-rose-400" />}
                    {stage}
                  </span>
                  <span className="font-mono font-bold">{data.count}</span>
                </button>
              ))}
              {selectedStageFilter && (
                <button
                  onClick={() => setSelectedStageFilter(null)}
                  className="w-full text-center text-[8px] text-slate-500 hover:text-slate-300 py-1"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Detailed Job List - Interactive */}
      {showJobList && (
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <div className="px-2 py-1.5 bg-slate-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span className="text-[9px] text-slate-400 flex items-center gap-1 whitespace-nowrap">
              <List size={10} />
              Jobs ({filteredJobs.length}{selectedStageFilter || selectedStatusFilter ? ' filtered' : ''})
            </span>
            <div className="flex items-center gap-1 flex-wrap w-full sm:w-auto">
              {/* Status filter buttons */}
              {(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as JobStatus[]).map(status => (
                <button
                  key={status}
                  onClick={() => setSelectedStatusFilter(selectedStatusFilter === status ? null : status)}
                  className={`px-1.5 py-0.5 rounded text-[7px] font-medium transition-colors ${
                    selectedStatusFilter === status
                      ? status === 'PENDING' ? 'bg-amber-500 text-white'
                        : status === 'PROCESSING' ? 'bg-blue-500 text-white'
                        : status === 'COMPLETED' ? 'bg-emerald-500 text-white'
                        : 'bg-rose-500 text-white'
                      : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                  }`}
                >
                  {status.slice(0, 4)}
                </button>
              ))}
              {(selectedStatusFilter || selectedStageFilter) && (
                <button
                  onClick={() => { setSelectedStatusFilter(null); setSelectedStageFilter(null); }}
                  className="text-slate-500 hover:text-white ml-1"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          </div>
          
          {/* Job list with scrollable area */}
          <div className="max-h-64 overflow-y-auto bg-slate-950">
            {jobsLoading ? (
              <div className="p-4 text-center">
                <RefreshCw size={16} className="text-slate-500 animate-spin mx-auto mb-2" />
                <span className="text-[10px] text-slate-500">Loading jobs...</span>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="p-4 text-center text-[10px] text-slate-500">
                {selectedStageFilter || selectedStatusFilter ? 'No jobs match filter' : 'No jobs in queue'}
              </div>
            ) : (
              filteredJobs.map(job => (
                <div 
                  key={job.id}
                  className="border-b border-slate-800/50 last:border-0"
                >
                  {/* Job row - clickable to expand */}
                  <button
                    onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                    className="w-full px-2 py-2 flex items-center gap-2 hover:bg-slate-900/50 transition-colors"
                  >
                    {/* Status indicator */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      job.status === 'PROCESSING' ? 'bg-blue-500 animate-pulse'
                      : job.status === 'PENDING' ? 'bg-amber-500'
                      : job.status === 'COMPLETED' ? 'bg-emerald-500'
                      : 'bg-rose-500'
                    }`} />
                    
                    {/* Scan type icon */}
                    <div className="flex-shrink-0">
                      {job.scanType === ScanType.DOCUMENT && <FileText size={12} className="text-blue-400" />}
                      {job.scanType === ScanType.ITEM && <Image size={12} className="text-amber-400" />}
                      {job.scanType === ScanType.SCENERY && <Mountain size={12} className="text-emerald-400" />}
                    </div>
                    
                    {/* Job info */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-[9px] text-slate-300 font-mono truncate">
                        {truncateText(job.assetId, 8)}...
                      </div>
                      <div className="text-[8px] text-slate-500">
                        {job.stage || 'Waiting'}
                      </div>
                    </div>
                    
                    {/* Progress */}
                    <div className="flex-shrink-0 w-12 sm:w-16">
                      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 ${
                            job.status === 'PROCESSING' ? 'bg-blue-500'
                            : job.status === 'COMPLETED' ? 'bg-emerald-500'
                            : job.status === 'FAILED' ? 'bg-rose-500'
                            : 'bg-amber-500'
                          }`}
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                      <div className="text-[7px] text-slate-500 text-right mt-0.5">{job.progress}%</div>
                    </div>
                    
                    {/* Expand indicator */}
                    <ChevronRight size={10} className={`text-slate-500 transition-transform ${expandedJobId === job.id ? 'rotate-90' : ''}`} />
                  </button>
                  
                  {/* Expanded details */}
                  {expandedJobId === job.id && (
                    <div className="px-3 py-2 bg-slate-900/50 border-t border-slate-800/50 text-[8px] space-y-1.5">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div>
                          <span className="text-slate-500">Job ID:</span>
                          <span className="ml-1 text-slate-300 font-mono">{truncateText(job.id, 12)}...</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Asset ID:</span>
                          <span className="ml-1 text-slate-300 font-mono">{truncateText(job.assetId, 12)}...</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Status:</span>
                          <span className={`ml-1 font-medium ${
                            job.status === 'PROCESSING' ? 'text-blue-400'
                            : job.status === 'COMPLETED' ? 'text-emerald-400'
                            : job.status === 'FAILED' ? 'text-rose-400'
                            : 'text-amber-400'
                          }`}>{job.status}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Priority:</span>
                          <span className="ml-1 text-slate-300">{job.priority}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Retries:</span>
                          <span className="ml-1 text-slate-300">{job.retryCount}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Created:</span>
                          <span className="ml-1 text-slate-300">
                            {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                      {job.error && (
                        <div className="mt-2 p-1.5 bg-rose-900/20 border border-rose-800/50 rounded text-rose-300 break-words whitespace-pre-wrap">
                          <span className="text-rose-400 font-medium">Error: </span>{job.error}
                        </div>
                      )}
                      {job.status === 'PROCESSING' && (
                        <div className="mt-2 p-1.5 bg-blue-900/20 border border-blue-800/50 rounded text-blue-300 flex items-center gap-1">
                          <Zap size={10} className="animate-pulse" />
                          <span>Currently at stage: <strong>{job.stage || 'Initializing'}</strong></span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
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
                {diagnostics.userId ? `${truncateText(diagnostics.userId, 8)}...` : 'NOT SET'}
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
                  <div className="text-[7px] text-rose-400 bg-rose-900/20 p-1 rounded break-words whitespace-pre-wrap">
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
                  <div className="text-[7px] text-rose-400 bg-rose-900/20 p-1 rounded break-words whitespace-pre-wrap">
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
                  <div className="text-[7px] text-rose-400 bg-rose-900/20 p-1 rounded break-words whitespace-pre-wrap">
                    {connectionTest.queueSelect.error}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Last re-queue result */}
      {lastRequeueResult && (
        <div className={`px-2 py-1.5 rounded border text-[9px] flex items-center justify-between ${
          lastRequeueResult.failed > 0 
            ? 'bg-amber-900/20 border-amber-700/30 text-amber-400' 
            : 'bg-emerald-900/20 border-emerald-700/30 text-emerald-400'
        }`}>
          <span>
            Last upload: {lastRequeueResult.queued} queued
            {lastRequeueResult.failed > 0 && `, ${lastRequeueResult.failed} failed`}
          </span>
          <span className="text-slate-500">
            {lastRequeueResult.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* Local pending assets indicator */}
      {localPendingCount > 0 && (
        <div className="px-2 py-2 bg-amber-900/20 border border-amber-700/30 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-amber-400 font-medium">
              {localPendingCount} local assets waiting
            </span>
            <Activity size={12} className="text-amber-500" />
          </div>
          
          {/* Split counts */}
          <div className="flex gap-2 mb-2 text-[8px]">
            {localNeedsUploadCount > 0 && (
              <span className="text-rose-400">📤 {localNeedsUploadCount} need upload</span>
            )}
            {localOnServerCount > 0 && (
              <span className="text-cyan-400">☁️ {localOnServerCount} tracked locally (server: {stats?.pending || 0} pending, {stats?.processing || 0} active)</span>
            )}
          </div>
          
          <p className="text-[8px] text-amber-600/80 mb-2">
            {localNeedsUploadCount > 0 
              ? 'Upload items to server, then trigger processing.'
              : 'All items uploaded. Trigger processing to start OCR.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleRequeueAll}
              disabled={isRequeuing || isTesting || localNeedsUploadCount === 0}
              className="flex-1 py-1.5 px-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-[10px] font-medium rounded flex items-center justify-center gap-1.5 transition-colors"
            >
              {isRequeuing ? (
                <>
                  <RefreshCw size={10} className="animate-spin" />
                  {requeueProgress.done}/{requeueProgress.total}
                </>
              ) : (
                <>
                  <Upload size={10} />
                  Upload ({localNeedsUploadCount})
                </>
              )}
            </button>
            <button
              onClick={handleTriggerProcessing}
              disabled={isTriggering || (stats?.pending || 0) === 0}
              className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-[10px] font-medium rounded flex items-center justify-center gap-1.5 transition-colors"
              title="Trigger Edge Function to process server queue"
            >
              {isTriggering ? (
                <>
                  <RefreshCw size={10} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Zap size={10} />
                  Process Queue
                </>
              )}
            </button>
            <button
              onClick={handleTestConnection}
              disabled={isRequeuing || isTesting}
              className="py-1.5 px-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-300 text-[10px] rounded flex items-center justify-center gap-1 transition-colors"
              title="Test server connection"
            >
              {isTesting ? (
                <RefreshCw size={10} className="animate-spin" />
              ) : (
                <TestTube2 size={10} />
              )}
            </button>
          </div>
          
          {/* Trigger result */}
          {triggerResult && (
            <div className="mt-2 p-1.5 bg-slate-900 rounded text-[8px]">
              <span className="text-slate-400">Last trigger: </span>
              <span className="text-emerald-400">{triggerResult.succeeded} ✓</span>
              {triggerResult.failed > 0 && <span className="text-rose-400"> {triggerResult.failed} ✗</span>}
            </div>
          )}
          
          {/* Connection test results */}
          {connectionTest && (
            <div className="mt-2 p-2 bg-slate-900 rounded text-[8px] space-y-1">
              <div className="flex items-start gap-1">
                <div className="mt-0.5">
                  {connectionTest.storageUpload.success ? (
                    <CheckCircle size={10} className="text-emerald-400" />
                  ) : (
                    <AlertCircle size={10} className="text-rose-400" />
                  )}
                </div>
                <span className={`break-words whitespace-pre-wrap flex-1 ${connectionTest.storageUpload.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                  Storage: {connectionTest.storageUpload.success ? 'OK' : connectionTest.storageUpload.error}
                </span>
              </div>
              <div className="flex items-start gap-1">
                <div className="mt-0.5">
                  {connectionTest.queueInsert.success ? (
                    <CheckCircle size={10} className="text-emerald-400" />
                  ) : (
                    <AlertCircle size={10} className="text-rose-400" />
                  )}
                </div>
                <span className={`break-words whitespace-pre-wrap flex-1 ${connectionTest.queueInsert.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                  Queue Insert: {connectionTest.queueInsert.success ? 'OK' : connectionTest.queueInsert.error}
                </span>
              </div>
              <div className="flex items-start gap-1">
                <div className="mt-0.5">
                  {connectionTest.queueSelect.success ? (
                    <CheckCircle size={10} className="text-emerald-400" />
                  ) : (
                    <AlertCircle size={10} className="text-rose-400" />
                  )}
                </div>
                <span className={`break-words whitespace-pre-wrap flex-1 ${connectionTest.queueSelect.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                  Queue Read: {connectionTest.queueSelect.success ? 'OK' : connectionTest.queueSelect.error}
                </span>
              </div>
            </div>
          )}
          
          {diagnostics && !diagnostics.canProcessServer && (
            <p className="text-[8px] text-rose-400 mt-1 text-center">
              {!diagnostics.userId ? 'Login required' : !diagnostics.isOnline ? 'Offline' : 'Check configuration'}
            </p>
          )}
        </div>
      )}

      {/* Actions for stuck jobs */}
      {(stats.processing > 0 || stats.failed > 0 || localPendingCount > 0) && (
        <div className="space-y-2">
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
          
          {/* Force Requeue - Upload all stuck to server */}
          <div className="flex gap-2">
            <button
              onClick={handleRequeueAll}
              disabled={isRequeuing || localNeedsUploadCount === 0}
              className="flex-1 py-2 px-2 bg-amber-700 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-600 text-white text-[10px] font-medium rounded flex items-center justify-center gap-1.5 transition-colors"
            >
              {isRequeuing ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  Uploading {requeueProgress.done}/{requeueProgress.total}...
                </>
              ) : (
                <>
                  <Upload size={12} />
                  Upload to Server ({localNeedsUploadCount})
                </>
              )}
            </button>
            <button
              onClick={handleTriggerProcessing}
              disabled={isTriggering || (stats?.pending || 0) === 0}
              className="flex-1 py-2 px-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 text-white text-[10px] font-medium rounded flex items-center justify-center gap-1.5 transition-colors"
              title="Trigger Edge Function to process queue"
            >
              {isTriggering ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Zap size={12} />
                  Process Queue ({stats?.pending || 0})
                </>
              )}
            </button>
          </div>
          
          {/* Reconcile with server - recover completed results */}
          {localOnServerCount > 0 && (
            <button
              onClick={async () => {
                setIsReconciling(true);
                setReconcileResult(null);
                try {
                  const result = await processingQueueService.reconcileWithServer();
                  setReconcileResult(result);
                  if (result.recovered > 0 || result.failed > 0 || result.orphaned > 0 || result.stillActive > 0) {
                    const lines = ['Reconciliation complete:'];
                    if (result.recovered > 0) lines.push(`✓ ${result.recovered} recovered from server`);
                    if (result.failed > 0) lines.push(`✗ ${result.failed} failed on server`);
                    if (result.stillActive > 0) lines.push(`⏳ ${result.stillActive} still processing on server`);
                    if (result.orphaned > 0) lines.push(`⚠ ${result.orphaned} orphaned (reset to pending)`);
                    alert(lines.join('\n'));
                    await fetchStats();
                    onRequeueComplete?.();
                  } else {
                    alert('No changes — all local items already match server state.');
                  }
                } catch (err) {
                  console.error('Reconciliation failed:', err);
                  alert('Reconciliation failed. Check console for details.');
                } finally {
                  setIsReconciling(false);
                }
              }}
              disabled={isReconciling}
              className="w-full py-2 px-2 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-800 disabled:text-slate-600 text-white text-[10px] font-medium rounded flex items-center justify-center gap-1.5 transition-colors"
            >
              {isReconciling ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  Reconciling with server...
                </>
              ) : (
                <>
                  <RefreshCw size={12} />
                  Reconcile {localOnServerCount} Items with Server
                </>
              )}
            </button>
          )}

          {/* Reconcile result */}
          {reconcileResult && (
            <div className="px-2 py-1.5 bg-cyan-900/20 border border-cyan-700/30 rounded text-[9px] text-cyan-400">
              Reconciled: {reconcileResult.recovered} recovered, {reconcileResult.failed} failed, {reconcileResult.orphaned} orphaned{reconcileResult.stillActive > 0 ? `, ${reconcileResult.stillActive} still active` : ''}
            </div>
          )}

          {/* Reset local stuck items */}
          <div className="flex gap-2">
            <button
              onClick={handleResetLocalStuck}
              disabled={localPendingCount === 0}
              className="flex-1 py-1.5 px-2 bg-amber-800 hover:bg-amber-700 disabled:bg-slate-800 disabled:text-slate-600 text-white text-[9px] rounded flex items-center justify-center gap-1 transition-colors"
            >
              <RotateCcw size={10} />
              Reset Local
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
