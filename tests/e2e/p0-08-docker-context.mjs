// P0-08: Docker build context — entrypoint not ignored, backend lockfile valid,
// Dockerfile COPY sources exist. (No docker daemon here; the real `npm ci`
// from backend/package*.json was validated manually during the fix.)
// Run: node tests/e2e/p0-08-docker-context.mjs
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

// 1. .dockerignore must not exclude docker-entrypoint.sh (Dockerfile COPYs it)
const ignore = readFileSync('.dockerignore', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
ok(!ignore.includes('docker-entrypoint.sh'), '.dockerignore does not exclude docker-entrypoint.sh');
ok(existsSync('docker-entrypoint.sh'), 'docker-entrypoint.sh exists in context');

// 2. backend lockfile exists, parses, pins all backend deps
ok(existsSync('backend/package-lock.json'), 'backend/package-lock.json exists');
const lock = JSON.parse(readFileSync('backend/package-lock.json', 'utf8'));
const backendDeps = Object.keys(JSON.parse(readFileSync('backend/package.json', 'utf8')).dependencies || {});
const pkgs = Object.keys(lock.packages || {});
ok(backendDeps.every(d => pkgs.some(p => p === `node_modules/${d}`)), `lock pins all backend deps (${backendDeps.join(',')})`);

// 3. Dockerfile COPY sources resolve inside the context
const df = readFileSync('Dockerfile', 'utf8');
const copies = [...df.matchAll(/^COPY\s+(\S+)\s+\S+/gm)].map(m => m[1]).filter(s => !s.startsWith('--'));
for (const src of copies) {
  const base = src.replace(/\/$/, '').split('/')[0].replace(/\*/g, '');
  ok(existsSync(base) || existsSync(src), `COPY source present: ${src}`);
}

// 4. Backend syntax still clean after all P0 edits (what `npm ci` + boot would hit first)
try {
  execSync('node --check src/index.js && for f in src/lib/*.js src/routes/*.js src/db/*.js src/services/*.js src/services/ingest/*.js; do node --check "$f" || exit 1; done', { cwd: 'backend', encoding: 'utf8', shell: '/bin/bash' });
  ok(true, 'all backend files pass node --check');
} catch (e) { ok(false, `node --check failed: ${e.message}`); }

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
