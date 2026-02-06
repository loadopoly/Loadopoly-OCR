# GeoGraph OCR Node

[![Version](https://img.shields.io/badge/version-2.9.2-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Dual-green.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)

> Advanced OCR-to-Graph platform with GIS metadata, semantic NLP, deduplication, and metaverse navigation.

---

## 💼 For Investors

### The $1.2B Market Opportunity: AI Training Data Crisis

Loadopoly-OCR solves the **structured historical data gap** that AI companies urgently need:

**Three Converging Problems:**

1. **AI Models Lack Historical Context** - LLMs trained on post-2010 web scrapes. "Data wall" expected 2026-2027.
2. **80-90% of Pre-2010 Data Not Digitized** - 500+ billion historical documents remain physical.
3. **Digitized Data Is Unstructured** - Major institutions have millions of items but no queryable knowledge.

**Concrete Example: Smithsonian Open Access**

The Smithsonian spent **20 years digitizing 11 million artifacts**. Researchers can find a 1920s building photo. But they can't query "who built it" or "what else did they design."

| What Smithsonian Has | What's Missing |
|---------------------|----------------|
| 11M digitized items in JSON | No knowledge graphs |
| Flat catalog metadata | No entity extraction |
| 35+ inconsistent schemas | No GPS coordinates |
| Download-and-process yourself | No semantic search |

**Our Solution:**
- Automatic entity extraction, temporal/spatial classification, knowledge graphs
- **88-99% time savings** for researchers (40 hours → 5 minutes)
- AI training data marketplace (archivists license structured datasets to OpenAI/Anthropic)
- **User-generated data flywheel**: Users capture never-before-digital data (workplaces, estate sales, local archives)

**Revenue Model:**
- Freemium SaaS subscriptions ($29-199/month)
- AI Training Data Marketplace (15-20% commission)
- NFT fractionalization for data ownership
- **Web3 Value-Return**: Users gain fractional ownership in corpus → earn passive income when AI companies license data → incentivized to capture more (visit museums, monuments) → "Get paid to live life"

**Investment Ask:** $150K for 8-10% to structure the first 100 archival collections and prove the AI licensing model.

📄 **Full Investment Thesis**: [DATA_OWNERSHIP_VALUE_PROPOSITION.md](./DATA_OWNERSHIP_VALUE_PROPOSITION.md)
🎯 **Demo Script**: [DEMO_SCRIPT_INVESTOR.md](./DEMO_SCRIPT_INVESTOR.md)
❓ **Technical Q&A**: [TECHNICAL_QA_INVESTOR.md](./TECHNICAL_QA_INVESTOR.md)
📋 **Pitch Checklist**: [INVESTOR_PITCH_CHECKLIST.md](./INVESTOR_PITCH_CHECKLIST.md)

---

## ✨ Features

### 🔍 AI-Powered OCR
- Extract text from historical documents, artifacts, and scenery using **Google Gemini 2.5 Flash**
- Automatic entity recognition (people, places, dates, organizations)
- Multi-language support with automatic language detection
- Configurable LLM providers (Gemini, OpenAI, local models)

### 📊 Knowledge Graph Generation
- Automatically build semantic relationships between documents
- Interactive force-directed graph visualization with D3.js
- Export graph data in multiple formats
- Cross-document entity linking and deduplication

### 🗺️ GIS Metadata Enrichment
- Capture geographic context with device GPS
- Zone classification and environmental context
- Historical location correlation
- Coordinate system normalization (WGS84)

### 🌐 3D Metaverse Navigation
- Explore your document corpus in immersive 3D
- Spatial clustering of related documents
- Optional AR camera overlay for real-world scanning
- Semantic canvas for 2D exploration

### ⚡ Batch Processing
- Process entire folders of documents (100s-1000s at once)
- Server-side queue with Supabase Edge Functions
- Pause/Resume/Cancel controls
- Real-time progress tracking with stage breakdown

### 🔒 Privacy-First Architecture
- All data stored locally by default (IndexedDB + Dexie)
- Optional cloud sync for cross-device access
- End-to-end encryption for sensitive data
- You control what gets shared

### 🎨 Accessibility
- WCAG 2.1 AA compliant
- Screen reader support (ARIA labels)
- Keyboard navigation with shortcuts
- Reduced motion support

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- (Optional) Supabase account for cloud features

### Installation

```bash
# Clone the repository
git clone https://github.com/loadopoly/Loadopoly-OCR.git
cd Loadopoly-OCR

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Start development server
npm run dev
```

### Environment Variables

Create a `.env.local` file with:

```env
# Required for AI processing
VITE_GEMINI_API_KEY=your_gemini_api_key

# Optional: Supabase for cloud sync
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# Optional: Web3 features
VITE_ALCHEMY_API_KEY=your_alchemy_key
```

## 📦 Build

```bash
# Production build
npm run build

# Build Chrome extension
npm run build:extension

# Create extension zip
npm run zip:extension

# Type checking
npm run typecheck

# Linting
npm run lint
```

## 🏗️ Architecture

```
src/
├── components/          # React UI components
│   ├── metaverse/       # 3D world and spatial views
│   ├── gard/            # Data governance components
│   └── ...
├── services/            # Business logic services
│   ├── geminiService    # LLM integration
│   ├── processingQueueService  # Server-side queue
│   ├── batchProcessorService   # Client-side batching
│   └── ...
├── lib/                 # Utilities and helpers
│   ├── supabaseClient   # Database client
│   ├── indexeddb        # Local storage
│   └── ...
├── contexts/            # React contexts
├── hooks/               # Custom React hooks
├── modules/             # Plugin system
├── plugins/             # Registered plugins
└── workers/             # Web workers for parallel processing
```

### Bundle Optimization (v2.9.0)

| Chunk | Size (gzipped) | Purpose |
|-------|----------------|---------|
| `index.js` | 14KB | Entry point |
| `vendor-react.js` | 60KB | React core |
| `vendor-icons.js` | 10KB | Lucide icons |
| `vendor-storage.js` | 32KB | Dexie/IndexedDB |
| `vendor-supabase.js` | 44KB | Supabase client |
| `vendor-visualization.js` | 64KB | D3 + Force Graph |
| `vendor-ai.js` | 50KB | Google Generative AI |
| `vendor-web3.js` | 97KB | Ethers.js (optional) |
| `App.js` | 81KB | Main application |

## 📚 Documentation

- [CHANGELOG.md](./CHANGELOG.md) - Version history and release notes
- [ARCHITECTURE_IMPROVEMENTS.md](./ARCHITECTURE_IMPROVEMENTS.md) - Technical architecture details
- [SUPABASE_INTEGRATION.md](./SUPABASE_INTEGRATION.md) - Cloud sync setup guide
- [WEB3_ARCHITECTURE.md](./WEB3_ARCHITECTURE.md) - Blockchain integration guide
- [DATABASE_SETUP.md](./DATABASE_SETUP.md) - Database schema and setup
- [PRIVACY-POLICY.md](./PRIVACY-POLICY.md) - Privacy policy
- [FORK_MANAGEMENT.md](./docs/technical/FORK_MANAGEMENT.md) - Fork sync and reset guide

## 🔧 Key Technologies

| Category | Technology |
|----------|------------|
| Frontend | React 19, TypeScript 5.6, Tailwind CSS 3.4 |
| Build | Vite 5, esbuild |
| State | React Context, Dexie (IndexedDB) |
| AI/ML | Google Gemini 2.5 Flash, OpenAI (optional) |
| Backend | Supabase (Postgres, Edge Functions, Realtime) |
| 3D/Viz | Three.js, D3.js, react-force-graph-2d |
| Web3 | Ethers.js 6, ERC-1155/721 contracts |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### 🔄 Managing Your Fork

Keep your fork synchronized with the upstream repository using our automated tools:

**Automated (GitHub Actions):**
- **Fork Sync Workflow**: Runs weekly automatically or trigger manually from Actions tab
- **Fork Reset Workflow**: Force reset to upstream when needed (creates backup first)

**Manual (Local Scripts):**
```bash
# Check fork health and sync status
bash scripts/health-check.sh

# Sync with upstream (preserves local changes)
bash scripts/sync-fork.sh

# Reset to upstream (⚠️ discards local changes)
bash scripts/reset-fork.sh
```

📖 **Full Guide:** [Fork Management Documentation](./docs/technical/FORK_MANAGEMENT.md)  
⚡ **Quick Reference:** [Fork Management Quick Ref](./docs/technical/FORK_MANAGEMENT_QUICKREF.md)

## 📄 License

This project uses a dual-license model:

- **Open Source**: [MIT License](./LICENSE) for non-commercial use
- **Commercial**: [Commercial License](./COMMERCIAL-LICENSE.md) for commercial applications

See [TERMS.md](./TERMS.md) for full terms of service.

## 🙏 Acknowledgments

- [Supabase](https://supabase.com) - Backend infrastructure
- [Google Gemini](https://ai.google.dev/) - AI/ML capabilities
- [Lucide](https://lucide.dev/) - Icon library
- [Tailwind CSS](https://tailwindcss.com/) - Styling framework

---

**Built with ❤️ by [Loadopoly](https://github.com/loadopoly)**
