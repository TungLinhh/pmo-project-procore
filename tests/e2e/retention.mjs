// Retention sweeper: prunes expired operational logs, never business data.
//
// The dangerous failure mode is deleting something that still matters, so the
// assertions are mostly about what it must NOT touch: audit_log stays unless a
// policy says otherwise, a small table is protected by RETENTION_MIN_ROWS, and
// a live (unexpired) session survives no matter how aggressive the window is.
import { getDb, closeDb } from '../../backend/src/db/index.js';
import { psql, ok, summary } from './lib.mjs';

const db = getDb();
const stamp = Date.now();
let tokenIds = [];
let callIds = [];
const savedEnv = {};
for (const k of ['RETENTION_MIN_ROWS', 'SESSION_RETENTION_DAYS', 'AI_LOG_RETENTION_DAYS', 'AUDIT_RETENTION_DAYS']) savedEnv[k] = process.env[k];
const setEnv = (k, v) => { if (v === undefined) delete process.env[k]; else process.env[k] = String(v); };

try {
  // Scratch rows: one already expired, one still valid.
  const hbg = await db.prepare("SELECT tenant_id FROM projects WHERE code = 'BTE-WP4-HBC'").getAsync();
  const admin = await db.prepare("SELECT id FROM users WHERE email = 'admin@hbg.com'").getAsync();
  const mk = await db.prepare(
    `INSERT INTO auth_refresh_tokens (user_id, token_hash, family_id, expires_at)
     VALUES (?, ?, gen_random_uuid(), now() - interval '1 day') RETURNING id`
  ).runAsync(admin.id, `retention-old-${stamp}`);
  const live = await db.prepare(
    `INSERT INTO auth_refresh_tokens (user_id, token_hash, family_id, expires_at)
     VALUES (?, ?, gen_random_uuid(), now() + interval '30 days') RETURNING id`
  ).runAsync(admin.id, `retention-live-${stamp}`);
  tokenIds = [Number(mk.lastInsertRowid), Number(live.lastInsertRowid)];

  const oldCall = await db.prepare(
    `INSERT INTO ai_calls (tenant_id, purpose, provider, model, status, created_at)
     VALUES (?, 'retenprobe', 'probe', 'probe', 'ok', now() - interval '200 days') RETURNING id`
  ).runAsync(hbg.tenant_id);
  // Fresh row: even with the most aggressive window the sweeper must keep it,
  // which is why every target is floored at 1 day.
  const newCall = await db.prepare(
    `INSERT INTO ai_calls (tenant_id, purpose, provider, model, status, created_at)
     VALUES (?, 'retenprobe', 'probe', 'probe', 'ok', now()) RETURNING id`
  ).runAsync(hbg.tenant_id);
  callIds = [Number(oldCall.lastInsertRowid), Number(newCall.lastInsertRowid)];

  const auditBefore = Number(psql('SELECT count(*) FROM audit_log'));

  const { runRetention, retentionPlan } = await import('../../backend/src/lib/retention.js');

  // 1. Default plan never includes audit_log (deleting the audit trail is a
  //    policy decision, not a sweeper's call).
  setEnv('AUDIT_RETENTION_DAYS', undefined);
  ok(!retentionPlan().some((p) => p.table === 'audit_log'),
    'mặc định KHÔNG dọn audit_log (cần AUDIT_RETENTION_DAYS > 0)');

  // 2. Sàn `RETENTION_MIN_ROWS` phải giữ bảng **nhỏ**. Đo 2026-09-30: bài này đỏ vì
  //    `auth_refresh_tokens` đã có 10 150 dòng — **vượt** sàn 10 000. Bản đầu giả định
  //    bảng luôn nhỏ, nên đây không phải hồi quy sản phẩm mà là bài kiểm phụ thuộc
  //    **kích thước bảng thật**, tức không tự chứa: đủ một vài lần chạy e2e là đỏ.
  //
  //    Cách sửa: dùng ngưỡng **lớn hơn bảng thật** (đọc số dòng rồi cộng dư) thay vì
  //    đoán một con số. Như vậy khẳng định giữ đúng ý nghĩa — "bảng dưới sàn thì không
  //    xoá gì" — ở mọi kích thước DB, và nếu sàn bị nới sai thì bài vẫn bắt được.
  const rtRows = Number(psql('SELECT count(*) FROM auth_refresh_tokens'));
  const floorAbove = rtRows + 1000;
  setEnv('RETENTION_MIN_ROWS', floorAbove);
  setEnv('SESSION_RETENTION_DAYS', 0);
  setEnv('AI_LOG_RETENTION_DAYS', 0);
  const guarded = await runRetention();
  const rt = guarded.results.find((r) => r.table === 'auth_refresh_tokens');
  ok(rt?.deleted === 0 && /ngưỡng/.test(rt?.skipped || ''),
    `bảng nhỏ hơn RETENTION_MIN_ROWS thì bỏ qua (bảng ${rtRows} dòng, sàn ${floorAbove}) — kết quả: ${rt?.skipped || 'xoá!'}`);
  ok(psql(`SELECT count(*) FROM auth_refresh_tokens WHERE id = ${tokenIds[0]}`) === '1',
    `dòng hết hạn vẫn còn khi bảng dưới ngưỡng (${rtRows} dòng)`);

  // 3. Floor lifted, window at its 1-day floor → expired rows go, live rows stay.
  setEnv('RETENTION_MIN_ROWS', 0);
  setEnv('SESSION_RETENTION_DAYS', 0);   // clamped to 1 day
  setEnv('AI_LOG_RETENTION_DAYS', 0);    // clamped to 1 day
  const swept = await runRetention();
  const rt2 = swept.results.find((r) => r.table === 'auth_refresh_tokens');
  ok(rt2?.deleted >= 1, `dọn được phiên đã hết hạn (${rt2?.deleted} dòng, giữ ${rt2?.describe})`);
  ok(psql(`SELECT count(*) FROM auth_refresh_tokens WHERE id = ${tokenIds[0]}`) === '0',
    'phiên hết hạn đã bị xoá');
  ok(psql(`SELECT count(*) FROM auth_refresh_tokens WHERE id = ${tokenIds[1]}`) === '1',
    'phiên còn hiệu lực KHÔNG bị xoá dù window nhỏ nhất');
  const ai = swept.results.find((r) => r.table === 'ai_calls');
  ok(ai?.deleted >= 1, `dọn được log AI cũ (${ai?.deleted} dòng)`);
  ok(psql(`SELECT count(*) FROM ai_calls WHERE id = ${callIds[1]}`) === '1',
    'log AI mới giữ nguyên dù window = 0 (sàn 1 ngày)');

  // 4. audit_log untouched no matter what.
  ok(Number(psql('SELECT count(*) FROM audit_log')) === auditBefore, 'audit_log không bị đụng tới');
  setEnv('AUDIT_RETENTION_DAYS', 36500);
  setEnv('RETENTION_MIN_ROWS', 0);
  const withAudit = await runRetention();
  ok(withAudit.results.every((r) => r.table !== 'audit_log' || r.deleted === 0),
    'audit_log vẫn không bị xoá dưới ngưỡng thời gian 100 năm');
  setEnv('AUDIT_RETENTION_DAYS', undefined);
} catch (e) {
  ok(false, e.message);
} finally {
  for (const k of Object.keys(savedEnv)) setEnv(k, savedEnv[k]);
  for (const id of tokenIds) psql(`DELETE FROM auth_refresh_tokens WHERE id = ${id}`);
  for (const id of callIds) psql(`DELETE FROM ai_calls WHERE id = ${id}`);
  await closeDb();
  summary();
}
