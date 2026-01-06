# Changelog

All notable changes to this project will be documented in this file.
See [RELEASE_NOTES.md](RELEASE_NOTES.md) for a high-level summary of recent major updates.

## [2.2.0] - 2026-01-06

### Added
- **Story Navigator - "Choose Your Own Adventure" Experience:**
  - Narrative Engine generates contextual story chapters as you explore
  - Typewriter text animation for immersive reading
  - Branching story choices with difficulty indicators (easy/medium/challenging)
  - Mood system (mysterious, revelatory, contemplative, exciting, melancholic)
  - Journey summary tracking your exploration path
  - Reading time estimates for each chapter
  - Thematic icons and colors based on node types (Person, Location, Organization, Date, Concept, Document)
  
- **Corpus Photo Display:**
  - Floating thumbnail grid showing your captured images in the World view
  - Chapter-related artifacts shown inline with the narrative
  - Click-to-expand photo gallery with navigation between multiple views
  - Direct asset view integration from story context

- **Narrative Templates:**
  - Rich opening templates for story chapters
  - Connection-specific narratives (CREATED_BY, LOCATED_IN, MENTIONS, etc.)
  - Teaser text for story choices by node type
  - Mood-appropriate chapter transitions

### Changed
- **World Rotation Speed:** Dramatically slowed from ~10 seconds to ~5 minutes per revolution for contemplative exploration
- **Panel System:** Replaced single Knowledge Explorer with switchable Story Narrator / Knowledge Explorer modes
- **Panel Width:** Expandable panels (384px default, 480px expanded)
- **Navigation Hint:** Updated to "Click nodes to start your story"

### New Components
- `StoryNarrator.tsx`: Interactive narrative panel with typewriter effect, photo gallery, and branching choices
- `narrativeService.ts`: NarrativeEngine class for procedural story generation

### Technical
- CSS animations added for fadeIn, slideInRight, and pulse-glow effects

## [2.1.0] - 2026-01-06

### Added
- **Semantic Deduplication Service:** Intelligent detection and consolidation of duplicate/similar assets to prevent data dilution.
  - Jaccard similarity for entity and keyword overlap
  - Levenshtein distance for title/description comparison
  - GPS proximity matching
  - GIS zone correlation
  - Union-Find clustering algorithm for grouping duplicates
- **Consolidated Metadata:** When duplicates are detected, metadata is intelligently merged:
  - Best title preserved with view count (e.g., "Bronze Bust (3 views)")
  - Entities and keywords merged from all variants
  - Most common category selected
  - Descriptions combined with unique details preserved
- **Interactive Knowledge Explorer:** Complete redesign of the 3D World view:
  - Force-directed physics simulation for organic node clustering
  - Sidebar panel showing direct connections, discovery paths, and thematic clusters
  - Relationship type and direction indicators (→ outgoing, ← incoming)
  - Path exploration showing routes between high-relevance nodes
  - Random Discovery feature for serendipitous exploration
  - Exploration history with backtracking
- **Enhanced World Visualization:**
  - Animated particles flowing along highlighted connections
  - Glow effects on hovered/selected nodes
  - Slow world rotation animation
  - Connection highlighting on hover/select
  - Type filter pills to focus on specific entity types
  - Working zoom controls (previously non-functional)
  - Labels and links visibility toggles
  - Subtle grid background for spatial reference

### Changed
- **Bundle Service:** Now performs two-phase bundling:
  1. Semantic deduplication (similarity threshold 0.55)
  2. Traditional key-based bundling for unique assets
- **Asset Display:** Bundled duplicates show image count and consolidated view

### Fixed
- **React 19 Compatibility:** Updated @react-three/fiber to v9.0.0, @react-three/drei to v9.122.0, three to v0.172.0
- **Vercel Deployment:** Added .npmrc with legacy-peer-deps for Expo peer dependency conflicts

### New Services
- `deduplicationService.ts`: Similarity scoring, duplicate clustering, metadata consolidation

### New Components
- `KnowledgeExplorer.tsx`: Interactive sidebar for deep graph exploration

## [2.0.0] - 2025-01-15

### Added
- **Metaverse Foundation:** Complete infrastructure for 3D world navigation and avatar persistence.
- **Avatar Persistence System:** User avatars with customizable appearance, XP progression, and badge system.
- **Real-time Presence Tracking:** Multi-user presence with heartbeat monitoring and activity status (ACTIVE/IDLE/AWAY).
- **3D World Renderer:** Isometric canvas rendering with Three.js-ready architecture for WebGL upgrade path.
- **Sector Navigation:** World divided into semantic zones (archive, research, marketplace, community, personal, special).
- **Exploration Points:** XP rewards for discovering new nodes and contributing data.
- **Database Optimizations:** BRIN indexes for time-series data, GIN indexes for JSONB searches, partial indexes for processing queues.
- **Monitoring Views:** Production-ready observability with index_usage_stats, table_stats, and cache_hit_stats views.

### New SQL Schemas
- `sql/AVATAR_PERSISTENCE_SCHEMA.sql`: Avatar tables, presence tracking, world sectors, RLS policies
- `sql/DATABASE_OPTIMIZATION.sql`: Performance indexes, monitoring views, autovacuum tuning

