-- ============================================
-- AVATAR PERSISTENCE & PRESENCE SCHEMA
-- ============================================
-- Extends GeoGraph Node with avatar state persistence,
-- real-time presence tracking, and exploration progression.
-- Version: 2.0.0

-- User avatar state and progression
CREATE TABLE IF NOT EXISTS user_avatars (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    USER_ID UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    
    -- Identity
    DISPLAY_NAME TEXT,
    AVATAR_MODEL TEXT DEFAULT 'default_explorer',
    AVATAR_COLOR TEXT DEFAULT '#6366f1',
    
    -- Spatial State (persisted across sessions)
    LAST_POSITION FLOAT[3] DEFAULT '{0, 0, 0}',
    LAST_ROTATION FLOAT[4] DEFAULT '{0, 0, 0, 1}',  -- Quaternion
    LAST_SECTOR TEXT DEFAULT 'ORIGIN',
    
    -- Progression (ties into GARD)
    CONTRIBUTION_LEVEL INTEGER DEFAULT 1,
    TOTAL_NODES_CREATED INTEGER DEFAULT 0,
    TOTAL_SHARDS_EARNED NUMERIC(18,8) DEFAULT 0,
    EXPLORATION_POINTS INTEGER DEFAULT 0,
    BADGES JSONB DEFAULT '[]',
    
    -- Timestamps
    CREATED_AT TIMESTAMPTZ DEFAULT NOW(),
    LAST_SEEN TIMESTAMPTZ DEFAULT NOW()
);

-- Ephemeral presence (for real-time "who's online")
CREATE TABLE IF NOT EXISTS presence_sessions (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    USER_ID UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    SESSION_ID TEXT NOT NULL UNIQUE,
    SECTOR TEXT DEFAULT 'ORIGIN',
    WORLD_POSITION FLOAT[3] DEFAULT '{0, 0, 0}',
    STATUS TEXT CHECK (STATUS IN ('ACTIVE', 'IDLE', 'AWAY')) DEFAULT 'ACTIVE',
    HEARTBEAT_AT TIMESTAMPTZ DEFAULT NOW(),
    CREATED_AT TIMESTAMPTZ DEFAULT NOW()
);

