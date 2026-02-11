/**
 * Supabase Client Configuration
 * 
 * This module provides typed Supabase clients for database operations.
 * Supports dual-client mode: a user-facing client and a Loadopoly master client.
 * 
 * Environment variables (set in .env.local):
 * - VITE_SUPABASE_URL             — Primary Supabase URL (may be user-provided)
 * - VITE_SUPABASE_ANON_KEY        — Primary Supabase anon key
 * - VITE_LOADOPOLY_SUPABASE_URL   — (Optional) Loadopoly master DB URL
 * - VITE_LOADOPOLY_SUPABASE_ANON_KEY — (Optional) Loadopoly master DB anon key
 * 
 * When the LOADOPOLY_ vars are set and differ from the primary, dual-write mode
 * activates: every mutation is persisted to both the master and user databases.
 * When they are NOT set, the primary client is assumed to BE the Loadopoly DB.
 * 
 * @module supabaseClient
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from './database.types'

const getEnvVar = (key: string): string => {
  // Vite environment variables
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    // @ts-ignore
    return import.meta.env[key]
  }
  // Node.js environment variables (for API routes)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key]
  }
  return ''
}

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL')
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY')

// Loadopoly master database credentials (always persists a copy)
const masterUrl = getEnvVar('VITE_LOADOPOLY_SUPABASE_URL')
const masterKey = getEnvVar('VITE_LOADOPOLY_SUPABASE_ANON_KEY')

// Create typed Supabase client (may be user-provided or Loadopoly's own)
export const supabase = 
  supabaseUrl && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey)
    : null;

/**
 * Master Loadopoly Supabase client.
 * 
 * If VITE_LOADOPOLY_SUPABASE_URL / VITE_LOADOPOLY_SUPABASE_ANON_KEY are set,
 * this is a separate client that always points to the canonical Loadopoly DB.
 * If they are NOT set, falls back to the primary `supabase` client (i.e. the
 * user hasn't overridden the database and the primary already IS Loadopoly).
 * 
 * This guarantees every write is persisted to Loadopoly regardless of whether
 * a user has configured their own Supabase instance.
 */
export const masterSupabase: SupabaseClient<Database> | null =
  masterUrl && masterKey
    ? createClient<Database>(masterUrl, masterKey)
    : supabase; // fallback: primary client IS the master

/**
 * Returns true when the master client is a *different* instance from the
 * user-facing client, meaning dual-write is required.
 */
export const isDualWriteRequired = (): boolean => {
  return Boolean(masterUrl && masterKey && masterUrl !== supabaseUrl)
}

// Connection status helper
export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

/** Returns true if the Loadopoly master client is available (always true unless no DB is configured at all). */
export const isMasterConfigured = (): boolean => {
  return masterSupabase !== null
}

/**
 * Test the Supabase connection and perform pre-flight schema validation
 * Returns true if connection is successful, false otherwise
 */
export async function testSupabaseConnection(): Promise<{ 
  connected: boolean
  error?: string
  schemaIssues?: string[]
}> {
  if (!supabase) {
    return { 
      connected: false, 
      error: 'Supabase not configured. Check your .env.local file for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' 
    }
  }

  try {
    const schemaIssues: string[] = [];

    // Test 1: Basic connection with historical_documents_global
    const { error: docError } = await supabase
      .from('historical_documents_global')
      .select('ASSET_ID')
      .limit(1)

    if (docError && docError.code !== 'PGRST116' && docError.code !== '42P01') {
      // PGRST116 = no rows, 42P01 = table doesn't exist - both mean connection works
      console.error('Supabase query error:', docError.message)
      return { connected: false, error: docError.message }
    }

    // Test 2: Pre-flight check - Verify user_avatars table structure
    const { data: avatarCheck, error: avatarError } = await supabase
      .from('user_avatars')
      .select('ID, USER_ID')
      .limit(0) // Don't fetch actual data, just test the schema

    if (avatarError) {
      if (avatarError.code === '42P01') {
        // Table doesn't exist
        schemaIssues.push('⚠️ CRITICAL: user_avatars table missing. Run migration: sql/CONSOLIDATED_SCHEMA.sql');
        console.error('🔴 [Schema Check] user_avatars table does not exist');
      } else if (avatarError.message?.includes('column') || avatarError.code === '42703') {
        // Column mismatch (likely lowercase vs uppercase issue)
        schemaIssues.push('⚠️ CRITICAL: user_avatars schema mismatch detected. Expected columns: "ID", "USER_ID" (quoted uppercase). Run migration: FIX_SCHEMA_AND_TRIGGERS.sql');
        console.error('🔴 [Schema Check] user_avatars column mismatch:', avatarError.message);
      } else if (avatarError.code !== 'PGRST116') {
        // Some other error
        schemaIssues.push(`⚠️ user_avatars table check failed: ${avatarError.message}`);
      }
    }

    // Test 3: Verify processing_queue table exists (core functionality)
    const { error: queueError } = await supabase
      .from('processing_queue')
      .select('ID')
      .limit(0)

    if (queueError && queueError.code === '42P01') {
      schemaIssues.push('⚠️ WARNING: processing_queue table missing. Background OCR will not work. Run: sql/CONSOLIDATED_SCHEMA.sql');
      console.warn('🟡 [Schema Check] processing_queue table does not exist');
    }

    // Log schema issues prominently
    if (schemaIssues.length > 0) {
      console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.warn('🔧 DATABASE SCHEMA ISSUES DETECTED');
      console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      schemaIssues.forEach(issue => console.warn(issue));
      console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    return { 
      connected: true,
      schemaIssues: schemaIssues.length > 0 ? schemaIssues : undefined
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('❌ Supabase connection failed:', errorMessage)
    return { connected: false, error: errorMessage }
  }
}
