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
      // GARD Tokenomics Tables
      royalty_transactions: {
        Row: {
          ID: string
          ASSET_ID: string
          TOKEN_ID: string
          TRANSACTION_TYPE: string
          SALE_PRICE: string
          ROYALTY_AMOUNT: string
          COMMUNITY_SHARE: string
          HOLDER_SHARE: string
          MAINTENANCE_SHARE: string
          SELLER_WALLET: string
          BUYER_WALLET: string
          TX_HASH: string | null
          BLOCK_NUMBER: number | null
          CHAIN_ID: number
          CREATED_AT: string
        }
        Insert: {
          ID?: string
          ASSET_ID: string
          TOKEN_ID: string
          TRANSACTION_TYPE: string
          SALE_PRICE: string
          ROYALTY_AMOUNT: string
          COMMUNITY_SHARE: string
          HOLDER_SHARE: string
          MAINTENANCE_SHARE: string
          SELLER_WALLET: string
          BUYER_WALLET: string
          TX_HASH?: string | null
          BLOCK_NUMBER?: number | null
          CHAIN_ID?: number
          CREATED_AT?: string
        }
        Update: {
          ID?: string
          ASSET_ID?: string
          TOKEN_ID?: string
          TRANSACTION_TYPE?: string
          SALE_PRICE?: string
          ROYALTY_AMOUNT?: string
          COMMUNITY_SHARE?: string
          HOLDER_SHARE?: string
          MAINTENANCE_SHARE?: string
          SELLER_WALLET?: string
          BUYER_WALLET?: string
          TX_HASH?: string | null
          BLOCK_NUMBER?: number | null
          CHAIN_ID?: number
          CREATED_AT?: string
        }
      }
      shard_holdings: {
        Row: {
          ID: string
          USER_ID: string
          ASSET_ID: string
          TOKEN_ID: string
          SHARD_COUNT: number
          ACQUISITION_PRICE: string | null
          ACQUISITION_DATE: string
          CURRENT_VALUE: string | null
          UNREALIZED_GAIN: string | null
        }
        Insert: {
          ID?: string
          USER_ID: string
          ASSET_ID: string
          TOKEN_ID: string
          SHARD_COUNT: number
          ACQUISITION_PRICE?: string | null
          ACQUISITION_DATE?: string
          CURRENT_VALUE?: string | null
          UNREALIZED_GAIN?: string | null
        }
        Update: {
          ID?: string
          USER_ID?: string
          ASSET_ID?: string
          TOKEN_ID?: string
          SHARD_COUNT?: number
          ACQUISITION_PRICE?: string | null
          ACQUISITION_DATE?: string
          CURRENT_VALUE?: string | null
          UNREALIZED_GAIN?: string | null
        }
      }
      community_fund: {
        Row: {
          ID: string
          COMMUNITY_ID: string | null
          BALANCE: string
          TOTAL_CONTRIBUTED: string
          TOTAL_WITHDRAWN: string
          LAST_CONTRIBUTION_AT: string | null
          LAST_WITHDRAWAL_AT: string | null
          CREATED_AT: string
        }
        Insert: {
          ID?: string
          COMMUNITY_ID?: string | null
          BALANCE?: string
          TOTAL_CONTRIBUTED?: string
          TOTAL_WITHDRAWN?: string
          LAST_CONTRIBUTION_AT?: string | null
          LAST_WITHDRAWAL_AT?: string | null
          CREATED_AT?: string
        }
        Update: {
          ID?: string
          COMMUNITY_ID?: string | null
          BALANCE?: string
          TOTAL_CONTRIBUTED?: string
          TOTAL_WITHDRAWN?: string
          LAST_CONTRIBUTION_AT?: string | null
          LAST_WITHDRAWAL_AT?: string | null
          CREATED_AT?: string
        }
      }
      social_return_projects: {
        Row: {
          ID: string
          TITLE: string
          DESCRIPTION: string
          REQUESTED_AMOUNT: string
          APPROVED_AMOUNT: string | null
          STATUS: string
          VOTES_FOR: number
          VOTES_AGAINST: number
          VOTING_DEADLINE: string
          PROPOSER_ID: string
          COMMUNITY_ID: string | null
          CREATED_AT: string
          FUNDED_AT: string | null
          COMPLETED_AT: string | null
        }
        Insert: {
          ID?: string
          TITLE: string
          DESCRIPTION: string
          REQUESTED_AMOUNT: string
          APPROVED_AMOUNT?: string | null
          STATUS?: string
          VOTES_FOR?: number
          VOTES_AGAINST?: number
          VOTING_DEADLINE: string
          PROPOSER_ID: string
          COMMUNITY_ID?: string | null
          CREATED_AT?: string
          FUNDED_AT?: string | null
          COMPLETED_AT?: string | null
        }
        Update: {
          ID?: string
          TITLE?: string
          DESCRIPTION?: string
          REQUESTED_AMOUNT?: string
          APPROVED_AMOUNT?: string | null
          STATUS?: string
          VOTES_FOR?: number
          VOTES_AGAINST?: number
          VOTING_DEADLINE?: string
          PROPOSER_ID?: string
          COMMUNITY_ID?: string | null
          CREATED_AT?: string
          FUNDED_AT?: string | null
          COMPLETED_AT?: string | null
        }
      }
      governance_votes: {
        Row: {
          ID: string
          PROJECT_ID: string
          VOTER_ID: string
          VOTE_WEIGHT: string
          VOTE_DIRECTION: boolean
          VOTED_AT: string
        }
        Insert: {
          ID?: string
          PROJECT_ID: string
          VOTER_ID: string
          VOTE_WEIGHT: string
          VOTE_DIRECTION: boolean
          VOTED_AT?: string
        }
        Update: {
          ID?: string
          PROJECT_ID?: string
          VOTER_ID?: string
          VOTE_WEIGHT?: string
          VOTE_DIRECTION?: boolean
          VOTED_AT?: string
        }
      }
      gard_tokenized_assets: {
        Row: {
          ASSET_ID: string
          NFT_TOKEN_ID: string
          SHARD_COUNT: number
          SHARD_PRICE_BASE: string
          ROYALTY_RATE: string
          CONTRIBUTOR_WALLET: string
          AI_QUALITY_SCORE: string | null
          GIS_PRECISION_SCORE: string | null
          HISTORICAL_SIGNIFICANCE: string | null
          IS_GENESIS_ASSET: boolean
          RETAIL_DEMAND_DRIVEN: boolean
          TOKENIZED_AT: string
          LAST_TRADED_AT: string | null
        }
        Insert: {
          ASSET_ID: string
          NFT_TOKEN_ID: string
          SHARD_COUNT?: number
          SHARD_PRICE_BASE: string
          ROYALTY_RATE?: string
          CONTRIBUTOR_WALLET: string
          AI_QUALITY_SCORE?: string | null
          GIS_PRECISION_SCORE?: string | null
          HISTORICAL_SIGNIFICANCE?: string | null
          IS_GENESIS_ASSET?: boolean
          RETAIL_DEMAND_DRIVEN?: boolean
          TOKENIZED_AT?: string
          LAST_TRADED_AT?: string | null
        }
        Update: {
          ASSET_ID?: string
          NFT_TOKEN_ID?: string
          SHARD_COUNT?: number
          SHARD_PRICE_BASE?: string
          ROYALTY_RATE?: string
          CONTRIBUTOR_WALLET?: string
          AI_QUALITY_SCORE?: string | null
          GIS_PRECISION_SCORE?: string | null
          HISTORICAL_SIGNIFICANCE?: string | null
          IS_GENESIS_ASSET?: boolean
          RETAIL_DEMAND_DRIVEN?: boolean
          TOKENIZED_AT?: string
          LAST_TRADED_AT?: string | null
        }
      }
      pending_rewards: {
        Row: {
          ID: string
          USER_ID: string
          PENDING_AMOUNT: string
          LAST_CLAIM_AT: string | null
          TOTAL_CLAIMED: string
          CREATED_AT: string
        }
        Insert: {
          ID?: string
          USER_ID: string
          PENDING_AMOUNT?: string
          LAST_CLAIM_AT?: string | null
          TOTAL_CLAIMED?: string
          CREATED_AT?: string
        }
        Update: {
          ID?: string
          USER_ID?: string
          PENDING_AMOUNT?: string
          LAST_CLAIM_AT?: string | null
          TOTAL_CLAIMED?: string
          CREATED_AT?: string
        }
      }
      // Metaverse Tables
      user_avatars: {
        Row: {
          ID: string
          USER_ID: string
          DISPLAY_NAME: string
          AVATAR_MODEL: string
          AVATAR_COLOR: string
          BADGES: Json
          XP_TOTAL: number
          LEVEL: number
          NODES_DISCOVERED: number
          SHARDS_MINTED: number
          LAST_POSITION: [number, number, number]
          LAST_ROTATION: [number, number, number, number]
          LAST_SECTOR: string
          LAST_SEEN: string
          CREATED_AT: string
          UPDATED_AT: string
        }
        Insert: {
          ID?: string
          USER_ID: string
          DISPLAY_NAME?: string
          AVATAR_MODEL?: string
          AVATAR_COLOR?: string
          BADGES?: Json
          XP_TOTAL?: number
          LEVEL?: number
          NODES_DISCOVERED?: number
          SHARDS_MINTED?: number
          LAST_POSITION?: [number, number, number]
          LAST_ROTATION?: [number, number, number, number]
          LAST_SECTOR?: string
          LAST_SEEN?: string
          CREATED_AT?: string
          UPDATED_AT?: string
        }
        Update: {
          ID?: string
          USER_ID?: string
          DISPLAY_NAME?: string
          AVATAR_MODEL?: string
          AVATAR_COLOR?: string
          BADGES?: Json
          XP_TOTAL?: number
          LEVEL?: number
          NODES_DISCOVERED?: number
          SHARDS_MINTED?: number
          LAST_POSITION?: [number, number, number]
          LAST_ROTATION?: [number, number, number, number]
          LAST_SECTOR?: string
          LAST_SEEN?: string
          CREATED_AT?: string
          UPDATED_AT?: string
        }
      }
      presence_sessions: {
        Row: {
          ID: string
          USER_ID: string
          SESSION_ID: string
          SECTOR: string
          POSITION: [number, number, number]
          STATUS: string
          HEARTBEAT_AT: string
          CONNECTED_AT: string
        }
        Insert: {
          ID?: string
          USER_ID: string
          SESSION_ID: string
          SECTOR?: string
          POSITION?: [number, number, number]
          STATUS?: string
          HEARTBEAT_AT?: string
          CONNECTED_AT?: string
        }
        Update: {
          ID?: string
          USER_ID?: string
          SESSION_ID?: string
          SECTOR?: string
          POSITION?: [number, number, number]
          STATUS?: string
          HEARTBEAT_AT?: string
          CONNECTED_AT?: string
        }
      }
      realtime_events: {
        Row: {
          ID: string
          EVENT_TYPE: string
          SECTOR: string | null
          PAYLOAD: Json
          ACTOR_USER_ID: string | null
          CREATED_AT: string
          PROCESSED_AT: string | null
        }
        Insert: {
          ID?: string
          EVENT_TYPE: string
          SECTOR?: string | null
          PAYLOAD?: Json
          ACTOR_USER_ID?: string | null
          CREATED_AT?: string
          PROCESSED_AT?: string | null
        }
        Update: {
          ID?: string
          EVENT_TYPE?: string
          SECTOR?: string | null
          PAYLOAD?: Json
          ACTOR_USER_ID?: string | null
          CREATED_AT?: string
          PROCESSED_AT?: string | null
        }
      }
      world_sectors: {
        Row: {
          ID: string
          SECTOR_CODE: string
          CENTER_X: number
          CENTER_Y: number
          CENTER_Z: number
          RADIUS: number
          ZONE_TYPE: string
          AESTHETIC_THEME: string
          NODE_COUNT: number
          ASSET_COUNT: number
          CREATED_AT: string
        }
        Insert: {
          ID?: string
          SECTOR_CODE: string
          CENTER_X?: number
          CENTER_Y?: number
          CENTER_Z?: number
          RADIUS?: number
          ZONE_TYPE?: string
          AESTHETIC_THEME?: string
          NODE_COUNT?: number
          ASSET_COUNT?: number
          CREATED_AT?: string
        }
        Update: {
          ID?: string
          SECTOR_CODE?: string
          CENTER_X?: number
          CENTER_Y?: number
          CENTER_Z?: number
          RADIUS?: number
          ZONE_TYPE?: string
          AESTHETIC_THEME?: string
          NODE_COUNT?: number
          ASSET_COUNT?: number
          CREATED_AT?: string
        }
      }
      archive_partnerships: {
        Row: {
          ID: string
          PARTNER_NAME: string
          PARTNER_TYPE: string
          API_ENDPOINT: string | null
          DATA_AGREEMENT_HASH: string | null
          ASSETS_CONTRIBUTED: number
          TOKENS_MINTED: number
          STATUS: string
          JOINED_AT: string
        }
        Insert: {
          ID?: string
          PARTNER_NAME: string
          PARTNER_TYPE?: string
          API_ENDPOINT?: string | null
          DATA_AGREEMENT_HASH?: string | null
          ASSETS_CONTRIBUTED?: number
          TOKENS_MINTED?: number
          STATUS?: string
          JOINED_AT?: string
        }
        Update: {
          ID?: string
          PARTNER_NAME?: string
          PARTNER_TYPE?: string
          API_ENDPOINT?: string | null
          DATA_AGREEMENT_HASH?: string | null
          ASSETS_CONTRIBUTED?: number
          TOKENS_MINTED?: number
          STATUS?: string
          JOINED_AT?: string
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
      // GARD Functions
      calculate_vote_weight: {
        Args: { p_user_id: string }
        Returns: number
      }
      record_royalty_transaction: {
        Args: {
          p_asset_id: string
          p_token_id: string
          p_transaction_type: string
          p_sale_price: number
          p_seller_wallet: string
          p_buyer_wallet: string
          p_tx_hash?: string | null
          p_block_number?: number | null
        }
        Returns: string
      }
      distribute_holder_rewards: {
        Args: { p_asset_id: string; p_holder_share: number }
        Returns: void
      }
      claim_rewards: {
        Args: { p_user_id: string }
        Returns: number
      }
      cast_governance_vote: {
        Args: {
          p_project_id: string
          p_voter_id: string
          p_vote_direction: boolean
        }
        Returns: void
      }
      // Metaverse Functions
      get_sector_presence: {
        Args: { p_sector: string }
        Returns: {
          user_id: string
          display_name: string
          avatar_model: string
          avatar_color: string
          position: [number, number, number]
          status: string
        }[]
      }
      update_presence_heartbeat: {
        Args: { p_session_id: string }
        Returns: void
      }
      increment_exploration_points: {
        Args: { p_user_id: string; p_points: number }
        Returns: void
      }
      update_avatar_contribution: {
        Args: { p_user_id: string; p_nodes_delta: number; p_shards_delta: number }
        Returns: void
      }
      cleanup_stale_presence: {
        Args: Record<string, never>
        Returns: number
      }
      initialize_user_avatar: {
        Args: { p_user_id: string }
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

// GARD Helper Types
export type RoyaltyTransactionRow = Database['public']['Tables']['royalty_transactions']['Row']
export type RoyaltyTransactionInsert = Database['public']['Tables']['royalty_transactions']['Insert']
export type RoyaltyTransactionUpdate = Database['public']['Tables']['royalty_transactions']['Update']

export type ShardHoldingRow = Database['public']['Tables']['shard_holdings']['Row']
export type ShardHoldingInsert = Database['public']['Tables']['shard_holdings']['Insert']
export type ShardHoldingUpdate = Database['public']['Tables']['shard_holdings']['Update']

export type CommunityFundRow = Database['public']['Tables']['community_fund']['Row']
export type CommunityFundInsert = Database['public']['Tables']['community_fund']['Insert']
export type CommunityFundUpdate = Database['public']['Tables']['community_fund']['Update']

export type SocialReturnProjectRow = Database['public']['Tables']['social_return_projects']['Row']
export type SocialReturnProjectInsert = Database['public']['Tables']['social_return_projects']['Insert']
export type SocialReturnProjectUpdate = Database['public']['Tables']['social_return_projects']['Update']

export type GovernanceVoteRow = Database['public']['Tables']['governance_votes']['Row']
export type GovernanceVoteInsert = Database['public']['Tables']['governance_votes']['Insert']
export type GovernanceVoteUpdate = Database['public']['Tables']['governance_votes']['Update']

export type GARDTokenizedAssetRow = Database['public']['Tables']['gard_tokenized_assets']['Row']
export type GARDTokenizedAssetInsert = Database['public']['Tables']['gard_tokenized_assets']['Insert']
export type GARDTokenizedAssetUpdate = Database['public']['Tables']['gard_tokenized_assets']['Update']

export type PendingRewardsRow = Database['public']['Tables']['pending_rewards']['Row']
export type PendingRewardsInsert = Database['public']['Tables']['pending_rewards']['Insert']
export type PendingRewardsUpdate = Database['public']['Tables']['pending_rewards']['Update']

// Metaverse Helper Types
export type UserAvatarRow = Database['public']['Tables']['user_avatars']['Row']
export type UserAvatarInsert = Database['public']['Tables']['user_avatars']['Insert']
export type UserAvatarUpdate = Database['public']['Tables']['user_avatars']['Update']

export type PresenceSessionRow = Database['public']['Tables']['presence_sessions']['Row']
export type PresenceSessionInsert = Database['public']['Tables']['presence_sessions']['Insert']
export type PresenceSessionUpdate = Database['public']['Tables']['presence_sessions']['Update']

export type RealtimeEventRow = Database['public']['Tables']['realtime_events']['Row']
export type RealtimeEventInsert = Database['public']['Tables']['realtime_events']['Insert']
export type RealtimeEventUpdate = Database['public']['Tables']['realtime_events']['Update']

export type WorldSectorRow = Database['public']['Tables']['world_sectors']['Row']
export type WorldSectorInsert = Database['public']['Tables']['world_sectors']['Insert']
export type WorldSectorUpdate = Database['public']['Tables']['world_sectors']['Update']

export type ArchivePartnershipRow = Database['public']['Tables']['archive_partnerships']['Row']
export type ArchivePartnershipInsert = Database['public']['Tables']['archive_partnerships']['Insert']
export type ArchivePartnershipUpdate = Database['public']['Tables']['archive_partnerships']['Update']
