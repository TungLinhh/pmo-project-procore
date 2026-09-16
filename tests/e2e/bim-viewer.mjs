// BIM viewer boot e2e (Wave D5): lazy chunk split (three/web-ifc OUT of main),
// viewer route boots on the fixture model without page errors, graceful empty
// state (fixture has metadata, geometry optional), Small plan gated.
// Run: node tests/e2e/bim-viewer.mjs (needs :3000 running + fresh dist build)
import { readFileSync, readdirSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const BASE = process.env.BASE_URL || 'http://localhost:3000';

// 1. Build manifest: 3D deps isolated in their own chunk.
{
  const assets = readdirSync(new URL('../../frontend/dist/assets', import.meta.url).pathname.replace(/\/$/, ''));
  const viewer = assets.filter((f) => f.startsWith('BimViewer-') && f.endsWith('.js'));
  const main = assets.filter((f) => f.startsWith('index-') && f.endsWith('.js'));
  ok(viewer.length === 1, `viewer chunk exists (${viewer.join(',')})`);
  const mainSrc = main.length ? readFileSync(new URL(`../../frontend/dist/assets/${main[0]}`, import.meta.url), 'utf8') : '';
  ok(main.length === 1 && !mainSrc.includes('StreamAllMeshes') && !mainSrc.includes('OrbitControls'), 'main bundle has no 3D code');
  const wasm = assets.filter((f) => f.endsWith('.wasm'));
  ok(wasm.length >= 1, `wasm emitted (${wasm.join(',')})`);
  const viewerSrc = readFileSync(new URL(`../../frontend/dist/assets/${viewer[0]}`, import.meta.url), 'utf8');
  ok(viewerSrc.includes('StreamAllMeshes'), 'viewer chunk carries geometry path');
}

const { chromium } = await import('playwright');
const browser = await chromium.launch();
try {
  const loginAs = async (page, email) => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.fill('input[type=email]', email);
    await page.fill('input[type=password]', 'admin123');
    await page.click('button[type=submit]');
    await page.waitForTimeout(2500);
  };
  // 2. Enterprise: upload fixture via node fetch (deterministic), open viewer.
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await loginAs(page, 'admin@hbg.com');
  const token = await page.evaluate(() => localStorage.getItem('pmo_token'));
  const fd = new FormData();
  fd.append('file', new Blob([readFileSync(new URL('../fixtures/pilot-tower.ifc', import.meta.url))]), 'boot-test.ifc');
  const up = await fetch(BASE + '/api/projects/1/bim/models', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  }).then(r => r.json());
  ok(up.id > 0, `fixture uploaded (got ${up.id})`);
  await page.goto(`${BASE}/hq/bim/${up.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const html = await page.content();
  ok(html.includes('bim-canvas'), 'viewer canvas mounted');
  ok(!html.includes('Lỗi:'), 'no viewer error banner');
  const m = html.match(/(\d+) meshes/);
  ok(m && Number(m[1]) >= 1, `real geometry rendered (${m ? m[0] : 'none'})`);
  ok(errs.length === 0, `zero page errors (got ${JSON.stringify(errs).slice(0, 200)})`);
  // Cleanup: row + staged file.
  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const row = await db.prepare('SELECT storage_key FROM file_uploads WHERE id = ?').getAsync(up.id);
  await db.prepare('DELETE FROM file_uploads WHERE id = ?').runAsync(up.id);
  if (row) {
    const { getFilePath } = await import('../../backend/src/lib/storage.js');
    const { unlinkSync } = await import('node:fs');
    try { unlinkSync(getFilePath(row.storage_key)); } catch {}
  }
  await db.prepare(`DELETE FROM audit_log WHERE resource_type = 'bim_model' AND resource_id = ?`).runAsync(up.id).catch(() => {});
  const { closeDb } = await import('../../backend/src/db/index.js');
  await closeDb();
  // 3. Small plan: viewer link hidden (nav flag) — direct URL still backend-gated.
  const page2 = await browser.newPage();
  await loginAs(page2, 'admin@pilot.test');
  const r = await page2.evaluate(async () => {
    const t = localStorage.getItem('pmo_token');
    const res = await fetch('/api/projects/4/bim-models', { headers: { Authorization: `Bearer ${t}` } });
    return res.status;
  });
  ok(r === 403, `small bim list → 403 (got ${r})`);
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