-- Realtime events log for world mutations
CREATE TABLE IF NOT EXISTS realtime_events (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    EVENT_TYPE TEXT NOT NULL,
    PAYLOAD JSONB NOT NULL DEFAULT '{}',
    SOURCE_USER_ID UUID REFERENCES auth.users(id),
    AFFECTED_CHUNKS TEXT[] DEFAULT '{}',
    PRIORITY TEXT CHECK (PRIORITY IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')) DEFAULT 'MEDIUM',
    PROCESSED BOOLEAN DEFAULT FALSE,
    CREATED_AT TIMESTAMPTZ DEFAULT NOW()
);

-- World sectors (procedurally generated from graph clusters)
CREATE TABLE IF NOT EXISTS world_sectors (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    SECTOR_CODE TEXT UNIQUE NOT NULL,
    CENTER_X FLOAT DEFAULT 0,
    CENTER_Y FLOAT DEFAULT 0,
    CENTER_Z FLOAT DEFAULT 0,
    RADIUS FLOAT DEFAULT 100,
    AESTHETIC_THEME TEXT CHECK (AESTHETIC_THEME IN (
        'VICTORIAN_LIBRARY', 'BRUTALIST_ARCHIVE', 'DIGITAL_NEON',
        'ORGANIC_GROWTH', 'INDUSTRIAL_HERITAGE', 'ACADEMIC_QUADRANGLE',
        'SACRED_GEOMETRY', 'CYBERPUNK_FRONTIER'
    )) DEFAULT 'DIGITAL_NEON',
    ZONE_TYPE TEXT CHECK (ZONE_TYPE IN (
        'URBAN_CORE', 'KNOWLEDGE_DISTRICT', 'DATA_SUBURBS',
        'FRONTIER_ZONE', 'ARCHIVE_RUINS', 'INSTITUTIONAL_HQ',
        'MARKETPLACE', 'COMMUNITY_PLAZA'
    )) DEFAULT 'URBAN_CORE',
    SOURCE_CLUSTER_ID TEXT,
    NODE_COUNT INTEGER DEFAULT 0,
    ASSET_COUNT INTEGER DEFAULT 0,
    CREATED_AT TIMESTAMPTZ DEFAULT NOW(),
    LAST_UPDATED TIMESTAMPTZ DEFAULT NOW()
);

-- Archive partnerships for district spawning
CREATE TABLE IF NOT EXISTS archive_partnerships (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PARTNER_NAME TEXT NOT NULL,
    PARTNER_TYPE TEXT CHECK (PARTNER_TYPE IN ('LIBRARY', 'MUSEUM', 'UNIVERSITY', 'GOVERNMENT', 'PRIVATE')),
    AESTHETIC_THEME TEXT,
    DISTRICT_SECTOR_CODE TEXT REFERENCES world_sectors(SECTOR_CODE),
    ASSET_COUNT INTEGER DEFAULT 0,
    SIGNED_AT TIMESTAMPTZ DEFAULT NOW(),
    IS_ACTIVE BOOLEAN DEFAULT TRUE,
    LOGO_URL TEXT,
    DESCRIPTION TEXT,
    WEBSITE_URL TEXT,
    CONTACT_EMAIL TEXT
);

-- ============================================
-- Indexes for Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_avatars_user ON user_avatars(USER_ID);
CREATE INDEX IF NOT EXISTS idx_avatars_last_seen ON user_avatars(LAST_SEEN DESC);
CREATE INDEX IF NOT EXISTS idx_avatars_contribution ON user_avatars(CONTRIBUTION_LEVEL DESC);

CREATE INDEX IF NOT EXISTS idx_presence_sector ON presence_sessions(SECTOR);
CREATE INDEX IF NOT EXISTS idx_presence_heartbeat ON presence_sessions(HEARTBEAT_AT DESC);
CREATE INDEX IF NOT EXISTS idx_presence_user ON presence_sessions(USER_ID);

CREATE INDEX IF NOT EXISTS idx_events_type ON realtime_events(EVENT_TYPE);
CREATE INDEX IF NOT EXISTS idx_events_created ON realtime_events(CREATED_AT DESC);
CREATE INDEX IF NOT EXISTS idx_events_processed ON realtime_events(PROCESSED) WHERE NOT PROCESSED;

CREATE INDEX IF NOT EXISTS idx_sectors_code ON world_sectors(SECTOR_CODE);
CREATE INDEX IF NOT EXISTS idx_sectors_zone ON world_sectors(ZONE_TYPE);

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE user_avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE realtime_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive_partnerships ENABLE ROW LEVEL SECURITY;

-- Avatar Policies
DROP POLICY IF EXISTS "Users can view all avatars" ON user_avatars;
CREATE POLICY "Users can view all avatars"
ON user_avatars FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update their own avatar" ON user_avatars;
CREATE POLICY "Users can update their own avatar"
ON user_avatars FOR UPDATE USING (USER_ID = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own avatar" ON user_avatars;
CREATE POLICY "Users can insert their own avatar"
ON user_avatars FOR INSERT WITH CHECK (USER_ID = auth.uid());

-- Presence Policies
DROP POLICY IF EXISTS "Users can view active presence" ON presence_sessions;
CREATE POLICY "Users can view active presence"
ON presence_sessions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage their own presence" ON presence_sessions;
CREATE POLICY "Users can manage their own presence"
ON presence_sessions FOR ALL USING (USER_ID = auth.uid());

-- Events Policies
DROP POLICY IF EXISTS "Users can view all events" ON realtime_events;
CREATE POLICY "Users can view all events"
ON realtime_events FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert events" ON realtime_events;
CREATE POLICY "Users can insert events"
ON realtime_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Sectors Policies
DROP POLICY IF EXISTS "Anyone can view sectors" ON world_sectors;
CREATE POLICY "Anyone can view sectors"
ON world_sectors FOR SELECT USING (true);

-- Partnerships Policies  
DROP POLICY IF EXISTS "Anyone can view partnerships" ON archive_partnerships;
CREATE POLICY "Anyone can view partnerships"
ON archive_partnerships FOR SELECT USING (true);

-- ============================================
-- Helper Functions
-- ============================================

-- Update presence heartbeat
CREATE OR REPLACE FUNCTION update_presence_heartbeat(
    p_session_id TEXT,
    p_sector TEXT DEFAULT NULL,
    p_position FLOAT[3] DEFAULT NULL,
    p_status TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE presence_sessions
    SET 
        HEARTBEAT_AT = NOW(),
        SECTOR = COALESCE(p_sector, SECTOR),
        WORLD_POSITION = COALESCE(p_position, WORLD_POSITION),
        STATUS = COALESCE(p_status, STATUS)
    WHERE SESSION_ID = p_session_id AND USER_ID = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment exploration points
CREATE OR REPLACE FUNCTION increment_exploration_points(
    p_user_id UUID,
    p_points INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    new_total INTEGER;
BEGIN
    UPDATE user_avatars
    SET 
        EXPLORATION_POINTS = EXPLORATION_POINTS + p_points,
        LAST_SEEN = NOW()
    WHERE USER_ID = p_user_id
    RETURNING EXPLORATION_POINTS INTO new_total;
    
    RETURN new_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup stale presence sessions (run via pg_cron or edge function)
CREATE OR REPLACE FUNCTION cleanup_stale_presence()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM presence_sessions
    WHERE HEARTBEAT_AT < NOW() - INTERVAL '5 minutes';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Get online users in a sector
CREATE OR REPLACE FUNCTION get_sector_presence(p_sector TEXT)
RETURNS TABLE (
    user_id UUID,
    session_id TEXT,
    display_name TEXT,
    avatar_color TEXT,
    world_position FLOAT[3],
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ps.USER_ID,
        ps.SESSION_ID,
        ua.DISPLAY_NAME,
        ua.AVATAR_COLOR,
        ps.WORLD_POSITION,
        ps.STATUS
    FROM presence_sessions ps
    LEFT JOIN user_avatars ua ON ps.USER_ID = ua.USER_ID
    WHERE ps.SECTOR = p_sector
    AND ps.HEARTBEAT_AT > NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update avatar contribution stats
CREATE OR REPLACE FUNCTION update_avatar_contribution(
    p_user_id UUID,
    p_nodes_delta INTEGER DEFAULT 0,
    p_shards_delta NUMERIC(18,8) DEFAULT 0
)
RETURNS VOID AS $$
DECLARE
    new_nodes INTEGER;
    new_level INTEGER;
BEGIN
    UPDATE user_avatars
    SET 
        TOTAL_NODES_CREATED = TOTAL_NODES_CREATED + p_nodes_delta,
        TOTAL_SHARDS_EARNED = TOTAL_SHARDS_EARNED + p_shards_delta,
        LAST_SEEN = NOW()
    WHERE USER_ID = p_user_id
    RETURNING TOTAL_NODES_CREATED INTO new_nodes;
    
    -- Calculate new contribution level (logarithmic scaling)
    new_level := GREATEST(1, FLOOR(LOG(GREATEST(new_nodes, 1)) / LOG(2)) + 1);
    
    UPDATE user_avatars
    SET CONTRIBUTION_LEVEL = new_level
    WHERE USER_ID = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Initialize avatar for new user
CREATE OR REPLACE FUNCTION initialize_user_avatar()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_avatars (USER_ID, DISPLAY_NAME)
    VALUES (NEW.id, 'Explorer_' || LEFT(NEW.id::TEXT, 6))
    ON CONFLICT (USER_ID) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create avatar on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION initialize_user_avatar();

-- Initialize origin sector
INSERT INTO world_sectors (SECTOR_CODE, CENTER_X, CENTER_Y, CENTER_Z, ZONE_TYPE, AESTHETIC_THEME)
VALUES ('ORIGIN', 0, 0, 0, 'COMMUNITY_PLAZA', 'DIGITAL_NEON')
ON CONFLICT (SECTOR_CODE) DO NOTHING;