### New Components
- `WorldRenderer.tsx`: 3D/isometric world visualization with real-time multi-user presence
- `src/components/metaverse/index.ts`: Metaverse component exports

### New Services
- `avatarService.ts`: Avatar initialization, position updates, presence management, exploration rewards

### New Hooks
- `useAvatar`: Avatar state, nearby users, sector tracking, position updates
- `useWorldSectors`: Fetch available world sectors
- `useContributionProgress`: Track contribution milestones

### Changed
- **App Navigation:** Added "3D World" tab with Globe icon (keyboard shortcut: `w`)
- **Mobile Menu:** World tab added to responsive navigation
- **Types:** Extended with UserAvatar, PresenceSession, WorldSector, and METAVERSE_CONFIG
- **Package Version:** Bumped to 2.0.0 with optional three.js dependencies

### Database Tables
- `user_avatars`: Avatar customization, XP, badges, contribution stats
- `presence_sessions`: Real-time position and activity tracking
- `realtime_events`: Event queue for world state changes
- `world_sectors`: Spatial partitioning with zone types and themes

## [1.9.4] - 2025-01-01

### Added
- **GARD Tokenomics System:** Complete integration of the SocialReturnSystem (GARD) framework for self-sustaining data economy.
- **Fractional Shard Ownership:** Each tokenized asset divided into 1,000 tradeable shards with full portfolio tracking.
- **10% Royalty Recycling:** Automatic distribution (50% Community, 30% Holders, 20% Maintenance) on all transactions.
- **DAO Governance Voting:** Weighted voting on community fund proposals based on shard holdings.
- **Social Returns Dashboard:** Real-time sustainability metrics, transaction history, and community fund tracking.
- **GARDDataShard Contract:** ERC1155 smart contract with EIP-2981 royalty standard for on-chain enforcement.
- **GARD Database Schema:** New tables (royalty_transactions, shard_holdings, community_fund, social_return_projects, governance_votes, gard_tokenized_assets, pending_rewards) and PostgreSQL functions.

### New Components
- `RoyaltyDashboard.tsx`: Stats grid, sustainability meter, transaction table
- `ShardPortfolio.tsx`: Holdings table, rewards claiming, unrealized gains
- `GovernanceVoting.tsx`: Proposal list, voting interface, progress visualization

### New Services
- `royaltyEngine.ts`: Core GARD calculations (royalty distribution, liquidity generation, sustainability)
- `communityFund.ts`: Fund management, proposal submission, voting
- `shardMarket.ts`: Portfolio tracking, shard trading, reward claiming

### New Hooks
- `useGARDRoyalties`: Fetch system stats and transaction history
- `useShardPortfolio`: Manage user holdings and rewards
- `useGovernanceVoting`: DAO voting interface

### Changed
- **App Navigation:** Added "Social Returns" tab with Sprout icon in sidebar
- **Database Types:** Extended with GARD table definitions and helper types
- **Types:** Added GARD interfaces and GARD_CONFIG constants

## [1.9.3] - 2025-12-31

### Added
- **Communities System:** Support for creating and joining communities with admission request management.
- **Community Filtering:** Global state integration to filter assets, graphs, and semantic views by community ID.
- **Messaging System:** Real-time chat interface for user-to-user communication.
- **Data Gifting:** Ability to send and claim digital assets and bundles within messages.
- **Processing Panel:** Persistent UI component for monitoring background processing tasks.

### Changed
- **App State:** Integrated `selectedCommunityId` into the global asset memoization.
- **UI:** Added "Communities" and "Messages" tabs to the main navigation.
## [1.9.0] - 2025-12-24

### Added
- **Curator Mode:** New dedicated view for manual asset curation and annotation editing.
- **Manual Bundling:** Support for user-defined bundles that override automatic clustering logic.
- **Annotation Editor:** Component for manual metadata refinement with `IS_USER_ANNOTATED` tracking.
- **Deterministic AI:** Fixed seed (42) for Gemini 2.5 Flash to ensure consistent extractions.
- **Retry Logic:** Manual "Retry" button for assets stuck in the processing state.
- **Schema Migration:** `sql/ADD_CURATOR_COLUMNS.sql` for manual curation support.

### Changed
- **AR UI:** Relocated processing buttons in `ARScene` to prevent shutter obstruction.
- **Master View:** Enabled "Contribute" (processing) functionality for the global corpus.
- **Bundle Service:** Refactored to respect `USER_BUNDLE_ID` and exclude manually bundled assets from auto-clustering.

## [1.8.1] - 2025-12-23

### Fixed
- **UUID Validation Error:** Switched from short random strings to standard UUID v4 for all asset and record identifiers. This resolves `22P02` errors in Supabase when columns are configured as `UUID` type.

## [1.8.0] - 2025-12-23

### Changed
- **Global Schema Standardization:** Migrated all database column names to UPPERCASE to resolve PostgREST case-sensitivity issues and ensure consistent query behavior.
- **TypeScript Refactor:** Updated `database.types.ts` and domain models to strictly use UPPERCASE keys, improving type safety and reducing runtime errors.
- **Supabase Service Optimization:** Refactored `supabaseService.ts` to use standardized UPPERCASE identifiers in all queries and data mappings.

