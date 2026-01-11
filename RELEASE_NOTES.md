# 🚀 GeoGraph Node: v2.5.1 Release Notes

## 🔧 v2.5.1 - Stability & Caching Fixes (2026-01-11)

This hotfix release addresses critical issues with service worker caching that caused blank pages and MIME type errors in production.

### 🛠️ Service Worker v2.0.0

Complete rewrite of the PWA service worker to prevent caching issues:

| Issue Fixed | Solution |
|-------------|----------|
| Blank pages after deploy | JS/CSS bundles are NEVER cached |
| MIME type errors | Content-type validation + Vercel headers |
| Stale cache poisoning | Auto-cleanup on activation |
| Module load failures | Skip cache for `/assets/*` entirely |

### 🔄 Processing State Consistency

Fixed state synchronization across all views:
- Dashboard, Batch tab, and Processing Queue now show consistent status
- Assets properly transition: `PENDING` → `PROCESSING` → `MINTED`
- Individual "Resume" buttons in the Processing Queue panel
- Real-time progress bar updates during AI processing

### ⚡ Build Improvements

```
dist/
├── vendor-react-[hash].js   # React core (cached long-term)
├── vendor-ui-[hash].js      # UI components (cached long-term)
├── vendor-data-[hash].js    # Data layer (cached long-term)
├── index-[hash].js          # App entry
└── App-[hash].js            # Main app bundle
```

### 🆘 Recovery UX

New error handling for cache-related failures:
- Loading spinner shown immediately (no blank screen)
- "Clear Cache & Reload" button in error UI
- Auto-prompt when new version is available
- Build timestamp in console for debugging

---

# 🚀 GeoGraph Node: v2.5.0 Release Notes

This release delivers a **comprehensive UX/UI overhaul** focusing on accessibility, user experience, progressive disclosure, and design polish.

## 🎨 Theme System

### Dark/Light Mode
New `useTheme` hook provides seamless theme switching:

```tsx
import { useTheme } from './hooks/useTheme';

const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
```

| Feature | Description |
|---------|-------------|
| **System Detection** | Auto-detects OS preference (`prefers-color-scheme`) |
| **Manual Toggle** | User can override with light/dark/system |
| **Persistent Storage** | Preference saved to localStorage |
| **CSS Variables** | Theme tokens applied via custom properties |

### High Contrast Mode
- Toggle for users with visual impairments
- Meets WCAG AA contrast requirements (4.5:1 for text)
- Enhanced border visibility

### Reduced Motion
- Respects `prefers-reduced-motion` media query
- Animations disabled or minimized for accessibility

## 🔍 Global Semantic Search

New `GlobalSearch` component provides NLP-powered search across your corpus:

### Keyboard Shortcuts
- `Cmd+K` (Mac) / `Ctrl+K` (Windows) to open
- `↑↓` Arrow keys to navigate results
- `Enter` to select
- `Esc` to close

### Filter Categories
| Filter | Icon | Description |
|--------|------|-------------|
| All | 🔍 | Search everything |
| Locations | 📍 | GIS zones, coordinates |
| People & Orgs | 👤 | Entities extracted from OCR |
| Documents | 📄 | Titles, collections |
| Dates | 📅 | Historical dates |
| Keywords | 🏷️ | Tags, concepts |

### Fuzzy Matching
- Typo-tolerant search ("Antoneo" matches "Antonio")
- Word-order independent ("1950 Opening" matches "Opening 1950")
- Relevance scoring with percentage display

## 📖 Enhanced Onboarding Wizard

New multi-step onboarding flow replaces the simple intro:

### Steps
1. **Welcome** - Introduction to GeoGraph features
2. **Account** (Optional) - Sign up/login with email or skip
3. **API Keys** (Optional) - Configure Gemini API with secure input
4. **Demo Tour** - Interactive feature highlights
5. **Customize** - Set experience level and preferences

### Progressive Disclosure
| Level | Features Shown |
|-------|----------------|
| Beginner | Core upload, OCR, basic graph |
| Intermediate | + GIS, communities, sync |
| Advanced | + Web3, NFT minting, advanced GIS |

