# Google Marketplace Submission Checklist

## ✅ Pre-Submission
- [x] Extension ZIP created: `geograph-ocr-extension.zip` (660 KB)
- [x] All assets included (manifest, icons, screenshots, privacy policy)
- [x] Code minified (no .map files)
- [x] Build passes TypeScript compilation
- [x] Supabase configuration ready
- [x] Version: 1.7.0

## ✅ Assets Ready
- [x] Icon 192x192: `/public/icon-192.png`
- [x] Icon 512x512: `/public/icon-512.png`
- [x] Icon SVG variants: `/public/icons/`
- [x] Desktop screenshots (1280x720): 3 files
  - dashboard, database view, knowledge graph
- [x] Mobile screenshots (390x844): 2 files
  - mobile dashboard, AR scanner
- [x] Privacy policy: `/public/privacy-policy.html`
- [x] Manifest: `/public/manifest.json`

## ✅ Store Listing Info
- [x] Name: GeoGraph OCR Node
- [x] Category: Productivity
- [x] Description: See `store-assets/STORE_LISTING.md`
- [x] Short description (≤132 chars)
- [x] Long description with features
- [x] Privacy policy text prepared

## ✅ Permissions Documented
- storage (local data persistence)
- activeTab (content capture)
- identity (cloud sync, optional)

## ✅ Features Included
- [x] AI-powered OCR (Gemini 2.5 Flash)
- [x] Knowledge graph generation
- [x] GIS metadata enrichment
- [x] Local-first architecture
- [x] Cloud sync (Supabase)
- [x] Batch processing
- [x] AR scanner
- [x] Camera capture
- [x] Web3 integration (optional)

## ✅ UI/UX Enhancements
- [x] Toast notifications
- [x] Error boundaries
- [x] Skeleton loading
- [x] Onboarding flow
- [x] Keyboard shortcuts
- [x] Offline indicator
- [x] WCAG 2.1 AA compliance
- [x] Smart Suggestions (Human Integration)
- [x] Real-time Status Bar

## 📱 Google Play Store (Android) Checklist
- [x] **PWA Quality**: Manifest.json is fully compliant with Play Store requirements.
- [x] **Icons**: 512x512 and Maskable icons provided.
- [x] **Screenshots**: Narrow form factor (mobile) screenshots provided.
- [ ] **TWA Wrapper**: Generate Android App Bundle (.aab) using Bubblewrap or PWABuilder.
- [ ] **Digital Asset Links**: Host `.well-known/assetlinks.json` on the production domain.
- [ ] **Privacy Policy**: Hosted at `/public/privacy-policy.html`.
- [ ] **Developer Account**: Google Play Console account active.

## 📝 Submission Steps
1. **Chrome Web Store**:
   - Visit: https://chrome.google.com/webstore/devconsole
   - Click "New item"
   - Upload `geograph-ocr-extension.zip`
   - Fill in store listing details
   - Add promotional images (440x280, 920x680)
   - Submit for review

2. **Google Play Store**:
   - Use [PWABuilder](https://www.pwabuilder.com/) to package the URL as an Android App.
   - Download the `.aab` file.
   - Upload to Google Play Console.
   - Set up "Digital Asset Links" to remove the browser URL bar.

## 📦 Files Location
| File | Location |
|------|----------|
| Extension ZIP | `/geograph-ocr-extension.zip` |
| Store Guide | `/store-assets/STORE_LISTING.md` |
| Privacy Policy | `/public/privacy-policy.html` |
| Manifest | `/public/manifest.json` |
| Icons | `/public/icons/` and `/public/icon-*.png` |
| Screenshots | `/public/screenshot-*.png` |

---
Last Updated: December 19, 2025
Version: 1.7.0
