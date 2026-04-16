-- User Credits System
-- Tracks OCR processing credits for the freemium model
-- 
-- Free tier: 5 credits on signup / first use
-- Paid: purchased via Stripe checkout (50/200/1000 packs)
-- BYOK: users with their own API key bypass this system entirely

-- ============================================
-- Table: user_credits
-- ============================================
CREATE TABLE IF NOT EXISTS user_credits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credits_remaining INTEGER NOT NULL DEFAULT 5,
    total_purchased INTEGER NOT NULL DEFAULT 0,
    free_credits_used INTEGER NOT NULL DEFAULT 0,
    last_purchase_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- ============================================
-- Table: credit_transactions (audit log)
-- ============================================
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('purchase', 'consumption', 'refund', 'grant')),
    pack_id TEXT,
    stripe_session_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Row-Level Security
-- ============================================
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own credits
CREATE POLICY "Users can view own credits"
    ON user_credits FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

-- Users can update their own credits (for free tier consumption)
CREATE POLICY "Users can update own credits"
    ON user_credits FOR UPDATE
    USING ((SELECT auth.uid()) = user_id);

-- Users can insert their own credits row
CREATE POLICY "Users can insert own credits"
    ON user_credits FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- Service role can do everything (for webhook fulfillment)
CREATE POLICY "Service role full access credits"
    ON user_credits FOR ALL
    USING ((SELECT auth.role()) = 'service_role');

-- Transaction audit log: users can read their own
CREATE POLICY "Users can view own transactions"
    ON credit_transactions FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

-- Service role can insert transactions (webhook)
CREATE POLICY "Service role full access transactions"
    ON credit_transactions FOR ALL
    USING ((SELECT auth.role()) = 'service_role');

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created ON credit_transactions(created_at DESC);
