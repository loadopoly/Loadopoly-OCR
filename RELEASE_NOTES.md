# 🚀 GeoGraph Node: v1.9.0 Release Notes

This major update introduces **Curator Mode**, a powerful suite of manual management tools that allow users to refine AI-extracted data and create custom collections.

## 🎨 Curator Mode & Manual Management
*   **Dedicated Curator View:** A new sidebar tab for high-level asset management and data refinement.
*   **Manual Bundling:** Multi-select assets to create persistent, user-defined bundles. These bundles are excluded from automatic clustering to preserve user intent.
*   **Annotation Editor:** Directly edit OCR text, titles, and descriptions. Manually edited records are flagged with `IS_USER_ANNOTATED` for data provenance.
*   **Deterministic AI:** Set a fixed seed for Gemini 2.5 Flash, ensuring that multiple photos of the same card/document yield consistent metadata.

## 🛠️ UI & Reliability Improvements
*   **AR Scanner Fix:** Moved the "Process" button to the top-right in AR mode to ensure it never blocks the camera shutter.
*   **Master View Processing:** Enabled the "Contribute" feature in the Master view, allowing users to process global assets directly.
*   **Stuck Asset Recovery:** Added "Retry" buttons to the GIS Context dashboard for assets that hang in a "Processing..." state.
*   **Schema Migration:** Added `sql/ADD_CURATOR_COLUMNS.sql` to support the new manual curation flags in Supabase.

# 🚀 GeoGraph Node: v1.8.1 Release Notes

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
