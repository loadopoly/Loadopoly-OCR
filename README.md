# GeoGraph Node

[![MIT License](https://img.shields.io/badge/Code-MIT-blue.svg)](LICENSE)
[![Data CC0](https://img.shields.io/badge/Data-CC0-brightgreen.svg)](DATA-LICENSE.md)
[![Privacy Policy](https://img.shields.io/badge/Privacy-Policy-orange.svg)](PRIVACY-POLICY.md)
[![Version](https://img.shields.io/badge/Version-2.5.1-blueviolet.svg)](RELEASE_NOTES.md)

**Open-source code (MIT) • Public-domain contributions (CC0) • Commercial dataset licensing available**

An advanced OCR-to-Graph platform integrating GIS metadata, semantic NLP processing, immersive 3D world navigation, and sharded NFT asset management for LLM training data.

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/loadopoly/Loadopoly-OCR.git
cd Loadopoly-OCR

# Install dependencies
npm install

# Copy environment template and add your keys
cp .env.example .env.local
# Edit .env.local with your Supabase and Gemini API keys

# Start development server
npm run dev
```

### Environment Setup

Create a `.env.local` file with:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GEMINI_API_KEY=your-gemini-api-key
VITE_DCC1_ADDRESS=0x71C7656EC7ab88b098defB751B7401B5f6d89A21
```

Get your credentials:
- **Supabase:** [supabase.com/dashboard](https://supabase.com/dashboard) → Project Settings → API
- **Gemini API:** [makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)
- **Web3:** The `VITE_DCC1_ADDRESS` is the contract address for the Shard NFT on Polygon.

---

## 🛡️ Security & Production

### Row Level Security (RLS)
For mass usage, ensure your Supabase tables have RLS enabled. The project includes `sql/FIX_TABLE_RLS.sql` which sets up:
- **Public Read:** Anyone can view the global corpus.
- **Owner Update/Delete:** Only the user who created a record (via `USER_ID`) can modify or delete it.
- **Anonymous Contributions:** Supports anonymous uploads while protecting authenticated user data.

### Production Deployment
1. **Vercel:** The project is optimized for Vercel. Connect your GitHub repo and it will auto-deploy.
2. **Environment Variables:** Add all `VITE_` variables in the Vercel dashboard.
3. **PWA:** The app is a full PWA. Ensure you serve it over HTTPS for service worker support.

---

## 🚀 What's New in v2.4.0

### 🔌 Modular Plugin Architecture (NEW)

A comprehensive pluggable architecture enabling extensibility and self-healing capabilities.

**Module System:**
- 🧩 **Plugin Loader** - Dynamic loading of third-party extensions
- 🔄 **Module Registry** - Central registry for renderers, LLM providers, and storage adapters
- 📡 **Event System** - Pub/sub event emitter for module communication
- 🏥 **Graph Healer** - Self-healing graph with deduplication, orphan linking, edge inference

**Pluggable Providers:**
- 🤖 **LLM Providers** - Swap between Gemini, OpenAI, or custom AI backends
- 💾 **Storage Adapters** - Abstract interface supporting Supabase, Firebase, or custom backends
- 🎨 **Renderer Modules** - Register custom graph visualizers (includes Three.js 3D renderer)

**Feature Flags:**
- 🚩 A/B testing support with rollout percentages
- 👤 User tier gating (novice, intermediate, expert)
- 💾 LocalStorage and environment-based providers

```typescript
// Example: Register a custom LLM provider
import { moduleRegistry, BaseLLMProvider } from './modules';

class MyCustomLLM extends BaseLLMProvider {
  name = 'custom-llm';
  // ... implementation
}

moduleRegistry.registerLLMProvider(new MyCustomLLM());
```

See [src/modules/](src/modules/) for complete documentation.

### 🎨 Enhanced UX/UI System
A comprehensive overhaul focusing on accessibility, user experience, and design polish.

**Theme System:**
- 🌙 Dark/Light mode toggle with system preference detection
- 🔍 High contrast mode for accessibility (WCAG AA compliant)
- ⏸️ Reduced motion support respecting user preferences
- CSS custom properties for consistent theming across components

**Global Semantic Search:**
- ⌨️ `Cmd+K` / `Ctrl+K` to open search anywhere
- 🔍 Filter by GIS locations, entities, documents, dates, keywords
- 🧠 Fuzzy matching for typo-tolerant results
- ⏱️ Recent searches history
- Full keyboard navigation

**Enhanced Onboarding:**
- Multi-step wizard: Welcome → Account → API Keys → Demo → Customize
- Progressive disclosure based on experience level
- Secure API key input with validation
- Skip options for experienced users

**2D Map Fallback:**
- Canvas-based alternative to 3D metaverse
- Touch gestures with pinch-to-zoom
- Haptic feedback on mobile
- Type-based filtering

**Analytics & Tracking:**
- Funnel analysis for drop-off detection
- Performance metrics (Core Web Vitals)
- In-app survey system

**Error Handling:**
- Contextual error messages with actionable suggestions
- OCR failure: "Retry or Edit Manually"
- Network issues: Offline mode support
- Copy error details for support

---

## 🚀 What's New in v2.2.0

### 📖 Story Navigator - "Choose Your Own Adventure"
The Knowledge World now guides you through your corpus with an immersive narrative experience, transforming data exploration into an interactive story.

**Narrative Engine:**
- **Procedural Story Generation:** Each node becomes a story chapter with contextual narratives
- **Mood System:** Chapters adopt moods (mysterious, revelatory, contemplative, exciting, melancholic) based on context
- **Thematic Icons:** Node types have distinct themes (👤 Human Story, 🗺️ Places & Memory, 🏛️ Institutions, ⏳ Echoes of Time, 💡 Ideas & Beliefs, 📜 Written Records)

**Typewriter Text Animation:**
- Text reveals gradually for immersive reading
- Skip button for quick navigation
- Reading time estimates per chapter

**Branching Story Choices:**
- Each chapter offers 1-3 paths to continue your journey
- Difficulty indicators: Easy (straightforward) → Medium (questions remain) → Challenging (complex connections)
- Teaser text hints at what awaits down each path
- Consequence previews help you choose

**Journey Tracking:**
- Breadcrumb trail of your exploration history
- Summary of visited themes and key figures
- Reset to start fresh adventures

### 📸 Corpus Photo Integration
Your captured images are now woven into the exploration experience:

- **Floating Thumbnail Grid:** Top-left preview of your photo corpus
- **Chapter Artifacts:** Related photos displayed inline with story chapters
- **Photo Gallery:** Navigate between multiple views of bundled assets
- **Direct Asset View:** Click any photo to see full details

### 🐢 Contemplative World Movement
- **Slow Rotation:** World now takes ~5 minutes for a full revolution (was ~10 seconds)
- **Spatial Awareness:** Slower movement lets you absorb connections and context
- **Meditative Experience:** Encourages thoughtful exploration over rapid scanning

### 🎛️ Panel System
- **Switchable Modes:** Toggle between Story Navigator (📖) and Knowledge Explorer (🗺️)
- **Expandable Panels:** Click expand for wider view (384px → 480px)
- **Navigation Hint:** "Click nodes to start your story"

---

## 🚀 What's New in v2.1.0

### 🔄 Smart Deduplication & Data Consolidation
Multiple photos of the same subject are now automatically detected and bundled together, preventing data dilution and improving training corpus quality.

**Semantic Similarity Detection:**
- **Title Similarity:** Levenshtein distance matching for fuzzy title comparison
- **Entity Overlap:** Jaccard similarity for shared entities (e.g., same person, location)
- **Keyword Matching:** Common keywords indicate related content
- **GPS Proximity:** Photos taken within ~100m are likely the same subject
- **GIS Zone Correlation:** Same geographic zone adds confidence

**Consolidated Metadata:**
When duplicates are detected (similarity > 55%), metadata is intelligently merged:
- Best quality description preserved with unique details from variants
- All entities combined (deduplicated)
- All keywords merged
- Most common category selected
- Title shows view count: "Bronze Bust by Antonio T. (3 views)"

### 🌐 Interactive Knowledge Explorer
The 3D World view has been completely redesigned for deep exploration:

**Force-Directed Layout:**
- Nodes organically arrange based on actual connections
- Related concepts cluster together naturally
- Physics simulation creates intuitive spatial relationships

**Deep Exploration Sidebar:**
- **Direct Connections:** See all nodes linked to selected node with relationship types
- **Discovery Paths:** Follow routes through the graph to find unexpected connections
- **Thematic Clusters:** Groups of related nodes by type (Person Network, Location Network, etc.)
- **Exploration History:** Backtrack through your journey

**Visual Engagement:**
- Animated particles flow along highlighted connections
- Glow effects on hover/selection
- Slow world rotation for spatial awareness
- Connection highlighting shows relationships at a glance
- Type filter pills to focus on specific entity types

**New Controls:**
- Working zoom in/out/reset
- Toggle labels visibility
- Toggle link visibility
- Collapse/expand explorer sidebar

---

## 🚀 What's New in v2.0.0

### 🌐 Metaverse Foundation & 3D World Navigation
The knowledge graph is no longer just a 2D visualization—it's now a navigable 3D space where users can explore data as a spatial environment.

**Avatar Persistence System:**
- **User Avatars:** Persistent identity with customizable appearance, display names, and contribution-based XP
- **Real-time Presence:** See other users exploring the same data sectors in real-time
- **Heartbeat Tracking:** Automatic status updates (ACTIVE, IDLE, AWAY) based on activity
- **Exploration Points:** Earn XP by discovering new nodes and contributing data

**3D World Renderer:**
- **Isometric Projection:** 2D canvas fallback for broad browser compatibility
- **Three.js Ready:** Optional WebGL rendering with @react-three/fiber (install three.js)
- **Sector Navigation:** World divided into semantic zones (archive, research, marketplace, etc.)
- **Real-time Multi-user:** See nearby avatars with position tracking

**New Database Tables:**
- `user_avatars` - Avatar customization, XP, and badge progression
- `presence_sessions` - Real-time position and activity tracking
- `realtime_events` - Event queue for world state changes
- `world_sectors` - Spatial partitioning of the knowledge graph

### ⚡ Database Performance Optimizations
Production-ready indexing strategy for high-throughput workloads:

**BRIN Indexes (Block Range Index):**
- 10x smaller than B-tree for time-series CREATED_AT columns
- Optimized for sequential timestamp queries

**GIN Indexes (Generalized Inverted Index):**
- Fast JSONB searches on ENTITIES_EXTRACTED, KEYWORDS_TAGS, GEO_CONTEXT
- Full-text search on EXTRACTED_TEXT

**Partial Indexes:**
- Processing queue optimization: index only PENDING/FAILED items
- Curator workflow: index only verified/featured assets

**Monitoring Views:**
- `index_usage_stats` - Track which indexes are being used
- `table_stats` - Row counts, live/dead tuple ratios
- `cache_hit_stats` - Buffer cache efficiency metrics

### New Files
- `sql/AVATAR_PERSISTENCE_SCHEMA.sql` - Avatar and presence tables with RLS
- `sql/DATABASE_OPTIMIZATION.sql` - Performance indexes and monitoring
- `src/services/avatarService.ts` - Avatar state management service
- `src/hooks/useAvatar.ts` - React hook for avatar state
- `src/components/metaverse/WorldRenderer.tsx` - 3D world visualization

### Navigation
- **New Tab:** Access the 3D World via the Globe icon in the sidebar
- **Keyboard Shortcut:** Press `w` to switch to World view

---

## 🚀 What's New in v1.9.4

### 🌱 GARD Tokenomics Integration (SocialReturnSystem)
- **Fractional Shard Ownership:** Each tokenized data asset is divided into 1,000 tradeable shards, enabling micro-investments in high-quality datasets.
- **10% Royalty Recycling:** Every transaction triggers automatic royalty distribution:
  - 50% to Community Fund (social return projects)
  - 30% to Shard Holders (proportional rewards)
  - 20% to Platform Maintenance
- **DAO Governance Voting:** Shard holders vote on community proposals with weight proportional to their holdings.
- **Social Returns Dashboard:** Track royalty distributions, system sustainability metrics, and community fund allocations.
- **Self-Sustaining Economics:** Real-time sustainability meter showing system health via the GARD formula: G_t ≥ N_t.
- **Genesis Asset Multipliers:** Early contributors receive 1.5x rewards on genesis period assets.

### New Components
- **Social Returns Tab:** Access via the "Sprout" icon in sidebar navigation
- **Royalty Dashboard:** Real-time stats, sustainability indicator, recent transactions
- **Shard Portfolio:** View holdings, track unrealized gains, claim pending rewards
- **Governance Voting:** Browse active proposals, cast votes, view voting history

### Smart Contract
- New `GARDDataShard.sol` ERC1155 contract with EIP-2981 royalty standard
- Automated on-chain royalty distribution on Polygon network

### Database Schema
- Run `sql/GARD_SCHEMA.sql` to add GARD tables and functions to your Supabase instance

## 🚀 What's New in v1.9.3
- **Communities & Social Layer:** Introduced a comprehensive community system allowing users to create, join, and manage private or public groups.
- **Community Data Baselines:** The Knowledge Graph and Semantic View can now be filtered by specific community data, enabling collaborative research and private data sharing.
- **User-to-User Messaging:** Integrated a secure messaging system for curators to communicate, trade insights, and coordinate data collection.
- **Data Gifting:** Users can now send Digital Assets and Data Bundles as "Gifts" directly within the messaging interface, facilitating peer-to-peer data exchange.
- **Processing Visibility Panel:** Added a global, persistent processing queue panel (accessible via the Zap icon) for real-time monitoring of background AI tasks.

## 🚀 What's New in v1.9.2
- **Intelligent Data Aggregation:** Implemented LLM-based visual tagging (`ASSOCIATIVE_ITEM_TAG`) to automatically group multiple photos of the same physical item into cohesive data bundles.
- **Streamlined Quick Processing:** Simplified the ingestion workflow with a single "Upload Documents" button and automatic AI-driven categorization, removing the need for manual scan type selection.
- **Mass Processing Controls:** Added "Process All Pending" functionality to both Quick Processing and Structured DB views, enabling one-click processing for large local or master datasets.
- **AR Scanner UX Refinement:** Improved the AR Scanner workflow to allow users to return to the photograph action if they cancel the processing confirmation, preventing accidental session loss.

### Previous (v1.9.1)
- **Curator Mode:** Introduced a dedicated "Curator" view for manual asset management, allowing users to override AI annotations and create custom bundles.
- **Manual Bundling:** Users can now multi-select assets and group them into persistent "User Defined Bundles" that bypass automatic clustering logic.
- **Deterministic AI Extraction:** Implemented fixed seeding for Gemini 2.5 Flash to ensure consistent metadata extraction across multiple photos of the same object.
- **AR UI Optimization:** Relocated the "Process Session" bubble in the AR Scanner to prevent overlap with the shutter button on mobile devices.
- **Global Processing & Recovery:** Enabled "Contribute" (processing) in the Master view and added "Retry" logic for assets stuck in a processing state.
- **Schema Expansion:** Added `IS_USER_ANNOTATED` and `USER_BUNDLE_ID` columns to the Supabase schema to support manual curation and persistent user collections.

### Previous (v1.8.1)
- **Production Hardening:** Standardized project metadata and environment variables.
- **Security Enhancements:** Improved RLS policies for owner-based data protection.
- **Cleanup:** Removed debug logs and optimized build configuration.
- **Global Schema Standardization:** Completed a full codebase and database migration to **UPPERCASE** column names.
- **Master View Restoration:** Fixed critical `PGRST204` errors in the "Master" cloud view by synchronizing frontend queries with the new UPPERCASE schema.
- **Automated Migration Scripts:** Added `sql/FIX_ALL_TABLES_COLUMNS_TO_UPPERCASE.sql` to provide a one-click solution for standardizing existing Supabase instances.
- **Type Safety Hardening:** Refactored `database.types.ts` and `types.ts` to strictly enforce the UPPERCASE schema, reducing runtime errors during data mapping.
- **API Compatibility:** Updated Vercel serverless functions to support the standardized schema for dataset exports and Web3 operations.

### Previous (v1.7.8)
- **Database Stability:** Organized all SQL migration and fix scripts into a dedicated `sql/` directory for easier maintenance.
- **RLS Policy Fixes:** Added `sql/FIX_TABLE_RLS.sql` to resolve "new row violates row-level security policy" errors during upload.
- **Enterprise Features:** Added `IS_ENTERPRISE` flag and accessibility metadata fields (`alt_text_short`, `reading_order`, etc.) to the core schema.
- **Reliable Ingestion Pipeline:** Fixed "new row violates row-level security policy" errors by deferring cloud sync until processing is complete, ensuring compatibility with restricted RLS environments.
- **Local-First Persistence:** Initial ingestion states are now saved to IndexedDB immediately, preventing data loss during processing.
- **Improved Error Recovery:** Better handling of processing failures with automatic local fallback and detailed error reporting in the queue.

### Previous (v1.7.2)
- **Automatic Cloud Sync:** All assets (including failed ones) are now automatically synced to Supabase cloud storage upon import, regardless of authentication status.
- **Robust Data Mapping:** Improved handling of case-insensitive database columns (ASSET_ID vs asset_id) for better cloud-to-local synchronization.
- **Marketplace Restoration:** Fixed the data marketplace view and bundle purchase logic.
- **Developer Tools:** New "Debug Mode" in settings for verbose logging and detailed AI processing error reports.
- **Cloud Fallback:** Implemented smart fallback for global corpus fetching to ensure the "Master" view remains functional even with schema inconsistencies.

### Previous (v1.7.0)
- **Human Integration Factor:** Smart suggestions engine on the dashboard for guided onboarding.
- **Real-time Status Bar:** Persistent monitoring of network, sync, and local asset counts.
- **Enhanced Auth Flow:** Redesigned sign-in experience with clear value propositions for cloud sync.
- **Hardware Bridge Improvements:** Better visual feedback for network scanner connections.
- **Device Friendliness:** Optimized touch targets and responsive layouts for mobile/tablet use.

### Previous (v1.6.2)
- **Enhanced UI/UX:** Toast notifications, skeleton loading, error boundaries with recovery
- **Onboarding Flow:** 6-step interactive guide for new users
- **Keyboard Shortcuts:** Press `?` to view all available shortcuts
- **Accessibility (WCAG 2.1 AA):** Full screen reader support, keyboard navigation, reduced motion
- **Offline Indicator:** Real-time connection status with sync notifications
- **Build Scripts:** Extension packaging ready for Chrome Web Store submission

### Previous (v1.6.1)
- **Supabase Cloud Storage:** Automatic cloud storage for authenticated users
- **Advanced PWA Suite:** Window Controls Overlay, File Handling, Share Target
- **System Widgets:** Windows 11/Android widgets for OCR status monitoring

---

## 🖼️ Visual Tour

### Dashboard & Intelligence
![Dashboard Overview](public/screenshot-desktop-1.png)
*The central command center showing global stats, recent graph activity, and real-time GIS environment context.*

### Knowledge Graphs & Structured Data
<div align="center">
  <img src="public/screenshot-desktop-3.png" width="48%" alt="Knowledge Graph" />
  <img src="public/screenshot-desktop-2.png" width="48%" alt="Structured Database" />
</div>
*Left: Relational mapping of entities extracted by Gemini 2.5 Flash. Right: Cloud dataframes with tabular cluster view.*

### Mobile Experience
<div align="center">
  <img src="public/screenshot-mobile-1.png" width="30%" alt="Mobile Dashboard" />
  <img src="public/screenshot-mobile-2.png" width="30%" alt="AR Scanner" />
</div>
*Fully responsive mobile interface with AR scanning capabilities.*

---

## About

GeoGraph Node transforms physical documents, artifacts, and locations into structured, AI-ready training data. Using Google's Gemini 2.5 Flash for intelligent extraction, the platform creates rich knowledge graphs, preserves GIS context, and enables fractional data ownership through blockchain technology.

### Storage Architecture

**Authenticated Users:**
- All uploads are automatically stored in Supabase cloud storage
- Images saved to `corpus-images` storage bucket
- Metadata persisted in `historical_documents_global` database
- Assets accessible across devices and sessions
- Full data portability and export capabilities

**Unauthenticated Users:**
- Temporary workspace using browser's IndexedDB
- Session-only storage (cleared on page refresh/close)
- Perfect for testing and one-time processing
- Can optionally contribute assets to global corpus
- No account required for basic functionality

### Use Cases

- **Archives & Museums:** Digitize collections with high-fidelity metadata extraction.
- **Historical Research:** Build complex, connected knowledge graphs from scanned documents.
- **AI/ML Training:** Generate high-quality, ethically sourced, and licensed training datasets.
- **Field Documentation:** Capture and catalog items with real-time location and environmental context.

---

## Support
- **Issues:** GitHub Issue Tracker
- **Email:** support@geograph.foundation
- **Discord:** [Join GeoGraph Community](https://discord.gg/geograph)

<p align="center"><sub>Built for the global open data movement.</sub></p>