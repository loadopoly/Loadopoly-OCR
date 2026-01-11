# Changelog

All notable changes to this project will be documented in this file.
See [RELEASE_NOTES.md](RELEASE_NOTES.md) for a high-level summary of recent major updates.

## [2.5.8] - 2026-01-11

### Added
- **Cluster Sync Statistics Panel** - Human-in-the-loop comprehension interface:
  - **ClusterSyncStatsPanel.tsx** - Full-featured statistics overview modal:
    - Overview tab with key metrics: Total Assets, Fully Structured, Partially Classified, Unstructured
    - Visual pie chart showing classification distribution with quality score
    - LLM attribution tracking showing which models performed classifications
  - **Clusters tab** - Per-cluster progress visualization:
    - Progress bars for all 6 structured clusters (Temporal, Spatial, Content, Knowledge Graph, Provenance, Discovery)
    - Color-coded completion percentages with threshold indicators
    - Quick reference guide explaining what gets classified in each cluster
  - **Quality tab** - Corpus health metrics:
    - Circular quality indicators for Structured Coverage, Average Confidence, Overall Quality
    - Intelligent recommendations based on corpus state
    - Benefits summary of structured data for discovery
  - Seamless transition to full Cluster Synchronizer from any tab

- **ClusterSyncButton Component** - Easily identifiable button for Curator Mode:
  - Gradient background with primary-to-violet color scheme
  - GitMerge icon for visual recognition
  - Real-time percentage badge showing classification progress
  - Color-coded badge (green ≥80%, amber ≥50%, gray <50%)
  - Hover effects with scale transform

### Changed
- **App.tsx** - Integrated Cluster Sync UI into Curator Mode:
  - Added ClusterSyncButton to Curator Mode header (next to FilterBadge)
  - Button shows live stats calculating fully-structured asset count
  - ClusterSyncStatsPanel modal renders when button clicked

### Fixed
- **ClusterSynchronizer.tsx** - Fixed property access for LLM response:
  - Changed `result.analysis` to `result.rawAnalysis` to match `MetadataExtractionResult` interface

## [2.5.7] - 2026-01-11

### Added
- **Cluster Synchronizer Curator Tool** - LLM-powered structured classification system:
  - **6 Structured Cluster Columns** for synchronized dimension values:
    - `STRUCTURED_TEMPORAL` - Era, Historical Period, Document Age
    - `STRUCTURED_SPATIAL` - Zone, Geographic Scale, Place Type
    - `STRUCTURED_CONTENT` - Category, Scan Type, Media Type, Subject Matter
    - `STRUCTURED_KNOWLEDGE_GRAPH` - Node Type, Connection Density, Narrative Role
    - `STRUCTURED_PROVENANCE` - License, Verification Level, Contested
    - `STRUCTURED_DISCOVERY` - Source, Entity Types, Serendipity Score, Research Potential
  - **LLM Attribution**: `CLASSIFICATION_LLM`, `CLASSIFICATION_DATE`, `CLASSIFICATION_VERSION`, `CLASSIFICATION_CONFIDENCE`

- **ClusterSynchronizer.tsx Component** - Interactive curator tool:
  - Per-cluster LLM classification with custom prompts
  - Bulk sync capability for corpus-wide classification
  - Progress tracking with pause/resume/skip controls
  - Export classification results as JSON
  - Learned mapping panel for similarity-based proxy classification

- **Structured Classification Mappings** - Similarity-based proxy classification:
  - `structured_classification_mappings` table for learned correlations
  - `classification_audit_log` for provenance tracking
  - `cluster_dimension_statistics` for corpus-wide dimension distribution
  - Helper functions: `find_structured_mapping()`, `get_dimension_distribution()`, `upsert_classification_mapping()`

- **Classification Status Filter Dimension** - New filter for structured vs unstructured:
  - `classificationStatus` dimension: structured | partial | unstructured
  - Quick filter presets: `structured_only`, `unstructured_only`, `partially_classified`
  - `getClassificationStatus()` utility function

- **New TypeScript Types** for structured clusters:
  - `StructuredTemporalCluster`, `StructuredSpatialCluster`, `StructuredContentCluster`
  - `StructuredKnowledgeGraphCluster`, `StructuredProvenanceCluster`, `StructuredDiscoveryCluster`
  - Classification fields on `HistoricalDocumentMetadata`

