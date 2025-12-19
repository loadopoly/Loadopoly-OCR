/**
 * Supabase Database Types
 * 
 * This file contains TypeScript type definitions for your Supabase database schema.
 * To generate accurate types from your actual schema, run:
 * npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      historical_documents_global: {
        Row: {
          ASSET_ID: string
          DOCUMENT_TITLE: string
          RAW_OCR_TRANSCRIPTION: string | null
          LOCAL_TIMESTAMP: string
          ENTITIES_EXTRACTED: Json | null
          KEYWORDS_TAGS: Json | null
          PRESERVATION_EVENTS: Json | null
          FILE_FORMAT: string | null
          DATA_LICENSE: string | null
          CONTRIBUTOR_ID: string | null
          CONTRIBUTED_AT: string | null
          original_image_url: string | null
          user_id: string | null
          created_at: string
        }
        Insert: {
          ASSET_ID: string
          DOCUMENT_TITLE: string
          RAW_OCR_TRANSCRIPTION?: string | null
          LOCAL_TIMESTAMP?: string
          ENTITIES_EXTRACTED?: Json | null
          KEYWORDS_TAGS?: Json | null
          PRESERVATION_EVENTS?: Json | null
          FILE_FORMAT?: string | null
          DATA_LICENSE?: string | null
          CONTRIBUTOR_ID?: string | null
          CONTRIBUTED_AT?: string | null
          original_image_url?: string | null
          user_id?: string | null
          created_at?: string
        }
        Update: {
          ASSET_ID?: string
          DOCUMENT_TITLE?: string
          RAW_OCR_TRANSCRIPTION?: string | null
          LOCAL_TIMESTAMP?: string
          ENTITIES_EXTRACTED?: Json | null
          KEYWORDS_TAGS?: Json | null
          PRESERVATION_EVENTS?: Json | null
          FILE_FORMAT?: string | null
          DATA_LICENSE?: string | null
          CONTRIBUTOR_ID?: string | null
          CONTRIBUTED_AT?: string | null
          original_image_url?: string | null
          user_id?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types for easier usage
export type HistoricalDocument = Database['public']['Tables']['historical_documents_global']['Row']
export type HistoricalDocumentInsert = Database['public']['Tables']['historical_documents_global']['Insert']
export type HistoricalDocumentUpdate = Database['public']['Tables']['historical_documents_global']['Update']
