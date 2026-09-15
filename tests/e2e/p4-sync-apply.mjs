// P4-3: winner=CLIENT really applies resource_json onto the server record.
// Seeded PENDING rows (no enqueue endpoint by design — tested with seeds).
// 1. non-owner resolve → 403 (ownership).
// 2. CLIENT apply → record changed + CLIENT_NEWER + SYNC_APPLY audit w/ before-after.
// 3. unknown resource_type → 422 (allowlist, never silent).
// 4. CLIENT without server_record_id → 422. Bad progress value → 422, record untouched.
// Run: BASE_URL=http://localhost:3000 node tests/e2e/p4-sync-apply.mjs
import { execSync } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CW = '/home/vutun/pmo_project';
let pass = 0, fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); cond ? pass++ : fail++; };
async function api(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const psql = (sql) => execSync(`bash backend/scripts/pg-ctl.sh psql -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8', cwd: CW }).trim().split('\n')[0];
const loginAs = async (email) => (await api('/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'admin123' }),
})).data?.token;

const adminT = await loginAs('admin@hbg.com');
const pmT = await loginAs('pm@hbg.com');
ok(!!adminT && !!pmT, 'login admin + pm');
const AH = { Authorization: `Bearer ${adminT}`, 'Content-Type': 'application/json' };
const PH = { Authorization: `Bearer ${pmT}`, 'Content-Type': 'application/json' };
const J = (H, b) => ({ headers: H, body: JSON.stringify(b) });

// target: a real schedule item; remember original progress for restore
const targetId = psql(`SELECT id FROM construction_schedule_items WHERE project_id = 1 LIMIT 1;`);
const origProgress = psql(`SELECT progress_pct FROM construction_schedule_items WHERE id = ${targetId};`);
ok(!!targetId, `target item #${targetId} (progress=${origProgress})`);

const seed = (type, recordId, json) => psql(
  `INSERT INTO offline_sync_queue (user_id, resource_type, server_record_id, resource_json, client_timestamp) VALUES (1, '${type}', ${recordId}, '${json}', now()) RETURNING id;`
);

// 1. ownership: pm cannot resolve admin's item
const q1 = seed('construction_schedule_item', targetId, '{"progress_pct": 0.5}');
const denied = await api('/api/sync/resolve', { method: 'POST', ...J(PH, { queue_id: Number(q1), winner: 'CLIENT' }) });
ok(denied.status === 403, `non-owner resolve → 403 (got ${denied.status})`);

// 2. CLIENT apply works + audit has before/after
const applied = await api('/api/sync/resolve', { method: 'POST', ...J(AH, { queue_id: Number(q1), winner: 'CLIENT' }) });
ok(applied.status === 200 && applied.data?.conflict_resolution === 'CLIENT_NEWER', 'CLIENT resolve ok');
ok(Number(psql(`SELECT progress_pct FROM construction_schedule_items WHERE id = ${targetId};`)) === 0.5, 'server record progress = 0.5');
const audit = JSON.parse(psql(`SELECT json_build_object('action', action, 'has_before', before IS NOT NULL, 'has_after', after IS NOT NULL)::text FROM audit_log WHERE action = 'SYNC_APPLY' ORDER BY id DESC LIMIT 1;`));
ok(audit.action === 'SYNC_APPLY' && audit.has_before && audit.has_after, 'SYNC_APPLY audit with before+after');

// 3. unknown type → 422, nothing applied
const q3 = seed('teleport_coordinates', targetId, '{"x": 1}');
const unk = await api('/api/sync/resolve', { method: 'POST', ...J(AH, { queue_id: Number(q3), winner: 'CLIENT' }) });
ok(unk.status === 422, `unknown type → 422 (got ${unk.status})`);

// 4. missing server_record_id → 422; bad value → 422 + untouched
const q4 = psql(`INSERT INTO offline_sync_queue (user_id, resource_type, resource_json, client_timestamp) VALUES (1, 'daily_report', '{"notes": "x"}', now()) RETURNING id;`);
const noRef = await api('/api/sync/resolve', { method: 'POST', ...J(AH, { queue_id: Number(q4), winner: 'CLIENT' }) });
ok(noRef.status === 422, `CLIENT without record → 422 (got ${noRef.status})`);
const q5 = seed('construction_schedule_item', targetId, '{"progress_pct": 9}');
const badVal = await api('/api/sync/resolve', { method: 'POST', ...J(AH, { queue_id: Number(q5), winner: 'CLIENT' }) });
ok(badVal.status === 422, `progress 9 → 422 (got ${badVal.status})`);
ok(Number(psql(`SELECT progress_pct FROM construction_schedule_items WHERE id = ${targetId};`)) === 0.5, 'record untouched after rejected apply');

// restore + cleanup
psql(`UPDATE construction_schedule_items SET progress_pct = ${origProgress} WHERE id = ${targetId};`);
execSync(`bash backend/scripts/pg-ctl.sh psql -c "DELETE FROM offline_sync_queue WHERE resource_json::text LIKE '%progress_pct%' OR resource_type = 'teleport_coordinates' OR (resource_type = 'daily_report' AND resource_json = '{\\"notes\\": \\"x\\"}'); DELETE FROM audit_log WHERE action = 'SYNC_APPLY';"`, { encoding: 'utf8', cwd: CW });
ok(String(psql(`SELECT progress_pct FROM construction_schedule_items WHERE id = ${targetId};`)) === String(origProgress), 'original progress restored');

console.log(pass && !fail ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
process.exit(fail ? 1 : 0);
