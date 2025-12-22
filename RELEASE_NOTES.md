# 🚀 GeoGraph Node: v1.7.3 Release Notes

This release addresses critical ingestion reliability and database synchronization issues.

## 🛠️ Ingestion Reliability (v1.7.3)
*   **RLS Conflict Resolution:** Fixed "new row violates row-level security policy" errors that occurred during batch processing. The system now defers cloud synchronization until after local AI processing is complete, avoiding unauthorized `UPDATE` attempts on the global corpus.
*   **Local-First Persistence:** Initial ingestion states are now saved to IndexedDB immediately. This ensures that even if a network error occurs or the browser is refreshed during processing, the asset record is preserved locally.
*   **Atomic Sync:** Cloud contributions are now performed as a single `INSERT` operation once all metadata (OCR, GIS, Entities) has been generated, ensuring data consistency in the global repository.

## 🚀 What's New in v1.7.2
*   **Automatic Cloud Sync:** All assets (including failed ones) are now automatically synced to Supabase cloud storage upon import, regardless of authentication status.
*   **Robust Data Mapping:** Improved handling of case-insensitive database columns (ASSET_ID vs asset_id) for better cloud-to-local synchronization.
*   **Marketplace Restoration:** Fixed the data marketplace view and bundle purchase logic.
*   **Developer Tools:** New "Debug Mode" in settings for verbose logging and detailed AI processing error reports.
*   **Cloud Fallback:** Implemented smart fallback for global corpus fetching to ensure the "Master" view remains functional even with schema inconsistencies.

# 🚀 GeoGraph Node: v1.7.1 Release Notes

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
