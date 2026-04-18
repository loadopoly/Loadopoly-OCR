/**
 * Top-level tab navigation helpers with a mobile fallback.
 *
 * On desktop the sidebar is visible and we click the labeled link. On the
 * mobile viewport (390px) the sidebar collapses behind a hamburger menu
 * that is not part of these benchmarks, so we fall back to the global
 * keyboard shortcut bound to each tab.
 *
 * See `docs/technical/PERFORMANCE_BENCHMARKING.md` §5.3.
 */

/**
 * Tab definition tuple: [tabId, sidebarLabel, keyboardShortcut].
 * Keep this list in sync with the playbook §5.3.
 */
const TAB_DEFS = [
  ['assets', 'Assets & Bundles', '4'],
  ['graph', 'Knowledge Graph', '5'],
  ['world', '3D World', 'w'],
  ['database', 'Structured DB', '6'],
  ['batch', 'Quick Processing', '2'],
  ['dashboard', 'Dashboard', '1'],
];

/**
 * Snapshot the page state used by every tab measurement.
 * Kept in one place so all tab metrics use identical fields.
 */
async function tabSnapshot(page) {
  return page.evaluate(() => ({
    hasErrorUi: document.body.innerText.includes('Something went wrong'),
    loadingSpinners: document.querySelectorAll('.animate-spin').length,
    bodySnippet: document.body.innerText.slice(0, 220),
  }));
}

/**
 * Click a sidebar tab by its visible label. Returns null if the label is
 * not visible (the caller should then fall back to the keyboard shortcut).
 *
 * NOTE: the 250 ms post-click wait is deliberate. The original 600 ms
 * inflated all tab timings by ~600 ms and masked real regressions.
 * React 19's `startTransition` completes within 100–200 ms for tab
 * switches; 250 ms gives enough headroom for lazy-chunk loads without
 * hiding regressions. Do not raise this without re-baselining.
 */
async function measureTabBySidebar(page, tabId, sidebarLabel) {
  const locator = page.locator(`text=${sidebarLabel}`).first();
  if (!(await locator.count())) return null;

  const isVisible = await locator.isVisible().catch(() => false);
  if (!isVisible) return null;

  const startedAt = Date.now();
  await locator.click();
  await page.waitForTimeout(250);
  const snapshot = await tabSnapshot(page);

  return { label: tabId, elapsedMs: Date.now() - startedAt, ...snapshot };
}

/**
 * Mobile fallback: trigger the tab via its keyboard shortcut.
 */
async function measureTabByShortcut(page, tabId, shortcutKey) {
  const startedAt = Date.now();
  await page.keyboard.press(shortcutKey);
  await page.waitForTimeout(250);
  const snapshot = await tabSnapshot(page);
  return { label: tabId, elapsedMs: Date.now() - startedAt, ...snapshot };
}

/**
 * Try sidebar click first, fall back to keyboard shortcut on mobile.
 * Returns null only if both paths are unavailable.
 */
async function measureTab(page, tabId, sidebarLabel, shortcutKey) {
  const viaSidebar = await measureTabBySidebar(page, tabId, sidebarLabel);
  if (viaSidebar) return viaSidebar;
  if (shortcutKey) return measureTabByShortcut(page, tabId, shortcutKey);
  return null;
}

/**
 * Navigate to the Assets & Bundles tab specifically — used as a setup
 * step by several interaction probes. Sidebar first, '4' shortcut as
 * mobile fallback. Always settles for 300 ms.
 */
async function navigateToAssetsTab(page) {
  const sidebar = page.locator('text=Assets & Bundles').first();
  const isVisible = await sidebar.isVisible().catch(() => false);
  if (isVisible) {
    await sidebar.click();
  } else {
    await page.keyboard.press('4');
  }
  await page.waitForTimeout(300);
}

module.exports = {
  TAB_DEFS,
  tabSnapshot,
  measureTab,
  measureTabBySidebar,
  measureTabByShortcut,
  navigateToAssetsTab,
};
