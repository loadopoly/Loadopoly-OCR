-- Seed additional standard reference objects for the sizing dynamic
-- This allows the system to recognize common items and pull their real-world dimensions.

INSERT INTO graph_nodes ("LABEL", "NODE_TYPE", "PHYSICAL_HEIGHT_M", "PHYSICAL_WIDTH_M", "IS_REFERENCE_OBJECT", "CANONICAL_ID", "DESCRIPTION")
VALUES 
  ('Standard Soda Can', 'entity', 0.122, 0.066, true, 'ref_soda_can_12oz', 'Standard 12oz (355ml) aluminum soda can'),
  ('Credit Card', 'entity', 0.05398, 0.0856, true, 'ref_credit_card_iso', 'Standard ISO/IEC 7810 ID-1 credit card size'),
  ('Standard US Letter Paper', 'entity', 0.2794, 0.2159, true, 'ref_paper_us_letter', 'Standard US Letter paper (8.5 x 11 inches)'),
  ('A4 Paper', 'entity', 0.297, 0.210, true, 'ref_paper_a4', 'Standard A4 paper size'),
  ('iPhone 15', 'entity', 0.1476, 0.0716, true, 'ref_iphone_15', 'Standard iPhone 15 dimensions'),
  ('Basketball (Size 7)', 'entity', 0.24, 0.24, true, 'ref_basketball_size_7', 'Official Size 7 basketball diameter');

-- Index for faster reference lookup during graph healing
CREATE INDEX IF NOT EXISTS idx_graph_nodes_reference ON graph_nodes ("IS_REFERENCE_OBJECT") WHERE "IS_REFERENCE_OBJECT" = true;
