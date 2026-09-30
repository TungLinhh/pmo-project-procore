// i18n + song ngu bao cao E2E (task 10, SRS Ngon ngu: VI chinh, EN cho chrome
// + bao cao doi tac). Locale API + workbook xlsx 2 dong tieu de VI/EN.
// Tu don rac.
import { createRequire } from 'node:module';
import { psqlQuery, apiBase } from '../tools/env.mjs';
import { ROOT } from './lib.mjs';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

const require = createRequire(ROOT + '/backend/package.json');
const XLSX = require('xlsx');


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['I18N-%'], { label: 'i18n' });
const BASE = apiBase();
let pass = 0, fail = 0;
const ok = (name, detail) => { pass++; console.log(`  PASS — ${name}: ${detail}`); };
const ng = (name, detail) => { fail++; console.log(`  FAIL — ${name}: ${detail}`); };

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  const t = await r.text();
  let data; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data, headers: r.headers };
}
const J = (body, token) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const exec = (sql) => psqlQuery(sql).split('\n')[0];

try {
  const login = await api('/api/auth/login', J({ email: 'admin@hbg.com', password: 'admin123' }));
  const T = login.data?.token;
  if (!T) { ng('login', JSON.stringify(login.data).slice(0, 120)); process.exit(1); }
  ok('login', 'admin@hbg.com');
  const H = { Authorization: `Bearer ${T}` };

  // 0. Login tra locale.
  (login.data?.user?.locale === 'vi' ? ok : ng)('login locale', login.data?.user?.locale);
  // 1. PUT locale en -> GET /me -> ve vi. Guard gia tri la.
  const put = await api('/api/me/locale', { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'en' }) });
  (put.status === 200 ? ok : ng)('locale set en', `status=${put.status}`);
  const me = await api('/api/me', { headers: H });
  (me.data?.locale === 'en' ? ok : ng)('locale persisted', me.data?.locale);
  const bad = await api('/api/me/locale', { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'fr' }) });
  (bad.status === 400 ? ok : ng)('locale guard', `status=${bad.status}`);
  await api('/api/me/locale', { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'vi' }) });

  // 2. Headers truyen tai (task 10: ma hoa khi truyen tai).
  const h = await api('/api/me', { headers: H });
  ((h.headers.get('x-content-type-options') === 'nosniff' && h.headers.get('referrer-policy') === 'same-origin'
    && h.headers.get('x-frame-options') === 'DENY') ? ok : ng)('security headers', 'nosniff + same-origin + DENY');

  // 3. Workbook song ngu: 5 sheets dong 1 VI + dong 2 EN.
  const code = `I18N-${Date.now()}`;
  const pid = await api('/api/projects', J({ code, name_vi: 'I18n test' }, T)).then((r) => r.data?.id);
  if (!pid) { ng('create project', 'no id'); process.exit(1); }
  ok('create project', `id=${pid}`);
  try {
    const zid = Number(exec(`INSERT INTO zones (project_id, code, name_en) VALUES (${pid}, 'Z1', 'Zone 1') RETURNING id`));
    exec(`INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, progress_pct, status) VALUES (${pid}, ${zid}, 'seed', 1, 'Viec 1', 0.5, 'IN_PROGRESS')`);
    const r = await fetch(`${BASE}/api/export/project-report.xlsx?project_id=${pid}`, { headers: H });
    const buf = Buffer.from(await r.arrayBuffer());
    (r.status === 200 && buf[0] === 0x50 && buf[1] === 0x4b ? ok : ng)('download xlsx', `status=${r.status}, ${buf.length}b`);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const cell = (ws, addr) => ws[addr]?.v;
    const expect = {
      Tong_quan: ['Hạng mục', 'Item'],
      Shopdrawing: ['Mã BV', 'Drawing code'],
      Vat_tu: ['Mã VT', 'Material code'],
      Trinh_duyet_MSB: ['Mã MSB', 'MSB code'],
      Thi_cong: ['Hạng mục', 'Item'],
    };
    for (const [sheet, [vi, en]] of Object.entries(expect)) {
      const ws = wb.Sheets[sheet];
      if (!ws) { ng(`sheet ${sheet}`, 'missing'); continue; }
      ((cell(ws, 'A1') === vi && cell(ws, 'A2') === en) ? ok : ng)(
        `bilingual ${sheet}`, `A1=${JSON.stringify(cell(ws, 'A1'))} A2=${JSON.stringify(cell(ws, 'A2'))}`);
    }
  } finally {
    exec(`DELETE FROM construction_schedule_items WHERE project_id = ${pid}`);
    exec(`DELETE FROM zones WHERE project_id = ${pid}`);
    exec(`DELETE FROM projects WHERE id = ${pid}`);
    ok('cleanup', `project ${pid} removed`);
  }
} catch (e) {
  ng('exception', e.message);
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