### User Preferences Hook
```tsx
import { useUserPreferences } from './components/EnhancedOnboarding';

const { preferences, updatePreferences } = useUserPreferences();
// preferences.level, preferences.showWeb3Features, etc.
```

## 🗺️ 2D Map Fallback

New `MapView2D` component for devices that struggle with WebGL:

### Features
- **Canvas Rendering:** Lightweight 2D alternative to Three.js
- **Touch Gestures:** Pinch-to-zoom, pan with finger/mouse
- **Haptic Feedback:** Vibration on node selection (mobile)
- **Type Filtering:** Show/hide node types (Person, Location, etc.)
- **View Modes:** Map (default), Grid, List

### Integration
```tsx
import { MapView2D } from './components/metaverse';

<MapView2D
  graphData={graphData}
  assets={assets}
  onNodeSelect={handleNodeSelect}
/>
```

## 📊 Analytics & Tracking

New analytics system for understanding user behavior:

### Event Types
- `upload_started`, `upload_completed`, `upload_failed`
- `ocr_processed`
- `nft_flow_started`, `nft_minted`, `nft_flow_abandoned`
- `onboarding_step`, `onboarding_completed`, `onboarding_skipped`
- `error_occurred`

### Funnel Analysis
```tsx
import { useFunnelAnalytics } from './hooks/useAnalytics';

const funnel = useFunnelAnalytics('nft-minting', [
  'select-assets',
  'connect-wallet',
  'confirm-mint',
  'complete'
]);

funnel.enterFunnel();
funnel.advanceStep(1);
funnel.abandonFunnel('wallet-rejected');
```

### In-App Surveys
```tsx
import { useSurveyAnalytics } from './hooks/useAnalytics';

const { openSurvey, completeSurvey, submitFeedback } = useSurveyAnalytics();
```

## ⚠️ Enhanced Error States

New `ErrorState` component with contextual error handling:

### Error Types
| Type | Use Case | Actions |
|------|----------|--------|
| `ocr_failed` | Text extraction failed | Retry, Edit Manually |
| `upload_failed` | File upload error | Try Again, Choose Different |
| `network_error` | Offline/connection lost | Retry, Work Offline |
| `wallet_error` | Web3 connection failed | Reconnect Wallet |
| `file_not_supported` | Invalid format | Choose Different File |
| `api_error` | Service unavailable | Retry, Check Status |

### Usage
```tsx
import { ErrorState } from './components/ErrorState';

<ErrorState
  type="ocr_failed"
  context={{
    message: "Image too blurry",
    onRetry: () => processAgain(),
    onManualEdit: () => openEditor()
  }}
/>
```

## ♿ Accessibility Improvements

### WCAG AA Compliance
- Color contrast ratios ≥4.5:1 for normal text
- Focus visible indicators on all interactive elements
- Screen reader announcements via ARIA live regions
- Keyboard navigation throughout

### New Utilities
```tsx
import {
  getContrastRatio,
  meetsContrastRequirements,
  trapFocus,
  runAccessibilityAudit
} from './lib/accessibility';

// Check if colors meet WCAG AA
meetsContrastRequirements('#ffffff', '#0f172a', 'normal'); // true

// Run audit
const { issues, warnings } = runAccessibilityAudit();
```

## 📦 New Files

```
src/
├── hooks/
│   ├── useTheme.ts          # Theme management
│   └── useAnalytics.ts      # Event tracking
├── components/
│   ├── GlobalSearch.tsx     # Semantic search modal
│   ├── EnhancedOnboarding.tsx # Multi-step wizard
│   ├── ErrorState.tsx       # Error handling UI
│   └── metaverse/
│       └── MapView2D.tsx    # 2D fallback renderer
├── lib/
│   └── accessibility.ts     # Enhanced a11y utilities
├── index.css                # Theme variables, animations
└── tailwind.config.js       # Extended design tokens
```

---

# 🚀 GeoGraph Node: v2.3.0 Release Notes

This release dramatically improves **duplicate detection** using modern NLP research and adds **manual curation tools** for intuitive asset consolidation.

## 🧠 Enhanced Deduplication V2

### Modern NLP Techniques
The new `deduplicationServiceV2.ts` implements research-backed algorithms:

