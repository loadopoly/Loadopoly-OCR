/**
 * Cache Service
 * 
 * Multi-tier caching for improved query performance:
 * - L1: In-memory LRU cache (fastest, per-session)
 * - L2: IndexedDB cache (persistent, offline)
 * - L3: Upstash Redis (shared, cross-device)
 * 
 * Features:
 * - Automatic cache invalidation with TTL
 * - Cache-aside pattern for transparent caching
 * - Deduplication result caching
 * - Asset metadata caching
 */

import { logger } from '../lib/logger';

// ============================================
// Types
// ============================================

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
  hitCount: number;
}

export interface CacheStats {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  l3Hits: number;
  l3Misses: number;
  totalEntries: number;
}

export interface CacheOptions {
  /** TTL in milliseconds */
  ttl?: number;
  /** Cache key prefix */
  prefix?: string;
  /** Skip L3 (Redis) */
  skipRemote?: boolean;
}

// ============================================
// Constants
// ============================================

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_L1_ENTRIES = 500;
const INDEXEDDB_STORE = 'cache';
const INDEXEDDB_NAME = 'geograph-cache';

// ============================================
// L1: In-Memory LRU Cache
// ============================================

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;

  constructor(maxSize: number = MAX_L1_ENTRIES) {
    this.maxSize = maxSize;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    entry.hitCount++;
    this.cache.set(key, entry);

    return entry.data;
  }

  set(key: string, data: T, ttl: number = DEFAULT_TTL): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now(),
      hitCount: 0
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}

// ============================================
// L2: IndexedDB Cache
// ============================================

class IndexedDBCache {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(INDEXEDDB_NAME, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(INDEXEDDB_STORE)) {
          const store = db.createObjectStore(INDEXEDDB_STORE, { keyPath: 'key' });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(INDEXEDDB_STORE, 'readonly');
        const store = tx.objectStore(INDEXEDDB_STORE);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const entry = request.result as CacheEntry<T> & { key: string } | undefined;
          if (!entry) {
            resolve(null);
            return;
          }

          if (Date.now() > entry.expiresAt) {
            // Expired, delete async
            this.delete(key).catch(() => {});
            resolve(null);
            return;
          }

          resolve(entry.data);
        };
      });
    } catch (error) {
      logger.warn('IndexedDB cache get failed', { key, error });
      return null;
    }
  }

  async set<T>(key: string, data: T, ttl: number = DEFAULT_TTL): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(INDEXEDDB_STORE, 'readwrite');
        const store = tx.objectStore(INDEXEDDB_STORE);
        
        const entry = {
          key,
          data,
          expiresAt: Date.now() + ttl,
          createdAt: Date.now(),
          hitCount: 0
        };

        const request = store.put(entry);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      logger.warn('IndexedDB cache set failed', { key, error });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(INDEXEDDB_STORE, 'readwrite');
        const store = tx.objectStore(INDEXEDDB_STORE);
        const request = store.delete(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      logger.warn('IndexedDB cache delete failed', { key, error });
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(INDEXEDDB_STORE, 'readwrite');
        const store = tx.objectStore(INDEXEDDB_STORE);
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      logger.warn('IndexedDB cache clear failed', { error });
    }
  }

  async cleanup(): Promise<number> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(INDEXEDDB_STORE, 'readwrite');
        const store = tx.objectStore(INDEXEDDB_STORE);
        const index = store.index('expiresAt');
        const range = IDBKeyRange.upperBound(Date.now());
        const request = index.openCursor(range);
        
        let deleted = 0;
        
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            deleted++;
            cursor.continue();
          } else {
            resolve(deleted);
          }
        };
        
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      logger.warn('IndexedDB cache cleanup failed', { error });
      return 0;
    }
  }
}

// ============================================
// L3: Upstash Redis Cache
// ============================================

class UpstashCache {
  private url: string | null = null;
  private token: string | null = null;

  constructor() {
    this.url = localStorage.getItem('geograph-upstash-url');
    this.token = localStorage.getItem('geograph-upstash-token');
  }

  isConfigured(): boolean {
    return !!(this.url && this.token);
  }

  configure(url: string, token: string): void {
    this.url = url;
    this.token = token;
    localStorage.setItem('geograph-upstash-url', url);
    localStorage.setItem('geograph-upstash-token', token);
  }

  private async request(commands: string[][]): Promise<any> {
    if (!this.isConfigured()) return null;

    try {
      const response = await fetch(`${this.url}/pipeline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(commands)
      });

      if (!response.ok) {
        throw new Error(`Upstash error: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      logger.warn('Upstash request failed', { error });
      return null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const result = await this.request([['GET', key]]);
    if (!result || !result[0]?.result) return null;

    try {
      const entry = JSON.parse(result[0].result) as CacheEntry<T>;
      if (Date.now() > entry.expiresAt) {
        this.delete(key).catch(() => {});
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, data: T, ttl: number = DEFAULT_TTL): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now(),
      hitCount: 0
    };

    const ttlSeconds = Math.ceil(ttl / 1000);
    await this.request([
      ['SET', key, JSON.stringify(entry), 'EX', ttlSeconds.toString()]
    ]);
  }

  async delete(key: string): Promise<void> {
    await this.request([['DEL', key]]);
  }

  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    if (keys.length === 0) return new Map();

    const result = await this.request([['MGET', ...keys]]);
    const map = new Map<string, T>();

    if (result?.[0]?.result) {
      result[0].result.forEach((value: string | null, index: number) => {
        if (value) {
          try {
            const entry = JSON.parse(value) as CacheEntry<T>;
            if (Date.now() <= entry.expiresAt) {
              map.set(keys[index], entry.data);
            }
          } catch {}
        }
      });
    }

    return map;
  }
}

// ============================================
// Unified Cache Service
// ============================================

class CacheService {
  private l1 = new LRUCache<any>();
  private l2 = new IndexedDBCache();
  private l3 = new UpstashCache();
  