### Fixed
- **Build Stability:** Resolved TypeScript errors in `App.tsx` related to missing `ID` and `CREATED_AT` fields in the initial asset creation logic.
- **Auth Integration:** Fixed lowercase column references in the account deletion and user asset retrieval flows.

## [1.7.1] - 2025-12-20

### Fixed
- **Gemini Engine Connectivity:** Resolved an issue where the Gemini API key was not correctly detected in browser environments by adding support for `VITE_GEMINI_API_KEY`.
- **SDK Integration:** Fixed a schema mismatch in the `@google/genai` SDK by correctly wrapping the request contents in an array.
- **Environment Configuration:** Updated `.env.example` and `README.md` with the correct environment variable naming for client-side exposure.

## [1.7.0] - 2025-12-19

### Added
- **Data Encryption:** Implemented client-side AES-GCM encryption for sensitive OCR text and document descriptions before cloud transmission.
- **Account Deletion:** Added a secure account deletion flow that removes all user-associated data from Supabase and the authentication system.
- **Web3 Transaction Logging:** Encrypted recording of on-chain minting events to the user's private cloud profile.
- **Automatic Cloud Sync:** Local assets are now automatically synchronized to the user's Supabase account upon login.

## [1.6.2] - 2025-12-19

### Added
- **Enhanced UI/UX:** Integrated `Toast` notifications for real-time feedback, `Skeleton` loading states for better perceived performance, and `ErrorBoundary` components with recovery options.
- **Onboarding Flow:** Added a 6-step interactive `Onboarding` guide to help new users navigate the GeoGraph ecosystem.
- **Keyboard Shortcuts:** Implemented a global `KeyboardShortcuts` listener (press `?` to toggle) for power-user navigation.

## [1.6.1] - 2025-12-19

### Added
- **Advanced PWA Features:** Implemented `file_handlers` for opening images/PDFs, `share_target` for receiving content from other apps, and `protocol_handlers` for `web+geograph://` deep links.
- **System Widgets:** Added Adaptive Card widgets (`status.json`) for Windows 11 and Android home screen integration.
- **Window Controls Overlay:** Enabled custom title bar area for a more native desktop application feel.
- **Asset Optimization:** Replaced SVG placeholders with high-quality PNG icons and screenshots in `public/` for better OS compatibility.

### Changed
- **Manifest Architecture:** Moved `manifest.json` and `sw.js` to `public/` root for correct scope resolution.
- **Cache Strategy:** Implemented aggressive cache busting (`v=3`) to ensure immediate propagation of PWA updates.

## [1.6.0] - 2025-01-07

### Added
- **Engine Upgrade:** Migrated to `gemini-2.5-flash` for blazing fast complex text reasoning and better entity extraction in messy scans.
- **Graph Visualizer Panning/Zooming:** Integrated `d3.zoom` into the `GraphVisualizer` component, enabling users to explore dense knowledge graphs via mouse/touch.
- **Structured DB Clusters:** Added a hierarchical "Cluster View" to the database tab, allowing grouping by Source, GIS Zone, Category, or Rights.
- **Cloud Refresh Logic:** Explicit "Refresh Cloud" button in Master View to force-pull latest dataframes from Supabase.
- **Relational Integrity:** Enhanced the Supabase fetching service to reconstruct D3-compatible nodes and links from flattened SQL records.

### Changed
- **Database Default View:** Set "Tabular View" as the default view for the database tab for better data density.
- **Metadata Labels:** Replaced the "Rights" column in the main database table with "Description" to prioritize semantic content visibility.
- **Collection Naming:** Integrated Gemini-suggested collection names to replace the generic "Batch Ingest" label.

### Fixed
- **Image Persistence:** Resolved a race condition where blob URLs were not being converted to permanent storage URLs fast enough for local persistence.
- **TypeScript Strictness:** Added missing types and `@ts-ignore` markers for `import.meta.env` access in non-Vite contexts.

## [1.5.1] - 2025-01-06

### Added
- **PWA Support:** Added `manifest.json` and meta tags to support installation as a standalone app on iOS, Android, and Desktop.
- **Mobile Optimizations:** Updated viewport settings to prevent accidental zooming on mobile inputs.

## [1.5.0] - 2025-01-05

### Added
- **Admin Broadcast Console:** Enabled administrators (and Master View users) to broadcast data to the network as "Public Airdrops".
- **Community Airdrops:** The Marketplace now features a dedicated section for "Community Airdrops (Free)", allowing all nodes to sync broadcasted data without cost.
- **CC0 Licensing Pipeline:** Ingestion pipeline updated to support explicit `CC0` (Public Domain) licensing triggers during broadcast events.

## [1.4.0] - 2024-12-28
- **Universal Data Ingestion:** Automatic background syncing to Supabase global corpus.
- **Anonymous Contributions:** Frictionless guest usage via session-based UUIDs.

## [1.0.0] - 2024-12-01
- Initial public release of the GeoGraph Node.