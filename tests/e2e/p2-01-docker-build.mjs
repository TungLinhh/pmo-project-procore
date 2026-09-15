// P2-01: Dockerfile structure is shippable (hermetic — no daemon, no /tmp).
// Full container boot is verified on the deploy host (coolify) + p4-docker-verify.
// Checks: multi-stage (frontend build → runtime), lockfile install, all COPYs,
// entrypoint executable + wired as ENTRYPOINT, HEALTHCHECK, no secrets baked.
// Run: node tests/e2e/p2-01-docker-build.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const df = readFileSync('Dockerfile', 'utf8');

ok(/FROM .* AS frontend-build/.test(df), 'stage 1: frontend build');
ok(/npm run build/.test(df), 'stage 1 builds frontend');
ok(/COPY --from=frontend-build \S+frontend\/dist/.test(df), 'stage 2 takes built frontend dist');
ok(/npm ci --omit=dev/.test(df), 'backend deps via lockfile (omit dev)');
for (const src of ['frontend/package', 'frontend/', 'backend/package', 'backend/', 'docker-entrypoint.sh'])
  ok(df.includes(src), `Dockerfile COPYs ${src}`);
ok(/ENTRYPOINT.*docker-entrypoint\.sh/.test(df), 'entrypoint wired');
ok((statSync('docker-entrypoint.sh').mode & 0o111) !== 0, 'entrypoint executable bit set in repo');
ok(/HEALTHCHECK[\s\S]*\/api\/health/.test(df), 'HEALTHCHECK hits /api/health');
ok(!/JWT_SECRET=\S+/.test(df) || /CHANGE_ME|#/.test(df), 'no real secret baked in Dockerfile');
ok(existsSync('backend/package-lock.json'), 'backend lockfile exists for Docker npm ci');
const lock = JSON.parse(readFileSync('backend/package-lock.json', 'utf8'));
const pkgs = Object.keys(lock.packages || {});
for (const d of ['express', 'pg', 'jsonwebtoken', 'bcryptjs', 'multer', 'xlsx'])
  ok(pkgs.includes(`node_modules/${d}`), `lock pins ${d}`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
