# Loadopoly-OCR — Claude Code Project Guide

React 19 + Vite + Tailwind field-capture app ("GeoGraph OCR Node"). This repo
is **one half of a two-repo system** with `loadopoly/Supply-Chain-Brain`
(Python pipeline, expected as sibling checkout `../Supply-Chain-Brain`):
the Operate Console captures guided photogrammetry sessions and delivers
**`loadopoly.capture/1` bundles** (`photos/` + `scb_manifest.json`) to the
Brain's `pipeline/src/photogrammetry` intake.

## Run

```bash
npm run dev          # app on http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src
npm run build        # production build (tsc -b && vite build)

# Full dual-repo loop (app + uplink receiver + intake watcher):
python ../Supply-Chain-Brain/orchestration/orchestrate.py
```

## Map

- `src/capture/` — framework-free capture domain. **`types.ts` defines the
  bundle contract** (`CAPTURE_SCHEMA_VERSION = 'loadopoly.capture/1'`);
  presets, Dexie store (own DB `LoadopolyCapture`), PoseTracker + blur
  analysis, dependency-free ZIP writer, manifest builder, SCB uplink client.
- `src/components/operate/` — Operate Console (default tab): OperateHome,
  PhotogrammetryCapture HUD, SessionDetail.
- `src/App.tsx` (~3,400 lines) — legacy workspace shell (Dashboard, Assets,
  Graph, 3D World …) and its Dexie DB `GeoGraphSync`. **Do not alter the
  GeoGraphSync schema/migrations**; the capture module deliberately uses its
  own database.
- `src/scb/` — System Core Bridge types for the cloud OCR chain (distinct
  from the capture bundle contract).
- Supabase edge functions in `supabase/functions/`; cloud features are
  optional — the capture flow must keep working with zero backend config.

## Rules

- Capture module stays dependency-free — no zip/sensor/camera libraries.
- Tailwind dark-slate design system; `primary` = blue scale; large touch
  targets; every interactive element gets ARIA labels; use
  `announce()` (src/lib/accessibility) for screen-reader feedback.
- Camera code must survive OS interruptions: keep the muted/playsInline/
  reactive-srcObject patterns used in `PhotogrammetryCapture.tsx`.
- **Contract changes** (`src/capture/types.ts`, `manifest.ts`): the Brain's
  intake must change in lockstep — run
  `python ../Supply-Chain-Brain/orchestration/contract_check.py --deep`
  and see the `contract-guardian` agent in the Supply-Chain-Brain repo.
  Additive optional fields keep schema `/1`; breaking changes bump both
  sides to `/2` with migration notes in both repos' docs.
- Verify before finishing: typecheck + eslint on touched files + build.
