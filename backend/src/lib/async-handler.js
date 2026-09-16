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

export default ah;
