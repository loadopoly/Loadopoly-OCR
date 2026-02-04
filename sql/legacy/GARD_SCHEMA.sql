-- ============================================
-- GARD (SocialReturnSystem) Database Schema
-- ============================================
-- This schema extends GeoGraph Node with royalty tracking,
-- shard ownership, community fund management, and DAO governance.

-- Royalty tracking table
CREATE TABLE IF NOT EXISTS royalty_transactions (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ASSET_ID TEXT REFERENCES historical_documents_global(ASSET_ID),
    TOKEN_ID TEXT NOT NULL,
    TRANSACTION_TYPE TEXT CHECK (TRANSACTION_TYPE IN ('SALE', 'LICENSE', 'GIFT')),
    SALE_PRICE NUMERIC(18,8) NOT NULL,
    ROYALTY_AMOUNT NUMERIC(18,8) NOT NULL,
    
    -- Distribution breakdown
    COMMUNITY_SHARE NUMERIC(18,8),
    HOLDER_SHARE NUMERIC(18,8),
    MAINTENANCE_SHARE NUMERIC(18,8),
    
    -- Participants
    SELLER_WALLET TEXT NOT NULL,
    BUYER_WALLET TEXT NOT NULL,
    
    -- Blockchain reference
    TX_HASH TEXT,
    BLOCK_NUMBER BIGINT,
    CHAIN_ID INTEGER DEFAULT 137, -- Polygon
    
    CREATED_AT TIMESTAMPTZ DEFAULT NOW()
);

-- Shard ownership ledger
CREATE TABLE IF NOT EXISTS shard_holdings (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    USER_ID UUID REFERENCES auth.users(id),
    ASSET_ID TEXT REFERENCES historical_documents_global(ASSET_ID),
    TOKEN_ID TEXT NOT NULL,
    SHARD_COUNT INTEGER NOT NULL,
    ACQUISITION_PRICE NUMERIC(18,8),
    ACQUISITION_DATE TIMESTAMPTZ DEFAULT NOW(),
    
    -- Derived value tracking
    CURRENT_VALUE NUMERIC(18,8),
    UNREALIZED_GAIN NUMERIC(18,8),
    
    UNIQUE(USER_ID, TOKEN_ID)
);

-- Community fund allocations
CREATE TABLE IF NOT EXISTS community_fund (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    BALANCE NUMERIC(18,8) DEFAULT 0,
    LAST_DEPOSIT_AT TIMESTAMPTZ,
    LAST_WITHDRAWAL_AT TIMESTAMPTZ,
    TOTAL_DEPOSITED NUMERIC(18,8) DEFAULT 0,
    TOTAL_WITHDRAWN NUMERIC(18,8) DEFAULT 0
);

-- Initialize community fund with a single row
INSERT INTO community_fund (ID, BALANCE, TOTAL_DEPOSITED, TOTAL_WITHDRAWN)
VALUES (gen_random_uuid(), 0, 0, 0)
ON CONFLICT DO NOTHING;

-- Social return projects
CREATE TABLE IF NOT EXISTS social_return_projects (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    TITLE TEXT NOT NULL,
    DESCRIPTION TEXT,
    REQUESTED_AMOUNT NUMERIC(18,8) NOT NULL,
    APPROVED_AMOUNT NUMERIC(18,8),
    STATUS TEXT CHECK (STATUS IN ('PROPOSED', 'VOTING', 'APPROVED', 'FUNDED', 'COMPLETED', 'REJECTED')) DEFAULT 'PROPOSED',
    
    -- Voting
    VOTES_FOR INTEGER DEFAULT 0,
    VOTES_AGAINST INTEGER DEFAULT 0,
    VOTING_DEADLINE TIMESTAMPTZ,
    
    -- Proposer
    PROPOSER_ID UUID REFERENCES auth.users(id),
    COMMUNITY_ID UUID,
    
    CREATED_AT TIMESTAMPTZ DEFAULT NOW(),
    FUNDED_AT TIMESTAMPTZ,
    COMPLETED_AT TIMESTAMPTZ
);

-- DAO voting records
CREATE TABLE IF NOT EXISTS governance_votes (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PROJECT_ID UUID REFERENCES social_return_projects(ID),
    VOTER_ID UUID REFERENCES auth.users(id),
    VOTE_WEIGHT NUMERIC(18,8) NOT NULL, -- Based on shard holdings
    VOTE_DIRECTION BOOLEAN NOT NULL, -- true = for, false = against
    VOTED_AT TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(PROJECT_ID, VOTER_ID)
);