### Changed
- **FilterContext.tsx** - Added 25th filter dimension (`classificationStatus`) and 3 new quick filter presets
- **UnifiedFilterPanel.tsx** - Extended dimension icons and quick filter info for classification status
- **FilterDependencyVisualizer.tsx** - Added classification status node position
- **types.ts** - Extended `HistoricalDocumentMetadata` with 6 structured cluster columns and classification metadata

### Database
- **sql/STRUCTURED_CLUSTER_SCHEMA.sql** - Complete schema for structured classification:
  - ALTER TABLE for 10 new columns on `historical_documents_global`
  - 3 new tables: `structured_classification_mappings`, `classification_audit_log`, `cluster_dimension_statistics`
  - GIN indexes for JSONB columns
  - RLS policies for public read, authenticated write
  - Stored functions for mapping lookup and statistics

## [2.5.6] - 2026-01-11

### Added
- **Historian-Informed Filter System** - Comprehensive expansion of filter dimensions designed by Digital Transformation Public Historians:
  - **24 Filter Dimensions** organized into 6 thematic clusters:
    - *Temporal*: Era, Historical Period, Document Age
    - *Spatial*: GIS Zone, Geographic Scale, Place Type
    - *Content Classification*: Category, Scan Type, Media Type, Subject Matter
    - *Knowledge Graph*: Node Type, Connection Density, Narrative Role
    - *Provenance & Trust*: License, Confidence, Verification Level, Contested
    - *Discovery Modes*: Source, Status, Entities, Relevance, Serendipity Score, Research Potential

- **Historical Period Mapping** - Intelligent era-to-period derivation:
  - Victorian Era, Edwardian Period, Roaring Twenties, Jazz Age, Art Deco
  - Great Depression, Swing Era, WWII Home Front, Atomic Age
  - Mid-Century Modern, Space Age, Counterculture, Civil Rights Era
  - Disco Era, Digital Dawn, Information Age, Social Media Era

- **25+ Quick Filter Presets** - New historian and discovery-focused presets:
  - *Trust & Verification*: Expert Verified, Community Curated
  - *Historical Periods*: Turn of Century (1890s-1910s), Interwar Period (1920s-1930s), Postwar Modern (1950s-1970s)
  - *Discovery Modes*: Serendipity High, Research Goldmine, Hidden Connections, Lonely Artifacts
  - *Subject-Focused*: People Stories, Place Histories, Ephemera Treasures
  - *Narrative Roles*: Narrative Anchors, Context Builders

- **Advanced Utility Functions** for dynamic dimension derivation:
  - `calculateSerendipityScore()` - Measures surprise potential from rare entities, contested status, cross-category links
  - `calculateResearchPotential()` - Scores scholarly value from entity richness, graph connectivity, confidence
  - `getConnectionDensity()` - Classifies graph role as Isolated/Linked/Hub based on connection count
  - `deriveNarrativeRole()` - Identifies story function: Protagonist, Setting, Evidence, Context
  - `deriveMediaType()` - Classifies format: Photograph, Map, Letter, Newspaper, etc.
  - `deriveGeographicScale()` - Determines scope: Local, Regional, National, International

- **Enhanced Dependency Graph** - 25+ filter relationships with historian-informed cascades:
  - Era → Historical Period, Document Age (automatic derivation)
  - Subject Matter → Narrative Role (content-to-story mapping)
  - Connection Density → Research Potential (hub identification)
  - Verification Level → Confidence (trust propagation)

### Changed
- **FilterContext.tsx** - Complete rewrite of dimension metadata with rich descriptions
- **UnifiedFilterPanel.tsx** - Extended to support all 24 dimensions with new icons
- **FilterDependencyVisualizer.tsx** - Reorganized node positions into thematic clusters
- **applyFilterToAsset()** - Context-aware filtering with full asset corpus access

## [2.5.4] - 2026-01-11

### Changed
- **Semantic View Integration** - Semantic Canvas is now a selectable sub-view within 3D World:
  - Removed Semantic View from the main sidebar navigation
  - Added view mode toggle in 3D World header (3D View / Semantic)
  - Streamlined navigation with cleaner sidebar structure
  - Semantic Canvas dynamically loads within the 3D World container

### Removed
- Standalone Semantic View sidebar item (now accessible via 3D World view toggle)
- `semantic` ViewMode type from FilterContext (consolidated into `world` view)

## [2.5.3] - 2026-01-11

