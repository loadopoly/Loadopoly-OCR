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
