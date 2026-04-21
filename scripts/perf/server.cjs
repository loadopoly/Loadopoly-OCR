/**
 * Preview-server lifecycle helpers for the perf benchmark harness.
 *
 * These helpers are intentionally tiny — the goal is reusability from a
 * future Skill, not abstraction for its own sake. Behavior matches what
 * `ui-benchmark.cjs` did inline before this was extracted.
 *
 * See `docs/technical/PERFORMANCE_BENCHMARKING.md` for the methodology.
 */

const { spawn } = require('child_process');
const path = require('path');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Poll `url` until it returns a 2xx response or the timeout elapses.
 * Throws on timeout. Network errors are swallowed and treated as "not ready".
 */
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

/**
 * One-shot reachability check used to decide whether to spawn our own
 * preview server. Never throws.
 */
async function canReach(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Spawn `npm run preview` bound to `host:port`. The child's stdout/stderr
 * are forwarded to the parent's stderr so the benchmark JSON on stdout
 * stays clean and machine-parseable.
 *
 * `cwd` defaults to the repo root (two levels up from this file).
 */
function startPreviewServer({ host, port, cwd } = {}) {
  if (!host || !port) {
    throw new Error('startPreviewServer: host and port are required');
  }
  const repoRoot = cwd || path.resolve(__dirname, '..', '..');

  const server = spawn(
    'npm',
    ['run', 'preview', '--', '--host', host, '--port', String(port), '--strictPort'],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    }
  );

  server.stdout.on('data', chunk => process.stderr.write(chunk));
  server.stderr.on('data', chunk => process.stderr.write(chunk));
  return server;
}

module.exports = {
  sleep,
  waitForServer,
  canReach,
  startPreviewServer,
};