### Added
- **Social Hub** - Unified interface condensing Communities, Messaging, and Social Returns (GARD) into a single, curated social experience.
- **Dynamic Filter Dependency System** - Comprehensive interdependent filtering across views:
  - `FilterContext` - Centralized React context managing filter state across all views
  - 12 filter dimensions: category, era, license, nodeType, zone, scanType, status, confidence, entities, relevance, contested, source
  - Dynamic dependency graph defining relationships between dimensions
  - Cross-view synchronization with toggle controls

- **UnifiedFilterPanel Component** - Sophisticated sliding panel UI:
  - Quick filter presets (Public Domain, High Confidence, Documents Only, etc.)
  - View sync toggles showing which views share filters
  - Analytics bar with real-time filter efficiency metrics
  - Expandable dimension cards with dependency constraint badges
  - Import/Export functionality for filter configurations

- **Dynamic LLM Selection & Configuration** - Expanded AI capabilities:
  - New "LLM Options & Credentials" section in Settings for managing multiple AI providers
  - Support for Gemini, GPT-4o, Claude 3.5 Sonnet, and Local (Ollama) configurations
  - Unified credential management (API Keys, Usernames, Logins) stored per-model
  - Real-time LLM status display in the sidebar Geo Location section
  - Updated preservation logs to track specific model agents used per process

- **InlineFilterBar Component** - Compact filter bar for each view:
  - Category, Era, and License dropdowns
  - Active filter count with clear button
  - Integrated into Knowledge Graph, 3D World, Structure DB, and Curator views

- **FilterDependencyVisualizer Component** - Interactive SVG visualization:
  - Circular layout of filter dimensions as nodes
  - Dependency edges with weight indicators
  - "Constrains" vs "Suggests" relationship types
  - Active filter highlighting with glow effects
  - Hover tooltips with dimension metadata

- **FilterInsightsPanel** - Dashboard widget in SmartSuggestions:
  - Collapsed summary bar showing filter stats
  - Cross-view dependency indicators
  - Embedded dependency graph toggle
  - AI-powered filter recommendations

### Changed
- **App.tsx** - Wrapped with FilterProvider, added sidebar toggle for Dynamic Filters
- **Knowledge Graph view** - Added FilterBadge and InlineFilterBar integration
- **3D World view** - Added header with FilterBadge and InlineFilterBar
- **Structure DB view** - Added FilterBadge and InlineFilterBar
- **Curator Mode view** - Added FilterBadge and InlineFilterBar
- **SmartSuggestions** - Added FilterInsightsPanel with dependency visualization

## [2.5.2] - 2026-01-11

### Fixed
- **Sidebar Scrolling** - Implemented `overflow-y-auto` on both desktop and mobile sidebars to ensure all navigation items are accessible on smaller viewports.
- **Custom Scrollbar** - Defined `.custom-scrollbar` utility in `index.css` for a cleaner, unified UI experience across the application.

## [2.5.1] - 2026-01-11

### Fixed
- **Service Worker Caching Issues** - Complete rewrite of `sw.js` (v2.0.0):
  - Fixed blank page issues caused by stale cached JS/CSS bundles
  - Fixed MIME type errors (`text/html` served instead of `text/css`)
  - Service worker now NEVER caches Vite-generated assets (`/assets/*`)
  - Network-first strategy for navigation requests
  - Auto-cleanup of stale assets on SW activation
  - Content-type validation before caching

- **Processing State Consistency** - Fixed mismatch between different views:
  - `handleProcessAllPending` now includes both PENDING and PROCESSING status
  - Assets start as PENDING and transition to PROCESSING when pipeline starts
  - Processing Queue panel shows unified view of batch queue + pending assets
  - Individual "Resume" button for each pending asset in queue panel
  - Real-time progress updates during processing pipeline

- **Bootstrap Race Condition** - Removed auto-initialization in `bootstrap.ts`
  that caused race conditions with explicit `bootstrapModuleSystem()` call

### Added
- **Loading State** - Immediate loading spinner while app initializes (no blank screen)
- **SW Update Detection** - Auto-prompts users when new version is available
- **Cache Recovery UI** - "Clear Cache & Reload" button in error screen for SW issues
- **Build Timestamp** - `__BUILD_TIME__` injection for debugging cache problems
- **Vercel Headers** - Proper MIME types and caching headers:
  - `X-Content-Type-Options: nosniff` prevents MIME sniffing
  - Immutable caching (1 year) for hashed assets
  - No-cache for `index.html` and `sw.js`

