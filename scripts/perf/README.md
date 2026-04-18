# `scripts/perf/` — Frontend Performance Benchmark Modules

Reusable building blocks for the perf benchmark harness. The runnable
entry point is `ui-benchmark.cjs` at the repository root, which composes
these modules into the full benchmark pipeline.

**Read this first:** [`docs/technical/PERFORMANCE_BENCHMARKING.md`](../../docs/technical/PERFORMANCE_BENCHMARKING.md)
— the methodology playbook. This README only documents *what is in each
file*; the playbook documents *what the process must look like and why*.

## Module map

| File | Responsibility |
|---|---|
| `server.cjs` | Spawn `vite preview`, wait for it to be reachable, decide whether to start our own server vs. reuse one given via `UI_BENCHMARK_URL`. |
| `state.cjs` | Seed `localStorage` so app-shell scenarios skip the landing page and onboarding (the "warm visitor" pre-warm from playbook §3). Also exports `STORAGE_KEYS` and `defaultUXPreferences()`. |
| `collect.cjs` | Per-page collectors: console/pageerror/requestfailed listeners, paint + nav timing snapshot, top-N JS resource timing. |
| `navigation.cjs` | Top-level tab navigation with the **mobile keyboard-shortcut fallback** (sidebar is hidden on 390 px viewports). Exports `TAB_DEFS` — the canonical tab list — and `navigateToAssetsTab()` used by interaction probes. |
| `interactions.cjs` | The four interaction probes: `measureBundleCardClick`, `measureImageLoadHealth`, `measureQueueMonitorLoad`, `measureBundleImageGrid`. |

## Design rules

These rules exist so a future Skill (or another script) can consume the
modules safely — not as personal preferences. Please follow them when
adding code here.

1. **Probes never throw.** They catch their own errors and return `{label,
   error}` so a single broken probe does not abort the whole benchmark
   run. The orchestrator decides what to do with errors.
2. **Probes return JSON-serializable objects only.** No Playwright
   handles, no functions, no class instances. The whole point is that the
   benchmark output is a single JSON document on stdout.
3. **No hidden timing inflation.** The 250 ms post-click settle in
   `navigation.cjs` was previously 600 ms and was hiding real regressions.
   Do not raise these waits to "make the test reliable" — if a probe is
   flaky, fix the underlying signal (wait on a DOM condition, not on the
   clock).
4. **Selectors are documented inline.** When you key off a Tailwind class
   (`from-purple-900`, `grid-cols-4`, `text-xl font-bold text-white`),
   leave a comment explaining which component renders it. Future
   refactors of those components will break the probe and the comment is
   the only thread back to the cause.
5. **Behavior changes require a benchmark re-baseline.** If you change a
   selector, a wait, or a default UX preference, update the numbers in
   `docs/technical/BENCHMARKS.md` in the same PR.

## Adding a new probe

1. Add a `measureFoo(page)` function to `interactions.cjs` following the
   same return-shape contract as the existing probes.
2. Call it from `collectAppScenario` in `ui-benchmark.cjs` and expose its
   result on the scenario object.
3. If failure of the probe represents a release-blocking issue, add it to
   the `hasBlockingIssue` check in `main()` so the benchmark exits 1.
4. Document why the probe exists in a top-of-function comment — what
   regression class it catches. Probes added without a "why" tend to get
   deleted in the next refactor.
5. Update playbook §5.5 to list the new probe.

## Adding a new aspirational metric (LCP, long tasks, TBT, ...)

These are listed in the playbook's "Implementation status" table as ❌.
When you implement one:

1. Put the collector in `collect.cjs` if it is page-wide, or in
   `interactions.cjs` if it attaches to a specific interaction.
2. Install any `PerformanceObserver` via `context.addInitScript` so it
   captures events from before `page.evaluate` could attach a handler.
3. Flip the row from ❌ to ✅ in the playbook's status table in the same
   PR.
