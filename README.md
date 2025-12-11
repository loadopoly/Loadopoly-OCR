# GeoGraph Node  [![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Data CC0](https://img.shields.io/badge/Data-CC0-brightgreen.svg)](DATA-LICENSE.md)

**Open-source code (MIT) • Public-domain contributions (CC0) • Commercial dataset licensing available**

- Code: MIT — fork, modify, sell, do whatever  
- Individual photos & metadata: CC0 — public domain forever  
- Curated releases, embeddings, bundles: © GeoGraph Foundation — commercial license required for LLM training

→ You can use the app for free, contribute for free, and still sell the platinum dataset to frontier labs.

## About

An advanced OCR-to-Graph platform integrating GIS metadata, semantic NLP processing, and sharded NFT asset management for LLM training data.

### Features

1.  **Gemini 2.5 Flash Integration**: Advanced OCR, timestamps, GIS zone inference, and graph node extraction.
2.  **Semantic Bundling**: Automatically groups assets by location, time, and topic into high-value training examples.
3.  **Knowledge Graph**: Visualize connections between documents, concepts, and locations (Force Directed Graph).
4.  **AR Scanner**: Real-time augmented reality scanning for historical markers.
5.  **Marketplace**: Dynamic sharding and bundle pricing for dataset monetization.
6.  **Quick Batch Processing**: High-throughput ingestion queue for processing 500+ documents/hour.

## Getting Started

1.  Clone the repository.
2.  Install dependencies: `npm install`.
3.  Set up environment variables (see `.env.example` or Vercel config):
    *   `VITE_GEMINI_API_KEY`: Google Gemini API Key.
    *   `VITE_SUPABASE_URL`: Supabase Project URL.
    *   `VITE_SUPABASE_ANON_KEY`: Supabase Anon Key.
4.  Run development server: `npm run dev`.
