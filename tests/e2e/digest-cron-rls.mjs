// Overdue digest must work from the CRON path, i.e. with no authenticated
// request and therefore no app.current_tenant.
//
// Before: attention_digest_runs' RLS policy used the raw form
// `current_setting('app.current_tenant', true) = ''`, which is NULL (not TRUE)
// when the GUC was never SET in the session — exactly the cron case. Every
// INSERT was refused with "new row violates row-level security policy", the
// daily digest recorded nothing, and the cron then marked the day done anyway.
// Now the policy uses the same app_tenant_unset() helper as every other table,
// and runOverdueDigest owns the tenant context itself.
import { getDb, closeDb } from '../../backend/src/db/index.js';
import { psql, ok, summary } from './lib.mjs';

const db = getDb();
// Assigned up front: a throw midway must still trigger cleanup.
const scratch = ['1990-01-01', '1990-01-02'];

try {
  // 1. The two policies must use the NULL-safe helper, not the raw GUC compare.
  const rawGuc = psql(
    `SELECT count(*) FROM pg_policies
      WHERE tablename IN ('attention_digest_runs', 'qa_inspections')
        AND qual LIKE '%current_setting%' AND qual NOT LIKE '%app_tenant_unset%'`
  );
  ok(rawGuc === '0', `không còn policy RLS nào dùng GUC thô (${rawGuc})`);

  const helpers = psql(
    `SELECT count(*) FROM pg_policies
      WHERE tablename IN ('attention_digest_runs', 'qa_inspections')
        AND qual LIKE '%app_tenant_unset%' AND with_check LIKE '%app_tenant_unset%'`
  );
  ok(helpers === '2', `cả 2 bảng dùng app_tenant_unset() cho USING lẫn WITH CHECK (${helpers})`);

  // 2. Prove the hatch really opens with the GUC unset (no ALS tenant). Run
  //    through the app's own pool so we get the same session state as a cron.
  const guc = await db.prepare("SELECT current_setting('app.current_tenant', true) AS raw").getAsync();
  ok(guc.raw === null, `GUC chưa được SET trong phiên cron (raw=${guc.raw})`);

  const seed = await db.prepare(
    `INSERT INTO attention_digest_runs (tenant_id, digest_date, user_id, project_id, item_count)
     SELECT p.tenant_id, ?, u.id, p.id, 0
       FROM projects p JOIN users u ON u.tenant_id = p.tenant_id AND u.role = 'admin'
      WHERE p.code = 'BTE-WP4-HBC' ORDER BY p.id, u.id LIMIT 1
     RETURNING id`
  ).getAsync('1990-01-01');
  ok(!!seed?.id, `ghi được dòng run khi không có tenant context (#${seed?.id})`);

  // 3. The digest function owns the tenant context, so a caller cannot forget.
  const { runOverdueDigest } = await import('../../backend/src/lib/attention-digest.js');
  const hbg = await db.prepare("SELECT tenant_id FROM projects WHERE code = 'BTE-WP4-HBC'").getAsync();
  const before = Number(psql(
    `SELECT count(*) FROM attention_digest_runs WHERE digest_date = '1990-01-02'`
  ));
  const result = await runOverdueDigest({ tenantId: hbg.tenant_id, date: '1990-01-02' });
  ok(!!result && result.tenant_id === Number(hbg.tenant_id),
    `runOverdueDigest chạy được ngoài request (${result?.deliveries?.length ?? 0} deliveries)`);
  const after = Number(psql(`SELECT count(*) FROM attention_digest_runs WHERE digest_date = '1990-01-02'`));
  ok(after >= before, `digest ghi run row cho ngày 1990-01-02 (${before} -> ${after})`);
  ok(after > 0, 'digest thật sự tạo bản ghi (không bị RLS chặn im lặng)');

  // 4. Cross-tenant isolation still holds for an authenticated request: rows
  //    outside the tenant stay invisible once the GUC is set.
  const foreign = psql(`SELECT count(*) FROM attention_digest_runs WHERE digest_date = '1990-01-01'`);
  const { runWithTenant } = await import('../../backend/src/lib/tenant.js');
  const seen = await runWithTenant(hbg.tenant_id, () =>
    db.prepare(`SELECT count(*) FROM attention_digest_runs WHERE digest_date = '1990-01-01'`).getAsync());
  const pilot = await db.prepare('SELECT id FROM tenants WHERE id <> ? ORDER BY id LIMIT 1').getAsync(hbg.tenant_id);
  const otherSeen = await runWithTenant(pilot.id, () =>
    db.prepare(`SELECT count(*) FROM attention_digest_runs WHERE digest_date = '1990-01-01'`).getAsync());
  ok(Number(seen.count) === Number(foreign), `tenant HBG thấy đủ dòng của mình (${seen.count}/${foreign})`);
  ok(Number(otherSeen.count) === 0, `tenant khác không thấy dòng của HBG (${otherSeen.count})`);

} catch (e) {
  ok(false, e.message);
} finally {
  for (const d of scratch) {
    try {
      const rows = await db.prepare('SELECT id, user_id FROM attention_digest_runs WHERE digest_date = ?').allAsync(d);
      for (const row of rows) {
        await db.prepare('DELETE FROM notifications WHERE resource_type = ? AND resource_id = ?')
          .runAsync('overdue_digest', row.id).catch(() => {});
        await db.prepare('DELETE FROM attention_digest_runs WHERE id = ?').runAsync(row.id).catch(() => {});
      }
    } catch { /* keep cleaning */ }
  }
  await closeDb();
  summary();
}
