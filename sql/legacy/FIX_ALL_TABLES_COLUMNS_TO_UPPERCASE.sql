-- Rename ALL lowercase columns to UPPERCASE in ALL public tables
-- This script iterates through every table in the public schema and renames its columns if they are not already uppercase.

DO $$
DECLARE
    _col record;
    _new_name text;
BEGIN
    FOR _col IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name <> UPPER(column_name)
          -- Skip system tables or specific tables if needed
          AND table_name NOT LIKE 'pg_%'
    LOOP
        _new_name := UPPER(_col.column_name);
        
        -- Check if target column already exists in that specific table
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = _col.table_name
              AND column_name = _new_name
        ) THEN
            RAISE NOTICE 'Target column % already exists in table %. Skipping rename of %.', _new_name, _col.table_name, _col.column_name;
        ELSE
            BEGIN
                EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO %I',
                    _col.table_name, _col.column_name, _new_name);
                RAISE NOTICE 'Renamed column % in table % to %', _col.column_name, _col.table_name, _new_name;
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE NOTICE 'Error renaming column % in table %: %', _col.column_name, _col.table_name, SQLERRM;
            END;
        END IF;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload config';
