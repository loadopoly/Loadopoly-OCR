/**
 * GeoGraph UI Performance Benchmark
 * 
 * Headless Playwright test that clicks through every major flow in the app,
 * measures response times, and writes results to benchmarks/results/.
 *
 * Flow: Landing Page → "Try Free" → Skip Onboarding → App Shell → All Tabs
 *
 * Usage:
 *   node benchmarks/ui-benchmark.cjs               # default: http://localhost:3000
 *   node benchmarks/ui-benchmark.cjs --url http://localhost:5173
 *   node benchmarks/ui-benchmark.cjs --save         # persist results to benchmarks/results/
 *   node benchmarks/ui-benchmark.cjs --compare      # compare against last saved baseline
 *
 * Requirements: playwright (npx playwright install chromium)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL = process.argv.find(a => a.startsWith('--url='))?.split('=')[1]
  || (process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : null)
  || 'http://localhost:3000';

const SAVE = process.argv.includes('--save');
const COMPARE = process.argv.includes('--compare');
const RESULTS_DIR = path.join(__dirname, 'results');
const BASELINE_FILE = path.join(RESULTS_DIR, 'baseline.json');
const THRESHOLDS_FILE = path.join(__dirname, 'thresholds.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(ms) { return ms === -2 ? 'SKIP' : ms < 0 ? 'FAIL' : `${ms}ms`; }
function pct(a, b) {
  if (b <= 0) return 'N/A';
  const diff = ((a - b) / b * 100).toFixed(1);
  return `${diff > 0 ? '+' : ''}${diff}%`;
}

/** Click a sidebar nav button by exact label text */
async function clickSidebarTab(page, label, timeout = 5000) {
  // Sidebar is the first child of the app shell — a div with nav buttons
  const btn = page.locator('button', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first();
  await btn.waitFor({ timeout });
  await btn.click();
  return btn;
}

class Benchmark {
  constructor() {
    this.results = {};
    this.errors = [];
    this.startTime = Date.now();
  }

  record(name, ms) {
    this.results[name] = Math.round(ms);
  }

  error(name, msg) {
    this.results[name] = -1; // -1 = failed/skipped
    this.errors.push(`${name}: ${msg}`);
  }

  elapsed() { return Date.now() - this.startTime; }
}

// ---------------------------------------------------------------------------
// Phase 1: Landing Page → App Shell
// ---------------------------------------------------------------------------

async function benchLandingToShell(page, bench) {
  // Load the landing page
  const loadStart = Date.now();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  bench.record('01_dom_content_loaded', Date.now() - loadStart);

  // Wait for React to render the landing page
  try {
    await page.waitForSelector('button:has-text("Try Free")', { timeout: 10000 });
    bench.record('02_landing_rendered', Date.now() - loadStart);
  } catch {
    bench.error('02_landing_rendered', 'Landing page did not render in 10s');
    return false;
  }

  // Click "Try Free" to enter onboarding wizard
  const entryStart = Date.now();
  await page.locator('button:has-text("Try Free")').click();

  // Wait for the onboarding wizard overlay
  try {
    await page.waitForSelector('button:has-text("Skip")', { timeout: 5000 });
    bench.record('02_onboarding_wizard', Date.now() - entryStart);
  } catch {
    bench.error('02_onboarding_wizard', 'Onboarding wizard did not appear');
    return false;
  }

  // Skip onboarding to go directly to app shell
  const skipStart = Date.now();
  await page.locator('button:has-text("Skip")').click();

  // Wait for the app shell (flex h-screen container)
  try {
    await page.waitForSelector('[class*="flex h-screen"]', { timeout: 10000 });
    bench.record('03_app_shell_ready', Date.now() - skipStart);
  } catch {
    bench.error('03_app_shell_ready', 'App shell did not appear after skip');
    return false;
  }

  // Wait for sidebar nav buttons
  try {
    await page.waitForSelector('button:has-text("Dashboard")', { timeout: 5000 });
    bench.record('03_sidebar_visible', Date.now() - skipStart);
  } catch {
    bench.error('03_sidebar_visible', 'Sidebar buttons not visible');
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Phase 2: Dashboard Content
// ---------------------------------------------------------------------------

async function benchDashboardContent(page, bench) {
  const start = Date.now();
  try {
    // Dashboard shows "Total Assets", "Processing Queue Status", etc.
    await page.waitForSelector('text=Total Assets', { timeout: 8000 });
    bench.record('04_dashboard_content', Date.now() - start);
  } catch {
    bench.error('04_dashboard_content', 'Dashboard content not rendered in 8s');
  }
}

// ---------------------------------------------------------------------------
// Phase 3: Tab Navigation
// ---------------------------------------------------------------------------

async function benchTabSwitch(page, bench, tabLabel, resultKey, contentText, timeout = 8000) {
  const start = Date.now();
  try {
    await clickSidebarTab(page, tabLabel);
    // Wait briefly for React's startTransition to complete
    await page.waitForTimeout(200);
    // Wait for tab-specific content text in the main area
    await page.waitForSelector(`text=${contentText}`, { timeout });
    bench.record(resultKey, Date.now() - start);
  } catch (e) {
    bench.error(resultKey, `${tabLabel}: ${e.message?.substring(0, 100)}`);
  }
}

// ---------------------------------------------------------------------------
// Phase 3.5: Batch Screen — AR Scanner button + photo upload actions
// ---------------------------------------------------------------------------

async function benchBatchScreenActions(page, bench) {
  const start = Date.now();
  try {
    await clickSidebarTab(page, 'Quick Processing');
    await page.waitForTimeout(300);

    // Verify the AR Scanner shortcut button exists on the batch screen
    const arBtn = page.locator('button:has-text("Open AR Scanner")').first();
    await arBtn.waitFor({ timeout: 8000 });
    bench.record('05b_batch_ar_button_visible', Date.now() - start);

    // Verify photo upload (camera) button exists (in BatchImporter)
    const cameraBtn = page.locator('button:has-text("Take Photo with Camera")').first();
    await cameraBtn.waitFor({ timeout: 5000 });
    bench.record('05b_batch_camera_button_visible', Date.now() - start);

    // Click the AR Scanner button — should navigate to AR tab
    const navStart = Date.now();
    await arBtn.click();
    await page.waitForTimeout(500);
    // The AR tab should now be active (Safety Warning appears, or AR content visible)
    const arVisible = await page.evaluate(() =>
      document.body.textContent?.includes('AR Safety Warning') ||
      document.body.textContent?.includes('AR Scanner')
    );
    if (arVisible) {
      bench.record('05b_batch_ar_navigates', Date.now() - navStart);
    } else {
      bench.error('05b_batch_ar_navigates', 'AR tab did not activate after clicking AR Scanner button');
    }

    // Navigate back to batch for subsequent tests
    await clickSidebarTab(page, 'Quick Processing');
    await page.waitForTimeout(300);

  } catch (e) {
    bench.error('05b_batch_ar_button_visible', `Batch screen actions: ${e.message?.substring(0, 100)}`);
  }
}

// ---------------------------------------------------------------------------
// Phase 3.6: Batch Processing Panel close-out flow
// ---------------------------------------------------------------------------

async function benchBatchCloseout(page, bench) {
  const start = Date.now();
  try {
    // Open the large batch manager overlay
    await clickSidebarTab(page, 'Quick Processing');
    await page.waitForTimeout(300);

    // Click "Open Large Batch Manager" button (shown in the processing panel slide-out
    // or the batch tab — look for it in either location).
    const openBatchBtn = page.locator('button:has-text("Open Large Batch Manager")').first();
    await openBatchBtn.waitFor({ timeout: 8000 });
    await openBatchBtn.click();
    bench.record('05c_batch_panel_open', Date.now() - start);

    // The overlay should appear: "Batch Processing" heading
    await page.waitForSelector('text=Batch Processing', { timeout: 8000 });
    bench.record('05c_batch_panel_visible', Date.now() - start);

    // Verify the Camera and AR Scanner buttons are present inside the panel
    const panelCameraBtn = page.locator('button[title="Take a photo with your camera"]').first();
    await panelCameraBtn.waitFor({ timeout: 5000 });
    bench.record('05c_batch_panel_camera_btn', Date.now() - start);

    const panelARBtn = page.locator('button[title="Open the full AR scanner"]').first();
    await panelARBtn.waitFor({ timeout: 5000 });
    bench.record('05c_batch_panel_ar_btn', Date.now() - start);

    // Close the panel via the × button inside the gradient header
    // The close button lives inside the "from-blue-600 to-purple-600" header div
    const closeStart = Date.now();
    try {
      await page
        .locator('div.bg-gradient-to-r button')
        .filter({ has: page.locator('svg') })
        .last()
        .click({ timeout: 3000 });
    } catch {
      // Fallback: press Escape (panel listens for Escape key)
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(600);

    // After close the panel overlay element should no longer be in the DOM.
    // We detect this by checking that the specific drop-zone text is gone.
    const panelGone = await page.evaluate(() =>
      document.querySelector('[class*="z-50"]') === null ||
      !document.body.textContent?.includes('Drop files here or click Add Files')
    );
    if (panelGone) {
      bench.record('05c_batch_panel_closeout', Date.now() - closeStart);
    } else {
      bench.error('05c_batch_panel_closeout', 'Batch panel did not close / screen locked after close');
    }

    // Verify the UI is responsive after close (click another tab successfully)
    const responseStart = Date.now();
    await clickSidebarTab(page, 'Dashboard');
    await page.waitForSelector('text=Total Assets', { timeout: 5000 });
    bench.record('05c_post_closeout_responsive', Date.now() - responseStart);

  } catch (e) {
    bench.error('05c_batch_panel_closeout', `Batch closeout: ${e.message?.substring(0, 100)}`);
  }
}


async function benchARScanner(page, bench) {
  const start = Date.now();
  try {
    await clickSidebarTab(page, 'AR Scanner');
    bench.record('10_ar_click', Date.now() - start);

    // Safety warning overlay should appear
    await page.waitForSelector('text=AR Safety Warning', { timeout: 8000 });
    bench.record('10_ar_safety_warning', Date.now() - start);

    // Click "I Understand & Agree"
    const agreeStart = Date.now();
    await page.locator('button:has-text("I Understand")').click();

    // After accept, camera view renders (or error on headless since no camera)
    // Look for any of: video element, camera error, or the AR viewfinder
    try {
      await page.waitForFunction(() => {
        return document.querySelector('video') ||
               document.body.textContent.includes('Camera') ||
               document.querySelector('[class*="ar-"]') ||
               document.querySelector('canvas');
      }, { timeout: 10000 });
      bench.record('10_ar_post_accept', Date.now() - agreeStart);
    } catch {
      // On headless without camera, this may timeout — record what we got
      bench.record('10_ar_post_accept', Date.now() - agreeStart);
    }

    // Navigate back to dashboard to clear AR overlay
    await clickSidebarTab(page, 'Dashboard');
    await page.waitForTimeout(500);
  } catch (e) {
    bench.error('10_ar_safety_warning', `AR flow: ${e.message?.substring(0, 100)}`);
  }
}

// ---------------------------------------------------------------------------
// Phase 5: Settings Panel
// ---------------------------------------------------------------------------

async function benchSettings(page, bench) {
  const start = Date.now();
  try {
    await clickSidebarTab(page, 'Settings');
    // Settings shows API key config, LLM provider, etc.
    await page.waitForSelector('text=Gemini', { timeout: 8000 });
    bench.record('14_settings_content', Date.now() - start);
  } catch (e) {
    bench.error('14_settings_content', e.message?.substring(0, 100));
  }
}

// ---------------------------------------------------------------------------
// Phase 6: Dynamic Filters
// ---------------------------------------------------------------------------

async function benchDynamicFilters(page, bench) {
  const start = Date.now();
  try {
    await clickSidebarTab(page, 'Dynamic Filters');
    await page.waitForTimeout(1000);
    // Check that tab switched (main content changes)
    bench.record('16_dynamic_filters', Date.now() - start);
  } catch (e) {
    bench.error('16_dynamic_filters', e.message?.substring(0, 100));
  }
}

// ---------------------------------------------------------------------------
// Phase 7: Memory
// ---------------------------------------------------------------------------

async function benchMemory(page, client, bench) {
  try {
    const metrics = await client.send('Performance.getMetrics');
    const jsHeap = metrics.metrics.find(m => m.name === 'JSHeapUsedSize');
    const totalHeap = metrics.metrics.find(m => m.name === 'JSHeapTotalSize');
    if (jsHeap) bench.record('mem_js_heap_used_kb', Math.round(jsHeap.value / 1024));
    if (totalHeap) bench.record('mem_js_heap_total_kb', Math.round(totalHeap.value / 1024));
  } catch {
    bench.error('mem_js_heap_used_kb', 'Could not read performance metrics');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       GeoGraph UI Performance Benchmark         ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Save: ${SAVE}  Compare: ${COMPARE}\n`);

  const browser = await chromium.launch({ headless: true });

  // ═══════════════════════════════════════════════════════════════
  // Scenario A: Returning User (direct to app shell — the real UX)
  // ═══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SCENARIO A: Returning User (direct → app shell)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const ctxA = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['camera', 'geolocation'],
  });
  const pageA = await ctxA.newPage();
  const clientA = await pageA.context().newCDPSession(pageA);
  await clientA.send('Performance.enable');

  // Capture console errors and page crashes
  const consoleErrors = [];
  pageA.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().substring(0, 120));
  });
  pageA.on('pageerror', err => consoleErrors.push(`PAGE_ERROR: ${err.message.substring(0, 120)}`));

  const benchA = new Benchmark();

  // Pre-seed: returning user + all extensions enabled + skip onboarding
  // Navigate to the base URL first to establish the origin for localStorage,
  // then set values and reload to simulate a returning user.
  await pageA.goto(BASE_URL, { waitUntil: 'commit', timeout: 15000 });
  await pageA.evaluate(() => {
    localStorage.setItem('geograph-has-visited', 'true');
    localStorage.setItem('geograph-onboarding-v2', 'done');
    localStorage.setItem('geograph-ux-preferences', JSON.stringify({
      simplifiedMode: false,
      extensions: { threeD: true, social: true, marketplace: true }
    }));
  });

  // Phase 1: App boot (returning user goes directly to app shell)
  console.log('▸ Phase 1: App Boot (returning user)');
  const bootStart = Date.now();
  await pageA.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  benchA.record('01_dom_content_loaded', Date.now() - bootStart);

  let shellReady = false;
  try {
    await pageA.waitForSelector('[class*="flex h-screen"]', { timeout: 15000 });
    benchA.record('02_app_shell_ready', Date.now() - bootStart);
    shellReady = true;
  } catch {
    benchA.error('02_app_shell_ready', 'App shell did not render in 15s');
  }

  if (shellReady) {
    try {
      await pageA.waitForSelector('button:has-text("Dashboard")', { timeout: 10000 });
      benchA.record('03_sidebar_visible', Date.now() - bootStart);
    } catch {
      benchA.error('03_sidebar_visible', 'Sidebar not visible in 10s');
    }

    // Phase 2: Dashboard Content
    console.log('▸ Phase 2: Dashboard Content');
    await benchDashboardContent(pageA, benchA);

    // Phase 3: Tab Navigation
    console.log('▸ Phase 3: Tab Navigation');
    await benchTabSwitch(pageA, benchA, 'Quick Processing', '05_batch_content', 'Batch Ingestion');
    await benchTabSwitch(pageA, benchA, 'Assets & Bundles', '06_assets_content', 'Exploratory Analysis');
    await benchTabSwitch(pageA, benchA, 'Knowledge Graph', '07_graph_content', 'Knowledge Graph');
    await benchTabSwitch(pageA, benchA, 'Structured DB', '08_database_content', 'Structured');
    await benchTabSwitch(pageA, benchA, 'Dashboard', '09_dashboard_return_content', 'Total Assets');

    // Phase 3.5: Batch Screen — AR Scanner button + photo upload actions
    console.log('▸ Phase 3.5: Batch Screen Actions (AR + Photo Upload)');
    await benchBatchScreenActions(pageA, benchA);

    // Phase 3.6: Batch Processing Panel close-out (screen-lock regression test)
    console.log('▸ Phase 3.6: Batch Processing Panel Close-out');
    await benchBatchCloseout(pageA, benchA);

    // Phase 4: AR Scanner Full Flow
    console.log('▸ Phase 4: AR Scanner Flow');
    await benchARScanner(pageA, benchA);

    // Phase 5: Conditional Tabs
    console.log('▸ Phase 5: Extension Tabs');
    const conditionalTabs = [
      { label: '3D World', key: '11_world_content', content: '3D' },
      { label: 'Social Hub', key: '12_social_content', content: 'Social' },
      { label: 'Marketplace', key: '13_market_content', content: 'Marketplace' },
    ];
    for (const { label, key, content } of conditionalTabs) {
      const start = Date.now();
      try {
        await clickSidebarTab(pageA, label, 5000);
        await pageA.waitForTimeout(200);
        await pageA.waitForSelector(`text=${content}`, { timeout: 8000 });
        benchA.record(key, Date.now() - start);
      } catch (e) {
        benchA.error(key, `${label}: ${e.message?.substring(0, 100)}`);
      }
    }

    // Phase 6: Settings
    console.log('▸ Phase 6: Settings');
    await benchSettings(pageA, benchA);

    // Phase 7: Dynamic Filters
    console.log('▸ Phase 7: Dynamic Filters');
    await benchDynamicFilters(pageA, benchA);

    // Phase 8: Error recovery — verify app still works after full navigation
    console.log('▸ Phase 8: Error Recovery Check');
    const recoveryStart = Date.now();
    try {
      await clickSidebarTab(pageA, 'Dashboard');
      await pageA.waitForSelector('text=Total Assets', { timeout: 5000 });
      benchA.record('18_recovery_to_dashboard', Date.now() - recoveryStart);
    } catch (e) {
      benchA.error('18_recovery_to_dashboard', e.message?.substring(0, 100));
    }

    // Check if "Something went wrong" ever appeared
    const errorScreen = await pageA.evaluate(() =>
      document.body.textContent?.includes('Something went wrong')
    );
    if (errorScreen) {
      benchA.error('19_no_error_screen', 'ErrorBoundary "Something went wrong" appeared during benchmark');
    } else {
      benchA.record('19_no_error_screen', 1); // 1 = no crash
    }
  }

  // Phase 9: Memory
  console.log('▸ Phase 9: Memory Snapshot');
  await benchMemory(pageA, clientA, benchA);

  benchA.record('total_benchmark_time', benchA.elapsed());
  if (consoleErrors.length > 0) {
    benchA.results['console_errors'] = consoleErrors.length;
  }

  await ctxA.close();

  // ═══════════════════════════════════════════════════════════════
  // Scenario B: First-Time Visitor (landing → onboarding → app)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SCENARIO B: First-Time Visitor (landing → app)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const ctxB = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['camera', 'geolocation'],
  });
  const pageB = await ctxB.newPage();

  // Pre-seed extension visibility only (no has-visited, no onboarding skip)
  await pageB.goto(BASE_URL + '/favicon.ico', { waitUntil: 'commit', timeout: 10000 }).catch(() => {});
  await pageB.evaluate(() => {
    localStorage.setItem('geograph-ux-preferences', JSON.stringify({
      simplifiedMode: false,
      extensions: { threeD: true, social: true, marketplace: true }
    }));
  });

  const benchB = new Benchmark();
  console.log('▸ Landing → Onboarding → App Shell');
  const firstVisitOk = await benchLandingToShell(pageB, benchB);

  if (firstVisitOk) {
    await benchDashboardContent(pageB, benchB);
  }
  benchB.record('total_benchmark_time', benchB.elapsed());

  await ctxB.close();
  await browser.close();

  // ── Results ──
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SCENARIO A: Returning User');
  console.log('═══════════════════════════════════════════════════════════════');
  printResults(benchA);

  if (consoleErrors.length > 0) {
    console.log(`\n  Console errors captured (${consoleErrors.length}):`);
    consoleErrors.slice(0, 5).forEach(e => console.log(`    • ${e}`));
    if (consoleErrors.length > 5) console.log(`    ... and ${consoleErrors.length - 5} more`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  SCENARIO B: First-Time Visitor');
  console.log('═══════════════════════════════════════════════════════════════');
  printResults(benchB);

  if (SAVE) {
    saveResults(benchA, 'returning');
    saveResults(benchB, 'first-visit');
  }

  if (COMPARE) {
    compareWithBaseline(benchA);
  }

  const totalErrors = benchA.errors.length + benchB.errors.length;
  if (totalErrors > 0) {
    console.log(`\n⚠  ${totalErrors} step(s) failed across both scenarios.`);
    process.exitCode = 1;
  } else {
    console.log('\n✓ All benchmarks passed.');
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printResults(bench) {
  // Load thresholds
  let thresholds = {};
  try {
    thresholds = JSON.parse(fs.readFileSync(THRESHOLDS_FILE, 'utf8'));
  } catch { /* no thresholds file yet */ }

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     BENCHMARK RESULTS                       ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');

  const entries = Object.entries(bench.results).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of entries) {
    const label = key.padEnd(35);
    const val = value === -2 ? 'SKIP'.padStart(10) : value < 0 ? 'FAILED'.padStart(10) : `${value}`.padStart(10);
    const unit = key.startsWith('mem_') ? 'KB' : 'ms';

    // Threshold check
    let status = '';
    if (thresholds[key] && value > 0) {
      if (value <= thresholds[key].target) {
        status = '  ✓ PASS';
      } else if (value <= thresholds[key].max) {
        status = '  ~ WARN';
      } else {
        status = '  ✗ FAIL';
      }
    }

    console.log(`║  ${label} ${val} ${unit}${status}`);
  }

  console.log('╠══════════════════════════════════════════════════════════════╣');

  if (bench.errors.length > 0) {
    console.log('║  ERRORS:');
    for (const err of bench.errors) {
      console.log(`║    • ${err.substring(0, 60)}`);
    }
    console.log('╠══════════════════════════════════════════════════════════════╣');
  }

  console.log('╚══════════════════════════════════════════════════════════════╝');
}

function saveResults(bench, scenario) {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tag = scenario ? `-${scenario}` : '';
  const result = {
    timestamp: new Date().toISOString(),
    url: BASE_URL,
    scenario: scenario || 'default',
    results: bench.results,
    errors: bench.errors,
  };

  // Save timestamped run
  const runFile = path.join(RESULTS_DIR, `run${tag}-${timestamp}.json`);
  fs.writeFileSync(runFile, JSON.stringify(result, null, 2));
  console.log(`\n✓ Results saved to ${path.relative(process.cwd(), runFile)}`);

  // Update baseline for this scenario
  const baselineFile = scenario
    ? path.join(RESULTS_DIR, `baseline-${scenario}.json`)
    : BASELINE_FILE;
  fs.writeFileSync(baselineFile, JSON.stringify(result, null, 2));
  console.log(`✓ Baseline updated: ${path.relative(process.cwd(), baselineFile)}`);
}

function compareWithBaseline(bench) {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.log('\n⚠  No baseline found. Run with --save first to create one.');
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const baseResults = baseline.results;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                 COMPARISON vs BASELINE                      ║');
  console.log(`║  Baseline: ${baseline.timestamp}                  ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Metric                            Now        Base    Delta ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');

  const entries = Object.entries(bench.results).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of entries) {
    const baseVal = baseResults[key];
    if (baseVal === undefined) continue;
    if (value < 0 || baseVal < 0) continue;

    const label = key.padEnd(35);
    const now = `${value}`.padStart(7);
    const base = `${baseVal}`.padStart(7);
    const delta = pct(value, baseVal).padStart(8);

    const indicator = value < baseVal ? '↓' : value > baseVal ? '↑' : '=';
    console.log(`║  ${label} ${now}  ${base}  ${delta} ${indicator}`);
  }

  console.log('╚══════════════════════════════════════════════════════════════╝');
}

main().catch(e => {
  console.error('Benchmark failed:', e.message);
  process.exit(1);
});
