/**
 * Deep performance benchmark.
 * - Emulates mobile CPU throttling (4x slowdown)
 * - Collects Long Tasks (>50ms on main thread)
 * - Measures FCP, LCP, TBT, TTI-ish
 * - Interacts with the app and times concrete user flows
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
    persona: 'developer',
    simplifiedMode: false,
    extensions: { web3: false, threeD: true, social: true, marketplace: false, curatorMode: true, arScanner: true },
    hasCompletedOnboarding: true,
    hasProcessedFirstAsset: false,
    assetCount: 0,
  };
}

async function instrument(page) {
  // Collect long tasks + paint metrics from inside the page.
  await page.addInitScript(() => {
    window.__longTasks = [];
    window.__paints = {};
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration), name: e.name });
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__paints[e.name] = Math.round(e.startTime);
        }
      }).observe({ type: 'paint', buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length) window.__paints['largest-contentful-paint'] = Math.round(entries[entries.length - 1].startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
  });
}

async function collectTaskSummary(page) {
  return page.evaluate(() => {
    const tasks = window.__longTasks || [];
    const total = tasks.reduce((s, t) => s + t.dur, 0);
    const max = tasks.reduce((m, t) => Math.max(m, t.dur), 0);
    // TBT = sum over long tasks of (duration - 50), but only between FCP and interactive.
    const tbt = tasks.reduce((s, t) => s + Math.max(0, t.dur - 50), 0);
    return {
      longTaskCount: tasks.length,
      longTaskTotalMs: total,
      longTaskMaxMs: max,
      totalBlockingTimeMs: tbt,
      paints: window.__paints || {},
      top5: tasks.slice().sort((a,b)=>b.dur-a.dur).slice(0,5),
    };
  });
}

async function timeAction(page, label, fn) {
  // Wait for main thread to settle, then run the action, then wait for settle again.
  await page.evaluate(() => new Promise(r => requestIdleCallback ? requestIdleCallback(() => r()) : setTimeout(r, 50)));
  const before = await page.evaluate(() => ({
    nowPerf: performance.now(),
    longTaskCount: (window.__longTasks||[]).length,
    longTaskTotal: (window.__longTasks||[]).reduce((s,t)=>s+t.dur,0),
  }));
  const wallStart = Date.now();
  await fn();
  // Wait for any long tasks kicked off by the action to settle.
  await page.evaluate(() => new Promise((resolve) => {
    const start = performance.now();
    function check() {
      const last = (window.__longTasks||[]).slice(-1)[0];
      // Settle when: 250ms passed AND no long task ended in last 150ms
      if (performance.now() - start > 250 && (!last || last.start + last.dur < performance.now() - 150)) {
        resolve();
      } else {
        setTimeout(check, 50);
      }
    }
    check();
  }));
  const after = await page.evaluate(() => ({
    nowPerf: performance.now(),
    longTaskCount: (window.__longTasks||[]).length,
    longTaskTotal: (window.__longTasks||[]).reduce((s,t)=>s+t.dur,0),
  }));
  return {
    label,
    wallMs: Date.now() - wallStart,
    mainThreadBusyMs: Math.round(after.longTaskTotal - before.longTaskTotal),
    longTasksTriggered: after.longTaskCount - before.longTaskCount,
  };
}

async function runScenario(browser, name, viewport, cpuThrottle) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((prefs) => {
    localStorage.setItem(prefs.storageKeys.hasVisited, 'true');
    localStorage.setItem(prefs.storageKeys.onboarding, 'true');
    localStorage.setItem(prefs.storageKeys.uxPreferences, JSON.stringify(prefs.uxPreferences));
  }, { storageKeys: STORAGE_KEYS, uxPreferences: defaultUXPreferences() });
  const page = await context.newPage();
  await instrument(page);

  // Apply CPU throttling via CDP for mobile realism
  if (cpuThrottle && cpuThrottle > 1) {
    const client = await context.newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  }

  const loadStart = Date.now();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  // Wait for something meaningful to appear
  await page.waitForSelector('nav, [class*="sidebar"], [class*="dashboard"], text=Dashboard', { timeout: 10000 }).catch(()=>{});
  const loadWall = Date.now() - loadStart;

  // Let things settle, then snapshot paint/long-task metrics
  await page.waitForTimeout(1500);
  const initial = await collectTaskSummary(page);

  // Interact: click several tabs and measure each one
  const tabActions = [
    { label: 'tab-assets', sidebar: 'Assets & Bundles', shortcut: '4' },
    { label: 'tab-graph', sidebar: 'Knowledge Graph', shortcut: '5' },
    { label: 'tab-database', sidebar: 'Structured DB', shortcut: '6' },
    { label: 'tab-batch', sidebar: 'Quick Processing', shortcut: '2' },
    { label: 'tab-dashboard', sidebar: 'Dashboard', shortcut: '1' },
    { label: 'tab-assets-2', sidebar: 'Assets & Bundles', shortcut: '4' },
    { label: 'tab-dashboard-2', sidebar: 'Dashboard', shortcut: '1' },
  ];

  const tabResults = [];
  for (const a of tabActions) {
    const r = await timeAction(page, a.label, async () => {
      const el = page.locator(`text=${a.sidebar}`).first();
      const visible = await el.isVisible().catch(()=>false);
      if (visible) await el.click();
      else await page.keyboard.press(a.shortcut);
    });
    tabResults.push(r);
  }

  const final = await collectTaskSummary(page);
  await context.close();

  return {
    name,
    viewport,
    cpuThrottle,
    loadWallMs: loadWall,
    initial,
    final,
    tabs: tabResults,
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const desktop = await runScenario(browser, 'desktop', { width: 1440, height: 900 }, 1);
  const mobile = await runScenario(browser, 'mobile', { width: 390, height: 844 }, 4); // 4x CPU throttle = mid-tier Android
  await browser.close();

  const summary = { desktop, mobile };
  console.log(JSON.stringify(summary, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
