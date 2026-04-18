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

module.exports = {
  measureBundleCardClick,
  measureImageLoadHealth,
  measureQueueMonitorLoad,
  measureBundleImageGrid,
};
