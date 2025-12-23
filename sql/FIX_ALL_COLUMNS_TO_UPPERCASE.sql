-- Rename ALL lowercase columns to UPPERCASE in historical_documents_global
-- This script iterates through every column and renames it if it's not already uppercase.

DO $$
DECLARE
    _col record;
    _new_name text;
BEGIN
    FOR _col IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'historical_documents_global'
          AND column_name <> UPPER(column_name)
    LOOP
        _new_name := UPPER(_col.column_name);
        
        -- Check if target column already exists
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'historical_documents_global'
              AND column_name = _new_name
        ) THEN
            RAISE NOTICE 'Target column % already exists. Skipping rename of %.', _new_name, _col.column_name;
        ELSE
            BEGIN
                EXECUTE format('ALTER TABLE public.historical_documents_global RENAME COLUMN %I TO %I',
                    _col.column_name, _new_name);
                RAISE NOTICE 'Renamed column % to %', _col.column_name, _new_name;
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE NOTICE 'Error renaming column %: %', _col.column_name, SQLERRM;
            END;
        END IF;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload config';
