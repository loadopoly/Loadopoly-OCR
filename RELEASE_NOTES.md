# 🚀 GeoGraph Node: v1.6.x Release Notes

This series of updates transforms the GeoGraph Node from a web utility into a robust, native-feeling application with enhanced data visualization and a streamlined onboarding experience.

## 📱 Native & PWA Integration
*   **Advanced PWA Capabilities:** Implemented `file_handlers` (open images/PDFs directly), `share_target` (receive content from other apps), and `protocol_handlers` for `web+geograph://` deep links.
*   **System Widgets:** Added Adaptive Card support for Windows 11 and Android home screen integration via [public/widgets/status.json](public/widgets/status.json).
*   **Desktop Experience:** Enabled **Window Controls Overlay** for a custom title bar area, providing a seamless native desktop feel.
*   **Asset Optimization:** High-quality PNG icons and screenshots added to [public/icons/](public/icons/) for better OS compatibility.

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
