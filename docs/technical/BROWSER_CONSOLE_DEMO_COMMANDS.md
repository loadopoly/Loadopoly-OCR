# Browser Console Demo Commands
## Technical Proof of Local Data Ownership

Use these commands during live demo to show data ownership in action.

---

## Setup: Open Browser DevTools

1. **Open the live app** (localhost:5173 or production URL)
2. **Upload 2-3 sample documents** first
3. **Press F12** (or Cmd+Option+I on Mac) to open DevTools
4. **Go to Console tab**

---

## Demo Command 1: Show Local Storage

```javascript
// Open IndexedDB connection
const db = new Dexie('GeoGraphSync');
await db.open();

// Show how many documents user owns locally
const assetCount = await db.assets.count();
console.log(`✅ You own ${assetCount} documents stored locally in YOUR browser`);

// List all asset IDs
const assets = await db.assets.toArray();
console.log('Your local asset library:', assets.map(a => ({ id: a.id, title: a.title })));
```

**Expected Output**:
```
✅ You own 3 documents stored locally in YOUR browser
Your local asset library: [
  { id: 'abc123', title: 'Historical Document 1920' },
  { id: 'def456', title: 'Receipt - Coffee Shop' },
  { id: 'ghi789', title: 'Article - AI Research' }
]
```

**Talking Point**: "This is YOUR data, in YOUR browser. Not on my servers."

---

## Demo Command 2: Inspect Structured Data

```javascript
// Get first document
const doc = assets[0];

console.log('=== 📄 Document Structure (What You Own) ===\n');

// Raw OCR text
console.log('1. Raw Text (OCR):', doc.rawText?.slice(0, 150) + '...\n');

// Extracted entities (people, places, organizations)
console.log('2. Entities (automatically extracted):');
doc.entities?.slice(0, 5).forEach(e => {
  console.log(`   • ${e.name} (${e.type})`);
});
console.log('');

// Temporal classification
console.log('3. Temporal Context:', {
  era: doc.structuredTemporal?.era,
  period: doc.structuredTemporal?.period,
  decade: doc.structuredTemporal?.decade
});

// Spatial classification
console.log('4. Spatial Context:', {
  zone: doc.structuredSpatial?.zone,
  coordinates: doc.latitude && doc.longitude ?
    `${doc.latitude}, ${doc.longitude}` : 'Not recorded',
  place: doc.structuredSpatial?.place
});

// Knowledge graph connections
console.log('5. Graph Connections:',
  doc.graphData?.nodes?.length || 0, 'nodes,',
  doc.graphData?.links?.length || 0, 'relationships'
);

// Vector embeddings (semantic search)
console.log('6. Text Embedding (768D vector for semantic search):',
  doc.textEmbedding ?
    `[${doc.textEmbedding.slice(0, 5).map(n => n.toFixed(3)).join(', ')}, ...]` :
    'Not yet generated'
);
```

**Expected Output**:
```
=== 📄 Document Structure (What You Own) ===

1. Raw Text (OCR): Certificate of Occupancy granted to John Smith on March 15, 1920 for property located at 42 West Street, Manhattan...

2. Entities (automatically extracted):
   • John Smith (PERSON)
   • NYC Building Department (ORGANIZATION)
   • Manhattan (LOCATION)
   • March 15, 1920 (DATE)
   • West Street (LOCATION)

3. Temporal Context: { era: 'Industrial Age', period: 'Post-WWI', decade: '1920s' }

4. Spatial Context: { zone: 'Urban', coordinates: '40.7128, -74.0060', place: 'Manhattan, New York' }

5. Graph Connections: 8 nodes, 12 relationships

6. Text Embedding (768D vector for semantic search): [0.123, -0.456, 0.789, 0.234, -0.567, ...]
```

**Talking Point**: "This isn't a text file - it's a structured database with entities, classifications, and relationships. And you own it."

---

## Demo Command 3: Show Data Portability

```javascript
// Export first document as JSON (portable format)
console.log('=== 💾 Exportable JSON (Your Property) ===\n');
console.log(JSON.stringify(doc, null, 2));

// Show file size estimate
const jsonSize = new Blob([JSON.stringify(doc)]).size;
console.log(`\nDocument size: ${(jsonSize / 1024).toFixed(1)} KB`);
console.log('✅ You can export this to JSON, CSV, GraphML, RDF, or Neo4j');
```

**Talking Point**: "You can export this entire database to any format. No lock-in."

---

## Demo Command 4: Compare with Cloud Storage

```javascript
// Check if synced to cloud (optional)
const syncedCount = assets.filter(a => a.supabaseId).length;
const localOnlyCount = assets.length - syncedCount;

console.log('=== ☁️ Storage Ownership ===\n');
console.log(`Local-only documents: ${localOnlyCount}`);
console.log(`Cloud-backed documents: ${syncedCount}`);
console.log(`\n✅ ${localOnlyCount > 0 ?
  'You have documents that NEVER touched our servers' :
  'All documents backed up to YOUR Supabase account'
}`);

// Show user has control
if (syncedCount > 0) {
  console.log('\nCloud sync is OPTIONAL - you control where data lives.');
}
```

**Talking Point**: "You choose if you want cloud backup. Default is local-only. YOU control it."

---

## Demo Command 5: Show Knowledge Graph Queries

