# GeoGraph Node

[![MIT License](https://img.shields.io/badge/Code-MIT-blue.svg)](LICENSE)
[![Data CC0](https://img.shields.io/badge/Data-CC0-brightgreen.svg)](DATA-LICENSE.md)
[![Privacy Policy](https://img.shields.io/badge/Privacy-Policy-orange.svg)](PRIVACY-POLICY.md)
[![Version](https://img.shields.io/badge/Version-1.6.0-blueviolet.svg)](CHANGELOG.md)

**Open-source code (MIT) • Public-domain contributions (CC0) • Commercial dataset licensing available**

An advanced OCR-to-Graph platform integrating GIS metadata, semantic NLP processing, and sharded NFT asset management for LLM training data.

---

## 🚀 What's New in v1.6.0
- **Gemini 2.5 Flash:** Upgraded the extraction engine to the latest high-performance model for blazing fast entity detection and relational mapping.
- **Enhanced Graph Interaction:** Full D3.js zoom and pan support in all graph visualizations.
- **Relational Cloud Integrity:** Robust reconstruction of knowledge graphs from Supabase JSONB dataframes, ensuring global views are as rich as local ones.
- **Cluster View Database:** New hierarchical "Cluster View" for exploring the repository through semantic groupings (Era, Category, GIS Zone).
- **Direct Cloud Sync:** One-click "Refresh Cloud" functionality to sync the latest global repository dataframes.

---

## 🖼️ Visual Tour

### Dashboard & Intelligence
![Dashboard Overview](screenshots/dashboard.png)
*The central command center showing global stats, recent graph activity, and real-time GIS environment context.*

### High-Throughput Ingestion
![Batch Processing](screenshots/quick-processing.png)
*Optimized pipeline for processing hundreds of documents per hour with automatic error handling and progress tracking.*

### Knowledge Graphs & Semantic Universe
<div align="center">
  <img src="screenshots/knowledge-graph.png" width="48%" alt="Knowledge Graph" />
  <img src="screenshots/semantic-view.png" width="48%" alt="Semantic Universe" />
</div>
*Left: Relational mapping of entities extracted by Gemini 2.5 Flash. Right: The Semantic Universe view clustering documents by era and LLM-derived category.*

### Structured Dataframes & Clusters
![Structured Database](screenshots/structured-db.png)
![Database Clusters](screenshots/db-clusters.png)
*Navigate your corpus using high-density tabular views or explore semantic clusters grouped by source and era.*

### Global Marketplace
![Marketplace](screenshots/marketplace.png)
*Fractional ownership of curated datasets through dynamic sharding and community airdrops.*

---

## About

GeoGraph Node transforms physical documents, artifacts, and locations into structured, AI-ready training data. Using Google's Gemini 2.5 Flash for intelligent extraction, the platform creates rich knowledge graphs, preserves GIS context, and enables fractional data ownership through blockchain technology.

### Use Cases

- **Archives & Museums:** Digitize collections with high-fidelity metadata extraction.
- **Historical Research:** Build complex, connected knowledge graphs from scanned documents.
- **AI/ML Training:** Generate high-quality, ethically sourced, and licensed training datasets.
- **Field Documentation:** Capture and catalog items with real-time location and environmental context.

---

## Features

### 🔍 Intelligent Scanning
- **Gemini 2.5 Flash Integration:** State-of-the-art OCR with temporal extraction, GIS zone inference, and complex entity relationship detection.
- **Multi-Mode Capture:** Optimized extraction pipelines for **Documents**, **Physical Artifacts**, and **Scenery**.
- **Accessibility First:** Auto-generated alt-text (WCAG compliant), logical reading order, and screen reader audio playback.
- **AR Scanner:** Real-time camera overlay simulating detection of nearby knowledge nodes and physical artifacts.

### 📱 Progressive Web App (PWA)
- **Installable:** Add to home screen on iOS, Android, and Desktop for a native experience.
- **Offline-First:** Interface caches locally; utilizes IndexedDB for high-speed local processing before cloud syncing.
- **Immersive:** Standalone mode removes browser chrome for focused data capture.

### 🗺️ GIS & Location
- **Automatic Geotagging:** Captures high-accuracy GPS coordinates with every scan.
- **Zone Inference:** AI-powered environment classification (e.g., "Urban High Density", "Rural Agricultural").
- **Landmark Detection:** Automatically identifies and links nearby POIs to the knowledge graph.

---

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Google Gemini API key (set as `API_KEY` in environment)
- Web3 Wallet (optional) for NFT shard features

### Installation
1. **Clone & Install**
   ```bash
   git clone https://github.com/geograph-foundation/geograph-node.git
   cd geograph-node
   npm install
   ```
2. **Environment Variables**
   Create a `.env` file:
   ```env
   API_KEY=your_gemini_api_key
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
3. **Run Dev**
   ```bash
   npm run dev
   ```

---

## Architecture

GeoGraph Node utilizes a **Hybrid Local-Cloud Architecture**.

1. **Local Node:** Captures data via Camera/AR, processes through Gemini, and stores in **IndexedDB**.
2. **Global Repository:** Automatically syncs processed records and images to **Supabase** (SQL + Storage).
3. **Blockchain Layer:** Direct interaction with **Polygon** for minting shards and verifying data provenance.

---

## Licensing
- **Source Code:** [MIT](LICENSE)
- **Raw Contributions:** [CC0 1.0 Universal](DATA-LICENSE.md) (Public Domain)
- **Curated Bundles:** [Commercial Dataset License](COMMERCIAL-LICENSE.md)

---

## Support
- **Issues:** GitHub Issue Tracker
- **Email:** support@geograph.foundation
- **Discord:** [Join GeoGraph Community](https://discord.gg/geograph)

<p align="center"><sub>Built for the global open data movement.</sub></p>