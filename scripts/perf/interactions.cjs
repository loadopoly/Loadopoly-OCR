/**
 * Interaction-level benchmark probes.
 *
 * Each probe returns a plain JSON object with a `label` field and either
 * the metrics it collected, a `skipped` flag with `reason`, or an `error`
 * field. They never throw — failures are reported in the result so the
 * benchmark run as a whole can complete and the JSON output is always
 * well-formed.
 *
 * Why each probe exists is in `docs/technical/PERFORMANCE_BENCHMARKING.md`
 * §5.5. Add new probes here and call them from `collectAppScenario` in
 * `ui-benchmark.cjs`.
 */

const { navigateToAssetsTab } = require('./navigation.cjs');

/**
 * Benchmark — BundleCard click interaction.
 *
 * Navigates to Assets, finds the first BundleCard, clicks it, and checks
 * whether the UI reacted (selection highlight or other DOM change). This
 * exists because a previous refactor left the card's `onClick` unwired
 * and the regression went unnoticed for weeks — there is now a probe.
 */
async function measureBundleCardClick(page) {
  try {
    await navigateToAssetsTab(page);

    // BundleCards have the purple package icon and "N images" badge.
    // The outermost clickable div uses the class pattern "from-purple-900".
    const cards = page.locator('[class*="from-purple-900"]');
    const count = await cards.count();
    if (count === 0) {
      return { label: 'bundle-card-click', skipped: true, reason: 'no BundleCards found' };
    }

    const card = cards.first();
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
 * Benchmark — Image load health.
 *
 * On the Assets tab, counts how many BundleCard preview images loaded
 * successfully (`<img>` with `naturalWidth > 0`) vs how many fell through
 * to the `ImageOff` placeholder rendered when all candidate URLs fail.
 */
async function measureImageLoadHealth(page) {
  try {
    await navigateToAssetsTab(page);
    // Give images a moment to attempt loading
    await page.waitForTimeout(500);

    const health = await page.evaluate(() => {
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

    const denominator = health.loadedImages + health.brokenImages + health.placeholderIcons;
    return {
      label: 'image-load-health',
      ...health,
      healthRatio: denominator > 0
        ? +(health.loadedImages / denominator).toFixed(2)
        : null,
    };
  } catch (err) {
    return { label: 'image-load-health', error: err.message };
  }
}

/**
 * Benchmark — Queue monitor load time.
 *
 * Measures how quickly the QueueMonitor stats grid becomes visible with
 * numeric data. The QueueMonitor renders a "grid grid-cols-2" with stat
 * cards (Waitlist, Active, Completed, Failed). We measure from now until
 * the grid contains at least two numeric values.
 */
async function measureQueueMonitorLoad(page) {
  try {
    const startedAt = Date.now();

    const queueHeader = page.locator('text=Processing Queue').first();
    const headerVisible = await queueHeader
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (!headerVisible) {
      return {
        label: 'queue-monitor-load',
        skipped: true,
        reason: 'Processing Queue header not found',
      };
    }

    // Each stat card has a large number (text-xl font-bold text-white).
    const statsLoaded = await page.waitForFunction(() => {
      const statNumbers = document.querySelectorAll('.text-xl.font-bold.text-white');
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
 * Benchmark — Bundle image grid performance.
 *
 * Navigates to Assets and measures how long it takes for the BundleCard
 * thumbnail grids (the 4-column preview strips) to appear and populate
 * with `<img>` elements. Catches lazy-loading delays and image-resolution
 * chain regressions.
 */
async function measureBundleImageGrid(page) {
  try {
    await navigateToAssetsTab(page);

    const startedAt = Date.now();

    const gridPopulated = await page.waitForFunction(() => {
      const grids = document.querySelectorAll('[class*="grid-cols-4"]');
      for (const grid of grids) {
        if (grid.querySelectorAll('img').length > 0) return true;
      }
      return false;
    }, { timeout: 8000 }).then(() => true).catch(() => false);

    const elapsedMs = Date.now() - startedAt;

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

/**
 * Benchmark — Cold-start sidebar tap.
 *
 * Measures whether the sidebar responds immediately after DOMContentLoaded
 * without a post-load settle wait. This catches the "sidebar freeze during
 * cold-start background work" P0 regression described in §10.3 of
 * docs/technical/BENCHMARKS.md.
 *
 * Viewport-aware:
 *   ≥1024 px (desktop): the sidebar is always visible; clicks "AR Scanner"
 *     and waits for the AR Safety Warning overlay to confirm both the tap
 *     registration and the chunk-metaverse lazy-chunk load.
 *   <1024 px (mobile): clicks the hamburger button and waits for the
 *     navigation overlay to become visible.
 *
 * The caller MUST navigate with waitUntil: 'domcontentloaded' and NO
 * subsequent waitForTimeout before calling this probe — that is the whole
 * point: we measure the sidebar before background hydration work completes.
 */
async function measureColdStartSidebar(page) {
  try {
    const { width } = page.viewportSize() ?? { width: 1440 };
    const isMobile = width < 1024;

    if (isMobile) {
      // MobileNavigation hamburger button. App.tsx line 288–295.
      // aria-label="Open navigation menu", rendered only on < lg viewports.
      const hamburger = page.locator('[aria-label="Open navigation menu"]').first();
      if (!(await hamburger.count())) {
        return { label: 'cold-start-sidebar', skipped: true, reason: 'hamburger button not found', isMobile: true };
      }
      const startedAt = Date.now();
      await hamburger.click();
      const sidebarOpened = await page
        .locator('[role="dialog"][aria-label="Navigation menu"]')
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      return { label: 'cold-start-sidebar', elapsedMs: Date.now() - startedAt, sidebarOpened, isMobile: true };
    } else {
      // Desktop sidebar (class="hidden lg:flex"). SidebarItem renders a <button>
      // with text "AR Scanner". App.tsx line 1927.
      const arButton = page.locator('nav button').filter({ hasText: 'AR Scanner' }).first();
      if (!(await arButton.count())) {
        return { label: 'cold-start-sidebar', skipped: true, reason: 'AR Scanner sidebar item not found', isMobile: false };
      }
      const startedAt = Date.now();
      await arButton.click();
      // The AR Safety Warning overlay (h2 "AR Safety Warning") is the first
      // visible DOM change that confirms (a) the tap registered and (b) the
      // chunk-metaverse lazy chunk finished loading. ARSafetyWarning.tsx line 20.
      const warningAppeared = await page
        .locator('h2').filter({ hasText: 'AR Safety Warning' })
        .waitFor({ state: 'visible', timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      return { label: 'cold-start-sidebar', elapsedMs: Date.now() - startedAt, warningAppeared, isMobile: false };
    }
  } catch (err) {
    return { label: 'cold-start-sidebar', error: err.message };
  }
}

/**
 * Benchmark — AR Scanner route load (settled app).
 *
 * Clicks the AR Scanner sidebar item on a settled app-shell page and
 * measures the time until the AR Safety Warning screen is fully rendered.
 * A regression here (> 1,000 ms) usually means the chunk-metaverse bundle
 * grew or a new top-level import was added to ARScene.tsx. See §10.3 of
 * docs/technical/BENCHMARKS.md.
 *
 * Desktop: clicks the always-visible sidebar nav button "AR Scanner".
 * Mobile fallback: keyboard shortcut '3' (App.tsx line 575).
 */
async function measureArScannerRouteLoad(page) {
  try {
    const { width } = page.viewportSize() ?? { width: 1440 };
    const isMobile = width < 1024;

    const startedAt = Date.now();

    if (!isMobile) {
      // Desktop sidebar always visible. SidebarItem <button> "AR Scanner". App.tsx line 1927.
      const arButton = page.locator('nav button').filter({ hasText: 'AR Scanner' }).first();
      if (await arButton.count()) {
        await arButton.click();
      } else {
        await page.keyboard.press('3');
      }
    } else {
      // Mobile: keyboard shortcut '3'. App.tsx line 575.
      await page.keyboard.press('3');
    }

    // ARSafetyWarning.tsx renders <h2 className="...">AR Safety Warning</h2>.
    const warningAppeared = await page
      .locator('h2').filter({ hasText: 'AR Safety Warning' })
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    return { label: 'ar-scanner-route-load', elapsedMs: Date.now() - startedAt, warningAppeared };
  } catch (err) {
    return { label: 'ar-scanner-route-load', error: err.message };
  }
}

/**
 * Benchmark — AR Scanner camera ready.
 *
 * Assumes the AR Safety Warning screen is currently shown. Clicks "I Understand
 * & Agree" and measures the time until the camera feed is live or a camera
 * error appears. When run headlessly (with --use-fake-device-for-media-stream
 * and --use-fake-ui-for-media-capture), the browser provides a synthetic video
 * stream so the full AR bring-up path is exercised end-to-end.
 *
 * hudOnBlack: true when neither a live video frame nor a camera error appears
 * within 5 s — this means the AR overlay HUD painted over a black surface,
 * which is the explicit §10.3 regression ("HUD-on-black-frame failure mode").
 */
async function measureArScannerCameraReady(page) {
  try {
    // ARSafetyWarning.tsx: <button>I Understand & Agree</button>
    const acceptBtn = page.locator('button').filter({ hasText: 'I Understand & Agree' }).first();
    if (!(await acceptBtn.count())) {
      return { label: 'ar-scanner-camera-ready', skipped: true, reason: 'Accept button not found' };
    }

    const startedAt = Date.now();
    await acceptBtn.click();

    // Poll until: (a) a <video> element has live data, or (b) a camera-error
    // message renders. Either result resolves the ambiguity about black-frame state.
    // ARScene.tsx: sets video.srcObject and checks readyState, or sets cameraError state.
    const outcome = await page.waitForFunction(() => {
      const video = document.querySelector('video');
      if (video && video.readyState >= 2) return 'camera-active';
      const text = document.body.innerText;
      if (
        text.includes('Camera permission was denied') ||
        text.includes('camera access') ||
        text.includes('Camera error') ||
        text.includes('Unable to access')
      ) {
        return 'camera-error';
      }
      return null;
    }, { timeout: 5000 }).then(h => h.jsonValue()).catch(() => null);

    const elapsedMs = Date.now() - startedAt;

    return {
      label: 'ar-scanner-camera-ready',
      elapsedMs,
      cameraActive: outcome === 'camera-active',
      cameraError: outcome === 'camera-error',
      // hudOnBlack: AR overlay rendered but no video frame and no error within 5 s.
      hudOnBlack: outcome === null,
    };
  } catch (err) {
    return { label: 'ar-scanner-camera-ready', error: err.message };
  }
}

module.exports = {
  measureBundleCardClick,
  measureImageLoadHealth,
  measureQueueMonitorLoad,
  measureBundleImageGrid,
  measureColdStartSidebar,
  measureArScannerRouteLoad,
  measureArScannerCameraReady,
};
