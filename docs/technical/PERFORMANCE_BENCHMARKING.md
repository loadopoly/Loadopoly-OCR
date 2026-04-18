# Performance Benchmarking Methodology

Reference playbook for measuring Loadopoly-OCR runtime performance. Every
performance change should be backed by numbers produced by this process. The
goal is not to produce pretty dashboards — the goal is to **catch real,
user-perceptible regressions** before they ship and to **prove that
optimizations actually move user-perceptible numbers**.

If you skip a step here, your "optimization" is probably theater.

> The companion file [`BENCHMARKS.md`](./BENCHMARKS.md) records the **results**
> of a benchmarking pass. This file documents the **process** that produces
> those results. They should be updated together.

---

## 0. When to run benchmarks

Run the full process described below **whenever any of the following is true**:

- You changed `vite.config.ts`, `src/index.tsx`, `src/App.tsx`, `tsconfig*.json`,
  or any module on the static-import critical path (anything imported by the
  entry chunk or by `App.tsx` at top level).
- You added, removed, or moved a `React.lazy` / dynamic `import()` boundary.
- You added, removed, or restructured a route or top-level tab.
- You added, removed, or upgraded a dependency that ends up in any
  `vendor-*` chunk.
- You touched a hot user interaction path: tab switching, BundleCard click,
  QueueMonitor refresh, image-grid render, 3D world load, knowledge graph
  load.
- You changed service workers, manifest, polyfills, or anything that runs
  before `ReactDOM.createRoot` mounts.

Trivial doc-only or test-only changes do not require a re-benchmark.

---

## 1. Required environment

| Tool | Version / source | Notes |
|---|---|---|
| Node.js | matches `package.json` `engines` (currently 24.x) | use `node --version` to confirm |
| `npm ci` | always, never `npm install` | guarantees `package-lock.json` is honored |
| Playwright Chromium | install via `npx playwright install chromium` | required for headless benchmarking |
| Vite preview server | `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort` | always benchmark the **production** build, never the dev server |
| `curl` | any | health-check the preview server before launching browsers |
| `python3` | any 3.x | small JSON post-processing of benchmark output |

A fresh clone needs:

```bash
npm ci
npx playwright install chromium
npm run build
```

The production build (`npm run build`) is mandatory. **Never** benchmark
`npm run dev` — Vite's dev server serves un-minified source, has hot-reload
overhead, splits chunks differently, and gives meaningless numbers.

---

## 2. Required viewports & throttling profiles

Every benchmark runs against **both** profiles. A change that only helps
desktop is not enough; mobile is the dominant environment.

| Profile | Viewport (CSS px) | CPU throttle (CDP `Emulation.setCPUThrottlingRate`) | Why |
|---|---|---|---|
| `desktop` | 1440 × 900 | 1× (none) | Best-case baseline; isolates network and bundle effects |
| `mobile` | 390 × 844 (iPhone 13 / 14 equivalent) | **4×** | Approximates a mid-tier Android (Pixel 4a / Galaxy A-series). Matches Lighthouse's "Moderate throttling" CPU model |

CPU throttling **must** be applied via the Chrome DevTools Protocol —
viewport size alone does not slow the JavaScript engine. Use:

```js
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
```

**Do not** lower the throttle rate to make numbers look better. If a
regression only appears at 4× throttle, it is still a regression — real
phones will hit it.

---

## 3. Pre-warmed app state

A benchmark of "first-time visitor on the landing page" is a different
benchmark from "returning user opening the app shell". Both matter, but
they must not be conflated.

For the **app-shell** scenarios (`appDesktop`, `appMobile`) every
Playwright context **must** seed `localStorage` before the first navigation
so the landing page and onboarding are skipped:

```js
await context.addInitScript((prefs) => {
  localStorage.setItem('geograph-has-visited', 'true');
  localStorage.setItem('geograph-onboarding-v2', 'true');
  localStorage.setItem('geograph-ux-preferences', JSON.stringify(prefs));
}, defaultUXPreferences());
```

`defaultUXPreferences()` lives in `ui-benchmark.cjs`; copy it verbatim into
ad-hoc scripts. A returning user with onboarding complete is the
representative "warm" path for tab switching, BundleCards, QueueMonitor,
etc.

The **landing** scenario uses a fresh context with no `localStorage` so
the first-visit code path is exercised.

---

## 4. Metrics to collect

For every scenario collect **all** of the following. Anything less and you
will miss real bottlenecks.

### 4.1 Network / bundle

- Every `*.js` resource loaded **between navigation start and 3 seconds
  after `domcontentloaded`** — this is the de-facto critical path.
- For each: name, transfer size (bytes), duration (ms).
- **Total transferred bytes** loaded during the critical-path window.
- Identify any chunk loaded eagerly that you expected to be lazy.

