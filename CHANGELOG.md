# Changelog

All notable changes to this project will be documented in this file.

## [1.3.0] - 2025-01-03

### Added
- **AR Scanner Enhancements:** Improved AR tab with simulated overlays, scanning animations, and better camera integration.
- **Shard Analytics:** User Profile settings now display total collected shards and contribution count derived from local asset data.
- **Robust Error Handling:** Added detailed error tracking for failed ingestions; improved batch processing resilience.
- **File Bundling Improvements:** Enhanced stability of the bundling service with better empty-group handling and try-catch blocks.

## [1.2.0] - 2025-01-02

### Added
- **Smart Marketplace Deduplication:** Implemented logic to compare bundle contents against the user's local repository.
- **Smart Filter Purchase:** Users can now purchase only the "delta" (unique items) of a bundle, filtering out assets they already own to save costs and avoid redundancy.
- **Dynamic Database Grouping:** The Structured Database view now allows dynamic grouping by Source Collection, GIS Zone, NLP Category, and Rights Statement.

### Changed
- **Stat Card Interaction:** Dashboard stat cards are now clickable and navigate to the relevant filtered views.
- **Marketplace UI:** Updated bundle cards to reflect ownership status and real-time token/shard calculations.

## [1.1.0] - 2025-01-01

### Added
- **Web3 Integration Toggle:** New setting in the Settings Panel allowing users to choose between "Enabled" (Strict Blockchain Verification) and "Disabled" (Frictionless/Virtual) modes.
- **Client-Side Minting:** Implemented `mintShardClientSide` using `ethers.js` v6 to interact directly with the Shard Contract on Polygon via the user's browser wallet.
- **Multi-Wallet Support:** Added support for EIP-1193 providers, enabling connections via MetaMask, Coinbase Wallet, Rabby, and others.
- **Network Switching:** Automatic switching to Polygon Mainnet when interacting with blockchain features.
- **Real-Time Feedback:** Contribute button now shows "Confirming..." and "Shard Minted" states based on real transaction receipts.

### Changed
- **Removed Simulation:** Deprecated the simulated NFT generation logic in `geminiService` and `web3Service`. NFT data is now only generated upon successful on-chain transaction.
- **Updated Settings UI:** Redesigned the Settings Panel to include the Web3 toggle and clarify the distinction between local-first and blockchain-enabled workflows.
- **Refactored Contribution Flow:** The `ContributeButton` now strictly checks the Web3 setting before attempting to trigger wallet actions.

### Fixed
- **Type Safety:** Resolved TypeScript enum mismatches in `ContributeButton` regarding `AssetStatus`.
- **Wallet Connection:** Improved error handling for user rejection during wallet connection requests.

## [1.0.0] - 2024-12-01

### Initial Release
- Core OCR and Graph functionality.
- Gemini 2.5 Flash integration.
- IndexedDB local storage.
- Basic visualization and bundling.
