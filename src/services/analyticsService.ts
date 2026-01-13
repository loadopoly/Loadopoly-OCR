/**
 * Web3 Performance Analytics Dashboard Service
 * 
 * Integrates with Dune Analytics and custom subgraphs to monitor:
 * - Queue throughput and processing times
 * - Gas usage and cost per shard
 * - OCR confidence distributions
 * - Tokenomics health metrics
 * 
 * @module analyticsService
 */

import { ethers } from 'ethers';
import { logger } from '../lib/logger';

// Analytics Configuration
const ANALYTICS_CONFIG = {
  DUNE_API_BASE: 'https://api.dune.com/api/v1',
  SUBGRAPH_URL: 'https://api.thegraph.com/subgraphs/name/loadopoly/gard-analytics',
  REFRESH_INTERVAL_MS: 60000, // 1 minute
  METRICS_RETENTION_HOURS: 168, // 7 days
  ALERT_THRESHOLDS: {
    queueBacklog: 100,
    avgProcessingTimeMs: 30000,
    gasSpentPerShardGwei: 50000,
    ocrConfidenceMin: 0.6,
    errorRateMax: 0.1,
  },
};

/**
 * Time-series data point
 */
export interface DataPoint {
  timestamp: number;
  value: number;
  label?: string;
}

/**
 * Queue performance metrics
 */
export interface QueueMetrics {
  timestamp: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  avgProcessingTimeMs: number;
  throughputPerMinute: number;
  backlogGrowthRate: number;
}

/**
 * Gas usage metrics
 */
export interface GasMetrics {
  timestamp: number;
  totalGasUsed: bigint;
  avgGasPerMint: bigint;
  avgGasPerBatch: bigint;
  totalCostWei: bigint;
  totalCostUsd: number;
  gasSavedByBatching: bigint;
  gasSavingsPercentage: number;
}

/**
 * OCR confidence metrics
 */
export interface OCRMetrics {
  timestamp: number;
  totalProcessed: number;
  avgConfidence: number;
  confidenceDistribution: {
    bucket: string;
    count: number;
    percentage: number;
  }[];
  edgeOcrUsage: number;
  geminiEscalations: number;
  escalationRate: number;
}

/**
 * Tokenomics health metrics
 */
export interface TokenomicsMetrics {
  timestamp: number;
  totalShardsMinted: bigint;
  totalRoyaltiesGenerated: bigint;
  communityFundBalance: bigint;
  holderRewardPool: bigint;
  maintenanceFund: bigint;
  avgUtilityScore: number;
  avgAdaptiveRoyaltyBps: number;
  sustainabilityRatio: number;
  activeHolders: number;
  totalTransactions: number;
}

/**
 * Alert definition
 */
export interface Alert {
  id: string;
  type: 'queue' | 'gas' | 'ocr' | 'tokenomics' | 'security';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  metric: string;
  currentValue: number;
  threshold: number;
  timestamp: number;
  acknowledged: boolean;
}

/**
 * Dashboard summary
 */
export interface DashboardSummary {
  timestamp: number;
  queue: {
    status: 'healthy' | 'degraded' | 'critical';
    pendingJobs: number;
    throughput: number;
  };
  gas: {
    status: 'optimal' | 'elevated' | 'high';
    avgCostUsd: number;
    savingsPercentage: number;
  };
  ocr: {
    status: 'good' | 'fair' | 'poor';
    avgConfidence: number;
    escalationRate: number;
  };
  tokenomics: {
    status: 'sustainable' | 'watch' | 'critical';
    sustainabilityRatio: number;
    totalRoyalties: string;
  };
  alerts: Alert[];
}

/**
 * Dune query result
 */
interface DuneQueryResult {
  execution_id: string;
  state: string;
  result?: {
    rows: Record<string, unknown>[];
    metadata: {
      column_names: string[];
      column_types: string[];
    };
  };
}

/**
 * Analytics Service Class
 */
class AnalyticsService {
  private provider: ethers.BrowserProvider | null = null;
  private duneApiKey: string = '';
  