-- Tokenized assets registry
CREATE TABLE IF NOT EXISTS gard_tokenized_assets (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ASSET_ID TEXT REFERENCES historical_documents_global(ASSET_ID) UNIQUE,
    NFT_TOKEN_ID TEXT NOT NULL UNIQUE,
    SHARD_COUNT INTEGER DEFAULT 1000,
    SHARD_PRICE_BASE NUMERIC(18,8) NOT NULL,
    ROYALTY_RATE NUMERIC(5,4) DEFAULT 0.1000, -- 10%
    CONTRIBUTOR_WALLET TEXT NOT NULL,
    
    -- Value attribution scores
    AI_QUALITY_SCORE NUMERIC(5,4),
    GIS_PRECISION_SCORE NUMERIC(5,4),
    HISTORICAL_SIGNIFICANCE NUMERIC(5,4),
    
    -- Asset classification
    IS_GENESIS_ASSET BOOLEAN DEFAULT FALSE,
    RETAIL_DEMAND_DRIVEN BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    TOKENIZED_AT TIMESTAMPTZ DEFAULT NOW(),
    LAST_TRADED_AT TIMESTAMPTZ
);

-- Pending rewards for shard holders
CREATE TABLE IF NOT EXISTS pending_rewards (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    USER_ID UUID REFERENCES auth.users(id) UNIQUE,
    PENDING_AMOUNT NUMERIC(18,8) DEFAULT 0,
    LAST_CLAIMED_AT TIMESTAMPTZ,
    TOTAL_CLAIMED NUMERIC(18,8) DEFAULT 0
);

-- ============================================
-- Indexes for Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_royalty_asset ON royalty_transactions(ASSET_ID);
CREATE INDEX IF NOT EXISTS idx_royalty_token ON royalty_transactions(TOKEN_ID);
CREATE INDEX IF NOT EXISTS idx_royalty_timestamp ON royalty_transactions(CREATED_AT DESC);

CREATE INDEX IF NOT EXISTS idx_holdings_user ON shard_holdings(USER_ID);
CREATE INDEX IF NOT EXISTS idx_holdings_token ON shard_holdings(TOKEN_ID);

CREATE INDEX IF NOT EXISTS idx_projects_status ON social_return_projects(STATUS);
CREATE INDEX IF NOT EXISTS idx_projects_community ON social_return_projects(COMMUNITY_ID);

CREATE INDEX IF NOT EXISTS idx_votes_project ON governance_votes(PROJECT_ID);
CREATE INDEX IF NOT EXISTS idx_votes_voter ON governance_votes(VOTER_ID);

CREATE INDEX IF NOT EXISTS idx_tokenized_asset ON gard_tokenized_assets(ASSET_ID);

-- ============================================
-- Enable Row Level Security
-- ============================================

ALTER TABLE royalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shard_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_fund ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_return_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gard_tokenized_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_rewards ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================

-- Royalty transactions: Public read, restricted write
CREATE POLICY "Public read for royalty transactions"
ON royalty_transactions FOR SELECT USING (true);

CREATE POLICY "System can insert royalty transactions"
ON royalty_transactions FOR INSERT 
WITH CHECK (true);

-- Shard holdings: Users can view their own
CREATE POLICY "Users can view their own holdings"
ON shard_holdings FOR SELECT USING (USER_ID = auth.uid());

CREATE POLICY "System can manage holdings"
ON shard_holdings FOR ALL USING (true);

-- Community fund: Public read
CREATE POLICY "Public read for community fund"
ON community_fund FOR SELECT USING (true);

-- Social return projects: Public read, authenticated propose
CREATE POLICY "Public read for projects"
ON social_return_projects FOR SELECT USING (true);

CREATE POLICY "Authenticated users can propose projects"
ON social_return_projects FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Proposers can update their projects"
ON social_return_projects FOR UPDATE
USING (PROPOSER_ID = auth.uid());

-- Governance votes: Users can vote once per project
CREATE POLICY "Users can view all votes"
ON governance_votes FOR SELECT USING (true);

CREATE POLICY "Users can cast their own votes"
ON governance_votes FOR INSERT
WITH CHECK (auth.uid() = VOTER_ID);

-- Tokenized assets: Public read
CREATE POLICY "Public read for tokenized assets"
ON gard_tokenized_assets FOR SELECT USING (true);

CREATE POLICY "System can manage tokenized assets"
ON gard_tokenized_assets FOR ALL USING (true);

-- Pending rewards: Users can view their own
CREATE POLICY "Users can view their own rewards"
ON pending_rewards FOR SELECT USING (USER_ID = auth.uid());

CREATE POLICY "System can manage rewards"
ON pending_rewards FOR ALL USING (true);

-- ============================================
-- Functions for GARD Operations
-- ============================================