Source: `performance.getEntriesByType('resource')`, filtered to JS.

### 4.2 Paint / lifecycle

- `first-paint` and `first-contentful-paint` from
  `performance.getEntriesByType('paint')`.
- `largest-contentful-paint` from a `PerformanceObserver` for type
  `largest-contentful-paint` (buffered).
- `domContentLoaded`, `load`, `responseEnd`, `transferSize` from
  `performance.getEntriesByType('navigation')[0]`.

### 4.3 Main-thread health

- All Long Tasks (>50 ms on the main thread) collected via a buffered
  `PerformanceObserver({ type: 'longtask', buffered: true })`. **Install
  this observer in `addInitScript` so it captures tasks from the very first
  parse**, not after `page.evaluate` has a chance to attach.
- Aggregate `longTaskCount`, `longTaskTotalMs`, `longTaskMaxMs`.
- **Total Blocking Time** (TBT): `Σ max(0, duration − 50)` over the long
  tasks observed during load.

### 4.4 Per-interaction timings

For each tab switch and each interaction listed in §6, capture:

- `wallMs` — wall-clock time from click to "settled" (DOM updated and no
  long task ended in the last 150 ms).
- `mainThreadBusyMs` — sum of long-task durations triggered by the
  interaction.
- `longTasksTriggered` — count of long tasks triggered by the interaction.

### 4.5 Per-chunk static-import graph

After every `vite build`, dump the static-import graph of every emitted
chunk and **fail loudly** if any chunk that used to be lazy has been pulled
onto the entry chunk's transitive static-import set.

Quick recipe:

```bash
for f in dist/assets/*.js; do
  grep -oE 'import\{[^}]*\}from"\./[^"]+"' "$f" | sort -u | sed "s|^|$(basename $f) -> |"
done
```

Walk that graph from `dist/assets/index-*.js` and confirm the set of
statically-reachable chunks contains **none** of: `chunk-cluster-sync`,
`chunk-metaverse`, `chunk-queue-monitor`, `chunk-web3-services`,
`chunk-gemini`, `chunk-batch-processing` (unless deliberately changed).

---

## 5. Scenarios that must be exercised

Every benchmark pass runs all of the scenarios below, in this order, in
**both** profiles (desktop + mobile-throttled).

### 5.1 Landing page (cold visitor)

- Fresh context, no `localStorage`.
- `page.goto('/')`.
- Capture §4.1, §4.2, §4.3.

### 5.2 App shell (warm visitor)

- Pre-seeded context per §3.
- `page.goto('/')`, wait for `nav` to be attached.
- Settle for 1.5–2 seconds, then capture §4.1, §4.2, §4.3.

### 5.3 Tab navigation

Click each top-level tab, in this order, with the per-interaction
measurement from §4.4:

1. Assets & Bundles (`4`)
2. Knowledge Graph (`5`)
3. 3D World (`w`)
4. Structured DB (`6`)
5. Quick Processing (`2`)
6. Dashboard (`1`)

Then re-click Assets and Dashboard to measure cached navigation. On
mobile, the sidebar is hidden behind the hamburger menu — **fall back to
the keyboard shortcut** (the parenthesized letter/number above) instead of
clicking. The benchmark script handles this fallback automatically; ad-hoc
scripts must too.

### 5.4 Heavy-tab cold load

The 3D World and Knowledge Graph tabs lazy-load large chunks
(`chunk-metaverse`, `vendor-visualization`). Measure the time from click
to first `<canvas>` / first force-graph node attached, distinguishing the
**cold** (first-open) and **cached** (re-open) cases.

### 5.5 Interaction benchmarks (already in `ui-benchmark.cjs`)

- **`bundle-card-click`** — proves the card `onClick` is wired.
- **`image-load-health`** — counts loaded vs. broken bundle thumbnails.
- **`queue-monitor-load`** — wall time until the QueueMonitor stat grid
  shows numeric values.
- **`bundle-image-grid`** — wall time until thumbnail grid populates with
  `<img>` elements.

These are not optional. They were added because earlier rounds of "perf
work" missed regressions in exactly these places.

---

## 6. Reproducible scripts

The repository provides one durable benchmark script. **Add to it; do not
fork it.** If you need ad-hoc instrumentation for an investigation, put
the script in `/tmp/` so it does not pollute the repo.

| Script | Purpose | Run with |
|---|---|---|
| `ui-benchmark.cjs` | Landing + desktop app + mobile app, all interaction benchmarks. CI-friendly. | `node ui-benchmark.cjs` (auto-starts `vite preview` if no `UI_BENCHMARK_URL`) |

To run against an already-running preview server (faster iteration):

```bash
# terminal 1
npm run build
npx vite preview --host 127.0.0.1 --port 4173 --strictPort

# terminal 2
UI_BENCHMARK_URL=http://127.0.0.1:4173 node ui-benchmark.cjs > /tmp/bench.json
```

