/**
 * Supabase Client Configuration
 * 
 * This module provides a typed Supabase client for database operations.
 * Environment variables must be set in .env.local:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY
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

export const isMasterConfigured = (): boolean => {
  return masterSupabase !== null
}

/**
 * Test the Supabase connection
 * Returns true if connection is successful, false otherwise
 */
export async function testSupabaseConnection(): Promise<{ 
  connected: boolean
  error?: string 
}> {
  if (!supabase) {
    return { 
      connected: false, 
      error: 'Supabase not configured. Check your .env.local file for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' 
    }
  }

  try {
    // Try to query the database - even if table doesn't exist, connection works
    const { error } = await supabase
      .from('historical_documents_global')
      .select('ASSET_ID')
      .limit(1)

    if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
      // PGRST116 = no rows, 42P01 = table doesn't exist - both mean connection works
      console.error('Supabase query error:', error.message)
      return { connected: false, error: error.message }
    }

    return { connected: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('❌ Supabase connection failed:', errorMessage)
    return { connected: false, error: errorMessage }
  }
}
