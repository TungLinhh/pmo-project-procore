import { readFileSync, existsSync, statSync } from 'node:fs';

function configure(spec, module) {
  // The maintained SheetJS ESM build does not auto-bind Node's filesystem.
  // Bind it once per module instance so readFile works for staged uploads.
  if (spec === 'xlsx' && typeof module?.set_fs === 'function') {
    module.set_fs({ readFileSync, existsSync, statSync });
  }
  return module;
}

// Optional heavy/native deps (P2-9): ssh2, @aws-sdk/*, xlsx.
// A missing dep must surface as 503 naming the package (actionable), never a
// raw "Cannot find module" 500. Dynamic ESM imports reject with
// ERR_MODULE_NOT_FOUND — translate that one case, rethrow anything else.
export async function need(spec) {
  try {
    const m = await import(spec);
    return configure(spec, m.default ?? m);
  } catch (e) {
    const msg = String(e?.message || '');
    if (e?.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find (module|package)/.test(msg)) {
      throw Object.assign(new Error(`Optional dependency missing: ${spec} (run: npm install ${spec})`), { status: 503 });
    }
    throw e;
  }
}

// Sync-use guard for static-import sites (xlsx in ingest/export paths, whose
// callers are synchronous). Resolves at module load; any property access on
// the fallback throws the same actionable 503.
import { createRequire } from 'node:module';

export function needSync(spec) {
  try {
    const m = createRequire(import.meta.url)(spec);
    return configure(spec, m?.default ?? m);
  } catch {
    return new Proxy({}, {
      get(_t, prop) {
        if (prop === '__esModule' || prop === Symbol.toPrimitive) return undefined;
        throw Object.assign(new Error(`Optional dependency missing: ${spec} (run: npm install ${spec})`), { status: 503 });
      },
      apply() {
        throw Object.assign(new Error(`Optional dependency missing: ${spec} (run: npm install ${spec})`), { status: 503 });
      },
    });
  }
}

export default need;
