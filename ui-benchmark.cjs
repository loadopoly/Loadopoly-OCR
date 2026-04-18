/**
 * Frontend perf benchmark orchestrator.
 *
 * Composes the modules in `scripts/perf/` into the full benchmark
 * pipeline: landing scenario, desktop app-shell scenario (1440×900),
 * mobile app-shell scenario (390×844), and the four interaction probes
 * on each app-shell run.
 *
 * Output is a single JSON document on stdout. Exit code is 1 if any
 * scenario reports a blocking issue (page error UI, [pageerror] in the
 * console listener stream, or a tab/probe rendering the error boundary).
 *
 * Methodology and the "why" of every step:
 *   docs/technical/PERFORMANCE_BENCHMARKING.md
 *
 * Module map (the building blocks composed below):
 *   scripts/perf/README.md
 *
 * Usage:
 *   # auto-spawns `vite preview`
 *   node ui-benchmark.cjs
 *
 *   # reuse an already-running preview server (faster iteration)
 *   UI_BENCHMARK_URL=http://127.0.0.1:4173 node ui-benchmark.cjs
 */

const { once } = require('events');
const { chromium } = require('playwright');

const {
  waitForServer,
  canReach,
  startPreviewServer,
} = require('./scripts/perf/server.cjs');
const {
  seedReturningUserState,
} = require('./scripts/perf/state.cjs');
const {
  collectScenario,
  collectJsResourceTiming,
} = require('./scripts/perf/collect.cjs');
const {
  TAB_DEFS,
  measureTab,
} = require('./scripts/perf/navigation.cjs');
const {
  measureBundleCardClick,
  measureImageLoadHealth,
  measureQueueMonitorLoad,
  measureBundleImageGrid,
} = require('./scripts/perf/interactions.cjs');

const HOST = process.env.UI_BENCHMARK_HOST || '127.0.0.1';
const PORT = Number(process.env.UI_BENCHMARK_PORT || 4173);
const BASE_URL = process.env.UI_BENCHMARK_URL || `http://${HOST}:${PORT}`;

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

/**
 * Run a full app-shell scenario for a given viewport: pre-warm
 * localStorage, navigate, collect paint/nav metrics, walk all top-level
 * tabs (with mobile-shortcut fallback), then run the four interaction
 * probes.
 */
async function collectAppScenario(browser, viewportLabel, viewport) {
  const context = await browser.newContext({ viewport });
  await seedReturningUserState(context);

  const page = await context.newPage();
  const result = await collectScenario(page, viewportLabel, BASE_URL);
  result.tabs = [];

  for (const [tabId, sidebarLabel, shortcutKey] of TAB_DEFS) {
    const metric = await measureTab(page, tabId, sidebarLabel, shortcutKey);
    if (metric) result.tabs.push(metric);
  }

  result.resources = await collectJsResourceTiming(page);

  // Interaction probes. Each is responsible for its own setup (e.g.
  // navigating to the Assets tab) and for not throwing.
  result.bundleCardClick = await measureBundleCardClick(page);
  result.imageLoadHealth = await measureImageLoadHealth(page);
  result.queueMonitorLoad = await measureQueueMonitorLoad(page);
  result.bundleImageGrid = await measureBundleImageGrid(page);

  await context.close();
  return result;
}

function hasPageError(scenario) {
  return scenario.issues.some(issue => issue.includes('[pageerror]'));
}

function hasTabError(scenario) {
  return (scenario.tabs || []).some(tab => tab.hasErrorUi);
}

function summarizeBlockingIssues(landing, appDesktop, appMobile) {
  return (
    landing.metrics.hasErrorUi ||
    appDesktop.metrics.hasErrorUi ||
    appMobile.metrics.hasErrorUi ||
    hasPageError(landing) ||
    hasPageError(appDesktop) ||
    hasPageError(appMobile) ||
    hasTabError(appDesktop) ||
    hasTabError(appMobile) ||
    appDesktop.bundleCardClick?.hasErrorUi ||
    appMobile.bundleCardClick?.hasErrorUi
  );
}

async function main() {
  const shouldStartServer =
    !process.env.UI_BENCHMARK_URL && !(await canReach(BASE_URL));
  const server = shouldStartServer
    ? startPreviewServer({ host: HOST, port: PORT })
    : null;

  try {
    await waitForServer(BASE_URL);
    const browser = await chromium.launch({ headless: true });

    // Landing page (first-time visitor, no localStorage seed).
    const landingContext = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
    const landingPage = await landingContext.newPage();
    const landing = await collectScenario(landingPage, 'landing', BASE_URL);
    await landingContext.close();

    // App-shell scenarios (warm visitor) at both required profiles.
    const appDesktop = await collectAppScenario(browser, 'app-desktop', DESKTOP_VIEWPORT);
    const appMobile = await collectAppScenario(browser, 'app-mobile', MOBILE_VIEWPORT);

    await browser.close();

    const summary = { baseUrl: BASE_URL, landing, appDesktop, appMobile };
    console.log(JSON.stringify(summary, null, 2));

    process.exitCode = summarizeBlockingIssues(landing, appDesktop, appMobile) ? 1 : 0;
  } finally {
    if (server && !server.killed) {
      server.kill('SIGTERM');
      await once(server, 'close').catch(() => {});
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