| Technique | Purpose | Example |
|-----------|---------|---------|
| **N-gram Similarity** | Order-independent matching | "1950 Opening Day" ↔ "Opening Day 1950" |
| **Word Shingles** | Semantic phrase overlap | "Bronze Bust by Antonio" ↔ "Bust Sculpture Antonio Bronze" |
| **Semantic Concepts** | Prioritizes key data (years 4x weight) | Years, dates, proper nouns extracted |
| **Phonetic Encoding** | OCR error tolerance | "Antonio" ↔ "Antoneo", "Photograph" ↔ "Photogragh" |

### Research Foundation
Based on peer-reviewed algorithms:
- **Henzinger (2006):** Near-Duplicate Detection
- **Charikar (2002):** SimHash fingerprinting
- **Broder (1997):** MinHash for Jaccard estimation
- **Navarro (2001):** Fuzzy String Matching

### Improved Recall
- Threshold lowered from `0.55` to `0.40`
- Multi-technique scoring (takes best match)
- Union-Find with path compression and rank optimization

## 🎨 Curator Merge Panel

New UI component for manual asset consolidation:

### Suggestions Tab
- AI-powered merge suggestions
- One-click Accept/Reject actions
- Similarity badges: High (80%+), Medium (60%+), Fair (40%+)
- Match reason tags explaining why items are suggested

### Manual Merge Tab
- Multi-select assets from main view
- Custom title override option
- Preview consolidated metadata before merge

### Find Similar Tab
- Select a reference asset
- Search for similar items in your corpus
- Add matches to selection for bulk merge

## 📦 New Files
```
src/
├── services/deduplicationServiceV2.ts  # Modern NLP algorithms (~750 lines)
├── components/CuratorMergePanel.tsx    # Manual curation UI
```

## ⚙️ Technical Changes
- **Bundle Service:** Updated to use V2 deduplication
- **Clustering:** Union-Find with path compression and rank optimization
- **Scoring:** Best-of multiple techniques for higher recall

---

# 🚀 GeoGraph Node: v2.2.0 Release Notes

This release transforms the Knowledge World into an immersive **narrative exploration experience**, guiding users through their corpus like a "choose your own adventure" story.

## 📖 Story Navigator

### Narrative Engine
The new `narrativeService.ts` generates contextual stories as you explore:
- **Procedural Chapters:** Each node becomes a story chapter with dynamic narrative
- **Mood System:** Chapters adopt moods (mysterious, revelatory, contemplative, exciting, melancholic)
- **Thematic Templates:** Rich narrative templates for openings, connections, and transitions
- **Journey Tracking:** Your exploration path creates a unique story

### Interactive Story Experience
- **Typewriter Animation:** Text reveals gradually for immersive reading
- **Branching Choices:** 1-3 paths per chapter with difficulty indicators
- **Teasers & Consequences:** Hints about what awaits down each path
- **Skip & Reset:** Control your pace through the narrative

### Corpus Photo Integration
- **Floating Thumbnails:** Preview grid of your captured photos in World view
- **Chapter Artifacts:** Related photos displayed inline with narratives
- **Photo Gallery:** Navigate multiple views of bundled assets

## 🐢 Contemplative World Movement
- World rotation slowed from ~10s to ~5 minutes per revolution
- Encourages thoughtful exploration over rapid scanning

## 🎛️ Panel System
- **Story Navigator (📖):** Narrative exploration mode
- **Knowledge Explorer (🗺️):** Deep graph analysis mode
- **Expandable:** 384px default, 480px expanded width

## 📦 New Files
```
src/
├── services/narrativeService.ts  # NarrativeEngine class
├── components/metaverse/
│   └── StoryNarrator.tsx         # Story panel UI
```

## 🎨 CSS Additions
- `animate-fadeIn` - Smooth content transitions
- `animate-slideInRight` - Panel animations
- `animate-pulse-glow` - Selection effects

---

# 🚀 GeoGraph Node: v2.1.0 Release Notes

This update introduces **Semantic Deduplication** to prevent data dilution and a completely redesigned **Interactive Knowledge Explorer**.

