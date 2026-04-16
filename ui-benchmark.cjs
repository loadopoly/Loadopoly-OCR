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

/**
 * Navigate to the Assets & Bundles tab using the sidebar or keyboard shortcut.
 * Returns true if the navigation succeeded.
 */
async function navigateToAssetsTab(page, viewport) {
  const sidebar = page.locator('text=Assets & Bundles').first();
  const isVisible = await sidebar.isVisible().catch(() => false);
  if (isVisible) {
    await sidebar.click();
  } else {
    // Mobile fallback: keyboard shortcut '4' opens Assets tab
    await page.keyboard.press('4');
  }
  await page.waitForTimeout(300);
}

/**
 * Benchmark 1 — BundleCard click interaction
 *
 * Navigates to Assets tab, finds the first BundleCard, clicks it, and checks
 * whether the UI reacted (e.g. selection highlight or other DOM change).
 * This catches the previously-dead onClick that was never wired up.
 */
async function measureBundleCardClick(page, viewport) {
  try {
    await navigateToAssetsTab(page, viewport);

    // BundleCards have the purple package icon and "N images" badge.
    // The outermost clickable div uses the class pattern "bg-gradient-to-br from-purple-900".
    const cards = page.locator('[class*="from-purple-900"]');
    const count = await cards.count();
    if (count === 0) return { label: 'bundle-card-click', skipped: true, reason: 'no BundleCards found' };

    const card = cards.first();
    // Snapshot the body text before click to detect selection change.
    const beforeSnippet = await page.evaluate(() => document.body.innerText.slice(0, 600));
    const startedAt = Date.now();
    await card.click();
    await page.waitForTimeout(300);
    const afterSnippet = await page.evaluate(() => document.body.innerText.slice(0, 600));

    return {
      label: 'bundle-card-click',
      elapsedMs: Date.now() - startedAt,
      bundleCardsFound: count,
      uiChanged: beforeSnippet !== afterSnippet,
      hasErrorUi: afterSnippet.includes('Something went wrong'),
    };
  } catch (err) {
    return { label: 'bundle-card-click', error: err.message };
  }
}

/**
 * Benchmark 2 — Image load health
 *
 * On the Assets tab, counts how many BundleCard preview images loaded successfully
 * (actual <img> with naturalWidth > 0) vs how many fell through to the placeholder
 * (the ImageOff SVG icon rendered when all candidate URLs fail).
 */
async function measureImageLoadHealth(page, viewport) {
  try {
    await navigateToAssetsTab(page, viewport);
    // Give images a moment to attempt loading
    await page.waitForTimeout(500);

    const health = await page.evaluate(() => {
      // BundleCard thumbnail grids use "grid grid-cols-4" layout
      const grids = document.querySelectorAll('[class*="grid-cols-4"]');
      let loadedImages = 0;
      let brokenImages = 0;
      let placeholderIcons = 0;

      grids.forEach(grid => {
        grid.querySelectorAll('img').forEach(img => {
          if (img.naturalWidth > 0 && img.complete) {
            loadedImages++;
          } else {
            brokenImages++;
          }
        });
        // ImageOff placeholder is an SVG inside a flex-center div when image fails
        grid.querySelectorAll('svg').forEach(() => {
          placeholderIcons++;
        });
      });

      return {
        totalGrids: grids.length,
        loadedImages,
        brokenImages,
        placeholderIcons,
      };
    });

    return {
      label: 'image-load-health',
      ...health,
      healthRatio: health.loadedImages + health.brokenImages + health.placeholderIcons > 0
        ? +(health.loadedImages / (health.loadedImages + health.brokenImages + health.placeholderIcons)).toFixed(2)
        : null,
    };
  } catch (err) {
    return { label: 'image-load-health', error: err.message };
  }
}

/**
 * Benchmark 3 — Queue monitor load time
 *
 * Measures how quickly the QueueMonitor stats grid becomes visible with numeric
 * data. The QueueMonitor renders a "grid grid-cols-2" with stat cards showing
 * Waitlist, Active, Completed, and Failed counts. We measure from now until
 * the grid is present and contains at least one numeric value.
 */
