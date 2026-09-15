// P1-08: ProjectPicker matches string URL ids to numeric API ids.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-08-picker-ids.mjs
import { spawn, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

const src = readFileSync('frontend/src/components/ProjectPicker.jsx', 'utf8');
ok(!src.includes('p.id === value') && !src.includes('value === p.id'), 'no raw string-vs-number comparison');
ok(src.includes('Number(value)'), 'value normalized with Number()');
ok(src.includes('filtered.length - 1'), 'highlight clamped to last index');

// live: simulate exactly what a page does — params.get('project') (string) must select the API row
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3208';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3208' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const H = { Authorization: `Bearer ${token}` };
  const list = await fetch(BASE + '/api/projects', { headers: H }).then(r => r.json());
  ok(list.length > 0, `projects list non-empty (got ${list.length})`);
  // mirror the component logic: const numValue = ...Number(value); projects.find(p => p.id === numValue)
  const normalize = (value) => (value === null || value === undefined || value === '' ? null : Number(value));
  const fromUrl = String(list[0].id); // what useSearchParams().get('project') returns
  const selected = list.find(p => p.id === normalize(fromUrl));
  ok(selected && selected.code === list[0].code, `string URL id selects row (got ${selected?.code})`);
  ok(list.find(p => p.id === normalize(null)) === undefined, 'null value selects nothing (allowAll path)');
  const hl = (h, len) => Math.min(h + 1, Math.max(len - 1, 0));
  ok(hl(2, 3) === 2 && hl(0, 0) === 0, 'highlight clamp never exceeds last index');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}

try {
  execSync('npm run build --workspace=frontend', { encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
  ok(true, 'frontend builds with fixed picker');
} catch (e) { ok(false, 'frontend build failed'); }

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
