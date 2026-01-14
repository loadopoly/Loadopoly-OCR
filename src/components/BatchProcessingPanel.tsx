/**
 * Batch Processing Panel
 * 
 * A comprehensive UI component for managing large-scale batch uploads.
 * Designed for processing hundreds to thousands of items with:
 * - Real-time progress visualization
 * - Pause/Resume/Cancel controls
 * - Performance metrics
 * - Error handling and retry capabilities
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { 
  batchProcessor, 
  BatchItemState, 
  BatchStats, 
  BatchProcessorState,
  BatchProcessorCallbacks
} from '../services/batchProcessorService';
import { ScanType } from '../types';

// ============================================
// Types
// ============================================

interface BatchProcessingPanelProps {
  onProcessItem: (file: File, itemId: string, scanType: ScanType, onProgress: (progress: number, stage: string) => void) => Promise<string | null>;
  onClose?: () => void;
  maxConcurrent?: number;
  defaultScanType?: ScanType;
}

// ============================================
// Helper Functions
// ============================================

function formatTime(ms: number): string {
  if (ms < 1000) return '< 1s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================
// Sub-Components
// ============================================

const StatusBadge: React.FC<{ status: BatchItemState['status'] }> = ({ status }) => {
  const config = {
    QUEUED: { bg: 'bg-gray-500', text: 'Queued' },
    PROCESSING: { bg: 'bg-blue-500 animate-pulse', text: 'Processing' },
    COMPLETED: { bg: 'bg-green-500', text: 'Complete' },
    ERROR: { bg: 'bg-red-500', text: 'Error' },
    PAUSED: { bg: 'bg-yellow-500', text: 'Paused' },
    CANCELLED: { bg: 'bg-gray-400', text: 'Cancelled' },
  }[status];
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium text-white ${config.bg}`}>
      {config.text}
    </span>
  );
};

const ProgressBar: React.FC<{ progress: number; status: BatchItemState['status'] }> = ({ progress, status }) => {
  const color = {
    QUEUED: 'bg-gray-400',
    PROCESSING: 'bg-blue-500',
    COMPLETED: 'bg-green-500',
    ERROR: 'bg-red-500',
    PAUSED: 'bg-yellow-500',
    CANCELLED: 'bg-gray-400',
  }[status];
  
  return (
    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <div 
        className={`h-full ${color} transition-all duration-300 ease-out`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};

const BatchItemRow: React.FC<{ item: BatchItemState }> = ({ item }) => (
  <div className="flex items-center gap-3 py-2 px-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
    {/* Icon based on status */}
    <div className="flex-shrink-0">
      {item.status === 'PROCESSING' && (
        <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {item.status === 'COMPLETED' && (
        <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {item.status === 'ERROR' && (
        <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {item.status === 'QUEUED' && (
        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
    </div>
    
    {/* File info */}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm truncate dark:text-white" title={item.fileName}>
          {item.fileName}
        </span>
        <span className="text-xs text-gray-400">{formatSize(item.fileSize)}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <ProgressBar progress={item.progress} status={item.status} />
        <span className="text-xs text-gray-500 whitespace-nowrap">{item.progress}%</span>
      </div>
      {item.stage && item.status === 'PROCESSING' && (
        <p className="text-xs text-blue-500 mt-0.5">{item.stage}</p>
      )}
      {item.errorMsg && (
        <p className="text-xs text-red-500 mt-0.5 truncate" title={item.errorMsg}>{item.errorMsg}</p>
      )}
    </div>
    
    {/* Status badge */}
    <StatusBadge status={item.status} />
  </div>
);

const StatsPanel: React.FC<{ stats: BatchStats; state: BatchProcessorState }> = ({ stats, state }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
    <div className="text-center">
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
      <div className="text-xs text-gray-500">Total</div>
    </div>
    <div className="text-center">
      <div className="text-2xl font-bold text-blue-500">{stats.processing}</div>
      <div className="text-xs text-gray-500">Processing</div>
    </div>
    <div className="text-center">
      <div className="text-2xl font-bold text-green-500">{stats.completed}</div>
      <div className="text-xs text-gray-500">Completed</div>
    </div>
    <div className="text-center">
      <div className="text-2xl font-bold text-red-500">{stats.failed}</div>
      <div className="text-xs text-gray-500">Failed</div>
    </div>
    
    {state === 'RUNNING' && stats.queued > 0 && (
      <div className="col-span-2 sm:col-span-4 text-center pt-2 border-t border-gray-200 dark:border-gray-700">
        <span className="text-sm text-gray-600 dark:text-gray-300">
          ⏱ Est. remaining: <strong>{formatTime(stats.estimatedTimeRemaining)}</strong>
          {stats.throughputPerMinute > 0 && (
            <span className="ml-3 text-gray-400">
              ({stats.throughputPerMinute.toFixed(1)}/min)
            </span>
          )}
        </span>
      </div>
    )}
  </div>
);

// ============================================
// Main Component
// ============================================

export const BatchProcessingPanel: React.FC<BatchProcessingPanelProps> = ({
  onProcessItem,
  onClose,
  maxConcurrent = 3,
  defaultScanType = ScanType.DOCUMENT,
}) => {
  const [items, setItems] = useState<BatchItemState[]>([]);
  const [stats, setStats] = useState<BatchStats>(batchProcessor.getStats());
  const [processorState, setProcessorState] = useState<BatchProcessorState>(batchProcessor.getState());
  const [logs, setLogs] = useState<Array<{ msg: string; level: string; time: Date }>>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [scanType, setScanType] = useState<ScanType>(defaultScanType);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Configure batch processor
  useEffect(() => {
    batchProcessor.configure({ maxConcurrent });
    
    const callbacks: Partial<BatchProcessorCallbacks> = {
      processItem: onProcessItem,
      onItemQueued: () => updateUI(),
      onItemStarted: () => updateUI(),
      onItemProgress: () => updateUI(),
      onItemCompleted: () => updateUI(),
      onItemFailed: () => updateUI(),
      onBatchCompleted: () => updateUI(),
      onStateChange: (state) => {
        setProcessorState(state);
        updateUI();
      },
      onLog: (msg, level) => {
        setLogs(prev => [...prev.slice(-99), { msg, level, time: new Date() }]);
      },
    };
    
    batchProcessor.setCallbacks(callbacks);
    updateUI();
    
    // Auto-recover stuck items on mount
    const stuck = batchProcessor.resetStuck();
    if (stuck > 0) {
      console.log(`[BatchPanel] Auto-recovered ${stuck} stuck items`);
    }
    
    return () => {
      batchProcessor.setCallbacks({});
    };
  }, [onProcessItem, maxConcurrent]);

  const updateUI = useCallback(() => {
    setItems(batchProcessor.getItems());
    setStats(batchProcessor.getStats());
    setProcessorState(batchProcessor.getState());
  }, []);

  // File drop handling
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files).filter(f => 
      f.type.startsWith('image/') || f.type === 'application/pdf'
    );
    
    if (files.length > 0) {
      batchProcessor.addFiles(files, scanType);
    }
  }, [scanType]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      batchProcessor.addFiles(files, scanType);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [scanType]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
      if (e.key === 'p' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (processorState === 'RUNNING') {
          batchProcessor.pause();
        } else if (processorState === 'PAUSED') {
          batchProcessor.resume();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [processorState, onClose]);

  // Visible items (virtualized for performance)
  const visibleItems = useMemo(() => {
    // Show first 100 items for performance
    return items.slice(0, 100);
  }, [items]);

  const progressPercent = stats.total > 0 
    ? Math.round((stats.completed / stats.total) * 100) 
    : 0;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <div>
            <h2 className="font-semibold">Batch Processing</h2>
            <p className="text-xs opacity-80">{stats.total} items • {progressPercent}% complete</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* State indicator */}
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            processorState === 'RUNNING' ? 'bg-green-500' :
            processorState === 'PAUSED' ? 'bg-yellow-500' :
            'bg-gray-500'
          }`}>
            {processorState}
          </span>
          
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      
      {/* Overall progress bar */}
      <div className="h-1 bg-gray-200 dark:bg-gray-700">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      
      {/* Stats */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <StatsPanel stats={stats} state={processorState} />
      </div>
      
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        {/* Add Files */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Files
        </button>
        
        {/* Scan Type Selector */}
        <select
          value={scanType}
          onChange={(e) => setScanType(e.target.value as ScanType)}
          className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
        >
          <option value={ScanType.DOCUMENT}>Document</option>
          <option value={ScanType.ITEM}>Item</option>
          <option value={ScanType.SCENERY}>Scenery</option>
        </select>
        
        <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
        
        {/* Play/Pause/Resume */}
        {processorState === 'IDLE' && stats.queued > 0 && (
          <button
            onClick={() => batchProcessor.start()}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Start
          </button>
        )}
        
        {processorState === 'RUNNING' && (
          <button
            onClick={() => batchProcessor.pause()}
            className="flex items-center gap-2 px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
            Pause
          </button>
        )}
        
        {processorState === 'PAUSED' && (
          <button
            onClick={() => batchProcessor.resume()}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Resume
          </button>
        )}
        
        {(processorState === 'RUNNING' || processorState === 'PAUSED') && (
          <button
            onClick={() => batchProcessor.stop()}
            className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h12v12H6z" />
            </svg>
            Stop
          </button>
        )}
        
        <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
        
        {/* Recovery Actions */}
        {stats.failed > 0 && (
          <button
            onClick={() => batchProcessor.retryFailed()}
            className="flex items-center gap-2 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry Failed ({stats.failed})
          </button>
        )}
        
        {stats.completed > 0 && (
          <button
            onClick={() => batchProcessor.clearCompleted()}
            className="flex items-center gap-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear Done
          </button>
        )}
        
        <div className="flex-1" />
        
        {/* Logs Toggle */}
        <button
          onClick={() => setShowLogs(!showLogs)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
            showLogs ? 'bg-purple-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Logs
        </button>
      </div>
      
      {/* Drop zone + Items list */}
      <div
        className="flex-1 overflow-hidden flex flex-col"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={handleDrop}
      >
        {items.length === 0 ? (
          /* Empty state / drop zone */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Drop files here or click Add Files
            </h3>
            <p className="text-sm text-gray-500 max-w-sm">
              Supports images (JPEG, PNG, WebP, HEIC) and PDFs.
              Optimized for large batches of 100+ documents.
            </p>
          </div>
        ) : showLogs ? (
          /* Logs view */
          <div className="flex-1 overflow-auto p-3 font-mono text-xs bg-gray-900 text-gray-100">
            {logs.map((log, i) => (
              <div key={i} className={`py-0.5 ${
                log.level === 'error' ? 'text-red-400' :
                log.level === 'warn' ? 'text-yellow-400' : 'text-gray-300'
              }`}>
                <span className="text-gray-500">{log.time.toLocaleTimeString()}</span>
                {' '}{log.msg}
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-gray-500 italic">No logs yet...</div>
            )}
          </div>
        ) : (
          /* Items list */
          <div ref={listRef} className="flex-1 overflow-auto p-2">
            {visibleItems.map(item => (
              <BatchItemRow key={item.id} item={item} />
            ))}
            {items.length > 100 && (
              <div className="text-center py-4 text-sm text-gray-500">
                Showing first 100 of {items.length} items
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Footer with keyboard hints */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
        <span className="hidden sm:inline">
          <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">Ctrl+P</kbd> Pause/Resume • 
          <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded ml-1">Esc</kbd> Close
        </span>
        <span className="sm:hidden">
          Drag & drop files to add
        </span>
      </div>
    </div>
  );
};

export default BatchProcessingPanel;
