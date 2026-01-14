-- ============================================
-- COMPREHENSIVE DATABASE HEALTH CHECK (v2.8.1)
-- ============================================
-- Run this query to verify your Supabase schema
-- is up to date with the Loadopoly-OCR v2.8.1 frontend.
--
-- All items should show ✅ status.
-- If any show ❌, run COMPLETE_SCHEMA_SETUP_V2.8.1.sql
-- ============================================

SELECT 'Table: processing_queue' as schema_item, 
       CASE WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'processing_queue') 
       THEN '✅ Exists' ELSE '❌ Missing' END as status
UNION ALL
SELECT 'Table: structured_clusters', 
       CASE WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'structured_clusters') 
       THEN '✅ Exists' ELSE '❌ Missing' END
UNION ALL
SELECT 'Table: vector_embeddings', 
       CASE WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'vector_embeddings') 
       THEN '✅ Exists' ELSE '❌ Missing' END
UNION ALL
SELECT 'Table: historical_documents_global', 
       CASE WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'historical_documents_global') 
       THEN '✅ Exists' ELSE '❌ Missing' END
UNION ALL
SELECT 'Extension: vector (pgvector)', 
       CASE WHEN EXISTS (SELECT FROM pg_extension WHERE extname = 'vector') 
       THEN '✅ Installed' ELSE '❌ Missing' END
UNION ALL
SELECT 'Column: TEXT_EMBEDDING (on historical_documents_global)', 
       CASE WHEN EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'text_embedding') 
       THEN '✅ Exists' ELSE '❌ Missing' END
UNION ALL
SELECT 'Column: STRUCTURED_TEMPORAL (on historical_documents_global)', 
       CASE WHEN EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'structured_temporal') 
       THEN '✅ Exists' ELSE '❌ Missing' END
UNION ALL
SELECT 'Column: CLASSIFICATION_LLM (on historical_documents_global)', 
       CASE WHEN EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'classification_llm') 
       THEN '✅ Exists' ELSE '❌ Missing' END
UNION ALL
SELECT 'BRIN index on CREATED_AT', 
       CASE WHEN EXISTS (
           SELECT FROM pg_class c 
           JOIN pg_am am ON c.relam = am.oid 
           WHERE c.relname LIKE '%created_at%' AND am.amname = 'brin'
       ) 
       THEN '✅ Exists' ELSE '⚠️ Optional' END
UNION ALL
SELECT 'RLS Policy: processing_queue', 
       CASE WHEN EXISTS (SELECT FROM pg_policies WHERE tablename = 'processing_queue') 
       THEN '✅ Active' ELSE '⚠️ No Policies' END
UNION ALL
SELECT 'RLS Policy: structured_clusters', 
       CASE WHEN EXISTS (SELECT FROM pg_policies WHERE tablename = 'structured_clusters') 
       THEN '✅ Active' ELSE '⚠️ No Policies' END;
