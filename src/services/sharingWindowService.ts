/**
 * Sharing Window Service
 *
 * Provides CRUD operations and query helpers for `data_sharing_windows`.
 * A sharing window is a named date range that a power user attaches a
 * sharing policy ('shareable' | 'locked' | 'seed') to. Documents whose
 * OCR-derived or ingested timestamp falls within the window inherit the
 * window's policy when access-control decisions are made.
 *
 * Key public helpers:
 *  - createWindow      — create a new sharing window
 *  - updateWindow      — update label, dates, status, or visibility
 *  - deleteWindow      — delete a window (documents are unaffected)
 *  - listWindows       — list all windows owned by the current user
 *  - getWindowsForDate — find windows whose range covers a given date
 *  - isDocumentShareable — returns true if a document's date falls in any
 *                          'shareable' or 'seed' window for its owner
 *  - getShareableDocumentsForPeriod — IDs of shareable documents in a range
 *  - effectiveStatusForDate — most-restrictive status for a date+owner combo
 *
 * @module sharingWindowService
 */

import { supabase } from '../lib/supabaseClient';
import { logger } from '../lib/logger';
import type { SharingWindow, SharingStatus } from '../types';
import type {
  SharingWindowInsert,
  SharingWindowUpdate,
} from '../lib/database.types';

// ============================================================
// Internal helpers
// ============================================================

/** Map a DB row to the camelCase SharingWindow domain type. */
function rowToWindow(row: Record<string, unknown>): SharingWindow {
  return {
    id:              row.id as string,
    userId:          row.user_id as string,
    label:           row.label as string,
    startDate:       (row.start_date as string) ?? null,
    endDate:         (row.end_date as string) ?? null,
    sharingStatus:   row.sharing_status as SharingStatus,
    visibility:      row.visibility as SharingWindow['visibility'],
    communityId:     (row.community_id as string) ?? undefined,
    licenseOverride: (row.license_override as string) ?? undefined,
    createdAt:       row.created_at as string,
    updatedAt:       row.updated_at as string,
  };
}

// ============================================================
// CRUD operations
// ============================================================

/**
 * Create a new sharing window for the currently authenticated user.
 *
 * @param params - Window parameters (label, dates, status, visibility)
 * @returns The created SharingWindow or null on failure
 */
export async function createWindow(
  params: Omit<SharingWindowInsert, 'user_id'>,
): Promise<SharingWindow | null> {
  if (!supabase) {
    logger.error('[SharingWindow] Supabase client is not configured', { module: 'sharingWindow' });
    return null;
  }

  const { data, error } = await supabase
    .from('data_sharing_windows')
    .insert({ ...params })
    .select()
    .single();

  if (error) {
    logger.error(`[SharingWindow] Failed to create window: ${error.message}`, {
      module: 'sharingWindow',
    });
    return null;
  }

  return rowToWindow(data as Record<string, unknown>);
}

/**
 * Update an existing sharing window.
 * RLS ensures only the owner can mutate their own windows.
 *
 * @param id     - UUID of the window to update
 * @param patch  - Partial fields to update
 * @returns The updated SharingWindow or null on failure
 */
export async function updateWindow(
  id: string,
  patch: Omit<SharingWindowUpdate, 'id' | 'user_id'>,
): Promise<SharingWindow | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('data_sharing_windows')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logger.error(`[SharingWindow] Failed to update window ${id}: ${error.message}`, {
      module: 'sharingWindow',
    });
    return null;
  }

  return rowToWindow(data as Record<string, unknown>);
}

/**
 * Delete a sharing window by ID.
 * Documents that were within the window are unaffected; they simply lose
 * their window-derived policy and default back to 'locked'.
 *
 * @param id - UUID of the window to delete
 * @returns true on success
 */
export async function deleteWindow(id: string): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('data_sharing_windows')
    .delete()
    .eq('id', id);

  if (error) {
    logger.error(`[SharingWindow] Failed to delete window ${id}: ${error.message}`, {
      module: 'sharingWindow',
    });
    return false;
  }

  return true;
}

/**
 * List all sharing windows visible to the current session.
 * Includes the user's own windows plus any community/public windows.
 *
 * @returns Ordered array of SharingWindow (newest first)
 */
export async function listWindows(): Promise<SharingWindow[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('data_sharing_windows')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error(`[SharingWindow] Failed to list windows: ${error.message}`, {
      module: 'sharingWindow',
    });
    return [];
  }

  return (data as Record<string, unknown>[]).map(rowToWindow);
}

