const { spawn } = require('child_process');
const { once } = require('events');
const { chromium } = require('playwright');

const HOST = process.env.UI_BENCHMARK_HOST || '127.0.0.1';
const PORT = Number(process.env.UI_BENCHMARK_PORT || 4173);
const BASE_URL = process.env.UI_BENCHMARK_URL || `http://${HOST}:${PORT}`;
const STORAGE_KEYS = {
  hasVisited: 'geograph-has-visited',
  onboarding: 'geograph-onboarding-v2',
  uxPreferences: 'geograph-ux-preferences',
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function canReach(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function startPreviewServer() {
  const server = spawn(
    'npm',
    ['run', 'preview', '--', '--host', HOST, '--port', String(PORT), '--strictPort'],
    {
      cwd: __dirname,
      env: process.env,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    }
  );

  server.stdout.on('data', chunk => process.stderr.write(chunk));
  server.stderr.on('data', chunk => process.stderr.write(chunk));
  return server;
}

function defaultUXPreferences() {
  return {
    persona: 'developer',
    simplifiedMode: false,
    extensions: {
      web3: false,
      threeD: true,
      social: true,
      marketplace: false,
      curatorMode: true,
      arScanner: true,
    },
    hasCompletedOnboarding: true,
    hasProcessedFirstAsset: false,
    assetCount: 0,
  };
}

async function collectScenario(page, label) {
  const issues = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      issues.push(`[console:${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', error => {
    issues.push(`[pageerror] ${error.message}`);
  });
  page.on('requestfailed', request => {
    issues.push(`[requestfailed] ${request.url()} :: ${request.failure()?.errorText || 'unknown'}`);
  });

  const startedAt = Date.now();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paints = Object.fromEntries(
      performance.getEntriesByType('paint').map(entry => [entry.name, entry.startTime])
    );

    return {
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      hasErrorUi: document.body.innerText.includes('Something went wrong'),
      bodySnippet: document.body.innerText.slice(0, 400),
      nav: nav
        ? {
            domContentLoaded: nav.domContentLoadedEventEnd,
            load: nav.loadEventEnd,
            responseEnd: nav.responseEnd,
            transferSize: nav.transferSize,
          }
        : null,
      paints,
    };
  });

  const result = {
    label,
    elapsedMs: Date.now() - startedAt,
    metrics,
    issues,
  };

  page.removeAllListeners();
  return result;
}

async function measureTab(page, label, textSelector) {
  const locator = page.locator(`text=${textSelector}`).first();
  if (!(await locator.count())) return null;

  // On narrow viewports (mobile) the sidebar is hidden behind a hamburger menu.
  // Check if the element is actually visible before attempting to click it.
  const isVisible = await locator.isVisible().catch(() => false);
  if (!isVisible) return null;

  const startedAt = Date.now();
  await locator.click();
  // PERF FIX: Reduced from 600ms to 250ms. The original 600ms wait inflated
  // all tab timings to ~800ms+, masking real performance differences.
  // React 19's startTransition completes within 100-200ms for tab switches;
  // 250ms gives enough headroom for lazy chunk loads without hiding regressions.
  await page.waitForTimeout(250);
  const snapshot = await page.evaluate(() => ({
    hasErrorUi: document.body.innerText.includes('Something went wrong'),
    loadingSpinners: document.querySelectorAll('.animate-spin').length,
    bodySnippet: document.body.innerText.slice(0, 220),
  }));

  return {
    label,
    elapsedMs: Date.now() - startedAt,
    ...snapshot,
  };
}

async function collectAppScenario(browser, viewportLabel, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((prefs) => {
    localStorage.setItem(prefs.storageKeys.hasVisited, 'true');
    localStorage.setItem(prefs.storageKeys.onboarding, 'true');
    localStorage.setItem(prefs.storageKeys.uxPreferences, JSON.stringify(prefs.uxPreferences));
  }, {
    storageKeys: STORAGE_KEYS,
    uxPreferences: defaultUXPreferences(),
  });

  const page = await context.newPage();
  const result = await collectScenario(page, viewportLabel);
  result.tabs = [];

  // Tab navigation: [tabId, sidebarLabel, keyboardShortcut]
  // On mobile viewports the sidebar is hidden — fall back to keyboard shortcuts
  const tabDefs = [
    ['assets', 'Assets & Bundles', '4'],
    ['graph', 'Knowledge Graph', '5'],
    ['world', '3D World', 'w'],
    ['database', 'Structured DB', '6'],
    ['batch', 'Quick Processing', '2'],
    ['dashboard', 'Dashboard', '1'],
  ];

  for (const [tabId, tabLabel, shortcutKey] of tabDefs) {
    // First try clicking the sidebar label (desktop)
    let metric = await measureTab(page, tabId, tabLabel);
    if (!metric && shortcutKey) {
      // Fallback for mobile: use keyboard shortcut
      const startedAt = Date.now();
      await page.keyboard.press(shortcutKey);
      await page.waitForTimeout(250);
      const snapshot = await page.evaluate(() => ({
        hasErrorUi: document.body.innerText.includes('Something went wrong'),
        loadingSpinners: document.querySelectorAll('.animate-spin').length,
        bodySnippet: document.body.innerText.slice(0, 220),
      }));
      metric = { label: tabId, elapsedMs: Date.now() - startedAt, ...snapshot };
    }
    if (metric) result.tabs.push(metric);
  }

  // Collect resource timing for JS bundle analysis
  result.resources = await page.evaluate(() => {
    return performance.getEntriesByType('resource')
      .filter(e => e.name.endsWith('.js'))
      .map(e => ({ name: e.name.split('/').pop(), transferSize: e.transferSize, duration: Math.round(e.duration) }))
      .sort((a, b) => b.transferSize - a.transferSize)
      .slice(0, 15);
  });

  await context.close();
  return result;
}

async function main() {
  const shouldStartServer =
    !process.env.UI_BENCHMARK_URL && !(await canReach(BASE_URL));
  const server = shouldStartServer ? startPreviewServer() : null;

  try {
    await waitForServer(BASE_URL);
    const browser = await chromium.launch({ headless: true });

    // --- Landing page (first-time visitor) ---
    const landingContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const landingPage = await landingContext.newPage();
    const landing = await collectScenario(landingPage, 'landing');
    await landingContext.close();

    // --- Desktop app scenario (1440×900) ---
    const appDesktop = await collectAppScenario(browser, 'app-desktop', { width: 1440, height: 900 });

    // --- Mobile app scenario (390×844 — iPhone 14 equivalent) ---
    const appMobile = await collectAppScenario(browser, 'app-mobile', { width: 390, height: 844 });

    await browser.close();

    const summary = { baseUrl: BASE_URL, landing, appDesktop, appMobile };
    console.log(JSON.stringify(summary, null, 2));

    const hasBlockingIssue =
      landing.metrics.hasErrorUi ||
      appDesktop.metrics.hasErrorUi ||
      appMobile.metrics.hasErrorUi ||
      landing.issues.some(issue => issue.includes('[pageerror]')) ||
      appDesktop.issues.some(issue => issue.includes('[pageerror]')) ||
      appMobile.issues.some(issue => issue.includes('[pageerror]')) ||
      (appDesktop.tabs || []).some(tab => tab.hasErrorUi) ||
      (appMobile.tabs || []).some(tab => tab.hasErrorUi);

    process.exitCode = hasBlockingIssue ? 1 : 0;
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
