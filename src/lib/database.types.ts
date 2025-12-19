/**
 * Supabase Database Types
 * 
 * This file contains TypeScript type definitions for your Supabase database schema.
 * Generated and updated to match the current schema structure.
 * 
 * Last updated: 2025-12-19
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
      data_assets: {
        Row: {
          id: string
          asset_id: string
          document_title: string | null
          document_description: string | null
          nlp_node_categorization: string | null
          local_gis_zone: string | null
          source_collection: string | null
          rights_statement: string | null
          token_count: number
          file_size_bytes: number
          confidence_score: number | null
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          document_title?: string | null
          document_description?: string | null
          nlp_node_categorization?: string | null
          local_gis_zone?: string | null
          source_collection?: string | null
          rights_statement?: string | null
          token_count?: number
          file_size_bytes?: number
          confidence_score?: number | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          asset_id?: string
          document_title?: string | null
          document_description?: string | null
          nlp_node_categorization?: string | null
          local_gis_zone?: string | null
          source_collection?: string | null
          rights_statement?: string | null
          token_count?: number
          file_size_bytes?: number
          confidence_score?: number | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      dataset_shares: {
        Row: {
          id: string
          dataset_id: string
          shared_with: string
          shared_at: string
          permissions: string
        }
        Insert: {
          id?: string
          dataset_id: string
          shared_with: string
          shared_at?: string
          permissions?: string
        }
        Update: {
          id?: string
          dataset_id?: string
          shared_with?: string
          shared_at?: string
          permissions?: string
        }
      }
      historical_documents_global: {
        Row: {
          id: string
          created_at: string
          contributor_id: string | null
          contributed_at: string | null
          data_license: string
          contributor_nft_minted: boolean
          original_image_url: string | null
          asset_id: string | null
          document_title: string | null
          raw_ocr_transcription: string | null
          preprocess_ocr_transcription: string | null
          user_id: string | null
          alt_text_short: string | null
          alt_text_long: string | null
          audio_description: string | null
          tactile_description: string | null
          reading_order: Json | null
          accessibility_score: number
          scan_type: string
          shard_token_id: number | null
          nft_token_id: number | null
          redemption_status: string
          wallet_address: string | null
          redemption_date: string | null
          redemption_tx_hash: string | null
          shards_collected: number
          shards_required: number
          shipping_status: string | null
          tracking_number: string | null
          CONTRIBUTOR_ID: string | null
          CONTRIBUTED_AT: string | null
          DATA_LICENSE: string
          CONTRIBUTOR_NFT_MINTED: boolean
          LOCAL_TIMESTAMP: string
          OCR_DERIVED_TIMESTAMP: string | null
          NLP_DERIVED_TIMESTAMP: string | null
          LOCAL_GIS_ZONE: string | null
          OCR_DERIVED_GIS_ZONE: string | null
          NLP_DERIVED_GIS_ZONE: string | null
          NODE_COUNT: number
          NLP_NODE_CATEGORIZATION: string | null
          RAW_OCR_TRANSCRIPTION: string | null
          PREPROCESS_OCR_TRANSCRIPTION: string | null
          SOURCE_COLLECTION: string | null
          DOCUMENT_TITLE: string | null
          DOCUMENT_DESCRIPTION: string | null
          FILE_FORMAT: string | null
          FILE_SIZE_BYTES: number
          RESOLUTION_DPI: number
          COLOR_MODE: string
          CREATOR_AGENT: string | null
          RIGHTS_STATEMENT: string | null
          LANGUAGE_CODE: string
          FIXITY_CHECKSUM: string | null
          INGEST_DATE: string
          LAST_MODIFIED: string
          PROCESSING_STATUS: string
          CONFIDENCE_SCORE: number
          ENTITIES_EXTRACTED: Json
          RELATED_ASSETS: Json
          PRESERVATION_EVENTS: Json
          KEYWORDS_TAGS: Json
          ACCESS_RESTRICTIONS: boolean
          TAXONOMY: Json | null
          ITEM_ATTRIBUTES: Json | null
          SCENERY_ATTRIBUTES: Json | null
        }
        Insert: {
          id?: string
          created_at?: string
          contributor_id?: string | null
          contributed_at?: string | null
          data_license?: string
          contributor_nft_minted?: boolean
          original_image_url?: string | null
          asset_id?: string | null
          document_title?: string | null
          raw_ocr_transcription?: string | null
          preprocess_ocr_transcription?: string | null
          user_id?: string | null
          alt_text_short?: string | null
          alt_text_long?: string | null
          audio_description?: string | null
          tactile_description?: string | null
          reading_order?: Json | null
          accessibility_score?: number
          scan_type?: string
          shard_token_id?: number | null
          nft_token_id?: number | null
          redemption_status?: string
          wallet_address?: string | null
          redemption_date?: string | null
          redemption_tx_hash?: string | null
          shards_collected?: number
          shards_required?: number
          shipping_status?: string | null
          tracking_number?: string | null
          CONTRIBUTOR_ID?: string | null
          CONTRIBUTED_AT?: string | null
          DATA_LICENSE?: string
          CONTRIBUTOR_NFT_MINTED?: boolean
          LOCAL_TIMESTAMP?: string
          OCR_DERIVED_TIMESTAMP?: string | null
          NLP_DERIVED_TIMESTAMP?: string | null
          LOCAL_GIS_ZONE?: string | null
          OCR_DERIVED_GIS_ZONE?: string | null
          NLP_DERIVED_GIS_ZONE?: string | null
          NODE_COUNT?: number
          NLP_NODE_CATEGORIZATION?: string | null
          RAW_OCR_TRANSCRIPTION?: string | null
          PREPROCESS_OCR_TRANSCRIPTION?: string | null
          SOURCE_COLLECTION?: string | null
          DOCUMENT_TITLE?: string | null
          DOCUMENT_DESCRIPTION?: string | null
          FILE_FORMAT?: string | null
          FILE_SIZE_BYTES?: number
          RESOLUTION_DPI?: number
          COLOR_MODE?: string
          CREATOR_AGENT?: string | null
          RIGHTS_STATEMENT?: string | null
          LANGUAGE_CODE?: string
          FIXITY_CHECKSUM?: string | null
          INGEST_DATE?: string
          LAST_MODIFIED?: string
          PROCESSING_STATUS?: string
          CONFIDENCE_SCORE?: number
          ENTITIES_EXTRACTED?: Json
          RELATED_ASSETS?: Json
          PRESERVATION_EVENTS?: Json
          KEYWORDS_TAGS?: Json
          ACCESS_RESTRICTIONS?: boolean
          TAXONOMY?: Json | null
          ITEM_ATTRIBUTES?: Json | null
          SCENERY_ATTRIBUTES?: Json | null
        }
        Update: {
          id?: string
          created_at?: string
          contributor_id?: string | null
          contributed_at?: string | null
          data_license?: string
          contributor_nft_minted?: boolean
          original_image_url?: string | null
          asset_id?: string | null
          document_title?: string | null
          raw_ocr_transcription?: string | null
          preprocess_ocr_transcription?: string | null
          user_id?: string | null
          alt_text_short?: string | null
          alt_text_long?: string | null
          audio_description?: string | null
          tactile_description?: string | null
          reading_order?: Json | null
          accessibility_score?: number
          scan_type?: string
          shard_token_id?: number | null
          nft_token_id?: number | null
          redemption_status?: string
          wallet_address?: string | null
          redemption_date?: string | null
          redemption_tx_hash?: string | null
          shards_collected?: number
          shards_required?: number
          shipping_status?: string | null
          tracking_number?: string | null
          CONTRIBUTOR_ID?: string | null
          CONTRIBUTED_AT?: string | null
          DATA_LICENSE?: string
          CONTRIBUTOR_NFT_MINTED?: boolean
          LOCAL_TIMESTAMP?: string
          OCR_DERIVED_TIMESTAMP?: string | null
          NLP_DERIVED_TIMESTAMP?: string | null
          LOCAL_GIS_ZONE?: string | null
          OCR_DERIVED_GIS_ZONE?: string | null
          NLP_DERIVED_GIS_ZONE?: string | null
          NODE_COUNT?: number
          NLP_NODE_CATEGORIZATION?: string | null
          RAW_OCR_TRANSCRIPTION?: string | null
          PREPROCESS_OCR_TRANSCRIPTION?: string | null
          SOURCE_COLLECTION?: string | null
          DOCUMENT_TITLE?: string | null
          DOCUMENT_DESCRIPTION?: string | null
          FILE_FORMAT?: string | null
          FILE_SIZE_BYTES?: number
          RESOLUTION_DPI?: number
          COLOR_MODE?: string
          CREATOR_AGENT?: string | null
          RIGHTS_STATEMENT?: string | null
          LANGUAGE_CODE?: string
          FIXITY_CHECKSUM?: string | null
          INGEST_DATE?: string
          LAST_MODIFIED?: string
          PROCESSING_STATUS?: string
          CONFIDENCE_SCORE?: number
          ENTITIES_EXTRACTED?: Json
          RELATED_ASSETS?: Json
          PRESERVATION_EVENTS?: Json
          KEYWORDS_TAGS?: Json
          ACCESS_RESTRICTIONS?: boolean
          TAXONOMY?: Json | null
          ITEM_ATTRIBUTES?: Json | null
          SCENERY_ATTRIBUTES?: Json | null
        }
      }
      object_attributes: {
        Row: {
          id: string
          asset_id: string
          taxonomy_id: string | null
          common_name: string | null
          scientific_name: string | null
          confidence_score: number | null
          material: string[] | null
          technique: string[] | null
          maker_or_artist: string | null
          maker_role: string | null
          manufacturer: string | null
          production_date: string | null
          period_or_style: string | null
          dimensions: Json | null
          condition: string | null
          inscriptions_or_marks: string[] | null
          architectural_style: string[] | null
          construction_date: string | null
          architect_or_builder: string | null
          site_type: string | null
          gps_accuracy_meters: number | null
          cultural_significance: string | null
          provenance_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          taxonomy_id?: string | null
          common_name?: string | null
          scientific_name?: string | null
          confidence_score?: number | null
          material?: string[] | null
          technique?: string[] | null
          maker_or_artist?: string | null
          maker_role?: string | null
          manufacturer?: string | null
          production_date?: string | null
          period_or_style?: string | null
          dimensions?: Json | null
          condition?: string | null
          inscriptions_or_marks?: string[] | null
          architectural_style?: string[] | null
          construction_date?: string | null
          architect_or_builder?: string | null
          site_type?: string | null
          gps_accuracy_meters?: number | null
          cultural_significance?: string | null
          provenance_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          asset_id?: string
          taxonomy_id?: string | null
          common_name?: string | null
          scientific_name?: string | null
          confidence_score?: number | null
          material?: string[] | null
          technique?: string[] | null
          maker_or_artist?: string | null
          maker_role?: string | null
          manufacturer?: string | null
          production_date?: string | null
          period_or_style?: string | null
          dimensions?: Json | null
          condition?: string | null
          inscriptions_or_marks?: string[] | null
          architectural_style?: string[] | null
          construction_date?: string | null
          architect_or_builder?: string | null
          site_type?: string | null
          gps_accuracy_meters?: number | null
          cultural_significance?: string | null
          provenance_notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      package_assets: {
        Row: {
          id: string
          package_id: string | null
          asset_id: string | null
          added_at: string
        }
        Insert: {
          id?: string
          package_id?: string | null
          asset_id?: string | null
          added_at?: string
        }
        Update: {
          id?: string
          package_id?: string | null
          asset_id?: string | null
          added_at?: string
        }
      }
      packages: {
        Row: {
          id: string
          package_name: string
          package_type: string
          grouping_key: string
          description: string | null
          base_price_cents: number
          price_per_asset_cents: number
          total_assets: number
          total_tokens: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          package_name: string
          package_type: string
          grouping_key: string
          description?: string | null
          base_price_cents: number
          price_per_asset_cents?: number
          total_assets?: number
          total_tokens?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          package_name?: string
          package_type?: string
          grouping_key?: string
          description?: string | null
          base_price_cents?: number
          price_per_asset_cents?: number
          total_assets?: number
          total_tokens?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      taxonomy: {
        Row: {
          id: string
          taxon_rank: string
          name: string
          parent_id: string | null
          gbif_id: number | null
          inaturalist_taxon_id: number | null
          wikidata_qid: string | null
          created_at: string
        }
        Insert: {
          id?: string
          taxon_rank: string
          name: string
          parent_id?: string | null
          gbif_id?: number | null
          inaturalist_taxon_id?: number | null
          wikidata_qid?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          taxon_rank?: string
          name?: string
          parent_id?: string | null
          gbif_id?: number | null
          inaturalist_taxon_id?: number | null
          wikidata_qid?: string | null
          created_at?: string
        }
      }
      user_asset_access: {
        Row: {
          id: string
          user_id: string | null
          asset_id: string | null
          source_purchase_id: string | null
          granted_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          asset_id?: string | null
          source_purchase_id?: string | null
          granted_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          asset_id?: string | null
          source_purchase_id?: string | null
          granted_at?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          email: string | null
          display_name: string | null
          wallet_address: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          display_name?: string | null
          wallet_address?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          display_name?: string | null
          wallet_address?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      user_purchases: {
        Row: {
          id: string
          user_id: string | null
          package_id: string | null
          purchase_type: string
          original_asset_count: number | null
          purchased_asset_count: number | null
          duplicate_count: number
          price_paid_cents: number
          transaction_hash: string | null
          purchased_at: string
          metadata: Json | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          package_id?: string | null
          purchase_type: string
          original_asset_count?: number | null
          purchased_asset_count?: number | null
          duplicate_count?: number
          price_paid_cents: number
          transaction_hash?: string | null
          purchased_at?: string
          metadata?: Json | null
        }
        Update: {
          id?: string
          user_id?: string | null
          package_id?: string | null
          purchase_type?: string
          original_asset_count?: number | null
          purchased_asset_count?: number | null
          duplicate_count?: number
          price_paid_cents?: number
          transaction_hash?: string | null
          purchased_at?: string
          metadata?: Json | null
        }
      }
      web3_transactions: {
        Row: {
          id: string
          user_id: string | null
          asset_id: string | null
          tx_hash: string
          details: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          asset_id?: string | null
          tx_hash: string
          details?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          asset_id?: string | null
          tx_hash?: string
          details?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_user_account: {
        Args: Record<string, never>
        Returns: void
      }
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

export type DataAsset = Database['public']['Tables']['data_assets']['Row']
export type DataAssetInsert = Database['public']['Tables']['data_assets']['Insert']
export type DataAssetUpdate = Database['public']['Tables']['data_assets']['Update']

export type UserProfile = Database['public']['Tables']['user_profiles']['Row']
export type UserProfileInsert = Database['public']['Tables']['user_profiles']['Insert']
export type UserProfileUpdate = Database['public']['Tables']['user_profiles']['Update']

export type Package = Database['public']['Tables']['packages']['Row']
export type PackageInsert = Database['public']['Tables']['packages']['Insert']
export type PackageUpdate = Database['public']['Tables']['packages']['Update']

export type UserPurchase = Database['public']['Tables']['user_purchases']['Row']
export type UserPurchaseInsert = Database['public']['Tables']['user_purchases']['Insert']
export type UserPurchaseUpdate = Database['public']['Tables']['user_purchases']['Update']

export type Taxonomy = Database['public']['Tables']['taxonomy']['Row']
export type TaxonomyInsert = Database['public']['Tables']['taxonomy']['Insert']
export type TaxonomyUpdate = Database['public']['Tables']['taxonomy']['Update']

export type ObjectAttributes = Database['public']['Tables']['object_attributes']['Row']
export type ObjectAttributesInsert = Database['public']['Tables']['object_attributes']['Insert']
export type ObjectAttributesUpdate = Database['public']['Tables']['object_attributes']['Update']
