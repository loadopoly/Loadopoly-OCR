# GeoGraph Node

[![MIT License](https://img.shields.io/badge/Code-MIT-blue.svg)](LICENSE)
[![Data CC0](https://img.shields.io/badge/Data-CC0-brightgreen.svg)](DATA-LICENSE.md)
[![Privacy Policy](https://img.shields.io/badge/Privacy-Policy-orange.svg)](PRIVACY-POLICY.md)
[![Version](https://img.shields.io/badge/Version-1.7.0-blueviolet.svg)](CHANGELOG.md)

**Open-source code (MIT) • Public-domain contributions (CC0) • Commercial dataset licensing available**

GeoGraph Node is a state-of-the-art OCR-to-Graph platform designed for historical document preservation and the generation of high-quality LLM training data. By integrating Google's **Gemini 2.5 Flash**, GIS metadata, and blockchain-based provenance, we transform physical archives into structured, relational knowledge universes.

---

## 🚀 What's New in v1.7.0
- **Advanced PWA Integration:** Fully compliant PWA with shortcuts, share targets (share images directly to GeoGraph), and protocol handlers (`web+geograph://`).
- **Tombstone Branding:** Updated brand identity featuring a stylized stone icon, reflecting our mission of preserving "set-in-stone" history.
- **Gemini 2.5 Flash Engine:** Blazing fast complex text reasoning, automated alt-text generation (WCAG AAA), and entity extraction.
- **D3.js Graph Visualizer:** Fully interactive knowledge graphs with smooth panning, multi-level zooming, and dynamic force-simulation.
- **Cluster View Database:** Explore the global corpus through semantic clusters: group by Source, GIS Zone, Category, or Rights.

---

## 🖼️ Visual Tour

### Intelligent Dashboard
![Dashboard Overview](screenshot-desktop.png)
*Real-time stats on training tokens, knowledge nodes, and GIS environment context.*

### High-Throughput Batch Processing
*Optimized for professional archiving, handle hundreds of documents with recursive folder imports and automated scan-type categorization (Items, Documents, Scenery).*

### Knowledge Graphs & Semantic Universe
<div align="center">
  <img src="screenshot-mobile.png" width="48%" alt="Mobile AR Scanner" />
  <img src="screenshot-desktop.png" width="48%" alt="Graph Visualization" />
</div>
*From AR-assisted field capture to multi-dimensional relational mapping.*

---

## 🛠️ Core Features

### 🔍 AI-Powered Extraction
- **Multimodal OCR:** Preserves logical reading order and document structure.
- **GIS Metadata:** Automatic geotagging with inferred environment zones (e.g., "Urban High Density").
- **Taxonomy Detection:** Automated kingdom/phylum/species classification for physical items.
- **Accessibility First:** Generates short and long alt-text, reading order blocks, and accessibility scores.

### 🕸️ Knowledge Graph Architecture
- **Relational Mapping:** Connects people, locations, and organizations across disjointed documents.
- **Semantic Clustering:** Automatically bundles related scans into intelligent "Archives" based on GPS proximity and temporal alignment.

### ⛓️ Web3 & Data Provenance
- **DCC1 Sharding:** Fractionalize contribution rewards using sharded NFTs on Polygon.
- **Fixity & Integrity:** Every asset is SHA-256 checksummed and timestamped on-chain for immutable provenance.
- **License Fluidity:** Support for CC0 (Public Domain) contributions and commercial dataset licensing.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- Google Gemini API key (set as `API_KEY` in environment)
- A modern browser (Chrome/Edge/Safari) for PWA and AR features

### Installation
1. **Clone & Install**
   ```bash
   git clone https://github.com/geograph-foundation/geograph-node.git
   cd geograph-node
   npm install
   ```
2. **Environment Configuration**
   The application looks for `process.env.API_KEY` for Gemini processing.
3. **Run Dev Environment**
   ```bash
   npm run dev
   ```

---

## 📜 Licensing

- **Source Code:** [MIT](LICENSE) - Open for community contribution.
- **Individual Contributions:** [CC0 1.0 Universal](DATA-LICENSE.md) - All raw user contributions are dedicated to the public domain.
- **Curated Bundles:** [Commercial License](COMMERCIAL-LICENSE.md) - Value-added datasets, embeddings, and quarterly releases are proprietary to the GeoGraph Foundation.

---

## 🤝 Support & Community
- **Issues:** Submit via GitHub Issue Tracker
- **Email:** support@geograph.foundation
- **Discord:** [Join the GeoGraph Community](https://discord.gg/geograph)

<p align="center"><sub>Built by the GeoGraph Foundation for the global open data movement.</sub></p>