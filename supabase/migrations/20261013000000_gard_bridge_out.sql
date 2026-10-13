-- GARD Exchange bridge locks (services/exchange in the fleet repository).
--
-- When a GeoGraph user bridges shards into their GARD-Shard Marketplace store, the exchange
-- takes them out of shard_holdings and writes one row here in the same transaction. The
-- GARD side mints the same number of geograph:<ASSET_ID> to the user; the row here is how
-- the exchange knows the lock happened if anything fails between the two.
-- The exchange also creates this table itself (CREATE TABLE IF NOT EXISTS); this migration
-- records it in GeoGraph's own schema history.

CREATE TABLE IF NOT EXISTS public.gard_bridge_out (
    bridge_id   TEXT PRIMARY KEY,
    user_id     UUID NOT NULL,
    asset_id    TEXT NOT NULL,
    shards      INTEGER NOT NULL CHECK (shards > 0),
    gard_asset  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row level security with no policies: the anon and authenticated API roles cannot read or write it.
ALTER TABLE public.gard_bridge_out ENABLE ROW LEVEL SECURITY;
