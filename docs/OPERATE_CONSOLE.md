# Operate Console — Field Capture → Supply Chain Brain

**Capture-first operations guide** · Version 2.22.0

The Operate Console is the front door of the app: open it, tap **Start
Capture**, and you are in a guided photogrammetry HUD within seconds. Every
session is bundled with GPS + device pose + fixity checksums and delivered to
the **Supply Chain Brain** (`loadopoly/Supply-Chain-Brain`) for supply-chain
optimization work — stockpile volumetrics, asset condition records,
cycle-count evidence, and yard layout scans.

---

## 60-second quick start

1. **Open the app** — it boots straight into the Operate Console
   (`npm run dev`, or the installed PWA on your phone).
2. Tap **Start Capture**.
3. Pick what you're shooting:

   | Preset | Use | Target shots |
   |---|---|---|
   | ⛰️ Stockpile / Volumetrics | aggregate piles → volume measurement | ~36 |
   | 🚜 Equipment / Asset | machines → condition record, cannibalization review | ~48 |
   | 📦 Pallet / Bin | palletized inventory → cycle-count evidence | ~20 |
   | ⚙️ Part / Component | single parts → ID + condition scoring | ~32 |
   | 📄 Documents / Labels | tags, travelers, paperwork → OCR | as needed |
   | 🏗️ Yard / Area Scan | laydown yards, docks → layout analysis | ~60 |

4. **Walk the orbit.** The HUD guides you:
   - **Coverage ring** — 12 compass sectors fill green as you circle the subject.
   - **Sharpness meter** — says `SHARP` / `SOFT — hold steady` live.
   - **Level bubble** — keeps your horizon stable.
   - **GPS pill** — shows fix accuracy; every shot is pose-stamped
     (lat/lng/alt, compass heading, pitch, roll).
   - Soft or badly exposed shots are **flagged, never silently kept** — retake
     from the thumbnail strip.
5. Tap **Finish** (enabled once the preset minimum is met).
6. On the session sheet, choose a delivery path (next section).

Everything is **offline-first**: photos persist to IndexedDB immediately and
survive refreshes, tab kills, and dead zones in the yard.

## Getting bundles into the Supply Chain Brain

Each session exports a self-describing bundle:

```
bundle_20260609_Stockpile_A_1a2b3c4d.zip
├── scb_manifest.json        ← schema "loadopoly.capture/1"
└── photos/IMG_0001.jpg …
```

### Path A — Export ZIP (always works)

1. **Export bundle** on the session sheet → ZIP downloads.
2. Drop it into the Brain repo at `pipeline/data/photogrammetry/inbox/`.
3. Run:

   ```bash
   cd Supply-Chain-Brain/pipeline
   python -m src.photogrammetry                 # sweep the inbox once
   python -m src.photogrammetry --watch         # or keep watching
   python -m src.photogrammetry --list          # confirm ingestion
   ```

   Add `--handoff-ocr` to also queue every photo for the Brain's GeoGraph OCR
   bridge (VLM part-number/label extraction).

### Path B — Live uplink (optional)

Configure an HTTP intake URL under **Supply Chain Brain → Brain intake** on the
Operate home (stored in `localStorage`, or build-time via
`VITE_SCB_INTAKE_URL`). **Uplink to Brain** then POSTs the bundle as
`multipart/form-data` (`bundle` = ZIP, `session` = session id) with automatic
retry/backoff. Any small receiver that writes the ZIP into the inbox directory
completes the loop.

### Path C — Legacy OCR pipeline (in-app)

**Run OCR pipeline** on the session sheet feeds the photos through the app's
existing Gemini OCR → knowledge-graph flow, alongside the SCB delivery.

## `scb_manifest.json` contract (`loadopoly.capture/1`)

```jsonc
{
  "schema": "loadopoly.capture/1",
  "generatedAt": "2026-06-09T14:05:00Z",
  "session": {
    "id": "uuid", "name": "Stockpile A", "preset": "STOCKPILE",
    "startedAt": "…", "completedAt": "…",
    "operator": "you@company.com", "notes": "",
    "origin": { "lat": 35.0456, "lng": -85.3097, "accuracyM": 4.2 },
    "device": { "userAgent": "…", "platform": "…" }
  },
  "project": { "id": "uuid", "name": "CHA Yard Digitization", "site": "CHA",
               "tags": ["supply-chain-optimization"] },
  "photos": [{
    "file": "photos/IMG_0001.jpg", "index": 0, "capturedAt": "…",
    "pose": { "lat": …, "lng": …, "accuracyM": …, "altM": …,
              "headingDeg": …, "pitchDeg": …, "rollDeg": … },
    "sectorIdx": 3, "ring": "MID",
    "width": 3840, "height": 2160, "bytes": 2381923,
    "sha256": "…",                                   // fixity checksum
    "quality": { "blurScore": 142.2, "blurry": false, "brightness": 0.46 }
  }],
  "coverage": { "sectors": 12, "filled": 10, "pct": 83 },
  "scb": { "targetDataStore": "supply-chain-brain",
           "intakeModule": "src.photogrammetry",
           "kind": "photogrammetry_capture" }
}
```

The Brain intake verifies every photo's SHA-256 before registering the session
in `local_brain.sqlite` (`photogrammetry_sessions` / `photogrammetry_photos`)
and logging `kind='photogrammetry_capture'` to `learning_log`.

Bundles are also ready for external photogrammetry engines — the `photos/`
folder drops directly into Meshroom / RealityCapture / COLMAP, and the
manifest's per-photo GPS+pose can seed georeferencing.

## Capture technique (why the presets push you this way)

- **~70 % overlap** between consecutive frames is what reconstruction needs;
  the per-preset shot targets bake this in for typical subject sizes.
- **Two or three heights** (the LOW/MID/HIGH pass chips) catch crests and
  undersides a single lap misses.
- **Sharp beats many** — a flagged-soft frame hurts more than a missing one,
  which is why the HUD meters sharpness live and flags soft captures.
- **Don't move the subject mid-session**; for parts, rotate around the part,
  not the part itself, when using GPS/heading sectors.

## Architecture

```
src/capture/                     # framework-free domain logic
├── types.ts          session/photo/manifest contract (loadopoly.capture/1)
├── presets.ts        capture recipes + quality thresholds
├── sessionStore.ts   Dexie DB "LoadopolyCapture" (offline-first persistence)
├── sensors.ts        PoseTracker (GPS+orientation), blur/exposure analysis
├── zip.ts            dependency-free ZIP writer (STORE method)
├── manifest.ts       manifest builder + bundle assembly + download
└── scbUplink.ts      HTTP uplink with retry/backoff + reachability probe

src/components/operate/
├── OperateHome.tsx            capture-first home (default tab "operate")
├── PhotogrammetryCapture.tsx  full-screen guided capture HUD
└── SessionDetail.tsx          review / export / uplink / delete
```

The module is self-contained: it creates its own IndexedDB database and
touches none of the legacy `GeoGraphSync` schema. The legacy workspace
(Dashboard, Assets, Knowledge Graph, 3D World, …) is unchanged and one tap
away in the sidebar.
