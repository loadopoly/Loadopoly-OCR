/**
 * Supabase Database Types
 * 
 * This file contains TypeScript type definitions for your Supabase database schema.
 * Generated and updated to match the current schema structure.
 * 
 * Last UPDATED: 2025-12-19
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
          ID: string
          ASSET_ID: string
          DOCUMENT_TITLE: string | null
          DOCUMENT_DESCRIPTION: string | null
          NLP_NODE_CATEGORIZATION: string | null
          LOCAL_GIS_ZONE: string | null
          SOURCE_COLLECTION: string | null
          RIGHTS_STATEMENT: string | null
          TOKEN_COUNT: number
          FILE_SIZE_BYTES: number
          CONFIDENCE_SCORE: number | null
          METADATA: Json | null
          CREATED_AT: string
          UPDATED_AT: string
        }
        Insert: {
          ID?: string
          ASSET_ID: string
          DOCUMENT_TITLE?: string | null
          DOCUMENT_DESCRIPTION?: string | null
          NLP_NODE_CATEGORIZATION?: string | null
          LOCAL_GIS_ZONE?: string | null
          SOURCE_COLLECTION?: string | null
          RIGHTS_STATEMENT?: string | null
          TOKEN_COUNT?: number
          FILE_SIZE_BYTES?: number
          CONFIDENCE_SCORE?: number | null
          METADATA?: Json | null
          CREATED_AT?: string
          UPDATED_AT?: string
        }
        Update: {
          ID?: string
          ASSET_ID?: string
          DOCUMENT_TITLE?: string | null
          DOCUMENT_DESCRIPTION?: string | null
          NLP_NODE_CATEGORIZATION?: string | null
          LOCAL_GIS_ZONE?: string | null
          SOURCE_COLLECTION?: string | null
          RIGHTS_STATEMENT?: string | null
          TOKEN_COUNT?: number
          FILE_SIZE_BYTES?: number
          CONFIDENCE_SCORE?: number | null
          METADATA?: Json | null
          CREATED_AT?: string
          UPDATED_AT?: string
        }
      }
      dataset_shares: {
        Row: {
          ID: string
          DATASET_ID: string
          SHARED_WITH: string
          SHARED_AT: string
          PERMISSIONS: string
        }
        Insert: {
          ID?: string
          DATASET_ID: string
          SHARED_WITH: string
          SHARED_AT?: string
          PERMISSIONS?: string
        }
        Update: {
          ID?: string
          DATASET_ID?: string
          SHARED_WITH?: string
          SHARED_AT?: string
          PERMISSIONS?: string
        }
      }
      historical_documents_global: {
        Row: {
          ID: string
          CREATED_AT: string
          CONTRIBUTOR_ID: string | null
          CONTRIBUTED_AT: string | null
          DATA_LICENSE: string
          CONTRIBUTOR_NFT_MINTED: boolean
          ORIGINAL_IMAGE_URL: string | null
          ASSET_ID: string | null
          DOCUMENT_TITLE: string | null
          RAW_OCR_TRANSCRIPTION: string | null
          PREPROCESS_OCR_TRANSCRIPTION: string | null
          USER_ID: string | null
          ALT_TEXT_SHORT: string | null
          ALT_TEXT_LONG: string | null
          AUDIO_DESCRIPTION: string | null
          TACTILE_DESCRIPTION: string | null
          READING_ORDER: Json | null
          ACCESSIBILITY_SCORE: number
          SCAN_TYPE: string
          SHARD_TOKEN_ID: number | null
          NFT_TOKEN_ID: number | null
          REDEMPTION_STATUS: string
          WALLET_ADDRESS: string | null
          REDEMPTION_DATE: string | null
          REDEMPTION_TX_HASH: string | null
          SHARDS_COLLECTED: number
          SHARDS_REQUIRED: number
          SHIPPING_STATUS: string | null
          TRACKING_NUMBER: string | null
          LOCAL_TIMESTAMP: string
          OCR_DERIVED_TIMESTAMP: string | null
          NLP_DERIVED_TIMESTAMP: string | null
          LOCAL_GIS_ZONE: string | null
          OCR_DERIVED_GIS_ZONE: string | null
          NLP_DERIVED_GIS_ZONE: string | null
          NODE_COUNT: number
          NLP_NODE_CATEGORIZATION: string | null
          SOURCE_COLLECTION: string | null
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
          IS_ENTERPRISE: boolean
          TAXONOMY: Json | null
          ITEM_ATTRIBUTES: Json | null
          SCENERY_ATTRIBUTES: Json | null
        }
        Insert: {
          ID?: string
          CREATED_AT?: string
          CONTRIBUTOR_ID?: string | null
          CONTRIBUTED_AT?: string | null
          DATA_LICENSE?: string
          CONTRIBUTOR_NFT_MINTED?: boolean
          ORIGINAL_IMAGE_URL?: string | null
          ASSET_ID?: string | null
          DOCUMENT_TITLE?: string | null
          RAW_OCR_TRANSCRIPTION?: string | null
          PREPROCESS_OCR_TRANSCRIPTION?: string | null
          USER_ID?: string | null
          ALT_TEXT_SHORT?: string | null
          ALT_TEXT_LONG?: string | null
          AUDIO_DESCRIPTION?: string | null
          TACTILE_DESCRIPTION?: string | null
          READING_ORDER?: Json | null
          ACCESSIBILITY_SCORE?: number
          SCAN_TYPE?: string
          SHARD_TOKEN_ID?: number | null
          NFT_TOKEN_ID?: number | null
          REDEMPTION_STATUS?: string
          WALLET_ADDRESS?: string | null
          REDEMPTION_DATE?: string | null
          REDEMPTION_TX_HASH?: string | null
          SHARDS_COLLECTED?: number
          SHARDS_REQUIRED?: number
          SHIPPING_STATUS?: string | null
          TRACKING_NUMBER?: string | null
          LOCAL_TIMESTAMP?: string
          OCR_DERIVED_TIMESTAMP?: string | null
          NLP_DERIVED_TIMESTAMP?: string | null
          LOCAL_GIS_ZONE?: string | null
          OCR_DERIVED_GIS_ZONE?: string | null
          NLP_DERIVED_GIS_ZONE?: string | null
          NODE_COUNT?: number
          NLP_NODE_CATEGORIZATION?: string | null
          SOURCE_COLLECTION?: string | null
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
          IS_ENTERPRISE?: boolean
          TAXONOMY?: Json | null
          ITEM_ATTRIBUTES?: Json | null
          SCENERY_ATTRIBUTES?: Json | null
        }
        Update: {
          ID?: string
          CREATED_AT?: string
          CONTRIBUTOR_ID?: string | null
          CONTRIBUTED_AT?: string | null
          DATA_LICENSE?: string
          CONTRIBUTOR_NFT_MINTED?: boolean
          ORIGINAL_IMAGE_URL?: string | null
          ASSET_ID?: string | null
          DOCUMENT_TITLE?: string | null
          RAW_OCR_TRANSCRIPTION?: string | null
          PREPROCESS_OCR_TRANSCRIPTION?: string | null
          USER_ID?: string | null
          ALT_TEXT_SHORT?: string | null
          ALT_TEXT_LONG?: string | null
          AUDIO_DESCRIPTION?: string | null
          TACTILE_DESCRIPTION?: string | null
          READING_ORDER?: Json | null
          ACCESSIBILITY_SCORE?: number
          SCAN_TYPE?: string
          SHARD_TOKEN_ID?: number | null
          NFT_TOKEN_ID?: number | null
          REDEMPTION_STATUS?: string
          WALLET_ADDRESS?: string | null
          REDEMPTION_DATE?: string | null
          REDEMPTION_TX_HASH?: string | null
          SHARDS_COLLECTED?: number
          SHARDS_REQUIRED?: number
          SHIPPING_STATUS?: string | null
          TRACKING_NUMBER?: string | null
          LOCAL_TIMESTAMP?: string
          OCR_DERIVED_TIMESTAMP?: string | null
          NLP_DERIVED_TIMESTAMP?: string | null
          LOCAL_GIS_ZONE?: string | null
          OCR_DERIVED_GIS_ZONE?: string | null
          NLP_DERIVED_GIS_ZONE?: string | null
          NODE_COUNT?: number
          NLP_NODE_CATEGORIZATION?: string | null
          SOURCE_COLLECTION?: string | null
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
          IS_ENTERPRISE?: boolean
          TAXONOMY?: Json | null
          ITEM_ATTRIBUTES?: Json | null
          SCENERY_ATTRIBUTES?: Json | null
        }
      }
      object_attributes: {
        Row: {
          ID: string
          ASSET_ID: string
          TAXONOMY_ID: string | null
          COMMON_NAME: string | null
          SCIENTIFIC_NAME: string | null
          CONFIDENCE_SCORE: number | null
          MATERIAL: string[] | null
          TECHNIQUE: string[] | null
          MAKER_OR_ARTIST: string | null
          MAKER_ROLE: string | null
          MANUFACTURER: string | null
          PRODUCTION_DATE: string | null
          PERIOD_OR_STYLE: string | null
          DIMENSIONS: Json | null
          CONDITION: string | null
          INSCRIPTIONS_OR_MARKS: string[] | null
          ARCHITECTURAL_STYLE: string[] | null
          CONSTRUCTION_DATE: string | null
          ARCHITECT_OR_BUILDER: string | null
          SITE_TYPE: string | null
          GPS_ACCURACY_METERS: number | null
          CULTURAL_SIGNIFICANCE: string | null
          PROVENANCE_NOTES: string | null
          CREATED_AT: string
          UPDATED_AT: string
        }
        Insert: {
          ID?: string
          ASSET_ID: string
          TAXONOMY_ID?: string | null
          COMMON_NAME?: string | null
          SCIENTIFIC_NAME?: string | null
          CONFIDENCE_SCORE?: number | null
          MATERIAL?: string[] | null
          TECHNIQUE?: string[] | null
          MAKER_OR_ARTIST?: string | null
          MAKER_ROLE?: string | null
          MANUFACTURER?: string | null
          PRODUCTION_DATE?: string | null
          PERIOD_OR_STYLE?: string | null
          DIMENSIONS?: Json | null
          CONDITION?: string | null
          INSCRIPTIONS_OR_MARKS?: string[] | null
          ARCHITECTURAL_STYLE?: string[] | null
          CONSTRUCTION_DATE?: string | null
          ARCHITECT_OR_BUILDER?: string | null
          SITE_TYPE?: string | null
          GPS_ACCURACY_METERS?: number | null
          CULTURAL_SIGNIFICANCE?: string | null
          PROVENANCE_NOTES?: string | null
          CREATED_AT?: string
          UPDATED_AT?: string
        }
        Update: {
          ID?: string
          ASSET_ID?: string
          TAXONOMY_ID?: string | null
          COMMON_NAME?: string | null
          SCIENTIFIC_NAME?: string | null
          CONFIDENCE_SCORE?: number | null
          MATERIAL?: string[] | null
          TECHNIQUE?: string[] | null
          MAKER_OR_ARTIST?: string | null
          MAKER_ROLE?: string | null
          MANUFACTURER?: string | null
          PRODUCTION_DATE?: string | null
          PERIOD_OR_STYLE?: string | null
          DIMENSIONS?: Json | null
          CONDITION?: string | null
          INSCRIPTIONS_OR_MARKS?: string[] | null
          ARCHITECTURAL_STYLE?: string[] | null
          CONSTRUCTION_DATE?: string | null
          ARCHITECT_OR_BUILDER?: string | null
          SITE_TYPE?: string | null
          GPS_ACCURACY_METERS?: number | null
          CULTURAL_SIGNIFICANCE?: string | null
          PROVENANCE_NOTES?: string | null
          CREATED_AT?: string
          UPDATED_AT?: string
        }
      }
      package_assets: {
        Row: {
          ID: string
          PACKAGE_ID: string | null
          ASSET_ID: string | null
          ADDED_AT: string
        }
        Insert: {
          ID?: string
          PACKAGE_ID?: string | null
          ASSET_ID?: string | null
          ADDED_AT?: string
        }
        Update: {
          ID?: string
          PACKAGE_ID?: string | null
          ASSET_ID?: string | null
          ADDED_AT?: string
        }
      }
      packages: {
        Row: {
          ID: string
          PACKAGE_NAME: string
          PACKAGE_TYPE: string
          GROUPING_KEY: string
          DESCRIPTION: string | null
          BASE_PRICE_CENTS: number
          PRICE_PER_ASSET_CENTS: number
          TOTAL_ASSETS: number
          TOTAL_TOKENS: number
          IS_ACTIVE: boolean
          CREATED_AT: string
          UPDATED_AT: string
        }
        Insert: {
          ID?: string
          PACKAGE_NAME: string
          PACKAGE_TYPE: string
          GROUPING_KEY: string
          DESCRIPTION?: string | null
          BASE_PRICE_CENTS: number
          PRICE_PER_ASSET_CENTS?: number
          TOTAL_ASSETS?: number
          TOTAL_TOKENS?: number
          IS_ACTIVE?: boolean
          CREATED_AT?: string
          UPDATED_AT?: string
        }
        Update: {
          ID?: string
          PACKAGE_NAME?: string
          PACKAGE_TYPE?: string
          GROUPING_KEY?: string
          DESCRIPTION?: string | null
          BASE_PRICE_CENTS?: number
          PRICE_PER_ASSET_CENTS?: number
          TOTAL_ASSETS?: number
          TOTAL_TOKENS?: number
          IS_ACTIVE?: boolean
          CREATED_AT?: string
          UPDATED_AT?: string
        }
      }
      taxonomy: {
        Row: {
          ID: string
          TAXON_RANK: string
          NAME: string
          PARENT_ID: string | null
          GBIF_ID: number | null
          INATURALIST_TAXON_ID: number | null
          WIKIDATA_QID: string | null
          CREATED_AT: string
        }
        Insert: {
          ID?: string
          TAXON_RANK: string
          NAME: string
          PARENT_ID?: string | null
          GBIF_ID?: number | null
          INATURALIST_TAXON_ID?: number | null
          WIKIDATA_QID?: string | null
          CREATED_AT?: string
        }
        Update: {
          ID?: string
          TAXON_RANK?: string
          NAME?: string
          PARENT_ID?: string | null
          GBIF_ID?: number | null
          INATURALIST_TAXON_ID?: number | null
          WIKIDATA_QID?: string | null
          CREATED_AT?: string
        }
      }
      user_asset_access: {
        Row: {
          ID: string
          USER_ID: string | null
          ASSET_ID: string | null
          SOURCE_PURCHASE_ID: string | null
          GRANTED_AT: string
        }
        Insert: {
          ID?: string
          USER_ID?: string | null
          ASSET_ID?: string | null
          SOURCE_PURCHASE_ID?: string | null
          GRANTED_AT?: string
        }
        Update: {
          ID?: string
          USER_ID?: string | null
          ASSET_ID?: string | null
          SOURCE_PURCHASE_ID?: string | null
          GRANTED_AT?: string
        }
      }
      user_profiles: {
        Row: {
          ID: string
          EMAIL: string | null
          DISPLAY_NAME: string | null
          WALLET_ADDRESS: string | null
          CREATED_AT: string
          UPDATED_AT: string
        }
        Insert: {
          ID: string
          EMAIL?: string | null
          DISPLAY_NAME?: string | null
          WALLET_ADDRESS?: string | null
          CREATED_AT?: string
          UPDATED_AT?: string
        }
        Update: {
          ID?: string
          EMAIL?: string | null
          DISPLAY_NAME?: string | null
          WALLET_ADDRESS?: string | null
          CREATED_AT?: string
          UPDATED_AT?: string
        }
      }
      user_purchases: {
        Row: {
          ID: string
          USER_ID: string | null
          PACKAGE_ID: string | null
          PURCHASE_TYPE: string
          ORIGINAL_ASSET_COUNT: number | null
          PURCHASED_ASSET_COUNT: number | null
          DUPLICATE_COUNT: number
          PRICE_PAID_CENTS: number
          TRANSACTION_HASH: string | null
          PURCHASED_AT: string
          METADATA: Json | null
        }
        Insert: {
          ID?: string
          USER_ID?: string | null
          PACKAGE_ID?: string | null
          PURCHASE_TYPE: string
          ORIGINAL_ASSET_COUNT?: number | null
          PURCHASED_ASSET_COUNT?: number | null
          DUPLICATE_COUNT?: number
          PRICE_PAID_CENTS: number
          TRANSACTION_HASH?: string | null
          PURCHASED_AT?: string
          METADATA?: Json | null
        }
        Update: {
          ID?: string
          USER_ID?: string | null
          PACKAGE_ID?: string | null
          PURCHASE_TYPE?: string
          ORIGINAL_ASSET_COUNT?: number | null
          PURCHASED_ASSET_COUNT?: number | null
          DUPLICATE_COUNT?: number
          PRICE_PAID_CENTS?: number
          TRANSACTION_HASH?: string | null
          PURCHASED_AT?: string
          METADATA?: Json | null
        }
      }
      web3_transactions: {
        Row: {
          ID: string
          USER_ID: string | null
          ASSET_ID: string | null
          TX_HASH: string
          DETAILS: string | null
          CREATED_AT: string
        }
        Insert: {
          ID?: string
          USER_ID?: string | null
          ASSET_ID?: string | null
          TX_HASH: string
          DETAILS?: string | null
          CREATED_AT?: string
        }
        Update: {
          ID?: string
          USER_ID?: string | null
          ASSET_ID?: string | null
          TX_HASH?: string
          DETAILS?: string | null
          CREATED_AT?: string
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