-- Calculate voting weight based on total shard holdings
CREATE OR REPLACE FUNCTION calculate_vote_weight(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    total_shards NUMERIC;
    global_shards NUMERIC;
BEGIN
    SELECT COALESCE(SUM(SHARD_COUNT), 0) INTO total_shards
    FROM shard_holdings WHERE USER_ID = p_user_id;
    
    SELECT COALESCE(SUM(SHARD_COUNT), 1) INTO global_shards
    FROM shard_holdings;
    
    RETURN total_shards / global_shards;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record a royalty transaction and distribute funds
CREATE OR REPLACE FUNCTION record_royalty_transaction(
    p_asset_id TEXT,
    p_token_id TEXT,
    p_transaction_type TEXT,
    p_sale_price NUMERIC,
    p_seller_wallet TEXT,
    p_buyer_wallet TEXT,
    p_tx_hash TEXT DEFAULT NULL,
    p_block_number BIGINT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_royalty NUMERIC;
    v_community NUMERIC;
    v_holders NUMERIC;
    v_maintenance NUMERIC;
    v_transaction_id UUID;
BEGIN
    -- Calculate royalty (10%)
    v_royalty := p_sale_price * 0.10;
    
    -- Calculate distribution
    v_community := v_royalty * 0.50;    -- 50% to community fund
    v_holders := v_royalty * 0.30;      -- 30% to shard holders
    v_maintenance := v_royalty * 0.20;  -- 20% to maintenance
    
    -- Insert transaction record
    INSERT INTO royalty_transactions (
        ASSET_ID, TOKEN_ID, TRANSACTION_TYPE, SALE_PRICE, ROYALTY_AMOUNT,
        COMMUNITY_SHARE, HOLDER_SHARE, MAINTENANCE_SHARE,
        SELLER_WALLET, BUYER_WALLET, TX_HASH, BLOCK_NUMBER
    ) VALUES (
        p_asset_id, p_token_id, p_transaction_type, p_sale_price, v_royalty,
        v_community, v_holders, v_maintenance,
        p_seller_wallet, p_buyer_wallet, p_tx_hash, p_block_number
    ) RETURNING ID INTO v_transaction_id;
    
    -- Update community fund
    UPDATE community_fund
    SET BALANCE = BALANCE + v_community,
        TOTAL_DEPOSITED = TOTAL_DEPOSITED + v_community,
        LAST_DEPOSIT_AT = NOW();
    
    RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Distribute holder rewards for a specific token
CREATE OR REPLACE FUNCTION distribute_holder_rewards(p_token_id TEXT, p_amount NUMERIC)
RETURNS VOID AS $$
DECLARE
    v_total_shards INTEGER;
    v_holder RECORD;
    v_reward NUMERIC;
BEGIN
    -- Get total shards for this token
    SELECT COALESCE(SUM(SHARD_COUNT), 0) INTO v_total_shards
    FROM shard_holdings WHERE TOKEN_ID = p_token_id;
    
    IF v_total_shards = 0 THEN
        RETURN;
    END IF;
    
    -- Distribute pro-rata to each holder
    FOR v_holder IN 
        SELECT USER_ID, SHARD_COUNT 
        FROM shard_holdings 
        WHERE TOKEN_ID = p_token_id
    LOOP
        v_reward := (p_amount * v_holder.SHARD_COUNT) / v_total_shards;
        
        INSERT INTO pending_rewards (USER_ID, PENDING_AMOUNT)
        VALUES (v_holder.USER_ID, v_reward)
        ON CONFLICT (USER_ID) 
        DO UPDATE SET PENDING_AMOUNT = pending_rewards.PENDING_AMOUNT + v_reward;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Claim pending rewards
CREATE OR REPLACE FUNCTION claim_rewards(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_amount NUMERIC;
BEGIN
    SELECT PENDING_AMOUNT INTO v_amount
    FROM pending_rewards WHERE USER_ID = p_user_id;
    
    IF v_amount IS NULL OR v_amount = 0 THEN
        RETURN 0;
    END IF;
    
    UPDATE pending_rewards
    SET PENDING_AMOUNT = 0,
        LAST_CLAIMED_AT = NOW(),
        TOTAL_CLAIMED = TOTAL_CLAIMED + v_amount
    WHERE USER_ID = p_user_id;
    
    RETURN v_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cast a governance vote
CREATE OR REPLACE FUNCTION cast_governance_vote(
    p_project_id UUID,
    p_voter_id UUID,
    p_vote_direction BOOLEAN
)
RETURNS VOID AS $$
DECLARE
    v_weight NUMERIC;
BEGIN
    -- Calculate vote weight
    v_weight := calculate_vote_weight(p_voter_id);
    
    -- Insert vote
    INSERT INTO governance_votes (PROJECT_ID, VOTER_ID, VOTE_WEIGHT, VOTE_DIRECTION)
    VALUES (p_project_id, p_voter_id, v_weight, p_vote_direction);
    
    -- Update project vote counts
    IF p_vote_direction THEN
        UPDATE social_return_projects
        SET VOTES_FOR = VOTES_FOR + 1
        WHERE ID = p_project_id;
    ELSE
        UPDATE social_return_projects
        SET VOTES_AGAINST = VOTES_AGAINST + 1
        WHERE ID = p_project_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
