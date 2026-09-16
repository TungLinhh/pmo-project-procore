// Async safety net (P0-2): Express 4 does NOT catch rejected promises from
// async route handlers — a bare `router.get('/', async ...)` throw becomes an
// unhandled rejection and the request hangs (no JSON 500, process at risk).
// `ah(fn)` wraps Promise.resolve(fn()).catch(next) so every async error lands
// in the Express error handler. `installAsyncSafetyNet()` monkey-patches
// Router.METHOD/use/all as a defense-in-depth net so future bare handlers
// are still safe even if an author forgets explicit ah().
import { Router } from 'express';
import express from 'express';

export const ah = (fn) => {
  if (typeof fn !== 'function') return fn;
  // Skip Express error handlers (arity 4) — never wrap those.
  if (fn.length === 4) return fn;
  return function asyncWrapper(req, res, next) {
    try {
      const out = fn(req, res, next);
      if (out && typeof out.catch === 'function') out.catch(next);
      return out;
    } catch (e) {
      next(e);
    }
  };
};

const PATCHED = Symbol.for('pmo.asyncSafetyNet');
const WRAPPED = Symbol.for('pmo.asyncWrapped');

export function installAsyncSafetyNet() {
  if (globalThis[PATCHED]) return;
  globalThis[PATCHED] = true;
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all', 'use'];
  const patchTarget = (target, label) => {
    if (!target) return;
    for (const m of methods) {
      // 'use' on app-level and router-level both need wrapping; skip if missing.
      const orig = target[m];
      if (typeof orig !== 'function' || orig.__pmoOriginal) continue;
      const wrapped = function patched(...args) {
        return orig.apply(this, args.map((a) => (typeof a === 'function' ? ah(a) : a)));
      };
      // Preserve original for tests/debug.
      wrapped.__pmoOriginal = orig;
      try { target[m] = wrapped; } catch { /* frozen prototype — skip */ }
    }
  };
  // Router covers all mounted routers; application covers direct app.METHOD/use
  // (app.get/post are NOT Router methods — missing this crashed the E2E probe
  // with an uncaught rejection instead of JSON 500).
  patchTarget(Router, 'router');
  // express.application is the app prototype (app.__proto__ chain).
  patchTarget(express.application, 'application');
}

// Retroactive net (P3 fix): static `import` hoisting means every route file
// registers its handlers BEFORE installAsyncSafetyNet() runs, so the
// prototype patch alone only covers routes registered later (wizard routes +
// future code). Walk already-mounted router stacks and wrap each layer handle
// in place — this is what actually covers the ~60 bare handlers in prod.
// Idempotent (WRAPPED mark) so test re-runs and double-wrapping are safe.
export function wrapRouterStack(router) {
  if (!router || !Array.isArray(router.stack)) return 0;
  let n = 0;
  for (const layer of router.stack) {
    if (!layer) continue;
    // Nested router (mounted via router.use(sub)): recurse into its stack.
    if (layer.handle && Array.isArray(layer.handle.stack)) {
      n += wrapRouterStack(layer.handle);
      continue;
    }
    // Route layers: per-method handlers live in layer.route.stack — the
    // router-level layer.handle is only the Route dispatcher (returns
    // undefined, so wrapping IT cannot catch handler rejections). Wrap each
    // route handler itself.
    if (layer.route && Array.isArray(layer.route.stack)) {
      for (const rl of layer.route.stack) {
        if (typeof rl.handle === 'function' && rl.handle.length !== 4 && !rl.handle[WRAPPED]) {
          const w = ah(rl.handle);
          w[WRAPPED] = true;
          rl.handle = w;
          n++;
        }
      }
      continue;
    }
    if (typeof layer.handle === 'function' && !layer.handle[WRAPPED]) {
      const orig = layer.handle;
      if (orig.length === 4) continue; // error handlers stay raw
      const w = ah(orig);
      w[WRAPPED] = true;
      layer.handle = w;
      n++;
    }
  }
  return n;
}

export function wrapAllRouters(routers) {
  let n = 0;
  for (const r of routers) n += wrapRouterStack(r);
  console.log(`[async-net] wrapped ${n} route-layer handlers`);
  return n;
}

export default ah;
