# GeoGraph Node

[![MIT License](https://img.shields.io/badge/Code-MIT-blue.svg)](LICENSE)
[![Data CC0](https://img.shields.io/badge/Data-CC0-brightgreen.svg)](DATA-LICENSE.md)
[![Privacy Policy](https://img.shields.io/badge/Privacy-Policy-orange.svg)](PRIVACY-POLICY.md)
[![Version](https://img.shields.io/badge/Version-1.7.1-blueviolet.svg)](RELEASE_NOTES.md)

**Open-source code (MIT) • Public-domain contributions (CC0) • Commercial dataset licensing available**

An advanced OCR-to-Graph platform integrating GIS metadata, semantic NLP processing, and sharded NFT asset management for LLM training data.

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/loadopoly/Loadopoly-OCR.git
cd Loadopoly-OCR

# Install dependencies
npm install

# Copy environment template and add your keys
cp .env.example .env.local
# Edit .env.local with your Supabase and Gemini API keys

# Start development server
npm run dev
```

### Environment Setup

Create a `.env.local` file with:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GEMINI_API_KEY=your-gemini-api-key
```

Get your credentials:
- **Supabase:** [supabase.com/dashboard](https://supabase.com/dashboard) → Project Settings → API
- **Gemini API:** [makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)

---

## 🚀 What's New in v1.7.0
- **Human Integration Factor:** Smart suggestions engine on the dashboard for guided onboarding.
- **Real-time Status Bar:** Persistent monitoring of network, sync, and local asset counts.
- **Enhanced Auth Flow:** Redesigned sign-in experience with clear value propositions for cloud sync.
- **Hardware Bridge Improvements:** Better visual feedback for network scanner connections.
- **Device Friendliness:** Optimized touch targets and responsive layouts for mobile/tablet use.

### Previous (v1.6.2)
- **Enhanced UI/UX:** Toast notifications, skeleton loading, error boundaries with recovery
- **Onboarding Flow:** 6-step interactive guide for new users
- **Keyboard Shortcuts:** Press `?` to view all available shortcuts
- **Accessibility (WCAG 2.1 AA):** Full screen reader support, keyboard navigation, reduced motion
- **Offline Indicator:** Real-time connection status with sync notifications
- **Build Scripts:** Extension packaging ready for Chrome Web Store submission

### Previous (v1.6.1)
- **Supabase Cloud Storage:** Automatic cloud storage for authenticated users
- **Advanced PWA Suite:** Window Controls Overlay, File Handling, Share Target
- **System Widgets:** Windows 11/Android widgets for OCR status monitoring

---

## 🖼️ Visual Tour

### Dashboard & Intelligence
![Dashboard Overview](public/screenshot-desktop-1.png)
*The central command center showing global stats, recent graph activity, and real-time GIS environment context.*

### Knowledge Graphs & Structured Data
<div align="center">
  <img src="public/screenshot-desktop-3.png" width="48%" alt="Knowledge Graph" />
  <img src="public/screenshot-desktop-2.png" width="48%" alt="Structured Database" />
</div>
*Left: Relational mapping of entities extracted by Gemini 2.5 Flash. Right: Cloud dataframes with tabular cluster view.*

### Mobile Experience
<div align="center">
  <img src="public/screenshot-mobile-1.png" width="30%" alt="Mobile Dashboard" />
  <img src="public/screenshot-mobile-2.png" width="30%" alt="AR Scanner" />
</div>
*Fully responsive mobile interface with AR scanning capabilities.*

---

## About

GeoGraph Node transforms physical documents, artifacts, and locations into structured, AI-ready training data. Using Google's Gemini 2.5 Flash for intelligent extraction, the platform creates rich knowledge graphs, preserves GIS context, and enables fractional data ownership through blockchain technology.

### Storage Architecture

**Authenticated Users:**
- All uploads are automatically stored in Supabase cloud storage
- Images saved to `corpus-images` storage bucket
- Metadata persisted in `historical_documents_global` database
- Assets accessible across devices and sessions
- Full data portability and export capabilities

**Unauthenticated Users:**
- Temporary workspace using browser's IndexedDB
- Session-only storage (cleared on page refresh/close)
- Perfect for testing and one-time processing
- Can optionally contribute assets to global corpus
- No account required for basic functionality

### Use Cases

- **Archives & Museums:** Digitize collections with high-fidelity metadata extraction.
- **Historical Research:** Build complex, connected knowledge graphs from scanned documents.
- **AI/ML Training:** Generate high-quality, ethically sourced, and licensed training datasets.
- **Field Documentation:** Capture and catalog items with real-time location and environmental context.

---

## Support
- **Issues:** GitHub Issue Tracker
- **Email:** support@geograph.foundation
- **Discord:** [Join GeoGraph Community](https://discord.gg/geograph)

<p align="center"><sub>Built for the global open data movement.</sub></p>