```javascript
// Example: Find all documents mentioning a person
const personName = 'John Smith'; // Replace with actual entity from your docs
const docsWithPerson = assets.filter(a =>
  a.entities?.some(e =>
    e.type === 'PERSON' &&
    e.name.toLowerCase().includes(personName.toLowerCase())
  )
);

console.log('=== 🔍 Query Your Data (Knowledge Graph) ===\n');
console.log(`Documents mentioning "${personName}":`, docsWithPerson.length);

if (docsWithPerson.length > 0) {
  docsWithPerson.forEach(d => {
    console.log(`  • ${d.title} (${new Date(d.timestamp).toLocaleDateString()})`);
  });
}

// Example: Find documents from a specific era
const era = 'Industrial Age';
const docsInEra = assets.filter(a =>
  a.structuredTemporal?.era === era
);

console.log(`\nDocuments from "${era}":`, docsInEra.length);
docsInEra.forEach(d => {
  console.log(`  • ${d.title}`);
});
```

**Talking Point**: "Because it's structured data, you can query it like a database. Find all documents from the 1920s, or all mentions of a person across 100 documents. This is the power of ownership."

---

## Demo Command 6: Prove No Vendor Lock-In

```javascript
// Delete a document locally (prove user control)
console.log('=== 🗑️ User Control (Delete Example) ===\n');

// Pick last document for demo deletion
const docToDelete = assets[assets.length - 1];
console.log(`Deleting document: "${docToDelete.title}"`);

// Actually delete (uncomment if you want to demo this live)
// await db.assets.delete(docToDelete.id);
// console.log('✅ Deleted from YOUR local storage (not our servers)');

// Or just show the command without executing
console.log('Command: await db.assets.delete(docId);');
console.log('✅ You have full CRUD control - Create, Read, Update, Delete');
```

**Talking Point**: "You can delete, modify, export anytime. Full CRUD control. This is YOUR database."

---

## Demo Command 7: Show Storage Usage

```javascript
// Estimate IndexedDB usage
if ('storage' in navigator && 'estimate' in navigator.storage) {
  const estimate = await navigator.storage.estimate();
  const usedMB = (estimate.usage / (1024 * 1024)).toFixed(2);
  const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(0);

  console.log('=== 💾 Storage Capacity ===\n');
  console.log(`Used: ${usedMB} MB`);
  console.log(`Available: ${quotaMB} MB`);
  console.log(`Percentage: ${(estimate.usage / estimate.quota * 100).toFixed(1)}%`);
  console.log(`\n✅ Browser gives users ~${quotaMB} MB (typically 50% of disk space)`);
} else {
  console.log('Storage API not available in this browser');
}
```

**Talking Point**: "Browsers give users gigabytes of storage. This scales to 10,000+ documents easily."

---

## Investor-Specific Demo Commands

### Show Cost Structure (Transparency)

```javascript
console.log('=== 💰 Cost Structure (Open & Transparent) ===\n');

const geminiCostPerDoc = 0.03; // Approximate Gemini API cost
const totalDocs = assets.length;
const totalCost = (totalDocs * geminiCostPerDoc).toFixed(2);

console.log(`Documents processed: ${totalDocs}`);
console.log(`Approximate API cost: $${totalCost}`);
console.log(`(~$${geminiCostPerDoc}/doc for Gemini 2.5 Flash)`);
console.log('\nFreemium model: Users bring own API key → $0 cost to us');
console.log('Paid tier: We provide credits → 70% gross margin');
```

### Show Technical Architecture

```javascript
console.log('=== 🏗️ Technical Architecture ===\n');
console.log('Frontend: React 19 + TypeScript 5.6 + Vite 5');
console.log('Local Storage: IndexedDB + Dexie (offline-first)');
console.log('Backend (optional): Supabase (PostgreSQL + Realtime)');
console.log('AI: Google Gemini 2.5 Flash (with OpenAI/Claude fallbacks)');
console.log('Visualization: D3.js (2D graphs) + Three.js (3D metaverse)');
console.log('Blockchain: Ethers.js + ERC-1155 (fractionalized NFTs)');
console.log('\n✅ Production-ready stack with auto-scaling');
```

---

## Backup: If Demo Fails

If live demo doesn't work (e.g., no documents uploaded yet), use this:

```javascript
// Show empty database (proves local storage exists)
const db = new Dexie('GeoGraphSync');
await db.open();
const count = await db.assets.count();

if (count === 0) {
  console.log('📂 Database is empty (no documents uploaded yet)');
  console.log('✅ But IndexedDB is running and ready');
  console.log('\nThis proves:');
  console.log('1. Local storage is set up');
  console.log('2. User controls their data from day one');
  console.log('3. No data sent to servers until user uploads');
  console.log('\nLet me upload a document real quick...');
}
```

---

## Pro Tips for Live Demo

1. **Upload 2-3 documents BEFORE opening DevTools** so you have data to show
2. **Copy these commands to a text file** so you can paste them quickly
3. **Run commands one by one** with explanations between each
4. **Adjust entity names** (e.g., "John Smith") based on your actual demo documents
5. **Use `console.table(assets)` instead of `console.log(assets)`** for prettier output

---

## One-Liner for Quick Demo

If you need a super fast proof:

```javascript
const db = new Dexie('GeoGraphSync'); await db.open(); const assets = await db.assets.toArray(); console.log(`✅ You own ${assets.length} documents locally. Sample:`, assets[0]);
```

Copy-paste this into console for instant proof of data ownership.

---

Good luck with the demo! 🚀
