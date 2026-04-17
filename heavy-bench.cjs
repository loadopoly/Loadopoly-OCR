/**
 * Heavy-tab benchmark — measures first-time lazy chunk load + render for
 * the expensive tabs (3D World, Knowledge Graph) on mobile & desktop with CPU throttle.
 */
const { chromium } = require('playwright');

const BASE_URL = 'http://127.0.0.1:4173';
const STORAGE_KEYS = {
  hasVisited: 'geograph-has-visited',
  onboarding: 'geograph-onboarding-v2',
  uxPreferences: 'geograph-ux-preferences',
};

function defaultUXPreferences() {
  return {
    persona: 'developer', simplifiedMode: false,
    extensions: { web3: false, threeD: true, social: true, marketplace: false, curatorMode: true, arScanner: true },
    hasCompletedOnboarding: true, hasProcessedFirstAsset: false, assetCount: 0,
  };
}

async function run(label, viewport, cpu) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((p) => {
    localStorage.setItem(p.k.hasVisited, 'true');
    localStorage.setItem(p.k.onboarding, 'true');
    localStorage.setItem(p.k.uxPreferences, JSON.stringify(p.prefs));
  }, { k: STORAGE_KEYS, prefs: defaultUXPreferences() });
  const page = await ctx.newPage();

  if (cpu > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  }

  // Track network + long tasks
  const jsRequests = [];
  page.on('response', async (r) => {
    const url = r.url();
    if (url.endsWith('.js') || url.includes('.js?')) {
      const t = r.request().timing();
      jsRequests.push({ name: url.split('/').pop(), status: r.status() });
    }
  });

  await page.addInitScript(() => {
    window.__lt = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ s: Math.round(e.startTime), d: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true });
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('nav', { timeout: 10000, state: 'attached' });
  // Let dashboard fully settle
  await page.waitForTimeout(2000);

  const results = {};

  // Heavy tabs: 3D World, Knowledge Graph, Assets, Batch
  const tests = [
    { label: 'graph', shortcut: '5', waitFor: 'canvas, svg' },
    { label: 'world', shortcut: 'w', waitFor: 'canvas' },
    { label: 'assets', shortcut: '4', waitFor: 'main' },
    { label: 'batch', shortcut: '2', waitFor: 'main' },
    { label: 'dashboard', shortcut: '1', waitFor: 'main' },
    { label: 'graph-cached', shortcut: '5', waitFor: 'canvas, svg' },
    { label: 'world-cached', shortcut: 'w', waitFor: 'canvas' },
  ];

  for (const t of tests) {
    const beforeLt = await page.evaluate(() => (window.__lt||[]).reduce((s,x)=>s+x.d,0));
    const beforePaint = await page.evaluate(() => performance.now());
    const wall = Date.now();
    await page.keyboard.press(t.shortcut);
    let firstPaintAt = null;
    try {
      await page.waitForSelector(t.waitFor, { timeout: 10000, state: 'attached' });
      firstPaintAt = Date.now() - wall;
    } catch {}
    // Settle
    await page.waitForTimeout(500);
    const afterLt = await page.evaluate(() => (window.__lt||[]).reduce((s,x)=>s+x.d,0));
    const longestAfter = await page.evaluate((n) => {
      const after = (window.__lt||[]).filter(x => x.s > n);
      return { count: after.length, total: after.reduce((s,x)=>s+x.d,0), max: after.reduce((m,x)=>Math.max(m,x.d),0) };
    }, beforePaint);
    results[t.label] = {
      wallToVisibleMs: firstPaintAt,
      mainThreadBusyMs: afterLt - beforeLt,
      longTaskCount: longestAfter.count,
      longestTaskMs: longestAfter.max,
    };
  }

  await browser.close();
  return { label, viewport, cpu, results };
}

(async () => {
  const desktop = await run('desktop', { width: 1440, height: 900 }, 1);
  const mobile = await run('mobile', { width: 390, height: 844 }, 4);
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
