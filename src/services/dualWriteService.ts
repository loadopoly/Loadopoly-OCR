/**
 * Dual-Write Service
 *
 * Ensures every write operation is persisted to the Loadopoly master database,
 * even when the user has configured their own Supabase instance as the primary.
 *
 * Strategy:
 *  1. The master write (Loadopoly DB) is ALWAYS attempted first with retries.
 *  2. The user-DB write proceeds independently — its failure is non-fatal.
 *  3. When the user *hasn't* overridden the DB, both clients are the same
 *     instance and only one write occurs (no duplication).
 *
 * @module dualWriteService
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  supabase,
  masterSupabase,
  isDualWriteRequired,
} from '../lib/supabaseClient';
import { logger } from '../lib/logger';

// ============================================
// Types
// ============================================

export interface DualWriteResult {
  /** Whether the master (Loadopoly) write succeeded */
  master: boolean;
  /** Whether the user-DB write succeeded (null = not attempted) */
  user: boolean | null;
  /** Error details keyed by target */
  errors: Record<string, string>;
}

// ============================================
// Internal helpers
// ============================================

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Attempt a single upsert against a given Supabase client with retries.
 */
async function writeWithRetry(
  client: SupabaseClient,
  table: string,
  record: Record<string, unknown>,
  label: string,
): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { error } = await (client as any)
        .from(table)
        .upsert(record, { onConflict: 'ASSET_ID' });

      if (error) throw error;

      logger.debug(`[DualWrite] ${label} write succeeded (attempt ${attempt})`, {
        module: 'dualWrite',
        operation: 'upsert',
      });
      return { ok: true };
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      logger.warn(
        `[DualWrite] ${label} write failed (attempt ${attempt}/${MAX_RETRIES}): ${msg}`,
        { module: 'dualWrite', operation: 'upsert' },
      );

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt); // linear back-off
      }
    }
  }

  return { ok: false, error: `${label} write exhausted ${MAX_RETRIES} retries` };
}

// ============================================
// Public API
// ============================================

/**
 * Upsert a record to both the Loadopoly master DB and the user's DB.
 *
 * - Master write always happens first with retries.
 * - If `isDualWriteRequired()` is false the two clients are identical and
 *   only one physical write occurs.
 */
export async function dualWriteUpsert(
  table: string,
  record: Record<string, unknown>,
): Promise<DualWriteResult> {
  const result: DualWriteResult = {
    master: false,
    user: null,
    errors: {},
  };

  // --- 1. Master (Loadopoly) write — mandatory ---
  if (!masterSupabase) {
    const msg = 'Master Supabase client is not configured';
    logger.error(`[DualWrite] CRITICAL: ${msg}`, { module: 'dualWrite' });
    result.errors.master = msg;
    return result;
  }

  const masterResult = await writeWithRetry(masterSupabase, table, record, 'Master');
  result.master = masterResult.ok;
  if (!masterResult.ok) {
    result.errors.master = masterResult.error!;
    logger.error(
      `[DualWrite] CRITICAL: Failed to persist to Loadopoly master DB (ASSET_ID=${record.ASSET_ID})`,
      { module: 'dualWrite' },
    );
  }

  // --- 2. User DB write — only when they have a separate instance ---
  if (isDualWriteRequired() && supabase) {
    const userResult = await writeWithRetry(supabase, table, record, 'User');
    result.user = userResult.ok;
    if (!userResult.ok) {
      result.errors.user = userResult.error!;
      // Non-fatal: user DB failure should not block the workflow
      logger.warn(
        `[DualWrite] User-DB write failed for ASSET_ID=${record.ASSET_ID}. ` +
        'Data is safe in master.',
        { module: 'dualWrite' },
      );
    }
  }

  return result;
}

/**
 * Insert a record to both DBs (no upsert / no conflict resolution).
 * Same dual-write semantics as `dualWriteUpsert`.
 */
export async function dualWriteInsert(
  table: string,
  record: Record<string, unknown>,
): Promise<DualWriteResult> {
  const result: DualWriteResult = {
    master: false,
    user: null,
    errors: {},
  };

  if (!masterSupabase) {
    result.errors.master = 'Master Supabase client is not configured';
    return result;
  }

  // Master insert
  try {
    const { error } = await (masterSupabase as any).from(table).insert(record);
    if (error) throw error;
    result.master = true;
  } catch (err: any) {
    result.master = false;
    result.errors.master = err?.message ?? String(err);
    logger.error(
      `[DualWrite] CRITICAL: Master insert failed for table=${table}`,
      { module: 'dualWrite' },
    );
  }

  // User insert (only when separate instance)
  if (isDualWriteRequired() && supabase) {
    try {
      const { error } = await (supabase as any).from(table).insert(record);
      if (error) throw error;
      result.user = true;
    } catch (err: any) {
      result.user = false;
      result.errors.user = err?.message ?? String(err);
      logger.warn(`[DualWrite] User-DB insert failed for table=${table}`, {
        module: 'dualWrite',
      });
    }
  }

  return result;
}