### Changed
- **Vite Build Config** - Added manual chunks for better caching:
  - `vendor-react` - React and React DOM
  - `vendor-ui` - Lucide React icons
  - `vendor-data` - Dexie and Supabase client
- Source maps now enabled for production debugging
- Pre-bundled common dependencies for faster dev startup

## [2.5.0] - 2026-01-09

### Added
- **Modular Plugin Architecture** (`src/modules/`):
  - `ModuleRegistry` - Central registry for all pluggable modules
  - `EventEmitter` - Mitt-style pub/sub system for module communication
  - `PluginLoader` - Dynamic loading of plugins from URLs or manifests
  - `PluginBuilder` - Fluent API for creating plugins

- **Abstract Storage Interface** (`src/modules/storage/`):
  - `IDataStorage` interface for swappable backends
  - `BaseStorage` abstract class with common functionality
  - `SupabaseStorage` - Full implementation for Supabase backend
  - `InMemoryStorage` - Testing/offline fallback storage

- **LLM Provider System** (`src/modules/llm/`):
  - `ILLMProvider` interface for AI backend abstraction
  - `BaseLLMProvider` with conflict arbitration defaults
  - `GeminiProvider` - Wraps existing Gemini service
  - `OpenAIProvider` - Alternative GPT-4o integration
  - `MockLLMProvider` - Testing fallback

- **Self-Healing Graph System** (`src/modules/graphHealer.ts`):
  - 4 built-in healing strategies:
    - `deduplication` - Merges duplicate nodes by similarity
    - `orphan-linking` - Links disconnected nodes to main graph
    - `edge-inference` - Infers edges from shared neighbors
    - `conflict-resolution` - LLM-powered metadata arbitration
  - Scheduled healing with configurable intervals
  - Healing history and event tracking

- **Feature Flags System** (`src/modules/featureFlags.ts`):
  - `LocalStorageFeatureFlagProvider` - Persistent browser storage
  - `EnvironmentFeatureFlagProvider` - Environment variable based
  - Rollout percentage support for gradual releases
  - User tier restrictions (novice, intermediate, expert)
  - Flag subscription for reactive UI updates

- **React Integration** (`src/hooks/useModules.ts`, `src/contexts/ModuleContext.tsx`):
  - `useFeatureFlag` - Check feature flag status
  - `useStorage` - Access active storage adapter
  - `useLLMProvider` - Access active LLM provider
  - `useGraphHealer` - Heal graphs on demand
  - `useModuleEvent` - Subscribe to module events
  - `ModuleProvider` - Context provider for module system

- **Example Plugin** (`src/plugins/threejs-renderer.tsx`):
  - Three.js 3D graph renderer with interactive controls
  - Demonstrates plugin architecture patterns
  - WebGL support detection

### Changed
- `src/index.tsx` now bootstraps the module system before app render
- Module system initializes LLM providers and storage adapters on startup

## [2.4.0] - 2026-01-09

### Added
- **Enhanced Theme System** (`useTheme.ts`):
  - Dark/Light mode toggle with system preference auto-detection
  - High contrast mode for accessibility (WCAG AA)
  - Reduced motion support for users who prefer minimal animations
  - CSS custom properties for consistent theming
  - Persistent user preferences via localStorage

- **Global Semantic Search** (`GlobalSearch.tsx`):
  - NLP-powered search with `Cmd+K` / `Ctrl+K` keyboard shortcut
  - Filter by category: GIS locations, entities, documents, dates, keywords
  - Fuzzy matching algorithm for typo-tolerant results
  - Recent searches history
  - Full keyboard navigation (↑↓ to navigate, Enter to select, Esc to close)

- **Enhanced Onboarding Wizard** (`EnhancedOnboarding.tsx`):
  - Multi-step setup: Welcome → Account → API Keys → Demo Tour → Customize
  - Social login integration ready (Supabase auth)
  - Secure API key input with visibility toggle and validation
  - Progressive disclosure based on user level (beginner/intermediate/advanced)
  - Optional step skipping for experienced users
  - Demo tour highlighting key features

- **2D Map Fallback for Metaverse** (`MapView2D.tsx`):
  - Canvas-based 2D alternative to 3D WebGL visualization
  - Touch support with pinch-to-zoom gestures
  - Haptic feedback on mobile devices
  - Pan/zoom controls with smooth transitions
  - Type-based node filtering (Document, Person, Location, etc.)
  - View mode switcher: Map, Grid, List

