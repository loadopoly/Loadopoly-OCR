/**
 * DuckDB-WASM In-Browser Analytical Engine
 *
 * Loads exported Parquet files from Bakugo's Parquet lakehouse or Supabase
 * Storage and runs sub-second OLAP aggregations entirely client-side using
 * DuckDB-WASM.  No server roundtrips required for analytical queries.
 *
 * Usage:
 * ```ts
 * const db = await initDuckDB();
 * await loadParquet(db, 'https://bakugo.loadopoly.com/parquet/scans.parquet', 'scans');
 * const summary = await queryScanSummary(db);
 * closeDuckDB(db);
 * ```
 *
 * @module duckdbAnalytics
 */

import * as duckdb from '@duckdb/duckdb-wasm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyticsResult {
  columns: string[];
  rows: Record<string, unknown>[];
  elapsed_ms: number;
}

export interface ScanSummary {
  total_scans: number;
  distinct_cards: number;
  avg_centering: number | null;
  min_centering: number | null;
  max_centering: number | null;
}

export interface CorpusStats {
  total_assets: number;
  total_processed: number;
  total_pending: number;
  avg_confidence: number | null;
}

export interface TimeSeriesPoint {
  period: string;
  count: number;
  avg_centering: number | null;
}

// ---------------------------------------------------------------------------
// Singleton management
// ---------------------------------------------------------------------------

let _db: duckdb.AsyncDuckDB | null = null;
let _conn: duckdb.AsyncDuckDBConnection | null = null;

/**
 * Lazily initialise a DuckDB-WASM instance.
 *
 * Uses the CDN-hosted bundles so we don't need to ship the ~3 MB WASM
 * binary in our own bundle.  The worker is created once and reused.
 */
export async function initDuckDB(): Promise<duckdb.AsyncDuckDB> {
  if (_db) return _db;

  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

  // Select the best bundle for this browser (eh = Extension Headers).
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], {
      type: 'text/javascript',
    })
  );

  const worker = new Worker(worker_url);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  URL.revokeObjectURL(worker_url);

  _db = db;
  return db;
}

/**
 * Get or create a reusable connection.
 */
async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (_conn) return _conn;
  const db = await initDuckDB();
  _conn = await db.connect();
  return _conn;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

/**
 * Register a remote Parquet file as a named table.
 *
 * @param url  - Public URL of the Parquet file (e.g. from Bakugo's lakehouse
 *               served through Cloudflare Tunnel, or a Supabase Storage URL).
 * @param tableName - SQL table name to register (e.g. `'scans'`).
 */
export async function loadParquet(
  url: string,
  tableName: string
): Promise<void> {
  const conn = await getConnection();
  await conn.query(`
    CREATE OR REPLACE TABLE ${tableName} AS
    SELECT * FROM read_parquet('${url}')
  `);
}

/**
 * Register an in-memory Arrow table from a `Uint8Array` buffer.
 */
export async function loadParquetBuffer(
  buffer: Uint8Array,
  tableName: string
): Promise<void> {
  const db = await initDuckDB();
  await db.registerFileBuffer(`${tableName}.parquet`, buffer);
  const conn = await getConnection();
  await conn.query(`
    CREATE OR REPLACE TABLE ${tableName} AS
    SELECT * FROM read_parquet('${tableName}.parquet')
  `);
}

// ---------------------------------------------------------------------------
// Generic query runner
// ---------------------------------------------------------------------------

/**
 * Execute an arbitrary SQL query and return structured results.
 */
export async function runQuery(sql: string): Promise<AnalyticsResult> {
  const conn = await getConnection();
  const t0 = performance.now();
  const result = await conn.query(sql);

  const columns = result.schema.fields.map((f) => f.name);
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < result.numRows; i++) {
    const row: Record<string, unknown> = {};
    for (const col of columns) {
      row[col] = result.getChildAt(columns.indexOf(col))?.get(i) ?? null;
    }
    rows.push(row);
  }

  return {
    columns,
    rows,
    elapsed_ms: Math.round(performance.now() - t0),
  };
}

