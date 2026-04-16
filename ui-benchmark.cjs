const { spawn } = require('child_process');
const { chromium } = require('playwright');

const HOST = process.env.UI_BENCHMARK_HOST || '127.0.0.1';
const PORT = Number(process.env.UI_BENCHMARK_PORT || 4173);
const BASE_URL = process.env.UI_BENCHMARK_URL || `http://${HOST}:${PORT}`;

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

function startPreviewServer() {
  const server = spawn(
    'npm',
    ['run', 'preview', '--', '--host', HOST, '--port', String(PORT)],
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
    if (['error', 'warning'].includes(msg.type())) {
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

  const startedAt = Date.now();
  await locator.click();
  await page.waitForTimeout(600);
  const snapshot = await page.evaluate(() => ({
    hasErrorUi: document.body.innerText.includes('Something went wrong'),
    bodySnippet: document.body.innerText.slice(0, 220),
  }));

  return {
    label,
    elapsedMs: Date.now() - startedAt,
    ...snapshot,
  };
}

async function collectAppScenario(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((prefs) => {
    localStorage.setItem('geograph-has-visited', 'true');
    localStorage.setItem('geograph-onboarding-v2', 'true');
    localStorage.setItem('geograph-ux-preferences', JSON.stringify(prefs));
  }, defaultUXPreferences());

  const page = await context.newPage();
  const result = await collectScenario(page, 'app');
  result.tabs = [];

  for (const tab of [
    ['assets', 'Assets & Bundles'],
    ['graph', 'Knowledge Graph'],
    ['world', '3D World'],
    ['database', 'Structured DB'],
    ['batch', 'Quick Processing'],
    ['dashboard', 'Dashboard'],
  ]) {
    const metric = await measureTab(page, tab[0], tab[1]);
    if (metric) result.tabs.push(metric);
  }

  await context.close();
  return result;
}

async function main() {
  const server = process.env.UI_BENCHMARK_URL ? null : startPreviewServer();

  try {
    await waitForServer(BASE_URL);
    const browser = await chromium.launch({ headless: true });

    const landingContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const landingPage = await landingContext.newPage();
    const landing = await collectScenario(landingPage, 'landing');
    await landingContext.close();

    const app = await collectAppScenario(browser);
    await browser.close();

    const summary = { baseUrl: BASE_URL, landing, app };
    console.log(JSON.stringify(summary, null, 2));

    const hasBlockingIssue =
      landing.metrics.hasErrorUi ||
      app.metrics.hasErrorUi ||
      landing.issues.some(issue => issue.includes('[pageerror]')) ||
      app.issues.some(issue => issue.includes('[pageerror]')) ||
      (app.tabs || []).some(tab => tab.hasErrorUi);

    process.exitCode = hasBlockingIssue ? 1 : 0;
  } finally {
    if (server && !server.killed) {
      server.kill('SIGTERM');
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