- **Analytics & Event Tracking** (`useAnalytics.ts`):
  - Comprehensive event tracking for user flows
  - Funnel analysis for drop-off detection (NFT minting, uploads, onboarding)
  - Session management with automatic start/end tracking
  - Performance metrics (Core Web Vitals)
  - In-app survey system for user feedback
  - Batch event queuing with configurable flush intervals

- **Enhanced Error States** (`ErrorState.tsx`):
  - Contextual error messages for OCR, upload, network, wallet failures
  - Actionable suggestions with retry options
  - Manual edit fallback for OCR failures
  - Inline and full-page error variants
  - Copy error details for support tickets
  - Help documentation links

### Changed
- **Tailwind Configuration:**
  - Extended color palette with earth tones for GIS surfaces
  - AI/metadata highlight colors (blue accent)
  - New animations: fade-in, slide-up, slide-down, pulse-glow, bounce-subtle, shimmer
  - Custom glow shadows for interactive elements
  - Font family configuration (Inter for UI, JetBrains Mono for code)
  - High contrast mode utilities

- **CSS Enhancements** (`index.css`):
  - CSS variables for light/dark theme switching
  - Screen reader utilities (`.sr-only`)
  - Focus visible styles for keyboard navigation
  - Reduced motion media query support
  - Custom scrollbar styling
  - Loading skeleton animation
  - Print-friendly styles

- **Accessibility Utilities** (`accessibility.ts`):
  - ARIA live region initialization
  - Color contrast ratio calculation (WCAG 2.1 formula)
  - Contrast requirement validation (4.5:1 normal, 3:1 large text)
  - Accessible text color suggestion based on background
  - Focus trap for modal dialogs
  - Arrow key navigation helpers
  - Screen reader description generators for images and graph nodes
  - Accessibility audit function for Lighthouse-style checks

### Technical
- New hooks: `useTheme`, `useAnalytics`, `useFunnelAnalytics`, `usePerformanceAnalytics`, `useSurveyAnalytics`
- New components: `GlobalSearch`, `EnhancedOnboarding`, `MapView2D`, `ErrorState`, `ProcessingState`, `EmptyState`
- Metaverse index exports updated for new 2D map component

## [2.3.0] - 2026-01-06

### Added
- **Enhanced Deduplication Service V2:** Complete rewrite of duplicate detection with modern NLP techniques:
  - **N-gram similarity:** Character trigrams for order-independent matching ("1950 Opening Day" ↔ "Opening Day 1950")
  - **Shingle similarity:** Word n-grams (1-gram, 2-gram, 3-gram) for semantic phrase matching
  - **Semantic concept extraction:** Prioritizes years (4x weight), dates, proper nouns, and key subjects
  - **Phonetic encoding:** Soundex-like algorithm for OCR error tolerance ("Antonio" ↔ "Antoneo")
  - **Multi-technique scoring:** Combines multiple similarity methods (takes best score)
  - **Research-backed algorithms:** Based on Near-Duplicate Detection (Henzinger 2006), SimHash (Charikar 2002), MinHash (Broder 1997)
  
- **Curator Merge Panel:** New manual curation UI for consolidating assets:
  - **Suggestions Tab:** AI-powered merge suggestions with one-click accept/reject
  - **Manual Merge Tab:** Select multiple assets and merge with custom title
  - **Find Similar Tab:** Search for assets similar to a selected reference
  - Similarity badges showing match confidence (High/Medium/Fair/Low)
  - Match reason tags explaining why items are suggested for merge
  - Expandable detail view showing all items and consolidated metadata
  - Selection-based workflow integrating with existing asset views

### Changed
- **Deduplication Threshold:** Lowered from 0.55 to 0.40 for better recall (catches more similar items)
- **Bundle Service:** Updated to use V2 deduplication with enhanced clustering algorithm
- **Union-Find Optimization:** Added path compression and rank optimization for faster clustering

### Technical
- `deduplicationServiceV2.ts`: New service with modern similarity algorithms (~750 lines)
- `CuratorMergePanel.tsx`: Manual curation component with suggestions, manual merge, and similarity search

### Research References
- M. Henzinger, "Finding Near-Duplicate Web Pages: A Large-Scale Evaluation of Algorithms" (SIGIR 2006)
- M. Charikar, "Similarity Estimation Techniques from Rounding Algorithms" (STOC 2002)
- A. Broder, "On the Resemblance and Containment of Documents" (SEQUENCES 1997)
- G. Navarro, "A Guided Tour to Approximate String Matching" (ACM Computing Surveys 2001)

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