## 🔄 Semantic Deduplication
Multiple photos of the same subject are automatically detected and bundled:
- Jaccard similarity for entity/keyword overlap
- Levenshtein distance for title comparison
- GPS proximity matching (~100m threshold)
- GIS zone correlation
- Union-Find clustering at 55% similarity threshold

## 🌐 Knowledge Explorer Redesign
- Force-directed physics layout
- Discovery paths and thematic clusters
- Animated particles on connections
- Exploration history with backtracking

---

# 🚀 GeoGraph Node: v2.0.0 Release Notes

This major release introduces the **Metaverse Foundation** with 3D world navigation and avatar persistence.

## 🌐 3D World Navigation
- Avatar persistence with XP progression
- Real-time presence for multi-user exploration
- Sector-based world partitioning
- Three.js ready with canvas fallback

## ⚡ Database Optimizations
- BRIN indexes for time-series queries
- GIN indexes for JSONB searches
- Partial indexes for workflow queues
- Monitoring views for performance tracking

---

# 🚀 GeoGraph Node: v1.9.4 Release Notes

This major update introduces the **GARD (SocialReturnSystem) Tokenomics Framework**, transforming GeoGraph from a document digitization tool into a **self-sustaining data economy** with measurable social returns.

## 🌱 GARD Tokenomics Integration

### Fractional Shard Ownership
- **1,000 Shards per Asset:** Each tokenized data asset is divided into 1,000 tradeable shards
- **Micro-Investments:** Enables fractional ownership of high-quality datasets
- **Portfolio Tracking:** View holdings, acquisition prices, unrealized gains, and current values

### 10% Royalty Recycling
Every transaction (sale, license, gift) triggers automatic royalty distribution:
- **50% Community Fund:** Allocated to DAO-governed social return projects
- **30% Shard Holders:** Proportional rewards based on holdings
- **20% Platform Maintenance:** Ensures operational sustainability

### DAO Governance
- **Weighted Voting:** Vote weight = (user_shards / total_shards) × 100
- **Proposal System:** Submit social return project proposals for community funding
- **Voting Periods:** 7-day default voting windows with real-time progress tracking

### Self-Sustainability Metrics
- **GARD Formula:** G_t = R_t + L_collateral,t + ROA_t
- **Sustainability Indicator:** Real-time meter showing G_t ≥ N_t compliance
- **70% LTV:** Loan-to-value ratio for asset-backed liquidity

## 🎯 New Features

### Social Returns Tab
Access via the **Sprout (🌱) icon** in the sidebar:
1. **Royalty Dashboard:** System stats, sustainability meter, transaction history
2. **Shard Portfolio:** View holdings, track gains, claim pending rewards
3. **Governance Voting:** Browse proposals, cast votes, view results

### Smart Contract
- **GARDDataShard.sol:** ERC1155 contract with EIP-2981 royalty standard
- **On-Chain Enforcement:** Royalty distribution on Polygon (Chain ID: 137)
- **Genesis Multiplier:** 1.5x rewards for early contributors

### Database Schema
Run `sql/GARD_SCHEMA.sql` to add:
- `royalty_transactions` - Transaction history
- `shard_holdings` - User portfolios
- `community_fund` - Fund balances
- `social_return_projects` - DAO proposals
- `governance_votes` - Voting records
- `gard_tokenized_assets` - Asset metadata
- `pending_rewards` - Unclaimed rewards

## 📦 New Code Structure
```
src/
├── services/gard/
│   ├── royaltyEngine.ts     # Core calculations
│   ├── communityFund.ts     # Fund management
│   ├── shardMarket.ts       # Trading & portfolios
│   └── index.ts             # Exports
├── hooks/
│   ├── useGARDRoyalties.ts  # Stats & transactions
│   ├── useShardPortfolio.ts # Holdings management
│   └── useGovernanceVoting.ts # DAO interface
├── components/gard/
│   ├── RoyaltyDashboard.tsx # Stats visualization
│   ├── ShardPortfolio.tsx   # Portfolio UI
│   ├── GovernanceVoting.tsx # Voting interface
│   └── index.ts             # Exports
contracts/
└── GARDDataShard.sol        # ERC1155 contract
sql/
└── GARD_SCHEMA.sql          # Database setup
```

