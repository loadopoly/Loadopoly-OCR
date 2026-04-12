-- Relational Sizing Migration
-- Adds physical dimension tracking and reference scaling to graph nodes.

ALTER TABLE IF EXISTS graph_nodes 
ADD COLUMN IF NOT EXISTS "PHYSICAL_WIDTH_M" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "PHYSICAL_HEIGHT_M" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "PHYSICAL_DEPTH_M" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "IS_REFERENCE_OBJECT" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "STANDARD_VOLUME_M3" DOUBLE PRECISION;

COMMENT ON COLUMN graph_nodes."IS_REFERENCE_OBJECT" IS 'If true, this node acts as a known-size reference (e.g. standard water bottle) for scaling other nodes in the same spatial cluster.';

-- Update graph_edges to support distance scaling
ALTER TABLE IF EXISTS graph_edges
ADD COLUMN IF NOT EXISTS "RELATIVE_SCALE" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "IMAGE_BBOX_RELATION" JSONB;

COMMENT ON COLUMN graph_edges."RELATIVE_SCALE" IS 'Computed scale ratio between from_node and to_node based on visual perspective.';

-- Seed some standard reference objects for the "sizing dynamic"
-- A standard 500ml water bottle is approx 20cm tall.
INSERT INTO graph_nodes ("LABEL", "NODE_TYPE", "PHYSICAL_HEIGHT_M", "IS_REFERENCE_OBJECT", "CANONICAL_ID", "DESCRIPTION")
VALUES ('Standard Water Bottle', 'entity', 0.203, true, 'ref_bottle_500ml', 'Standard 500ml plastic water bottle as reference scale')
ON CONFLICT ("NODE_TYPE", "CANONICAL_ID") DO UPDATE 
SET "PHYSICAL_HEIGHT_M" = EXCLUDED."PHYSICAL_HEIGHT_M", "IS_REFERENCE_OBJECT" = true;

