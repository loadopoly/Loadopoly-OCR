# GeoGraph Node

[![MIT License](https://img.shields.io/badge/Code-MIT-blue.svg)](LICENSE)
[![Data CC0](https://img.shields.io/badge/Data-CC0-brightgreen.svg)](DATA-LICENSE.md)
[![Privacy Policy](https://img.shields.io/badge/Privacy-Policy-orange.svg)](PRIVACY-POLICY.md)
[![Version](https://img.shields.io/badge/Version-1.8.0-blueviolet.svg)](CHANGELOG.md)

**Open-source infrastructure for the preservation of human knowledge.**

GeoGraph Node is an advanced **OCR-to-Graph** platform that transforms physical artifacts, documents, and scenery into high-fidelity, structured training data for LLMs. Utilizing **Gemini 2.5 Flash**, it automates the extraction of relational entities, GIS context, and WCAG-compliant accessibility metadata, bridging the gap between physical archives and the semantic web.

---

## 🚀 What's New in v1.8.0
- **Refined Branding:** New "Set-in-Stone" visual identity featuring high-contrast slate aesthetics and a stylized tombstone emblem.
- **Advanced PWA Engine:** Fully compliant web app with Shortcuts (Quick Scan, AR Scanner), Share Target (process images directly from other apps), and File Handlers.
- **Master Dataframes:** Robust "Cluster View" for global repository exploration. Group knowledge by Source, GIS Zone, or NLP Category.
- **Immersive AR Scanner:** Real-time field capture with simulated node detection and batch session processing.
- **Relational Knowledge Rebuild:** Intelligent backend that reconstructs complex D3 knowledge graphs from flattened SQL relational data.

---

## 🖼️ Feature Showcase

### 📊 Intelligent Dashboard
- **Token Analytics:** Track tokenization throughput and vocabulary growth.
- **GIS Context:** Real-time environmental analysis (Urban vs. Rural) inferred from visual cues.
- **Activity Graph:** Live preview of the most recently extracted knowledge connections.

### 🧪 Extraction Pipeline (Powered by Gemini 2.5 Flash)
- **Multimodal OCR:** Preserves logical structure, table formatting, and handwritten nuances.
- **Entity Linking:** Automatic identification of People, Locations, and Organizations.
- **Accessibility:** Generates WCAG AAA alt-text and logical reading order blocks.
- **Taxonomy:** Automated Kingdom/Phylum/Species classification for biological items.

### 🕸️ Knowledge Graph & Semantic Canvas
- **D3.js Visualization:** Interactive, zoomable graph with force-directed simulation.
- **Semantic Clustering:** Multi-dimensional views of the corpus based on temporal and category-based relationship.

---

## 🛠️ Technical Stack
- **Frontend:** React 19, Tailwind CSS (High-Contrast Slate Palette).
- **AI Engine:** Google Gemini 2.5 Flash (OCR, NLP, Vision).
- **Backend:** Supabase (PostgreSQL, Storage, Auth).
- **Local Storage:** Dexie.js (IndexedDB) for a local-first, offline-ready experience.
- **Graph:** D3.js & React Force Graph for relational mapping.
- **Web3:** Ethers.js for DCC1 sharding and on-chain provenance (Polygon Network).

---

## 🚀 Installation

### 1. Clone & Setup
```bash
git clone https://github.com/geograph-foundation/geograph-node.git
cd geograph-node
npm install
```

### 2. Configure Environment
Create a `.env` file or set the following environment variable:
- `API_KEY`: Your Google Gemini API Key.

### 3. Database Setup
Follow the instructions in `DATABASE_SETUP.md` to configure your Supabase instance.

### 4. Run Development
```bash
npm run dev
```

---

## ⚖️ Licensing & Contribution

- **Source Code:** [MIT License](LICENSE) - Free and open for all.
- **Data Contributions:** [CC0 1.0 Universal](DATA-LICENSE.md) - Individual raw contributions are dedicated to the public domain.
- **Curated Corpus:** [Commercial License](COMMERCIAL-LICENSE.md) - Enriched, cleaned, and bundled datasets require licensing for commercial use.

---

## 🤝 Community
- **GitHub Issues:** Bug reports and feature requests.
- **Email:** support@geograph.foundation
- **Discord:** [Join the GeoGraph Community](https://discord.gg/geograph)

<p align="center"><sub>Preserving the past, training the future. Built by the GeoGraph Foundation.</sub></p>