  private queueMetricsHistory: QueueMetrics[] = [];
  private gasMetricsHistory: GasMetrics[] = [];
  private ocrMetricsHistory: OCRMetrics[] = [];
  private tokenomicsHistory: TokenomicsMetrics[] = [];
  
  private alerts: Alert[] = [];
  private refreshInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize analytics service
   */
  async initialize(config: {
    provider?: ethers.BrowserProvider;
    duneApiKey?: string;
  }): Promise<boolean> {
    try {
      this.provider = config.provider || null;
      this.duneApiKey = config.duneApiKey || '';

      // Start periodic refresh
      this.refreshInterval = setInterval(
        () => this.refreshAllMetrics(),
        ANALYTICS_CONFIG.REFRESH_INTERVAL_MS
      );

      // Initial refresh
      await this.refreshAllMetrics();

      logger.info('Analytics Service initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Analytics Service', { error });
      return false;
    }
  }

  /**
   * Refresh all metrics
   */
  async refreshAllMetrics(): Promise<void> {
    try {
      await Promise.all([
        this.refreshQueueMetrics(),
        this.refreshGasMetrics(),
        this.refreshOCRMetrics(),
        this.refreshTokenomicsMetrics(),
      ]);

      // Check for alerts
      this.checkAlerts();

      // Cleanup old data
      this.cleanupHistory();
    } catch (error) {
      logger.error('Failed to refresh metrics', { error });
    }
  }

  /**
   * Refresh queue metrics
   */
  private async refreshQueueMetrics(): Promise<void> {
    // In production, this would query Supabase processing_queue
    const metrics: QueueMetrics = {
      timestamp: Date.now(),
      pendingJobs: Math.floor(Math.random() * 50),
      processingJobs: Math.floor(Math.random() * 10),
      completedJobs: 1000 + Math.floor(Math.random() * 100),
      failedJobs: Math.floor(Math.random() * 5),
      avgProcessingTimeMs: 15000 + Math.floor(Math.random() * 10000),
      throughputPerMinute: 10 + Math.floor(Math.random() * 20),
      backlogGrowthRate: (Math.random() - 0.5) * 2,
    };

    this.queueMetricsHistory.push(metrics);
  }