// ============================================================
// Query helpers
// ============================================================

/**
 * Find all sharing windows whose date range covers the given date.
 *
 * @param date    - ISO 8601 timestamp to check
 * @param userId  - (optional) Restrict to windows owned by this user
 * @returns Array of matching SharingWindow objects
 */
export async function getWindowsForDate(
  date: string,
  userId?: string,
): Promise<SharingWindow[]> {
  if (!supabase) return [];

  let query = supabase
    .from('data_sharing_windows')
    .select('*')
    .or(`start_date.is.null,start_date.lte.${date}`)
    .or(`end_date.is.null,end_date.gte.${date}`);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) {
    logger.warn(`[SharingWindow] getWindowsForDate failed: ${error.message}`, {
      module: 'sharingWindow',
    });
    return [];
  }

  return (data as Record<string, unknown>[]).map(rowToWindow);
}

/**
 * Determine the most-restrictive effective sharing status for a document
 * given the owner's windows.
 * Priority (most → least restrictive): locked > seed > shareable.
 * If no windows match, defaults to 'locked'.
 *
 * @param ownerId - UUID of the document's owner
 * @param docDate - ISO 8601 timestamp of the document
 * @returns Effective SharingStatus
 */
export async function effectiveStatusForDate(
  ownerId: string,
  docDate: string,
): Promise<SharingStatus> {
  if (!supabase) return 'locked';

  // Use the server-side helper function for efficiency
  const { data, error } = await (supabase as any).rpc(
    'get_sharing_status_for_document',
    { p_user_id: ownerId, p_doc_date: docDate },
  );

  if (error) {
    logger.warn(
      `[SharingWindow] effectiveStatusForDate RPC failed: ${error.message}`,
      { module: 'sharingWindow' },
    );
    return 'locked';
  }

  return (data ?? 'locked') as SharingStatus;
}

/**
 * Returns true when a document is allowed to leave the owner's local
 * device and be written to the cloud (i.e. status is 'shareable' or 'seed').
 *
 * @param ownerId - UUID of the document owner
 * @param docDate - ISO 8601 timestamp of the document (INGEST_DATE or LOCAL_TIMESTAMP)
 */
export async function isDocumentShareable(
  ownerId: string,
  docDate: string,
): Promise<boolean> {
  const status = await effectiveStatusForDate(ownerId, docDate);
  return status === 'shareable' || status === 'seed';
}

/**
 * Returns the IDs of documents owned by `ownerId` whose dates fall within
 * [startDate, endDate] AND whose effective status is 'shareable' or 'seed'.
 *
 * This is used by the seed-dataset creation flow to select eligible documents.
 *
 * @param ownerId   - UUID of the document owner
 * @param startDate - ISO 8601 start of the period (inclusive)
 * @param endDate   - ISO 8601 end of the period (inclusive)
 * @returns Array of document UUIDs
 */
export async function getShareableDocumentsForPeriod(
  ownerId: string,
  startDate: string,
  endDate: string,
): Promise<string[]> {
  if (!supabase) return [];

  // Step 1: find all windows for this user that are shareable/seed and overlap the range
  const { data: windows, error: wErr } = await supabase
    .from('data_sharing_windows')
    .select('start_date, end_date')
    .eq('user_id', ownerId)
    .in('sharing_status', ['shareable', 'seed']);

  if (wErr || !windows?.length) return [];

  // Step 2: fetch documents in the requested period whose dates overlap a window
  // We query the historical_documents_global table for the user's documents
  const { data: docs, error: dErr } = await supabase
    .from('historical_documents_global')
    .select('"ID", "INGEST_DATE", "LOCAL_TIMESTAMP"')
    .eq('"USER_ID"', ownerId)
    .gte('"INGEST_DATE"', startDate)
    .lte('"INGEST_DATE"', endDate);

  if (dErr || !docs?.length) return [];

  // Step 3: filter locally by window coverage
  return (docs as Array<Record<string, unknown>>)
    .filter(doc => {
      const docDate = (doc['INGEST_DATE'] ?? doc['LOCAL_TIMESTAMP']) as string;
      if (!docDate) return false;
      return (windows as Array<Record<string, unknown>>).some(w => {
        const start = w['start_date'] as string | null;
        const end   = w['end_date']   as string | null;
        const after  = !start || docDate >= start;
        const before = !end   || docDate <= end;
        return after && before;
      });
    })
    .map(doc => doc['ID'] as string);
}
