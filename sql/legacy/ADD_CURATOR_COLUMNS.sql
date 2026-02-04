-- Add columns for manual curation and bundling
ALTER TABLE historical_documents_global 
ADD COLUMN IF NOT EXISTS IS_USER_ANNOTATED BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS USER_BUNDLE_ID UUID DEFAULT NULL;

-- Create a table for user-defined bundles if it doesn't exist
CREATE TABLE IF NOT EXISTS user_bundles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id),
    is_public BOOLEAN DEFAULT TRUE
);

-- Add RLS for user_bundles
ALTER TABLE user_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to user_bundles" 
ON user_bundles FOR SELECT 
USING (true);

CREATE POLICY "Allow authenticated users to create bundles" 
ON user_bundles FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow users to update their own bundles" 
ON user_bundles FOR UPDATE 
USING (auth.uid() = user_id);
