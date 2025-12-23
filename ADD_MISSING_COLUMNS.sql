DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'historical_documents_global' 
        AND column_name = 'IS_ENTERPRISE'
    ) THEN
        ALTER TABLE public.historical_documents_global ADD COLUMN "IS_ENTERPRISE" BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'alt_text_short') THEN
        ALTER TABLE public.historical_documents_global ADD COLUMN alt_text_short TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'alt_text_long') THEN
        ALTER TABLE public.historical_documents_global ADD COLUMN alt_text_long TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'reading_order') THEN
        ALTER TABLE public.historical_documents_global ADD COLUMN reading_order JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'accessibility_score') THEN
        ALTER TABLE public.historical_documents_global ADD COLUMN accessibility_score DECIMAL(3,2);
    END IF;

END $$;

NOTIFY pgrst, 'reload config';
