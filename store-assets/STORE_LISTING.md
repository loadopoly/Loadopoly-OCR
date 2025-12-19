# Chrome Web Store / Google Marketplace Submission

This document contains all assets and information needed for store submission.

## Store Listing Information

### App Name
GeoGraph OCR Node

### Short Description (132 characters max)
AI-powered OCR platform for historical document digitization with knowledge graph generation and GIS metadata enrichment.

### Detailed Description
GeoGraph OCR Node is an advanced OCR-to-Graph platform designed for researchers, archivists, and historians who need to digitize and analyze historical documents.

**Key Features:**

🔍 **AI-Powered OCR**
- Extract text from historical documents, artifacts, and scenery using Google Gemini 2.5 Flash
- Automatic entity recognition (people, places, dates, organizations)
- Multi-language support with automatic language detection

📊 **Knowledge Graph Generation**
- Automatically build semantic relationships between documents
- Interactive force-directed graph visualization
- Export graph data for further analysis

🗺️ **GIS Metadata Enrichment**
- Capture geographic context with device GPS
- Zone classification and environmental context
- Historical location correlation

🔒 **Privacy-First Architecture**
- All data stored locally by default
- Optional cloud sync for cross-device access
- You control what gets shared

⚡ **Batch Processing**
- Process entire folders of documents
- Queue management with progress tracking
- Support for JPEG, PNG, and PDF formats

🎨 **Accessibility**
- WCAG 2.1 AA compliant
- Screen reader support
- Keyboard navigation
- Reduced motion support

### Category
Productivity

### Language
English

## Required Assets

### Icons
- [x] 16x16 PNG - `/public/icons/icon-16.svg` (convert to PNG)
- [x] 32x32 PNG - `/public/icons/icon-32.svg` (convert to PNG)
- [x] 48x48 PNG - `/public/icons/icon-48.svg` (convert to PNG)
- [x] 128x128 PNG - `/public/icons/icon-128.svg` (convert to PNG)

### Screenshots (1280x800 or 640x400)
Required: At least 1, maximum 5

1. **Dashboard** - Central command center showing stats, recent graph activity, and GIS context
2. **Batch Processing** - High-throughput document scanning interface
3. **Knowledge Graph** - Interactive entity relationship visualization
4. **Structured DB** - Cloud dataframes with tabular cluster view
5. **Settings** - Configuration panel with sync and integration options

### Promotional Images
- Small tile: 440x280 PNG
- Large tile: 920x680 PNG (optional)
- Marquee: 1400x560 PNG (optional)

## Privacy Policy
URL: https://[your-domain]/privacy-policy.html

A standalone privacy policy page is included at `/public/privacy-policy.html`

## Permissions Justification

| Permission | Justification |
|------------|---------------|
| `storage` | Store user preferences, processed assets, and sync settings locally |
| `activeTab` | Access the current tab for capturing content when user initiates |
| `identity` | Optional authentication for cloud sync features |

## Build Instructions

```bash
# Install dependencies
npm install

# Build for production
npm run build:extension

# Create zip for submission
npm run zip:extension
```

The extension zip will be created at `geograph-ocr-extension.zip`

## Testing Checklist

- [ ] All icons display correctly at all sizes
- [ ] Popup opens and renders correctly
- [ ] Camera capture works (requires HTTPS)
- [ ] File upload works
- [ ] OCR processing completes
- [ ] Graph visualization renders
- [ ] Settings persist across sessions
- [ ] Keyboard shortcuts work
- [ ] Screen reader announces actions
- [ ] Works in offline mode (local processing)
- [ ] Cloud sync works when logged in

## Version History

### v1.6.2 (Current)
- Added comprehensive error handling with ErrorBoundary
- Added toast notification system
- Added skeleton loading states
- Added onboarding flow for new users
- Added keyboard shortcuts
- Improved accessibility (WCAG 2.1 AA)
- Added offline/online status indicator
- Updated build scripts for extension packaging

### v1.6.1
- Initial public release
- AI-powered OCR with Gemini 2.5 Flash
- Knowledge graph generation
- GIS metadata enrichment
- Local-first architecture with optional cloud sync