Output is a single JSON document on stdout. Pipe to `python3 -m json.tool`
or to your own summarizer. Process exit code is `1` if any blocking issue
is detected (page error UI, console pageerror, or a tab that rendered the
"Something went wrong" boundary).

Adding a new scenario? Extend `collectAppScenario()`. Adding a new
interaction probe? Add a `measure*` function with the same shape as
`measureBundleCardClick` and call it from `collectAppScenario`.

---

## 7. Procedure (the actual checklist)

Run this end-to-end. Do not skip steps.

1. **Baseline.** On the base branch (or before your change), run:
   ```bash
   git stash            # if you have local changes
   npm ci
   npm run build
   node ui-benchmark.cjs > /tmp/baseline.json 2>/tmp/baseline.err
   ```
   Save `baseline.json`. Inspect the per-chunk transfer list, paint
   metrics, long-task counts, and tab timings.

2. **Implement the change.** Keep the change scoped. Run typecheck and
   lint:
   ```bash
   npm run typecheck
   npm run lint
   ```

3. **Rebuild and re-benchmark** in the same shell so Node, Playwright, and
   Chromium versions are identical:
   ```bash
   npm run build
   node ui-benchmark.cjs > /tmp/after.json 2>/tmp/after.err
   ```

4. **Diff the two JSON files.** Look explicitly at:
   - Total critical-path JS transfer (mobile in particular).
   - The set of chunks loaded before 3 s settle.
   - LCP and FCP (mobile in particular).
   - Long-task count and TBT.
   - Tab-switch wall and main-thread-busy timings.
   - Any new `[pageerror]`, `[requestfailed]`, or "Something went wrong"
     entries in the issues array.

5. **If the static-import graph might have shifted** (almost always true
   for `vite.config.ts` changes, lazy-import changes, or new top-level
   imports): walk `dist/assets/*.js` per §4.5 and verify nothing
   previously lazy is now eager.

6. **Validate**:
   ```bash
   # repository-standard validation
   npm run typecheck
   npm run lint
   # then the agent validation suite
   parallel_validation
   ```

7. **Record the wins (and the losses) in the PR description** with the
   measured numbers — actual bytes, actual milliseconds. No vague claims
   like "feels faster". If you cannot demonstrate a measured improvement,
   either the change is not a perf change (mark it as such) or it should
   not land.

---

## 8. Anti-patterns (do not do these)

These are the failure modes that produced the "you didn't dive deep
enough" feedback. They are listed here so future sessions recognize them.

- **Benchmarking only the dev server.** Always benchmark `vite preview`
  against a fresh `npm run build`. Dev numbers are not real.
- **Benchmarking with no CPU throttling.** Modern desktop CPUs hide every
  bundle-size and long-task problem. The mobile-4× run is the one that
  surfaces real issues.
- **Benchmarking only `domContentLoaded` or `load`.** The app uses
  Suspense and lazy chunks; both fire long before the user sees a usable
  UI. You must measure paints, LCP, long tasks, and per-interaction
  settle time.
- **Inflating waits to mask regressions.** If a measurement function does
  `await waitForTimeout(600)` after every action, every action will look
  like ~600 ms regardless of what the app did. Use the long-task settle
  loop instead — wait for "no long task ended in the last 150 ms" with a
  reasonable upper bound.
- **Trusting a single run.** Numbers wobble. For tight comparisons run the
  benchmark **at least three times** per profile and take the median.
- **Looking only at chunk *sizes*.** A 33 KB chunk on the critical path
  matters less than a 1 KB chunk that pins a 33 KB chunk on the critical
  path. Always inspect the **static-import graph**, not just the
  `vite build` output table.
- **Skipping mobile.** Mobile is the dominant environment. A change that
  only improves the desktop column is at best half a change.
- **Fixing a number without understanding why it moved.** If you cannot
  explain *why* a metric improved (which import chain you broke, which
  long task you eliminated, which render you skipped), assume you got
  lucky and the regression will reappear next refactor.
- **Inventing a new benchmark script for every PR.** Extend
  `ui-benchmark.cjs` so the new probe runs in CI forever. Throwaway
  scripts belong in `/tmp/`.

---

## 9. Where the numbers should live

- **Per-PR**: in the PR description, with absolute numbers and deltas.
- **Per-release**: update `docs/technical/BENCHMARKS.md` with the latest
  numbers from a clean baseline run on the release commit.
- **Per-incident**: if a perf regression is shipped and detected later,
  add a new `measure*` probe to `ui-benchmark.cjs` so the same regression
  cannot recur silently.

The goal is a monotonic ratchet: every probe added stays added, every
chunk that gets off the critical path stays off, every milestone is
measured against the previous one.
