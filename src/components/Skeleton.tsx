/**
 * Skeleton Loading Components
 * Provides visual feedback during data loading for better perceived performance
 */

import React from 'react';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-slate-800 rounded ${className}`}
      aria-hidden="true"
    />
  );
}

export function AssetCardSkeleton() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <Skeleton className="h-48 w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-2 mt-4">
          <Skeleton className="h-8 flex-1 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function TableRowSkeleton({ columns = 9 }: { columns?: number }) {
  return (
    <tr className="border-b border-slate-800">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-16" />
      </div>
      <Skeleton className="h-12 w-12 rounded-lg" />
    </div>
  );
}

export function GraphSkeleton() {
  return (
    <div className="relative h-full w-full flex items-center justify-center bg-slate-900 rounded-xl">
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Animated network nodes */}
        <div className="relative w-48 h-48">
          <div className="absolute top-0 left-1/2 -translate-x-1/2">
            <Skeleton className="w-8 h-8 rounded-full" />
          </div>
          <div className="absolute bottom-0 left-4">
            <Skeleton className="w-6 h-6 rounded-full" />
          </div>
          <div className="absolute bottom-0 right-4">
            <Skeleton className="w-6 h-6 rounded-full" />
          </div>
          <div className="absolute top-1/2 left-0 -translate-y-1/2">
            <Skeleton className="w-5 h-5 rounded-full" />
          </div>
          <div className="absolute top-1/2 right-0 -translate-y-1/2">
            <Skeleton className="w-5 h-5 rounded-full" />
          </div>
        </div>
      </div>
      <p className="text-slate-500 text-sm mt-32">Loading knowledge graph...</p>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      
      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <Skeleton className="h-5 w-48 mb-4" />
          <GraphSkeleton />
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <Skeleton className="h-5 w-32 mb-4" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start gap-4 p-3 rounded bg-slate-950/50 border border-slate-800">
                <Skeleton className="w-16 h-16 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AssetsGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8">
      {Array.from({ length: count }).map((_, i) => (
        <AssetCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function BatchQueueSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3 bg-slate-800/30 rounded">
          <Skeleton className="w-4 h-4 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
