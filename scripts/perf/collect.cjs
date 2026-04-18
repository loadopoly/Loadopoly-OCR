/**
 * Page-level metric collection.
 *
 * Provides:
 *   - `attachIssueListeners(page)`: capture console errors, page errors,
 *     and failed requests into a string array.
 *   - `collectScenario(page, label, baseUrl)`: navigate, settle, and
 *     return the standard {label, elapsedMs, metrics, issues} shape used
 *     by the benchmark.
 *   - `collectJsResourceTiming(page)`: top-15 JS resources by transfer
 *     size, used for bundle analysis.
 *
 * See `docs/technical/PERFORMANCE_BENCHMARKING.md` §4 for what these
 * metrics mean and §4.2/§4.3 for items that are required but not yet
 * implemented here (LCP, long tasks, TBT).
 */

/**
 * Wires error/console/network listeners onto the page and returns the
 * mutable `issues` array they will append to. Caller is responsible for
 * `page.removeAllListeners()` when done.
 */
function attachIssueListeners(page) {
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
  return issues;
}

/**
 * Navigate to `baseUrl`, wait 2.5s for the app to settle, and capture
 * paint + navigation timing along with a body-text snapshot.
 *
 * The 2.5s settle is deliberately long enough to let lazy-loaded chunks
 * arrive but short enough to keep a full benchmark run under a minute.
 * If you change it, update §5 of the methodology doc.
 */
async function collectScenario(page, label, baseUrl) {
  const issues = attachIssueListeners(page);

  const startedAt = Date.now();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
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

/**
 * Collect the top 15 JS resources loaded on the page, sorted by
 * transferSize desc. Used to spot anything heavy that should not be on
 * the critical path.
 */
async function collectJsResourceTiming(page, limit = 15) {
  return page.evaluate((max) => {
    return performance.getEntriesByType('resource')
      .filter(e => e.name.endsWith('.js'))
      .map(e => ({
        name: e.name.split('/').pop(),
        transferSize: e.transferSize,
        duration: Math.round(e.duration),
      }))
      .sort((a, b) => b.transferSize - a.transferSize)
      .slice(0, max);
  }, limit);
}

module.exports = {
  attachIssueListeners,
  collectScenario,
  collectJsResourceTiming,
};