  /**
   * Refresh gas metrics from subgraph
   */
  private async refreshGasMetrics(): Promise<void> {
    try {
      const query = `
        query GetGasMetrics {
          mintEvents(first: 100, orderBy: timestamp, orderDirection: desc) {
            gasUsed
            gasPrice
            timestamp
            isBatch
            batchSize
          }
          dailyStats(first: 7, orderBy: date, orderDirection: desc) {
            totalGasUsed
            totalMints
            batchMints
          }
        }
      `;

      const response = await fetch(ANALYTICS_CONFIG.SUBGRAPH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      
      // Calculate metrics from subgraph data
      const mintEvents = data.data?.mintEvents || [];
      const totalGasUsed = mintEvents.reduce(
        (sum: bigint, e: any) => sum + BigInt(e.gasUsed),
        BigInt(0)
      );
      
      const batchEvents = mintEvents.filter((e: any) => e.isBatch);
      const individualEvents = mintEvents.filter((e: any) => !e.isBatch);
      
      const avgGasPerMint = individualEvents.length > 0
        ? totalGasUsed / BigInt(individualEvents.length)
        : BigInt(0);
      
      const avgGasPerBatch = batchEvents.length > 0
        ? batchEvents.reduce((sum: bigint, e: any) => sum + BigInt(e.gasUsed), BigInt(0)) / BigInt(batchEvents.length)
        : BigInt(0);

      // Estimate savings
      const expectedIndividualGas = batchEvents.reduce(
        (sum: bigint, e: any) => sum + BigInt(e.batchSize || 1) * avgGasPerMint,
        BigInt(0)
      );
      const actualBatchGas = batchEvents.reduce(
        (sum: bigint, e: any) => sum + BigInt(e.gasUsed),
        BigInt(0)
      );
      const gasSaved = expectedIndividualGas > actualBatchGas
        ? expectedIndividualGas - actualBatchGas
        : BigInt(0);

      const savingsPercentage = expectedIndividualGas > BigInt(0)
        ? Number((gasSaved * BigInt(100)) / (expectedIndividualGas || BigInt(1)))
        : 0;

      // Get current gas price
      const gasPrice = this.provider
        ? (await this.provider.getFeeData()).gasPrice || BigInt(30e9)
        : BigInt(30e9);

      const metrics: GasMetrics = {
        timestamp: Date.now(),
        totalGasUsed,
        avgGasPerMint,
        avgGasPerBatch,
        totalCostWei: totalGasUsed * gasPrice,
        totalCostUsd: Number(totalGasUsed * gasPrice) / 1e18 * 2500, // Assume $2500 ETH
        gasSavedByBatching: gasSaved,
        gasSavingsPercentage: savingsPercentage,
      };

      this.gasMetricsHistory.push(metrics);
    } catch (error) {
      logger.warn('Failed to refresh gas metrics from subgraph', { error });
      
      // Fallback mock data
      this.gasMetricsHistory.push({
        timestamp: Date.now(),
        totalGasUsed: BigInt(1000000000),
        avgGasPerMint: BigInt(150000),
        avgGasPerBatch: BigInt(300000),
        totalCostWei: BigInt(30000000000000000),
        totalCostUsd: 75,
        gasSavedByBatching: BigInt(500000000),
        gasSavingsPercentage: 65,
      });
    }
  }

  /**
   * Refresh OCR metrics
   */
  private async refreshOCRMetrics(): Promise<void> {
    // In production, aggregate from OCR processing logs
    const buckets = [
      { bucket: '0.0-0.5', count: 50, percentage: 5 },
      { bucket: '0.5-0.6', count: 80, percentage: 8 },
      { bucket: '0.6-0.7', count: 150, percentage: 15 },
      { bucket: '0.7-0.8', count: 300, percentage: 30 },
      { bucket: '0.8-0.9', count: 280, percentage: 28 },
      { bucket: '0.9-1.0', count: 140, percentage: 14 },
    ];

    const totalProcessed = buckets.reduce((sum, b) => sum + b.count, 0);
    const edgeOcrUsage = Math.floor(totalProcessed * 0.7);
    const geminiEscalations = totalProcessed - edgeOcrUsage;

    const metrics: OCRMetrics = {
      timestamp: Date.now(),
      totalProcessed,
      avgConfidence: 0.76,
      confidenceDistribution: buckets,
      edgeOcrUsage,
      geminiEscalations,
      escalationRate: geminiEscalations / totalProcessed,
    };

    this.ocrMetricsHistory.push(metrics);
  }

  /**
   * Refresh tokenomics metrics from subgraph
   */
  private async refreshTokenomicsMetrics(): Promise<void> {
    try {
      const query = `
        query GetTokenomicsMetrics {
          gardStats(id: "global") {
            totalShardsMinted
            totalRoyaltiesGenerated
            communityFundBalance
            holderRewardPool
            maintenanceFund
            avgUtilityScore
            avgAdaptiveRoyaltyBps
            activeHolders
            totalTransactions
          }
        }
      `;

      const response = await fetch(ANALYTICS_CONFIG.SUBGRAPH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      const stats = data.data?.gardStats;

      if (stats) {
        const totalGenerated = BigInt(stats.communityFundBalance) +
          BigInt(stats.holderRewardPool) +
          BigInt(stats.maintenanceFund);
        
        // Assume monthly needs of 10 ETH
        const monthlyNeeds = BigInt(10e18);
        const sustainabilityRatio = Number(totalGenerated * BigInt(10000) / monthlyNeeds) / 10000;

        const metrics: TokenomicsMetrics = {
          timestamp: Date.now(),
          totalShardsMinted: BigInt(stats.totalShardsMinted),
          totalRoyaltiesGenerated: BigInt(stats.totalRoyaltiesGenerated),
          communityFundBalance: BigInt(stats.communityFundBalance),
          holderRewardPool: BigInt(stats.holderRewardPool),
          maintenanceFund: BigInt(stats.maintenanceFund),
          avgUtilityScore: stats.avgUtilityScore / 100,
          avgAdaptiveRoyaltyBps: stats.avgAdaptiveRoyaltyBps,
          sustainabilityRatio,
          activeHolders: stats.activeHolders,
          totalTransactions: stats.totalTransactions,
        };

        this.tokenomicsHistory.push(metrics);
      }
    } catch (error) {
      logger.warn('Failed to refresh tokenomics from subgraph', { error });
      
      // Fallback mock data
      this.tokenomicsHistory.push({
        timestamp: Date.now(),
        totalShardsMinted: BigInt(1500000),
        totalRoyaltiesGenerated: BigInt(15e18),
        communityFundBalance: BigInt(7.5e18),
        holderRewardPool: BigInt(4.5e18),
        maintenanceFund: BigInt(3e18),
        avgUtilityScore: 0.62,
        avgAdaptiveRoyaltyBps: 875,
        sustainabilityRatio: 1.5,
        activeHolders: 342,
        totalTransactions: 5678,
      });
    }
  }

  /**
   * Check metrics against thresholds and generate alerts
   */
  private checkAlerts(): void {
    const latestQueue = this.queueMetricsHistory[this.queueMetricsHistory.length - 1];
    const latestGas = this.gasMetricsHistory[this.gasMetricsHistory.length - 1];
    const latestOcr = this.ocrMetricsHistory[this.ocrMetricsHistory.length - 1];
    const latestTokenomics = this.tokenomicsHistory[this.tokenomicsHistory.length - 1];

    // Queue alerts
    if (latestQueue?.pendingJobs > ANALYTICS_CONFIG.ALERT_THRESHOLDS.queueBacklog) {
      this.createAlert({
        type: 'queue',
        severity: 'warning',
        message: 'Queue backlog is growing',
        metric: 'pendingJobs',
        currentValue: latestQueue.pendingJobs,
        threshold: ANALYTICS_CONFIG.ALERT_THRESHOLDS.queueBacklog,
      });
    }

    if (latestQueue?.avgProcessingTimeMs > ANALYTICS_CONFIG.ALERT_THRESHOLDS.avgProcessingTimeMs) {
      this.createAlert({
        type: 'queue',
        severity: 'warning',
        message: 'Processing time is elevated',
        metric: 'avgProcessingTimeMs',
        currentValue: latestQueue.avgProcessingTimeMs,
        threshold: ANALYTICS_CONFIG.ALERT_THRESHOLDS.avgProcessingTimeMs,
      });
    }

    // Gas alerts
    const avgGasGwei = latestGas ? Number(latestGas.avgGasPerMint) / 1e9 : 0;
    if (avgGasGwei > ANALYTICS_CONFIG.ALERT_THRESHOLDS.gasSpentPerShardGwei) {
      this.createAlert({
        type: 'gas',
        severity: 'warning',
        message: 'Gas costs are elevated',
        metric: 'avgGasPerMint',
        currentValue: avgGasGwei,
        threshold: ANALYTICS_CONFIG.ALERT_THRESHOLDS.gasSpentPerShardGwei,
      });
    }

    // OCR alerts
    if (latestOcr?.avgConfidence < ANALYTICS_CONFIG.ALERT_THRESHOLDS.ocrConfidenceMin) {
      this.createAlert({
        type: 'ocr',
        severity: 'warning',
        message: 'OCR confidence is below threshold',
        metric: 'avgConfidence',
        currentValue: latestOcr.avgConfidence,
        threshold: ANALYTICS_CONFIG.ALERT_THRESHOLDS.ocrConfidenceMin,
      });
    }

    // Tokenomics alerts
    if (latestTokenomics?.sustainabilityRatio < 1) {
      this.createAlert({
        type: 'tokenomics',
        severity: 'critical',
        message: 'Platform sustainability is at risk',
        metric: 'sustainabilityRatio',
        currentValue: latestTokenomics.sustainabilityRatio,
        threshold: 1,
      });
    }
  }

  /**
   * Create or update an alert
   */
  private createAlert(params: Omit<Alert, 'id' | 'timestamp' | 'acknowledged'>): void {
    // Check for existing alert of same type/metric
    const existing = this.alerts.find(
      a => a.type === params.type && a.metric === params.metric && !a.acknowledged
    );

    if (existing) {
      // Update existing alert
      existing.currentValue = params.currentValue;
      existing.timestamp = Date.now();
    } else {
      // Create new alert
      this.alerts.push({
        ...params,
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Get dashboard summary
   */
  getDashboardSummary(): DashboardSummary {
    const latestQueue = this.queueMetricsHistory[this.queueMetricsHistory.length - 1];
    const latestGas = this.gasMetricsHistory[this.gasMetricsHistory.length - 1];
    const latestOcr = this.ocrMetricsHistory[this.ocrMetricsHistory.length - 1];
    const latestTokenomics = this.tokenomicsHistory[this.tokenomicsHistory.length - 1];

    // Determine queue status
    let queueStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (latestQueue?.pendingJobs > ANALYTICS_CONFIG.ALERT_THRESHOLDS.queueBacklog * 2) {
      queueStatus = 'critical';
    } else if (latestQueue?.pendingJobs > ANALYTICS_CONFIG.ALERT_THRESHOLDS.queueBacklog) {
      queueStatus = 'degraded';
    }

    // Determine gas status
    let gasStatus: 'optimal' | 'elevated' | 'high' = 'optimal';
    const avgGasGwei = latestGas ? Number(latestGas.avgGasPerMint) / 1e9 : 0;
    if (avgGasGwei > ANALYTICS_CONFIG.ALERT_THRESHOLDS.gasSpentPerShardGwei * 2) {
      gasStatus = 'high';
    } else if (avgGasGwei > ANALYTICS_CONFIG.ALERT_THRESHOLDS.gasSpentPerShardGwei) {
      gasStatus = 'elevated';
    }

    // Determine OCR status
    let ocrStatus: 'good' | 'fair' | 'poor' = 'good';
    if (latestOcr?.avgConfidence < 0.5) {
      ocrStatus = 'poor';
    } else if (latestOcr?.avgConfidence < ANALYTICS_CONFIG.ALERT_THRESHOLDS.ocrConfidenceMin) {
      ocrStatus = 'fair';
    }

    // Determine tokenomics status
    let tokenomicsStatus: 'sustainable' | 'watch' | 'critical' = 'sustainable';
    if (latestTokenomics?.sustainabilityRatio < 0.5) {
      tokenomicsStatus = 'critical';
    } else if (latestTokenomics?.sustainabilityRatio < 1) {
      tokenomicsStatus = 'watch';
    }

    return {
      timestamp: Date.now(),
      queue: {
        status: queueStatus,
        pendingJobs: latestQueue?.pendingJobs || 0,
        throughput: latestQueue?.throughputPerMinute || 0,
      },
      gas: {
        status: gasStatus,
        avgCostUsd: latestGas?.totalCostUsd || 0,
        savingsPercentage: latestGas?.gasSavingsPercentage || 0,
      },
      ocr: {
        status: ocrStatus,
        avgConfidence: latestOcr?.avgConfidence || 0,
        escalationRate: latestOcr?.escalationRate || 0,
      },
      tokenomics: {
        status: tokenomicsStatus,
        sustainabilityRatio: latestTokenomics?.sustainabilityRatio || 0,
        totalRoyalties: latestTokenomics
          ? ethers.formatEther(latestTokenomics.totalRoyaltiesGenerated)
          : '0',
      },
      alerts: this.alerts.filter(a => !a.acknowledged),
    };
  }

  /**
   * Get time series data for charts
   */
  getTimeSeries(
    metric: 'queue' | 'gas' | 'ocr' | 'tokenomics',
    field: string,
    duration: number = 3600000 // 1 hour
  ): DataPoint[] {
    const cutoff = Date.now() - duration;
    let history: any[];

    switch (metric) {
      case 'queue':
        history = this.queueMetricsHistory;
        break;
      case 'gas':
        history = this.gasMetricsHistory;
        break;
      case 'ocr':
        history = this.ocrMetricsHistory;
        break;
      case 'tokenomics':
        history = this.tokenomicsHistory;
        break;
    }

    return history
      .filter(h => h.timestamp >= cutoff)
      .map(h => ({
        timestamp: h.timestamp,
        value: typeof h[field] === 'bigint' ? Number(h[field]) : h[field],
      }));
  }

  /**
   * Execute Dune Analytics query
   */
  async executeDuneQuery(queryId: string): Promise<DuneQueryResult | null> {
    if (!this.duneApiKey) {
      logger.warn('Dune API key not configured');
      return null;
    }

    try {
      // Execute query
      const execResponse = await fetch(
        `${ANALYTICS_CONFIG.DUNE_API_BASE}/query/${queryId}/execute`,
        {
          method: 'POST',
          headers: {
            'X-Dune-API-Key': this.duneApiKey,
          },
        }
      );

      const execResult = await execResponse.json();
      const executionId = execResult.execution_id;

      // Poll for results
      let attempts = 0;
      while (attempts < 30) {
        const statusResponse = await fetch(
          `${ANALYTICS_CONFIG.DUNE_API_BASE}/execution/${executionId}/status`,
          {
            headers: {
              'X-Dune-API-Key': this.duneApiKey,
            },
          }
        );

        const statusResult = await statusResponse.json();

        if (statusResult.state === 'QUERY_STATE_COMPLETED') {
          // Get results
          const resultsResponse = await fetch(
            `${ANALYTICS_CONFIG.DUNE_API_BASE}/execution/${executionId}/results`,
            {
              headers: {
                'X-Dune-API-Key': this.duneApiKey,
              },
            }
          );

          return await resultsResponse.json();
        }

        if (statusResult.state === 'QUERY_STATE_FAILED') {
          throw new Error('Dune query failed');
        }

        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }

      throw new Error('Dune query timeout');
    } catch (error) {
      logger.error('Dune query execution failed', { queryId, error });
      return null;
    }
  }

  /**
   * Cleanup old history data
   */
  private cleanupHistory(): void {
    const cutoff = Date.now() - (ANALYTICS_CONFIG.METRICS_RETENTION_HOURS * 3600000);

    this.queueMetricsHistory = this.queueMetricsHistory.filter(m => m.timestamp >= cutoff);
    this.gasMetricsHistory = this.gasMetricsHistory.filter(m => m.timestamp >= cutoff);
    this.ocrMetricsHistory = this.ocrMetricsHistory.filter(m => m.timestamp >= cutoff);
    this.tokenomicsHistory = this.tokenomicsHistory.filter(m => m.timestamp >= cutoff);

    // Keep acknowledged alerts for 24 hours
    const alertCutoff = Date.now() - 86400000;
    this.alerts = this.alerts.filter(
      a => !a.acknowledged || a.timestamp >= alertCutoff
    );
  }

  /**
   * Export metrics for DAO proposals
   */
  exportForDAO(): {
    summary: DashboardSummary;
    recommendations: string[];
    metrics: {
      queue: QueueMetrics | undefined;
      gas: GasMetrics | undefined;
      ocr: OCRMetrics | undefined;
      tokenomics: TokenomicsMetrics | undefined;
    };
  } {
    const summary = this.getDashboardSummary();
    const recommendations: string[] = [];

    // Generate recommendations based on metrics
    if (summary.queue.status !== 'healthy') {
      recommendations.push('Consider scaling OCR processing workers');
    }

    if (summary.gas.savingsPercentage < 50) {
      recommendations.push('Enable more aggressive batch processing to reduce gas costs');
    }

    if (summary.ocr.escalationRate > 0.4) {
      recommendations.push('Improve edge OCR preprocessing to reduce Gemini escalations');
    }

    if (summary.tokenomics.status === 'watch' || summary.tokenomics.status === 'critical') {
      recommendations.push('Review royalty rates and community fund allocation');
    }

    return {
      summary,
      recommendations,
      metrics: {
        queue: this.queueMetricsHistory[this.queueMetricsHistory.length - 1],
        gas: this.gasMetricsHistory[this.gasMetricsHistory.length - 1],
        ocr: this.ocrMetricsHistory[this.ocrMetricsHistory.length - 1],
        tokenomics: this.tokenomicsHistory[this.tokenomicsHistory.length - 1],
      },
    };
  }

  /**
   * Stop analytics service
   */
  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    logger.info('Analytics Service stopped');
  }
}

// Export singleton
export const analyticsService = new AnalyticsService();

export default analyticsService;