async function measureQueueMonitorLoad(page) {
  try {
    const startedAt = Date.now();

    // The QueueMonitor header contains "Processing Queue" text.
    // Wait for it to appear (the component may still be loading stats).
    const queueHeader = page.locator('text=Processing Queue').first();
    const headerVisible = await queueHeader.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);

    if (!headerVisible) {
      return { label: 'queue-monitor-load', skipped: true, reason: 'Processing Queue header not found' };
    }

    // Now wait for the stats grid to populate (the 2-column grid with stat cards).
    // Each card has a large number (text-xl font-bold text-white).
    const statsLoaded = await page.waitForFunction(() => {
      const statNumbers = document.querySelectorAll('.text-xl.font-bold.text-white');
      // At least 2 stat cards should be visible with numeric content
      let numericCount = 0;
      statNumbers.forEach(el => {
        if (/^\d+$/.test(el.textContent?.trim() || '')) numericCount++;
      });
      return numericCount >= 2;
    }, { timeout: 8000 }).then(() => true).catch(() => false);

    const elapsedMs = Date.now() - startedAt;

    const stats = await page.evaluate(() => {
      const statEls = document.querySelectorAll('.text-xl.font-bold.text-white');
      const values = [];
      statEls.forEach(el => values.push(el.textContent?.trim() || ''));
      return values;
    });

    return {
      label: 'queue-monitor-load',
      elapsedMs,
      statsLoaded,
      statsValues: stats.slice(0, 4),
    };
  } catch (err) {
    return { label: 'queue-monitor-load', error: err.message };
  }
}

/**
 * Benchmark 4 — Bundle image grid performance
 *
 * Navigates to the Assets tab and measures how long it takes for the BundleCard
 * thumbnail grids (the 4-column preview strips) to appear and populate with
 * actual <img> elements. This catches lazy-loading delays and image resolution
 * chain performance.
 */
async function measureBundleImageGrid(page, viewport) {
  try {
    await navigateToAssetsTab(page, viewport);

    const startedAt = Date.now();

    // Wait for at least one thumbnail grid to contain an <img> element
    const gridPopulated = await page.waitForFunction(() => {
      const grids = document.querySelectorAll('[class*="grid-cols-4"]');
      for (const grid of grids) {
        if (grid.querySelectorAll('img').length > 0) return true;
      }
      return false;
    }, { timeout: 8000 }).then(() => true).catch(() => false);

    const elapsedMs = Date.now() - startedAt;

    // Snapshot the state of all grids
    const gridStats = await page.evaluate(() => {
      const grids = document.querySelectorAll('[class*="grid-cols-4"]');
      let totalSlots = 0;
      let slotsWithImg = 0;
      let imgsComplete = 0;

      grids.forEach(grid => {
        const slots = grid.children;
        totalSlots += slots.length;
        for (const slot of slots) {
          const img = slot.querySelector('img');
          if (img) {
            slotsWithImg++;
            if (img.complete && img.naturalWidth > 0) imgsComplete++;
          }
        }
      });

      return { gridCount: grids.length, totalSlots, slotsWithImg, imgsComplete };
    });

    return {
      label: 'bundle-image-grid',
      elapsedMs,
      gridPopulated,
      ...gridStats,
      fillRate: gridStats.totalSlots > 0
        ? +(gridStats.imgsComplete / gridStats.totalSlots).toFixed(2)
        : null,
    };
  } catch (err) {
    return { label: 'bundle-image-grid', error: err.message };
  }
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

  // --- Interaction-level benchmarks ---

  // 1. BundleCard click interaction: navigate to Assets tab, click a BundleCard,
  //    verify that selection state changes (the card's onClick should toggle asset selection).
  result.bundleCardClick = await measureBundleCardClick(page, viewport);

  // 2. Image load health: count how many bundle preview images loaded successfully
  //    vs how many fell back to the broken-image placeholder (ImageOff icon).
  result.imageLoadHealth = await measureImageLoadHealth(page, viewport);

  // 3. Queue monitor load time: measure how long the Processing Queue stats grid
  //    takes to appear with numeric data after the page is ready.
  result.queueMonitorLoad = await measureQueueMonitorLoad(page);

  // 4. Bundle image grid performance: measure how long it takes for the BundleCard
  //    thumbnail grids to populate with actual <img> elements after navigating to Assets.
  result.bundleImageGrid = await measureBundleImageGrid(page, viewport);

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
      (appMobile.tabs || []).some(tab => tab.hasErrorUi) ||
      // Interaction benchmarks: flag if BundleCard click caused an error UI
      appDesktop.bundleCardClick?.hasErrorUi ||
      appMobile.bundleCardClick?.hasErrorUi;

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
