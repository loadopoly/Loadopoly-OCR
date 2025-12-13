# GeoGraph Node

[![MIT License](https://img.shields.io/badge/Code-MIT-blue.svg)](LICENSE)
[![Data CC0](https://img.shields.io/badge/Data-CC0-brightgreen.svg)](DATA-LICENSE.md)
[![Privacy Policy](https://img.shields.io/badge/Privacy-Policy-orange.svg)](PRIVACY-POLICY.md)
[![Version](https://img.shields.io/badge/Version-1.3.0-blueviolet.svg)](CHANGELOG.md)

**Open-source code (MIT) • Public-domain contributions (CC0) • Commercial dataset licensing available**

An advanced OCR-to-Graph platform integrating GIS metadata, semantic NLP processing, and sharded NFT asset management for LLM training data.

---

## Table of Contents

- [About](#about)
- [Features](#features)
- [Screenshots](#screenshots)
- [Getting Started](#getting-started)
- [Architecture](#architecture)
- [Licensing](#licensing)
- [Privacy](#privacy)
- [Contributing](#contributing)
- [Support](#support)
- [Third-Party Attributions](#third-party-attributions)

---

## About

GeoGraph Node transforms physical documents, artifacts, and locations into structured, AI-ready training data. Using Google's Gemini 2.5 Flash for intelligent extraction, the platform creates rich knowledge graphs, preserves GIS context, and enables fractional data ownership through blockchain technology.

### Use Cases

- **Archives & Museums:** Digitize collections with rich metadata extraction
- **Historical Research:** Build connected knowledge graphs from documents
- **AI/ML Training:** Generate high-quality, licensed training datasets
- **Field Documentation:** Capture and catalog items with location context
- **Data Monetization:** Contribute to the GeoGraph Corpus and earn rewards

---

## Features

### 🔍 Intelligent Scanning
- **Gemini 2.5 Flash Integration:** Advanced OCR with timestamp, GIS zone inference, and entity extraction
- **Multi-Mode Capture:** Optimized extraction pipelines for **Documents**, **Physical Artifacts**, and **Scenery**.
- **Accessibility First:** Auto-generated alt-text, reading order, and screen reader support
- **AR Scanner (v1.3):** Real-time camera overlay simulating detection of nearby knowledge nodes and artifacts.

### 🗺️ GIS & Location
- **Automatic Geotagging:** Capture GPS coordinates with every scan
- **Zone Inference:** AI-powered environment classification (urban, rural, historical district, etc.)
- **Landmark Detection:** Identify and link nearby points of interest

### 🕸️ Knowledge Graphs & Database
- **Dynamic Grouping:** Restructure your entire repository on the fly by **Source Collection**, **GIS Zone**, **NLP Category**, or **Rights Statement**.
- **Entity Extraction:** People, places, organizations, dates, and concepts
- **Relationship Mapping:** Automatically detect connections between entities
- **Semantic Canvas:** 3D universe view of your entire corpus

### 📦 Smart Bundling & Marketplace (v1.2)
- **Automatic Clustering:** Related images are bundled by time, location, and content.
- **Smart Deduplication:** When purchasing datasets, the node analyzes your existing holdings.
- **Differential Pricing:** If you own part of a bundle, you are offered a "Smart Filter" price to purchase only the data you lack.
- **Training-Ready:** Export filtered bundles as JSONL for ML pipelines.
- **Robust Ingestion:** Improved error handling for batch processing and file ingestion.

### ⛓️ Blockchain & Web3
- **Flexible Integration:** Toggle between "Web3 Enabled" (Strict Minting) and "Web3 Disabled" (Frictionless) modes.
- **Client-Side Minting:** Direct interaction with Polygon contracts for immediate, verifiable provenance.
- **Phygital Redemption:** Collect shards to unlock physical certificates.
- **Shard Analytics (v1.3):** View your total collected shards and contributions directly in the User Profile.

### 🚀 High Throughput
- **Batch Processing:** Ingest 500+ documents per hour via Camera or Folder Import.
- **Recursive Import:** Drag and drop entire folder structures for auto-ingestion.
- **Background Sync:** Auto-ingest from watched folders.

---

## Screenshots

*Coming soon*

---

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Google Gemini API key
- Web3 Wallet (optional, e.g., MetaMask) for NFT features

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/geograph-foundation/geograph-node.git
   cd geograph-node
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env` file in the project root:
   ```env
   # Required
   GEMINI_API_KEY=your_gemini_api_key
   
   # Optional - for cloud sync and auth
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

### Web3 Configuration

To use the blockchain features:
1. Go to **Settings** in the app sidebar.
2. Toggle **Web3 Integration** to "Enabled".
3. When you click "Earn Shard" on an asset, you will be prompted to connect your wallet.
4. The app supports **Polygon Mainnet**. It will attempt to switch your network automatically.

---

## Architecture

### Local-First Design

```
┌─────────────────────────────────────────────────────────────┐
│                      GeoGraph Node                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Camera    │  │   Upload    │  │  AR Scanner │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          ▼                                  │
│                 ┌─────────────────┐                         │
│                 │  Gemini 2.5 AI  │ ◄── OCR, NLP, GIS      │
│                 └────────┬────────┘                         │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   IndexedDB                          │   │
│  │  • Assets  • Graphs  • Metadata  • Purchasing DB    │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│         ┌────────────────┼────────────────┐                │
│         ▼                ▼                ▼                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Supabase   │  │   Polygon   │  │   Export    │        │
│  │  (Optional) │  │   (Wallet)  │  │   JSONL     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Tailwind CSS |
| Build | Vite 5 |
| AI/ML | Google Gemini 2.5 Flash |
| Visualization | D3.js, react-force-graph-2d |
| Storage | IndexedDB (Dexie), Supabase |
| Blockchain | ethers.js v6, Polygon |
| Auth | Supabase Auth |

---

## Licensing

GeoGraph Node uses a **multi-license model** designed to maximize both openness and sustainability:

| Component | License | Details |
|-----------|---------|---------|
| **Source Code** | [MIT](LICENSE) | Fork, modify, sell — do whatever |
| **Individual Contributions** | [CC0](DATA-LICENSE.md) | Public domain forever |
| **Curated Datasets** | [Commercial](COMMERCIAL-LICENSE.md) | License required for LLM training |

### Summary

- ✅ **Free to use** the app for personal or commercial purposes
- ✅ **Free to contribute** data to the public corpus
- ✅ **Free to fork** and modify the code
- 💰 **License required** for curated dataset bundles used in commercial AI training

Contact licensing@geograph.foundation for commercial licensing.

---

## Privacy

We take privacy seriously. Key points:

- **Local-first:** Processing happens on your device by default
- **Opt-in sharing:** Data only leaves your device when you explicitly contribute
- **Transparent AI:** We disclose all third-party AI services used
- **Your data, your control:** Export or delete your data anytime

Read our full [Privacy Policy](PRIVACY-POLICY.md).

---

## Contributing

We welcome contributions! Here's how to help:

### Code Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Data Contributions

Use the app to scan documents and click "Earn Shard" to contribute to the GeoGraph Corpus. All contributions are CC0 (public domain).

### Bug Reports

Open an issue on GitHub with:
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Device/browser information

---

## Support

- **Documentation:** https://docs.geograph.foundation
- **Issues:** https://github.com/geograph-foundation/geograph-node/issues
- **Email:** support@geograph.foundation
- **Discord:** https://discord.gg/geograph

---

## Third-Party Attributions

This project uses open-source software. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for full attributions.

Key dependencies:
- [React](https://reactjs.org/) - UI framework
- [D3.js](https://d3js.org/) - Data visualization
- [ethers.js](https://ethers.org/) - Ethereum library
- [Supabase](https://supabase.com/) - Backend services
- [Google Gemini](https://ai.google.dev/) - AI processing

---

## Roadmap

- [ ] iOS App Store release
- [ ] Google Play Store release
- [ ] Offline AI processing (on-device models)
- [ ] Multi-language OCR support
- [ ] Collaborative corpus editing
- [ ] Advanced export formats (Parquet, HuggingFace)
- [ ] Plugin system for custom extractors

---

## Contact

**GeoGraph Foundation**

- Website: https://geograph.foundation
- Email: hello@geograph.foundation
- Twitter: [@geaborners](https://twitter.com/geograph)
- GitHub: https://github.com/geograph-foundation

---

<p align="center">
  <sub>Built with ❤️ for the open data community</sub>
</p>