// ---------------------------------------------------------------------------
// Pre-built analytical queries
// ---------------------------------------------------------------------------

/**
 * Aggregate scan statistics from the Bakugo scans Parquet table.
 * Requires `loadParquet(url, 'scans')` to have been called first.
 */
export async function queryScanSummary(): Promise<ScanSummary> {
  const result = await runQuery(`
    SELECT
      COUNT(*)                       AS total_scans,
      COUNT(DISTINCT phash)          AS distinct_cards,
      ROUND(AVG(worst_ratio_pct), 2) AS avg_centering,
      ROUND(MIN(worst_ratio_pct), 2) AS min_centering,
      ROUND(MAX(worst_ratio_pct), 2) AS max_centering
    FROM scans
  `);

  const r = result.rows[0] ?? {};
  return {
    total_scans: (r.total_scans as number) ?? 0,
    distinct_cards: (r.distinct_cards as number) ?? 0,
    avg_centering: (r.avg_centering as number) ?? null,
    min_centering: (r.min_centering as number) ?? null,
    max_centering: (r.max_centering as number) ?? null,
  };
}

/**
 * Corpus-level statistics over Loadopoly-OCR's document assets.
 * Requires a table named `'assets'` to be registered.
 */
export async function queryCorpusStats(): Promise<CorpusStats> {
  const result = await runQuery(`
    SELECT
      COUNT(*)                                              AS total_assets,
      COUNT(*) FILTER (WHERE status = 'COMPLETE')           AS total_processed,
      COUNT(*) FILTER (WHERE status IN ('PENDING','QUEUE')) AS total_pending,
      ROUND(AVG(CASE WHEN confidence IS NOT NULL
                     THEN confidence END), 3)               AS avg_confidence
    FROM assets
  `);

  const r = result.rows[0] ?? {};
  return {
    total_assets: (r.total_assets as number) ?? 0,
    total_processed: (r.total_processed as number) ?? 0,
    total_pending: (r.total_pending as number) ?? 0,
    avg_confidence: (r.avg_confidence as number) ?? null,
  };
}

/**
 * Time-series activity from the scans table.
 */
export async function queryTimeSeriesActivity(
  granularity: 'day' | 'week' | 'month' = 'day'
): Promise<TimeSeriesPoint[]> {
  const trunc = granularity === 'day' ? 'DAY'
              : granularity === 'week' ? 'WEEK'
              : 'MONTH';

  const result = await runQuery(`
    SELECT
      DATE_TRUNC('${trunc}', to_timestamp(created_at))::VARCHAR AS period,
      COUNT(*)                                                  AS count,
      ROUND(AVG(worst_ratio_pct), 2)                            AS avg_centering
    FROM scans
    GROUP BY 1
    ORDER BY 1
  `);

  return result.rows.map((r) => ({
    period: (r.period as string) ?? '',
    count: (r.count as number) ?? 0,
    avg_centering: (r.avg_centering as number) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Cross-corpus federated query
// ---------------------------------------------------------------------------

/**
 * Federated query joining Bakugo scans with Loadopoly-OCR assets.
 * Both tables must be loaded first via `loadParquet()`.
 */
export async function queryCrossCorpusSummary(): Promise<AnalyticsResult> {
  return runQuery(`
    SELECT
      'bakugo'     AS source,
      COUNT(*)     AS total_records,
      'scans'      AS record_type
    FROM scans
    UNION ALL
    SELECT
      'loadopoly'  AS source,
      COUNT(*)     AS total_records,
      'assets'     AS record_type
    FROM assets
  `);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Close the DuckDB connection and terminate the worker.
 */
export function closeDuckDB(): void {
  if (_conn) {
    _conn.close();
    _conn = null;
  }
  if (_db) {
    _db.terminate();
    _db = null;
  }
}

/**
 * Check whether DuckDB-WASM is available (SharedArrayBuffer required).
 */
export function isDuckDBAvailable(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}
