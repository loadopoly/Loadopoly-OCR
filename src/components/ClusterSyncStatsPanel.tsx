/**
 * Cluster Sync Stats Panel
 * 
 * A statistics overview panel showing structured classification progress,
 * corpus health metrics, and quick access to the Cluster Synchronizer tool.
 * Designed for human-in-the-loop comprehension of data quality.
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  Sparkles,
  Brain,
  BarChart2,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  ChevronRight,
  TrendingUp,
  Database,
  RefreshCw,
  Info,
  PieChart,
  Layers,
  MapPin,
  Tag,
  Network,
  ShieldCheck,
  Search,
  Zap,
  GitMerge,
  Activity,
} from 'lucide-react';
import { DigitalAsset } from '../types';
import { ClusterSynchronizer, ClusterType } from './ClusterSynchronizer';

// ============================================
// Types
// ============================================

interface ClusterSyncStatsPanelProps {
  assets: DigitalAsset[];
  onClose: () => void;
}

interface ClusterStats {
  type: ClusterType;
  label: string;
  icon: React.ReactNode;
  color: string;
  classified: number;
  unclassified: number;
  percentage: number;
}

// ============================================
// Sub-Components
// ============================================

function StatCard({ 
  label, 
  value, 
  icon, 
  color, 
  subtext,
  trend,
}: { 
  label: string; 
  value: string | number; 
  icon: React.ReactNode; 
  color: string;
  subtext?: string;
  trend?: 'up' | 'down' | 'stable';
}) {
  return (
    <div className={`
      p-4 rounded-xl border transition-all duration-200
      bg-${color}-500/5 border-${color}-500/20 hover:border-${color}-500/40
    `}>
      <div className="flex items-start justify-between mb-2">
        <span className={`text-${color}-400`}>{icon}</span>
        {trend && (
          <span className={`text-xs flex items-center gap-1 ${
            trend === 'up' ? 'text-emerald-400' : 
            trend === 'down' ? 'text-red-400' : 'text-slate-400'
          }`}>
            {trend === 'up' && <TrendingUp size={12} />}
            {trend === 'down' && <TrendingUp size={12} className="rotate-180" />}
            {trend === 'stable' && <Activity size={12} />}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
      {subtext && <div className="text-[10px] text-slate-500 mt-1">{subtext}</div>}
    </div>
  );
}

function ClusterProgressBar({ stats }: { stats: ClusterStats }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-${stats.color}-400`}>{stats.icon}</span>
          <span className="text-sm font-medium text-slate-200">{stats.label}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-emerald-400">{stats.classified}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">{stats.classified + stats.unclassified}</span>
          <span className={`
            px-1.5 py-0.5 rounded text-[10px] font-bold
            ${stats.percentage >= 80 ? 'bg-emerald-500/20 text-emerald-400' :
              stats.percentage >= 50 ? 'bg-amber-500/20 text-amber-400' :
              'bg-red-500/20 text-red-400'}
          `}>
            {stats.percentage.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div 
          className={`h-full bg-gradient-to-r from-${stats.color}-600 to-${stats.color}-400 transition-all duration-500`}
          style={{ width: `${stats.percentage}%` }}
        />
      </div>
    </div>
  );
}

function QualityIndicator({ score, label }: { score: number; label: string }) {
  const getColor = () => {
    if (score >= 80) return 'emerald';
    if (score >= 60) return 'amber';
    return 'red';
  };
  
  const color = getColor();
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 transform -rotate-90">
          <circle
            cx="48"
            cy="48"
            r="40"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-slate-800"
          />
          <circle
            cx="48"
            cy="48"
            r="40"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`text-${color}-400 transition-all duration-1000`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-white">{score}%</span>
        </div>
      </div>
      <span className="text-xs text-slate-400 mt-2">{label}</span>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function ClusterSyncStatsPanel({ assets, onClose }: ClusterSyncStatsPanelProps) {
  const [showFullSynchronizer, setShowFullSynchronizer] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'clusters' | 'quality'>('overview');

  // Calculate statistics
  const stats = useMemo(() => {
    const total = assets.length;
    
    // Count structured vs unstructured
    let fullyStructured = 0;
    let partiallyStructured = 0;
    let unstructured = 0;
    
    // Per-cluster counts
    const clusterCounts: Record<ClusterType, { classified: number; unclassified: number }> = {
      TEMPORAL: { classified: 0, unclassified: 0 },
      SPATIAL: { classified: 0, unclassified: 0 },
      CONTENT: { classified: 0, unclassified: 0 },
      KNOWLEDGE_GRAPH: { classified: 0, unclassified: 0 },
      PROVENANCE: { classified: 0, unclassified: 0 },
      DISCOVERY: { classified: 0, unclassified: 0 },
    };
    
    // LLM usage
    const llmUsage: Record<string, number> = {};
    
    // Confidence distribution
    let totalConfidence = 0;
    let confidenceCount = 0;
    
    assets.forEach(asset => {
      const record = asset.sqlRecord;
      if (!record) {
        unstructured++;
        Object.keys(clusterCounts).forEach(k => {
          clusterCounts[k as ClusterType].unclassified++;
        });
        return;
      }
      
      let clustersClassified = 0;
      
      // Check each cluster
      if (record.STRUCTURED_TEMPORAL) {
        clusterCounts.TEMPORAL.classified++;
        clustersClassified++;
      } else {
        clusterCounts.TEMPORAL.unclassified++;
      }
      
      if (record.STRUCTURED_SPATIAL) {
        clusterCounts.SPATIAL.classified++;
        clustersClassified++;
      } else {
        clusterCounts.SPATIAL.unclassified++;
      }
      
      if (record.STRUCTURED_CONTENT) {
        clusterCounts.CONTENT.classified++;
        clustersClassified++;
      } else {
        clusterCounts.CONTENT.unclassified++;
      }
      
      if (record.STRUCTURED_KNOWLEDGE_GRAPH) {
        clusterCounts.KNOWLEDGE_GRAPH.classified++;
        clustersClassified++;
      } else {
        clusterCounts.KNOWLEDGE_GRAPH.unclassified++;
      }
      
      if (record.STRUCTURED_PROVENANCE) {
        clusterCounts.PROVENANCE.classified++;
        clustersClassified++;
      } else {
        clusterCounts.PROVENANCE.unclassified++;
      }
      
      if (record.STRUCTURED_DISCOVERY) {
        clusterCounts.DISCOVERY.classified++;
        clustersClassified++;
      } else {
        clusterCounts.DISCOVERY.unclassified++;
      }
      
      // Overall status
      if (clustersClassified === 6) {
        fullyStructured++;
      } else if (clustersClassified > 0) {
        partiallyStructured++;
      } else {
        unstructured++;
      }
      
      // LLM tracking
      if (record.CLASSIFICATION_LLM) {
        llmUsage[record.CLASSIFICATION_LLM] = (llmUsage[record.CLASSIFICATION_LLM] || 0) + 1;
      }
      
      // Confidence
      if (record.CLASSIFICATION_CONFIDENCE) {
        totalConfidence += record.CLASSIFICATION_CONFIDENCE;
        confidenceCount++;
      }
    });
    
    const avgConfidence = confidenceCount > 0 ? (totalConfidence / confidenceCount) * 100 : 0;
    const structuredPercentage = total > 0 ? (fullyStructured / total) * 100 : 0;
    const qualityScore = Math.round((structuredPercentage * 0.6) + (avgConfidence * 0.4));
    
    return {
      total,
      fullyStructured,
      partiallyStructured,
      unstructured,
      structuredPercentage,
      avgConfidence,
      qualityScore,
      clusterCounts,
      llmUsage,
    };
  }, [assets]);

  // Build cluster stats array
  const clusterStats: ClusterStats[] = [
    {
      type: 'TEMPORAL',
      label: 'Temporal',
      icon: <Clock size={14} />,
      color: 'amber',
      classified: stats.clusterCounts.TEMPORAL.classified,
      unclassified: stats.clusterCounts.TEMPORAL.unclassified,
      percentage: stats.total > 0 ? (stats.clusterCounts.TEMPORAL.classified / stats.total) * 100 : 0,
    },
    {
      type: 'SPATIAL',
      label: 'Spatial',
      icon: <MapPin size={14} />,
      color: 'emerald',
      classified: stats.clusterCounts.SPATIAL.classified,
      unclassified: stats.clusterCounts.SPATIAL.unclassified,
      percentage: stats.total > 0 ? (stats.clusterCounts.SPATIAL.classified / stats.total) * 100 : 0,
    },
    {
      type: 'CONTENT',
      label: 'Content',
      icon: <Tag size={14} />,
      color: 'blue',
      classified: stats.clusterCounts.CONTENT.classified,
      unclassified: stats.clusterCounts.CONTENT.unclassified,
      percentage: stats.total > 0 ? (stats.clusterCounts.CONTENT.classified / stats.total) * 100 : 0,
    },
    {
      type: 'KNOWLEDGE_GRAPH',
      label: 'Knowledge Graph',
      icon: <Network size={14} />,
      color: 'violet',
      classified: stats.clusterCounts.KNOWLEDGE_GRAPH.classified,
      unclassified: stats.clusterCounts.KNOWLEDGE_GRAPH.unclassified,
      percentage: stats.total > 0 ? (stats.clusterCounts.KNOWLEDGE_GRAPH.classified / stats.total) * 100 : 0,
    },
    {
      type: 'PROVENANCE',
      label: 'Provenance',
      icon: <ShieldCheck size={14} />,
      color: 'rose',
      classified: stats.clusterCounts.PROVENANCE.classified,
      unclassified: stats.clusterCounts.PROVENANCE.unclassified,
      percentage: stats.total > 0 ? (stats.clusterCounts.PROVENANCE.classified / stats.total) * 100 : 0,
    },
    {
      type: 'DISCOVERY',
      label: 'Discovery',
      icon: <Search size={14} />,
      color: 'cyan',
      classified: stats.clusterCounts.DISCOVERY.classified,
      unclassified: stats.clusterCounts.DISCOVERY.unclassified,
      percentage: stats.total > 0 ? (stats.clusterCounts.DISCOVERY.classified / stats.total) * 100 : 0,
    },
  ];

  // If showing full synchronizer, render that instead
  if (showFullSynchronizer) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="w-full max-w-7xl h-[90vh] bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <button
              onClick={() => setShowFullSynchronizer(false)}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronRight size={16} className="rotate-180" />
              Back to Overview
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          
          {/* Synchronizer */}
          <div className="flex-1 overflow-hidden">
            <ClusterSynchronizer assets={assets} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700 bg-gradient-to-r from-primary-600/10 to-violet-600/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary-500/20">
              <GitMerge className="text-primary-400" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Corpus Classification Overview</h2>
              <p className="text-sm text-slate-400">Structured cluster synchronization status</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-700">
          {[
            { id: 'overview', label: 'Overview', icon: <BarChart2 size={14} /> },
            { id: 'clusters', label: 'Clusters', icon: <Layers size={14} /> },
            { id: 'quality', label: 'Quality', icon: <Activity size={14} /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id as any)}
              className={`
                flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors
                ${selectedTab === tab.id
                  ? 'text-primary-400 border-b-2 border-primary-500 bg-primary-500/5'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {selectedTab === 'overview' && (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Total Assets"
                  value={stats.total}
                  icon={<Database size={18} />}
                  color="slate"
                />
                <StatCard
                  label="Fully Structured"
                  value={stats.fullyStructured}
                  icon={<CheckCircle size={18} />}
                  color="emerald"
                  subtext={`${stats.structuredPercentage.toFixed(1)}% of corpus`}
                  trend="up"
                />
                <StatCard
                  label="Partially Classified"
                  value={stats.partiallyStructured}
                  icon={<AlertCircle size={18} />}
                  color="amber"
                  subtext="Needs completion"
                />
                <StatCard
                  label="Unstructured"
                  value={stats.unstructured}
                  icon={<Search size={18} />}
                  color="red"
                  subtext="Awaiting classification"
                />
              </div>

              {/* Visual Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pie Chart Representation */}
                <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
                  <h4 className="text-sm font-medium text-slate-300 mb-4">Classification Distribution</h4>
                  <div className="flex items-center justify-center gap-8">
                    <div className="relative w-32 h-32">
                      <svg className="w-32 h-32 transform -rotate-90">
                        <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="16" className="text-slate-700" />
                        <circle 
                          cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="16" 
                          strokeDasharray={`${stats.structuredPercentage * 3.52} 352`}
                          className="text-emerald-500"
                        />
                        <circle 
                          cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="16" 
                          strokeDasharray={`${(stats.partiallyStructured / stats.total) * 352} 352`}
                          strokeDashoffset={`-${stats.structuredPercentage * 3.52}`}
                          className="text-amber-500"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-white">{stats.qualityScore}%</div>
                          <div className="text-[10px] text-slate-400">Quality</div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span className="text-xs text-slate-400">Structured ({stats.fullyStructured})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                        <span className="text-xs text-slate-400">Partial ({stats.partiallyStructured})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-slate-600" />
                        <span className="text-xs text-slate-400">Unstructured ({stats.unstructured})</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* LLM Attribution */}
                <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
                  <h4 className="text-sm font-medium text-slate-300 mb-4">LLM Classifications</h4>
                  {Object.keys(stats.llmUsage).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(stats.llmUsage).map(([llm, count]) => (
                        <div key={llm} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Brain size={14} className="text-violet-400" />
                            <span className="text-sm text-slate-300">{llm}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 bg-slate-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-violet-500"
                                style={{ width: `${(count / stats.total) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-400 w-8 text-right">{count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                      <Brain size={32} className="mb-2 opacity-50" />
                      <p className="text-sm">No LLM classifications yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Call to Action */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-primary-500/10 to-violet-500/10 border border-primary-500/20">
                <div className="flex items-center gap-3">
                  <Sparkles className="text-primary-400" size={20} />
                  <div>
                    <p className="text-sm font-medium text-white">Ready to classify your corpus?</p>
                    <p className="text-xs text-slate-400">Use the Cluster Synchronizer to structure your data with AI</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFullSynchronizer(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors"
                >
                  <Zap size={16} />
                  Open Synchronizer
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {selectedTab === 'clusters' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-400">
                  Classification progress across all 6 thematic clusters
                </p>
                <button
                  onClick={() => setShowFullSynchronizer(true)}
                  className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"
                >
                  Classify Now <ArrowRight size={12} />
                </button>
              </div>
              
              <div className="space-y-4">
                {clusterStats.map(cluster => (
                  <ClusterProgressBar key={cluster.type} stats={cluster} />
                ))}
              </div>

              {/* Cluster Details */}
              <div className="mt-6 p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
                <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                  <Info size={14} />
                  What gets classified?
                </h4>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock size={12} className="text-amber-400" />
                      <span className="text-slate-300">Temporal:</span>
                      <span className="text-slate-500">Era, Historical Period, Document Age</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin size={12} className="text-emerald-400" />
                      <span className="text-slate-300">Spatial:</span>
                      <span className="text-slate-500">Zone, Scale, Place Type</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Tag size={12} className="text-blue-400" />
                      <span className="text-slate-300">Content:</span>
                      <span className="text-slate-500">Category, Media, Subject</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Network size={12} className="text-violet-400" />
                      <span className="text-slate-300">Graph:</span>
                      <span className="text-slate-500">Node Type, Density, Role</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={12} className="text-rose-400" />
                      <span className="text-slate-300">Provenance:</span>
                      <span className="text-slate-500">License, Verification</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Search size={12} className="text-cyan-400" />
                      <span className="text-slate-300">Discovery:</span>
                      <span className="text-slate-500">Serendipity, Research Potential</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedTab === 'quality' && (
            <div className="space-y-6">
              {/* Quality Indicators */}
              <div className="flex justify-center gap-8 py-4">
                <QualityIndicator 
                  score={Math.round(stats.structuredPercentage)} 
                  label="Structured Coverage" 
                />
                <QualityIndicator 
                  score={Math.round(stats.avgConfidence)} 
                  label="Avg. Confidence" 
                />
                <QualityIndicator 
                  score={stats.qualityScore} 
                  label="Overall Quality" 
                />
              </div>

              {/* Quality Insights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
                  <h4 className="text-sm font-medium text-slate-300 mb-3">Recommendations</h4>
                  <div className="space-y-2">
                    {stats.unstructured > 0 && (
                      <div className="flex items-start gap-2 text-xs">
                        <AlertCircle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-slate-400">
                          <span className="text-white font-medium">{stats.unstructured} assets</span> have no structured classification. Consider running bulk sync.
                        </p>
                      </div>
                    )}
                    {stats.partiallyStructured > 0 && (
                      <div className="flex items-start gap-2 text-xs">
                        <Info size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
                        <p className="text-slate-400">
                          <span className="text-white font-medium">{stats.partiallyStructured} assets</span> are partially classified. Complete remaining clusters.
                        </p>
                      </div>
                    )}
                    {stats.avgConfidence < 70 && stats.avgConfidence > 0 && (
                      <div className="flex items-start gap-2 text-xs">
                        <AlertCircle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-slate-400">
                          Average confidence is <span className="text-white font-medium">{stats.avgConfidence.toFixed(0)}%</span>. Review low-confidence items.
                        </p>
                      </div>
                    )}
                    {stats.qualityScore >= 80 && (
                      <div className="flex items-start gap-2 text-xs">
                        <CheckCircle size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        <p className="text-slate-400">
                          Excellent corpus quality! Your data is well-structured for discovery.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
                  <h4 className="text-sm font-medium text-slate-300 mb-3">Benefits of Structured Data</h4>
                  <div className="space-y-2 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <Zap size={12} className="text-primary-400" />
                      <span>Faster, more accurate search results</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Network size={12} className="text-violet-400" />
                      <span>Better knowledge graph connections</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles size={12} className="text-amber-400" />
                      <span>Higher serendipity discovery potential</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp size={12} className="text-emerald-400" />
                      <span>Proxy classification for new data</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-700 bg-slate-950">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <RefreshCw size={12} />
            <span>Statistics refresh on panel open</span>
          </div>
          <button
            onClick={() => setShowFullSynchronizer(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <GitMerge size={16} />
            Open Cluster Synchronizer
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Trigger Button Component
// ============================================

export function ClusterSyncButton({ 
  onClick, 
  stats 
}: { 
  onClick: () => void;
  stats?: { structured: number; total: number };
}) {
  const percentage = stats && stats.total > 0 
    ? Math.round((stats.structured / stats.total) * 100) 
    : 0;
  
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600/20 to-violet-600/20 hover:from-primary-600/30 hover:to-violet-600/30 border border-primary-500/30 hover:border-primary-500/50 rounded-lg transition-all duration-200"
      title="Open Corpus Classification Overview"
    >
      <GitMerge size={18} className="text-primary-400 group-hover:scale-110 transition-transform" />
      <span className="text-sm font-medium text-white">Sync Clusters</span>
      {stats && stats.total > 0 && (
        <span className={`
          px-1.5 py-0.5 rounded text-[10px] font-bold
          ${percentage >= 80 ? 'bg-emerald-500/20 text-emerald-400' :
            percentage >= 50 ? 'bg-amber-500/20 text-amber-400' :
            'bg-slate-700/50 text-slate-400'}
        `}>
          {percentage}%
        </span>
      )}
    </button>
  );
}

export default ClusterSyncStatsPanel;
