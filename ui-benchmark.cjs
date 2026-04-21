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

const { chromium } = require('playwright');

const {
  waitForServer,
  canReach,
  startPreviewServer,
  stopPreviewServer,
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
  measureColdStartSidebar,
  measureArScannerRouteLoad,
  measureArScannerCameraReady,
} = require('./scripts/perf/interactions.cjs');

const HOST = process.env.UI_BENCHMARK_HOST || '127.0.0.1';
const PORT = Number(process.env.UI_BENCHMARK_PORT || 4173);
const BASE_URL = process.env.UI_BENCHMARK_URL || `http://${HOST}:${PORT}`;

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function createBenchmarkContext(browser, viewport) {
  const context = await browser.newContext({ viewport });
  await context.grantPermissions(['camera', 'geolocation'], { origin: BASE_URL });
  return context;
}

/**
 * Run a full app-shell scenario for a given viewport: pre-warm
 * localStorage, navigate, collect paint/nav metrics, walk all top-level
 * tabs (with mobile-shortcut fallback), then run the four interaction
 * probes.
 */
async function collectAppScenario(browser, viewportLabel, viewport) {
  const context = await createBenchmarkContext(browser, viewport);
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
  result.arScannerRouteLoad = await measureArScannerRouteLoad(page);
  if (result.arScannerRouteLoad?.warningAppeared === true) {
    result.arScannerCameraReady = await measureArScannerCameraReady(page);
  }

  result.bundleCardClick = await measureBundleCardClick(page);
  result.imageLoadHealth = await measureImageLoadHealth(page);
  result.queueMonitorLoad = await measureQueueMonitorLoad(page);
  result.bundleImageGrid = await measureBundleImageGrid(page);

  await context.close();
  return result;
}

/**
 * Cold-start scenario: measure sidebar and AR Scanner responsiveness
 * immediately after DOMContentLoaded with no post-load settle wait.
 *
 * This catches the three regressions described in §10 of
 * docs/technical/BENCHMARKS.md that the settled app-shell scenarios miss:
 *   - Sidebar tap swallowed during cold-start background work (P0).
 *   - AR Scanner warning screen latency after a cold nav.
 *   - HUD-on-black-frame: AR overlay paints before getUserMedia produces a frame.
 */
async function collectColdStartScenario(browser, viewportLabel, viewport) {
  const context = await createBenchmarkContext(browser, viewport);
  await seedReturningUserState(context);

  const page = await context.newPage();
  // Navigate cold — domcontentloaded only, no waitForTimeout.
  // The probe must run before background hydration work completes.
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const sidebar = await measureColdStartSidebar(page);

  // If the AR Safety Warning is already on screen from the cold tap, chain
  // the camera-ready probe so the full §10 step-4 path is exercised.
  let cameraReady = null;
  if (!sidebar.skipped && sidebar.warningAppeared === true) {
    cameraReady = await measureArScannerCameraReady(page);
  }

  await context.close();
  return { label: viewportLabel, sidebar, cameraReady };
}


function hasPageError(scenario) {
  return scenario.issues.some(issue => issue.includes('[pageerror]'));
}

function hasTabError(scenario) {
  return (scenario.tabs || []).some(tab => tab.hasErrorUi);
}

function hasColdStartBlockingIssue(coldStart) {
  if (!coldStart || coldStart.sidebar?.skipped) return false;
  // HUD-on-black-frame is an explicit §10.3 regression.
  if (coldStart.cameraReady?.hudOnBlack) return true;
  return false;
}

function summarizeBlockingIssues(landing, appDesktop, appMobile, coldStartDesktop, coldStartMobile) {
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
    appMobile.bundleCardClick?.hasErrorUi ||
    appDesktop.arScannerCameraReady?.hudOnBlack ||
    appMobile.arScannerCameraReady?.hudOnBlack ||
    hasColdStartBlockingIssue(coldStartDesktop) ||
    hasColdStartBlockingIssue(coldStartMobile)
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
    // Use the full Chromium channel (not headless_shell) so synthetic
    // getUserMedia works in headless mode during the AR Scanner probe.
    const browser = await chromium.launch({
      channel: 'chromium',
      headless: true,
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-capture',
      ],
    });

    // Landing page (first-time visitor, no localStorage seed).
    const landingContext = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
    const landingPage = await landingContext.newPage();
    const landing = await collectScenario(landingPage, 'landing', BASE_URL);
    await landingContext.close();

    // App-shell scenarios (warm visitor) at both required profiles.
    const appDesktop = await collectAppScenario(browser, 'app-desktop', DESKTOP_VIEWPORT);
    const appMobile = await collectAppScenario(browser, 'app-mobile', MOBILE_VIEWPORT);

    // Cold-start scenarios: sidebar + AR Scanner responsiveness right after
    // DOMContentLoaded with no post-load settle wait (§10 benchmark).
    const coldStartDesktop = await collectColdStartScenario(browser, 'cold-start-desktop', DESKTOP_VIEWPORT);
    const coldStartMobile = await collectColdStartScenario(browser, 'cold-start-mobile', MOBILE_VIEWPORT);

    await browser.close();

    const summary = { baseUrl: BASE_URL, landing, appDesktop, appMobile, coldStartDesktop, coldStartMobile };
    console.log(JSON.stringify(summary, null, 2));

    process.exitCode = summarizeBlockingIssues(landing, appDesktop, appMobile, coldStartDesktop, coldStartMobile) ? 1 : 0;
  } finally {
    if (server) {
      await stopPreviewServer(server);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