---

# 🚀 GeoGraph Node: v1.9.3 Release Notes

This update introduces **Communities**, **Messaging**, **Data Gifting**, and a **Processing Visibility Panel**.

## 🏘️ Communities & Social Layer
- **Community System:** Create and join public or private communities with admission request management.
- **Community Data Baselines:** Filter Knowledge Graph and Semantic View by community data for collaborative research.

## 💬 Messaging & Data Gifting
- **User-to-User Messaging:** Secure real-time chat interface for curator communication.
- **Data Gifting:** Send Digital Assets and Data Bundles as gifts within messages.

## 👁️ Processing Visibility
- **Processing Panel:** Global, persistent UI component for monitoring background AI tasks (Zap icon).

---

# 🚀 GeoGraph Node: v1.9.2 Release Notes

This update introduces **Intelligent Data Aggregation** and a streamlined **Quick Processing** workflow.

## 🧠 Intelligent Data Aggregation
*   **Visual Associative Tagging:** The Gemini 2.5 Flash model now generates a unique `ASSOCIATIVE_ITEM_TAG` for physical objects. This allows the system to recognize the same item across different photos, angles, and sequences.
*   **Automatic Bundling:** Assets sharing the same associative tag are automatically grouped into data bundles, creating a more organized and searchable database.

## ⚡ Streamlined Ingestion
*   **Quick Processing UI:** Replaced the multi-step upload process with a single "Upload Documents" button. The AI now automatically categorizes items, eliminating the need for manual scan type selection.
*   **Process All Pending:** Added a "Process All Pending" button to both Quick Processing and Structured DB views, allowing for efficient batch processing of large datasets.

## 🛠️ UX Refinements
*   **AR Scanner Workflow:** Improved the AR Scanner's "Process Captures" confirmation. If a user cancels, they are now returned to the scanner view instead of losing their session queue.
*   **Type Safety:** Expanded the `DigitalAsset` and `SQLRecord` types to support the new aggregation metadata.

# 🚀 GeoGraph Node: v1.9.1 Release Notes

This update introduces **Full Offline Support**, enabling data collection in remote environments without internet connectivity.

## 📶 Offline Capabilities
*   **Robust Service Worker:** Updated caching strategy to include all external dependencies (React, Lucide, Gemini SDK), ensuring the app loads reliably offline.
*   **Offline Ingestion:** Assets captured via the AR Scanner or Camera while offline are now saved locally to IndexedDB with a `PENDING` status.
*   **Auto-Resume Pipeline:** The AI processing pipeline automatically detects when the device is back online and resumes processing for all pending assets.
*   **Offline UI Indicators:** New visual badges and status messages in the AR Scanner and Camera interfaces provide clear feedback on connection status.

## 🛠️ Reliability Improvements
*   **Auth Fallback:** Improved application startup logic to gracefully handle authentication failures when the Supabase backend is unreachable.
*   **PWA Hardening:** Optimized the manifest and service worker for better "Add to Home Screen" performance on mobile devices.

# 🚀 GeoGraph Node: v1.9.0 Release Notes

This patch fixes a critical database synchronization error where short random IDs were rejected by Supabase's UUID validation.

## 🛠️ Bug Fixes (v1.8.1)
*   **Standardized UUIDs:** Replaced legacy short-string ID generation with `uuidv4()`. This ensures that all asset identifiers are valid UUIDs, satisfying PostgreSQL's strict type checking and preventing `400 Bad Request` errors during cloud synchronization.
*   **Improved Sync Reliability:** All new uploads and batch imports now use globally unique identifiers that are compatible with both `TEXT` and `UUID` database columns.

# 🚀 GeoGraph Node: v1.8.0 Release Notes

This major update standardizes the entire database schema and application codebase to use **UPPERCASE** column names, resolving long-standing case-sensitivity issues with Supabase/PostgREST.

