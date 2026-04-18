/**
 * App-state seeding for "warm visitor" benchmark scenarios.
 *
 * The landing page and onboarding flow are real code paths and have their
 * own benchmark scenario, but most app-shell measurements (tab switching,
 * BundleCard interaction, QueueMonitor load) only make sense from the
 * perspective of a returning user who has already completed onboarding.
 *
 * `seedReturningUserState(context)` adds an `addInitScript` to the given
 * Playwright BrowserContext that pre-populates `localStorage` so the very
 * first `page.goto('/')` lands on the app shell instead of the landing
 * splash.
 *
 * See `docs/technical/PERFORMANCE_BENCHMARKING.md` §3.
 */

const STORAGE_KEYS = {
  hasVisited: 'geograph-has-visited',
  onboarding: 'geograph-onboarding-v2',
  uxPreferences: 'geograph-ux-preferences',
};

/**
 * Default UX preferences used to skip the onboarding flow. Values mirror
 * the persona/extension defaults a typical developer-mode returning user
 * would have. Do not change these without re-baselining the benchmark
 * results in `docs/technical/BENCHMARKS.md` — they directly affect which
 * extension chunks are eligible to load.
 */
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

/**
 * Install the warm-user `localStorage` seed on a Playwright BrowserContext.
 * Must be called BEFORE the first `page.goto`, otherwise the landing page
 * code path will run and the measurement will not represent a returning
 * user.
 */
async function seedReturningUserState(context, preferences = defaultUXPreferences()) {
  await context.addInitScript((payload) => {
    localStorage.setItem(payload.storageKeys.hasVisited, 'true');
    localStorage.setItem(payload.storageKeys.onboarding, 'true');
    localStorage.setItem(payload.storageKeys.uxPreferences, JSON.stringify(payload.uxPreferences));
  }, {
    storageKeys: STORAGE_KEYS,
    uxPreferences: preferences,
  });
}

module.exports = {
  STORAGE_KEYS,
  defaultUXPreferences,
  seedReturningUserState,
};