  private stats: CacheStats = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
    l3Hits: 0,
    l3Misses: 0,
    totalEntries: 0
  };

  /**
   * Get value from cache (tries L1 -> L2 -> L3)
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const fullKey = options.prefix ? `${options.prefix}:${key}` : key;

    // L1: In-memory
    const l1Value = this.l1.get(fullKey) as T | null;
    if (l1Value !== null) {
      this.stats.l1Hits++;
      return l1Value;
    }
    this.stats.l1Misses++;

    // L2: IndexedDB
    const l2Value = await this.l2.get<T>(fullKey);
    if (l2Value !== null) {
      this.stats.l2Hits++;
      // Promote to L1
      this.l1.set(fullKey, l2Value, options.ttl);
      return l2Value;
    }
    this.stats.l2Misses++;

    // L3: Upstash Redis
    if (!options.skipRemote && this.l3.isConfigured()) {
      const l3Value = await this.l3.get<T>(fullKey);
      if (l3Value !== null) {
        this.stats.l3Hits++;
        // Promote to L1 and L2
        this.l1.set(fullKey, l3Value, options.ttl);
        await this.l2.set(fullKey, l3Value, options.ttl);
        return l3Value;
      }
      this.stats.l3Misses++;
    }

    return null;
  }

  /**
   * Set value in all cache tiers
   */
  async set<T>(key: string, data: T, options: CacheOptions = {}): Promise<void> {
    const fullKey = options.prefix ? `${options.prefix}:${key}` : key;
    const ttl = options.ttl || DEFAULT_TTL;

    // Set in all tiers
    this.l1.set(fullKey, data, ttl);
    await this.l2.set(fullKey, data, ttl);
    
    if (!options.skipRemote && this.l3.isConfigured()) {
      await this.l3.set(fullKey, data, ttl);
    }

    this.stats.totalEntries = this.l1.size();
  }

  /**
   * Delete from all cache tiers
   */
  async delete(key: string, options: CacheOptions = {}): Promise<void> {
    const fullKey = options.prefix ? `${options.prefix}:${key}` : key;

    this.l1.delete(fullKey);
    await this.l2.delete(fullKey);
    
    if (!options.skipRemote && this.l3.isConfigured()) {
      await this.l3.delete(fullKey);
    }
  }

  /**
   * Cache-aside pattern: get or fetch
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const cached = await this.get<T>(key, options);
    if (cached !== null) return cached;

    const fresh = await fetcher();
    await this.set(key, fresh, options);
    return fresh;
  }

  /**
   * Invalidate cache entries by prefix
   */
  async invalidateByPrefix(prefix: string): Promise<void> {
    // L1: Filter and delete
    const keysToDelete = this.l1.keys().filter(k => k.startsWith(prefix));
    keysToDelete.forEach(k => this.l1.delete(k));

    // L2 and L3 would need pattern-based deletion (not implemented for simplicity)
    logger.info('Cache invalidated by prefix', { prefix, l1Deleted: keysToDelete.length });
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    this.l1.clear();
    await this.l2.clear();
    this.stats = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
      l3Hits: 0,
      l3Misses: 0,
      totalEntries: 0
    };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats, totalEntries: this.l1.size() };
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<number> {
    const deleted = await this.l2.cleanup();
    logger.info('Cache cleanup complete', { deletedEntries: deleted });
    return deleted;
  }

  /**
   * Configure Upstash Redis
   */
  configureRedis(url: string, token: string): void {
    this.l3.configure(url, token);
  }

  /**
   * Check if Redis is configured
   */
  isRedisConfigured(): boolean {
    return this.l3.isConfigured();
  }
}

// ============================================
// Specialized Cache Helpers
// ============================================

export const cacheService = new CacheService();

/**
 * Cache deduplication results
 */
export async function cacheDeduplicationResult(
  userId: string,
  assetCount: number,
  result: any
): Promise<void> {
  const key = `dedup:${userId}:${assetCount}`;
  await cacheService.set(key, result, { 
    ttl: 10 * 60 * 1000, // 10 minutes
    prefix: 'dedup'
  });
}

/**
 * Get cached deduplication result
 */
export async function getCachedDeduplicationResult(
  userId: string,
  assetCount: number
): Promise<any | null> {
  const key = `dedup:${userId}:${assetCount}`;
  return cacheService.get(key, { prefix: 'dedup' });
}

/**
 * Cache asset metadata for quick lookup
 */
export async function cacheAssetMetadata(
  assetId: string,
  metadata: any
): Promise<void> {
  await cacheService.set(assetId, metadata, {
    ttl: 30 * 60 * 1000, // 30 minutes
    prefix: 'asset'
  });
}

/**
 * Get cached asset metadata
 */
export async function getCachedAssetMetadata(
  assetId: string
): Promise<any | null> {
  return cacheService.get(assetId, { prefix: 'asset' });
}

/**
 * Cache global corpus counts
 */
export async function cacheCorpusStats(
  stats: { totalAssets: number; totalTokens: number; lastUpdated: string }
): Promise<void> {
  await cacheService.set('corpus-stats', stats, {
    ttl: 5 * 60 * 1000, // 5 minutes
    prefix: 'global',
    skipRemote: false // Share across devices via Redis
  });
}

/**
 * Get cached corpus stats
 */
export async function getCachedCorpusStats(): Promise<any | null> {
  return cacheService.get('corpus-stats', { prefix: 'global' });
}

export default cacheService;