## 🏗️ Schema Standardization (v1.8.0)
*   **Global UPPERCASE Migration:** All database columns in the `historical_documents_global` table have been converted to UPPERCASE. This eliminates `PGRST204` errors and ensures that queries are always interpreted correctly by the backend.
*   **Strict Type Safety:** The `database.types.ts` file has been completely refactored to match the new schema. All interface keys now use UPPERCASE, providing compile-time validation for all database interactions.
*   **Unified Data Mapping:** The application's internal data models now align perfectly with the database schema, removing the need for complex case-conversion logic in the service layer.

## 🛠️ Bug Fixes & Improvements
*   **Ingestion Pipeline:** Fixed a critical bug where `ID` and `CREATED_AT` were missing from initial asset records, causing build failures and runtime sync issues.
*   **Auth Reliability:** Standardized authentication-related queries to use `USER_ID` (uppercase), ensuring that account deletion and private asset retrieval work reliably.
*   **Build Optimization:** Cleaned up redundant type definitions and improved the overall stability of the TypeScript build process.

# 🚀 GeoGraph Node: v1.7.3 Release Notes

## 🔒 Privacy & Security (v1.7.0+)
*   **End-to-End Encryption:** Sensitive OCR data and document descriptions are now encrypted client-side using AES-GCM before being sent to the cloud. Only you can decrypt your data.
*   **Right to be Forgotten:** A new "Delete Account" feature allows users to permanently wipe their entire cloud footprint, including all assets and transaction logs.
*   **Encrypted Web3 Logs:** On-chain transaction metadata is now stored in an encrypted state within your private Supabase profile.

## 🤖 AI Engine Reliability (v1.7.1)
*   **Gemini Flash 2.5 Optimization:** Fixed a critical connectivity issue where the API key was not being correctly exposed to the browser.
*   **SDK Hardening:** Updated the `@google/genai` integration to handle structured JSON responses more reliably with the latest schema requirements.
*   **Environment Readiness:** Standardized environment variable naming to `VITE_GEMINI_API_KEY` for seamless deployment on Vercel and other CI/CD platforms.

## 📱 Marketplace & Device Readiness
*   **Google Play Store Optimization:** Fully compliant `manifest.json` and high-resolution assets prepared for Android TWA (Trusted Web Activity) submission.
*   **Mobile-First Refinements:** Optimized touch targets and responsive layouts for field research on mobile and tablet devices.
*   **Marketplace Checklist:** Comprehensive guide for Chrome Web Store and Google Play Store submission added to the repository.

## 🎨 UI/UX & Accessibility
*   **Interactive Onboarding:** A new 6-step [Onboarding.tsx](src/components/Onboarding.tsx) guide helps new users master the GeoGraph ecosystem.
*   **Power-User Navigation:** Global [KeyboardShortcuts.tsx](src/components/KeyboardShortcuts.tsx) implemented; press `?` at any time to view the shortcut map.
*   **Polished Feedback:** Integrated [Toast.tsx](src/components/Toast.tsx) notifications and [Skeleton.tsx](src/components/Skeleton.tsx) loading states for smoother transitions.
*   **Resilience:** Added [ErrorBoundary.tsx](src/components/ErrorBoundary.tsx) to catch and recover from runtime issues gracefully.

## 🧠 Engine & Data Intelligence
*   **Gemini 2.5 Flash Upgrade:** Migrated to the latest `gemini-2.5-flash` model for faster reasoning and superior entity extraction from complex scans.
*   **Graph Exploration:** Enhanced [GraphVisualizer.tsx](src/components/GraphVisualizer.tsx) with `d3.zoom` for fluid panning and zooming in dense knowledge graphs.
*   **Structured DB Clusters:** New hierarchical "Cluster View" in the database tab allows grouping by Source, GIS Zone, or Category.
*   **Cloud Sync:** Added explicit "Refresh Cloud" logic to force-pull the latest dataframes from Supabase.

## 🔧 Technical Improvements
*   **Relational Integrity:** Reconstructed D3-compatible nodes and links from flattened SQL records in the Supabase service.
*   **Cache Strategy:** Implemented aggressive cache busting (`v=3`) to ensure immediate PWA updates.
*   **TypeScript:** Hardened the codebase with stricter types and resolved race conditions in image persistence.

---
*For a full list of granular changes, see the [CHANGELOG.md](CHANGELOG.md).*
