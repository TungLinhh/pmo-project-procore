// P1-04: HQ pillar links preserve the selected project (?project= everywhere).
// Run: node tests/e2e/p1-04-project-param.mjs
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

const cc = readFileSync('frontend/src/hq/ControlCenter.jsx', 'utf8');
ok(!cc.includes('project_id='), 'ControlCenter sends no ?project_id=');
for (const link of ['/hq/progress', '/hq/shop', '/hq/materials', '/hq/payment'])
  ok(cc.includes(`${link}\${selectedProject ? \`?project=\${selectedProject}\``) || cc.includes(`\`${link}\``) || cc.includes(link + '${selectedProject'), `${link} link present`);

// every receiver reads the same key the senders write
for (const f of ['ProgressDetail', 'ShopList', 'Materials', 'Payment', 'Manpower', 'Issues']) {
  const src = readFileSync(`frontend/src/hq/${f}.jsx`, 'utf8');
  ok(src.includes(`get('project')`) || src.includes(`get("project")`), `${f} reads ?project=`);
}
// navigation links (nav('/hq/...')) must not use the dead key; ?project_id= as a
// *backend API query param* (e.g. /api/shop-drawings?project_id=) stays valid.
try {
  const hits = execSync(`grep -rn "project_id=" frontend/src --include=*.jsx || true`, { encoding: 'utf8' }).trim();
  const navHits = hits.split('\n').filter(l => l && (l.includes('/hq/') || l.includes('nav(`')));
  ok(navHits.length === 0, `no ?project_id= nav links in jsx (got "${navHits.join('; ').slice(0, 160)}")`);
} catch (e) { ok(false, 'grep failed'); }
// frontend still builds
try {
  execSync('npm run build --workspace=frontend', { encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
  ok(true, 'frontend builds');
} catch (e) { ok(false, `frontend build failed: ${(e.stdout || '') + (e.message || '')}`.slice(0, 300)); }

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
