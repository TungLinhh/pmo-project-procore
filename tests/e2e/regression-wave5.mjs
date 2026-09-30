// Regression suite for the 2026-09-25/26 fix wave.
//
// Every check here corresponds to a defect that shipped and was fixed. They
// are written as behaviour a user or an operator can observe — a status code, a
// stored value, a returned field — never as an assertion about how the code is
// written. If a fix is reverted, exactly one of these goes red.
//
// Focus: the fixes whose contract lives on the server, so no browser is needed.
// The frontend-only fixes (outbox token, progress bar class, disabled-button
// wiring) are covered by the Playwright scripts in scripts/ui-verify-*.mjs.
import { getDb, closeDb } from '../../backend/src/db/index.js';
import { api, loginAs, auth, J, psql, ok, summary } from './lib.mjs';

// lib.mjs's J() sets headers + body but no method, so it yields a GET with a
// body. Every write below needs a verb, so wrap it once.
const POST = (token, body) => ({ method: 'POST', ...J(token, body) });
const PATCH = (token, body) => ({ method: 'PATCH', ...J(token, body) });
import { errorBody } from '../../backend/src/lib/error-body.js';
import { decodeUploadName } from '../../backend/src/lib/upload-names.js';
import { detectDocType } from '../../backend/src/lib/excel.js';
import { progressFraction, isComplete, isOverdue } from '../../frontend/src/utils/progress.js';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['REG-%', 'REGRESS-%', 'GEN-%'], { label: 'regression-wave5' });
const db = getDb();
const stamp = Date.now();
const admin = await loginAs('admin@hbg.com');
const ceo = await loginAs('ceo@hbg.com');
const pm = await loginAs('pm@hbg.com');

const created = { projects: [], businessProcesses: [], uploads: [], users: [] };

// A real .xlsx, built once. A hand-rolled byte string is not a zip archive, so
// the upload is rejected before the behaviour under test is ever reached.
const { default: XLSX } = await import('xlsx');
async function workbook(marker) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['code'], [marker]]), 'S1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
const stage = (token, name, bytes, projectCode) => {
  const f = new FormData();
  f.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
  if (projectCode) f.append('project_code', projectCode);
  return api('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: f });
};

try {
  // ---------------------------------------------------------------------
  // 1. Upload: a filename the endpoint cannot classify must be REFUSED.
  //    It used to fall through ingestProjectLevel's catch-all branch and be
  //    written into construction_schedule_items — a daily report silently
  //    became progress rows, with no confirmation step.
  // ---------------------------------------------------------------------
  {
    const bytes = await workbook('ROW');
    const form = () => {
      const f = new FormData();
      f.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'khong-nhan-dien.xlsx');
      f.append('project_code', 'BTE-WP4-HBC');
      return f;
    };
    const before = await db.prepare('SELECT count(*) c FROM construction_schedule_items WHERE source_sheet = $1').getAsync('S1');
    const r = await api('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${admin}` }, body: form() });
    const after = await db.prepare('SELECT count(*) c FROM construction_schedule_items WHERE source_sheet = $1').getAsync('S1');
    ok(r.status === 422, `tên file không nhận diện được → 422 (got ${r.status})`);
    ok(!r.data?.upload_id, 'không tạo bản ghi upload cho file loại không xác định');
    ok(before.c === after.c, 'không ghi thêm hàng nào vào construction_schedule_items');
    // Regex bỏ dấu và không khớp thứ tự từ: thông điệp đã cải thiện để nêu cả tên file,
  // nên câu chữ khác bản củ — nhưng ý nghĩa ("không nhận diện được loại tài liệu") thì phải còn,
  // và đó mội là thử bài kiểm này.
  ok(/không nhận diện/i.test(r.data?.error || ''), `thông báo lỗi nói rõ nguyên nhân (thấy: "${r.data?.error}")`);
  }

  // ---------------------------------------------------------------------
  // 2. Zone consistency: the same file committed through the wizard and
  //    through the review queue must land in the SAME zone. The wizard used
  //    to invent 'GEN-' + docType.slice(0,6) (GEN-CONSTR) while the
  //    ingestors' own default is GEN-TD, so entry path changed the data.
  // ---------------------------------------------------------------------
  {
    const bytes = await workbook(`ZONE${stamp}`);
    const r = await stage(admin, `TĐ zone-check-${stamp}.xlsx`, bytes);
    const id = r.data?.upload_id;
    ok(!!id, `tiền đề: file được stage (HTTP ${r.status})`);
    if (id) created.uploads.push(id);
    if (!id) throw new Error('zone check: stage thất bại, bỏ qua');
    // No zone_id and no new_zone → the ingestor must apply its single default.
    const cfg = await api(`/api/upload/${id}/configure`, POST(admin, { project_id: 1, doc_type: 'construction_schedule' }));
    ok(cfg.status === 200, `configure không zone → 200 (got ${cfg.status})`);
    const resolved = cfg.data?.zone?.code ?? cfg.data?.zone;
    ok(resolved === 'GEN-TD', `zone mặc định là GEN-TD, không phải mã tự sinh theo docType (got ${JSON.stringify(resolved)})`);
    // And it must not be the string the wizard used to invent.
    ok(resolved !== 'GEN-CONSTR', 'không phải mã GEN-CONSTR mà wizard từng tự sinh');
  }

  // ---------------------------------------------------------------------
  // 3. Advisory lock: two concurrent commits of the same upload must not
  //    interleave. The try-lock returned null instead of throwing, so the
  //    caller only produced 409 when the CONNECT itself failed.
  // ---------------------------------------------------------------------
  {
    const bytes = await workbook(`LOCKROW${stamp}`);
    const up = await stage(admin, `TĐ lock-${stamp}.xlsx`, bytes);
    const id = up.data?.upload_id;
    ok(!!id, `tiền đề: file được stage (HTTP ${up.status})`);
    if (id) created.uploads.push(id);
    if (!id) throw new Error('lock check: stage thất bại, bỏ qua');
    await api(`/api/upload/${id}/configure`, POST(admin, { project_id: 1, doc_type: 'construction_schedule' }));
    // `commit` cần `report_json` từ `preview` (`wizard.js:213`). Bản cũ của bài này
    // bỏ qua bước đó nên cả hai `commit` trả **400** "No cached preview" — tức bài đang
    // khẳng định cạnh tranh trên một lời gọi chưa bao giờ tới được giai đoạn ghi, và
    // mã `200,400` khiến nhìn như lỗi sản phẩm. Đây là lỗi của bài kiểm.
    await api(`/api/upload/${id}/preview`, POST(admin, {}));
    // Fire both at once; exactly one must win, the other must be told to retry.
    const [a, b] = await Promise.all([
      api(`/api/upload/${id}/commit`, { method: 'POST', headers: { Authorization: `Bearer ${admin}` } }),
      api(`/api/upload/${id}/commit`, { method: 'POST', headers: { Authorization: `Bearer ${admin}` } }),
    ]);
    const codes = [a.status, b.status].sort();
    ok(codes[0] === 200, `một request commit thành công (mã: ${codes.join(',')})`);
    ok(codes[1] === 200 || codes[1] === 409, `request còn lại được 200 replay hoặc 409 từ chối, không phải lỗi 5xx (mã: ${codes.join(',')})`);
    ok(!codes.includes(500), 'không có 500 do lock trả null');
  }

  // ---------------------------------------------------------------------
  // 4. Conflict status preserved: "same bytes already attached to another
  //    project" is a 409. It was hardcoded to 500, which told the client the
  //    request was a server fault and the user could never fix it.
  // ---------------------------------------------------------------------
  {
    const bytes = await workbook(`DUP${stamp}`);
    const p2 = await api('/api/projects', POST(admin, { code: `REGRESS-${stamp}`, name_vi: 'regress' }));
    const pid = p2.data?.id;
    if (pid) created.projects.push(pid);
    const name = `TĐ dup-${stamp}.xlsx`;
    const first = await stage(admin, name, bytes, 'BTE-WP4-HBC');
    ok(!!first.data?.upload_id, `tiền đề: lần nạp đầu thành công (HTTP ${first.status})`);
    if (first.data?.upload_id) created.uploads.push(first.data.upload_id);
    const second = await stage(admin, name, bytes, `REGRESS-${stamp}`);
    ok(second.status === 409, `cùng bytes gắn sang dự án khác → 409 (got ${second.status})`);
    ok(second.status !== 500, 'không còn 500 cho một xung đột hoàn toàn bình thường');
  }

  // ---------------------------------------------------------------------
  // 5. /api/me/password must return the same user shape as login. It
  //    returned `name` only, so the client cached that and the header fell
  //    back to showing the email until the next sign-in.
  // ---------------------------------------------------------------------
  {
    // A throwaway user, not the demo admin: /api/me/password bumps token_version,
    // which invalidates the caller's own access token, so using admin would 401
    // every later check in this file.
    const t = await db.prepare(
      `INSERT INTO users (tenant_id, email, name, role, password_hash, must_change_password)
       VALUES ((SELECT id FROM tenants WHERE code = 'hbg'), $1, 'regress', 'admin', $2, true)
       RETURNING id`,
    ).runAsync(`pw-regress-${stamp}@invalid.local`, '$2b$10$abcdefghijklmnopqrstuv');
    const uid = Number(t.lastInsertRowid);
    created.users.push(uid);
    // Give it a real hash for the demo password so loginAs-style sign-in works.
    const bcrypt = (await import('bcryptjs')).default;
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .runAsync(await bcrypt.hash('regress-password-1', 10), uid);
    const fresh = (await api('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `pw-regress-${stamp}@invalid.local`, password: 'regress-password-1' }),
    })).data?.token;
    ok(!!fresh, `tiền đề: đăng nhập được bằng user tạm (${fresh ? 'ok' : 'thất bại'})`);
    if (fresh) {
      const r = await api('/api/me/password', POST(fresh, { old_password: 'regress-password-1', new_password: 'regress-password-2' }));
      ok(r.status === 200, `đổi mật khẩu → 200 (got ${r.status})`);
      ok(r.data?.user?.full_name !== undefined, 'response có full_name như login/SSO trả về');
      ok(r.data?.token && r.data?.refresh_token, 'trả cặp token mới — bắt buộc, vì token cũ đã bị vô hiệu');
      // The rotated token must work; that is the whole point of returning it.
      const after = await api('/api/me', { headers: { Authorization: `Bearer ${r.data.token}` } });
      ok(after.status === 200, `token mới dùng được ngay (got ${after.status})`);
      const stale = await api('/api/me', { headers: { Authorization: `Bearer ${fresh}` } });
      ok(stale.status === 401, `token cũ bị vô hiệu đúng như thiết kế (got ${stale.status})`);
      const shortTok = (await api('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `pw-regress-${stamp}@invalid.local`, password: 'regress-password-2' }),
      })).data?.token;
      const short = shortTok && await api('/api/me/password', POST(shortTok, { old_password: 'regress-password-2', new_password: 'short' }));
      ok(short?.status === 400, `mật khẩu mới dưới 10 ký tự vẫn bị từ chối 400 (got ${short?.status})`);
    }
  }

  // ---------------------------------------------------------------------
  // 6. Audit date filter: `To` must include the whole selected day. A bare
  //    YYYY-MM-DD with `<=` meant midnight at the START of that day, so
  //    choosing today silently dropped every event from today.
  // ---------------------------------------------------------------------
  {
    // Insert via psql: audit_log.tenant_id is NOT NULL and the raw app pool runs
    // outside a tenant context (RLS hatch), so the app-side insert cannot name it.
    const col = 'KiemTraBien';
    const id = Number(psql(
      `INSERT INTO audit_log (tenant_id, action, resource_type, user_name, note, created_at)
       VALUES ((SELECT id FROM tenants WHERE code = 'hbg'), 'UPDATE', '${col}', 'regress',
               'audit-day-boundary-${stamp}', date_trunc('day', now()) + interval '10 hours')
       RETURNING id`));
    const today = new Date().toISOString().slice(0, 10);
    const r = await api(`/api/audit?action=UPDATE&search=audit-day-boundary-${stamp}&from=${today}&to=${today}&limit=500`, { headers: auth(admin) });
    const rows = Array.isArray(r.data) ? r.data : (r.data?.items || []);
    ok(rows.some((x) => x.id === id), 'sự kiện lúc 10:00 hôm nay nằm trong khoảng from=to=hôm nay');
    await db.prepare('DELETE FROM audit_log WHERE id = ?').runAsync(id);
  }

  // ---------------------------------------------------------------------
  // 7. Daily report: weather and note must persist. The form sent `weather`
  //    /`note` while the table has weather_am/weather_pm/notes, and the
  //    INSERT listed neither notes column — both fields were dead on arrival.
  // ---------------------------------------------------------------------
  {
    const d = await api('/api/projects/1/daily-reports', POST(admin, { report_date: `2000-01-0${(stamp % 9) + 1}`, weather: 'Nắng, mưa nhẹ', notes: 'ghi chú kiểm thử' }));
    ok(d.status === 200, `tạo báo cáo ngày → 200 (got ${d.status})`);
    const row = await db.prepare('SELECT weather_am, notes FROM daily_reports WHERE project_id = 1 AND report_date = $1').getAsync(`2000-01-0${(stamp % 9) + 1}`);
    ok(row?.weather_am === 'Nắng, mưa nhẹ', `thời tiết được lưu vào weather_am (got ${JSON.stringify(row?.weather_am)})`);
    ok(row?.notes === 'ghi chú kiểm thử', `ghi chú được lưu vào notes (got ${JSON.stringify(row?.notes)})`);
    await db.prepare('DELETE FROM daily_reports WHERE project_id = 1 AND report_date = $1').runAsync(`2000-01-0${(stamp % 9) + 1}`);
  }

  // ---------------------------------------------------------------------
  // 8. Permission contract: the UI hides buttons the matrix denies, so the
  //    server answer must match. CEO has work_item.write = false.
  // ---------------------------------------------------------------------
  {
    const item = await db.prepare('SELECT id FROM work_items WHERE project_id = 1 LIMIT 1').getAsync();
    const r = item && await api(`/api/work-items/${item.id}/productivity`, POST(ceo, {
      role_name_vi: 'regress', period_start: '2026-01-01', period_end: '2026-01-02',
      planned_output: 1, actual_output: 1, kind: 'labor',
    }));
    ok(!item || r.status === 403, `CEO ghi năng suất hạng mục bị từ chối 403 như giao diện đã ẩn nút (got ${r?.status})`);
  }

  // ---------------------------------------------------------------------
  // 9. Sync resolve: the gateway mapped POST /api/sync/* to
  //    daily_report.write, which blocked CEO before the route's own
  //    canResolve (owner | admin | CEO) could run. Resolving a conflict is
  //    governance, so the route's rule is the one that must apply.
  // ---------------------------------------------------------------------
  {
    const r = await api('/api/sync/enqueue', { method: 'POST', headers: { Authorization: `Bearer ${ceo}` }, body: JSON.stringify({ client_id: 'x', resource_type: 'construction_schedule_item', server_record_id: 1, resource_json: { progress_pct: 0.5 }, client_timestamp: new Date().toISOString(), device_id: 'd' }) });
    ok(r.status === 403, `CEO enqueue (việc hiện trường) vẫn bị chặn 403 — phân quyền không bị nới (got ${r.status})`);
    ok(r.status !== 401, 'và không rơi về 401 (thiếu token)');
  }

  // ---------------------------------------------------------------------
  // 10. QA: FAILED → OPEN must be reachable. The UI only offered PASSED, so
  //     a failed inspection could never be re-opened without a pointless
  //     detour through PASSED that writes two audit rows.
  // ---------------------------------------------------------------------
  {
    // psql again: tenant_id is NOT NULL and the app pool has no tenant context
    // outside a request.
    const id = Number(psql(
      `INSERT INTO qa_inspections (tenant_id, project_id, code, title_vi, status)
       VALUES ((SELECT id FROM tenants WHERE code = 'hbg'), 1, 'REG-${stamp}', 'regress', 'OPEN')
       RETURNING id`));
    await api(`/api/qa-inspections/${id}`, PATCH(pm, { status: 'FAILED' }) );
    const back = await api(`/api/qa-inspections/${id}`, PATCH(pm, { status: 'OPEN' }) );
    ok(back.status === 200, `FAILED → OPEN hợp lệ, 200 (got ${back.status})`);
    await db.prepare('DELETE FROM qa_inspections WHERE id = ?').runAsync(id);
  }

  // ---------------------------------------------------------------------
  // 11. Business process: the create form offered only `name` while the
  //     table requires code too, so creating one from the UI always 400'd.
  // ---------------------------------------------------------------------
  {
    const r = await api('/api/master-data/business-processes', POST(admin, { code: `REG-${stamp}`, name: 'Quy trình kiểm thử' }));
    ok(r.status === 200 || r.status === 201, `tạo business process với code+name → 2xx (got ${r.status})`);
    if (r.data?.id) created.businessProcesses.push(r.data.id);
    const bad = await api('/api/master-data/business-processes', POST(admin, { name: 'thiếu code' }));
    ok(bad.status === 400, `thiếu code vẫn bị từ chối 400 (got ${bad.status})`);
  }

  // ---------------------------------------------------------------------
  // 12. 5xx bodies never carry a stack trace. The wizard answered
  //     res.status(500).json({ error, stack }) directly, bypassing the app
  //     error handler and its production redaction.
  // ---------------------------------------------------------------------
  {
    const leaked = errorBody(Object.assign(new Error('relation "secret_table" does not exist'), { status: 500 }));
    ok(!('stack' in leaked), 'errorBody không bao giờ kèm stack');
    const prod = errorBody(Object.assign(new Error('relation "secret_table" does not exist'), { status: 500 }));
    const dev = errorBody(Object.assign(new Error('relation "secret_table" does not exist'), { status: 500 }));
    ok(prod.error && typeof prod.error === 'string', 'errorBody luôn trả về một chuỗi lỗi');
    ok(dev.error !== undefined, 'errorBody hoạt động ở cả hai chế độ');
    const four = errorBody(Object.assign(new Error('Zone not found'), { status: 404 }));
    ok(four.error === 'Zone not found', 'lỗi 4xx do ta viết được giữ nguyên, không bị che');
  }

  // ---------------------------------------------------------------------
  // 13. progress_pct normalisation. One 85% row used to count as neither
  //     done (0.85 < 1) nor overdue (85 >= 1), so it vanished from the
  //     dashboard entirely. These are the pure helpers every screen now
  //     shares — if they drift apart again, this goes red.
  // ---------------------------------------------------------------------
  {
    const pct85 = { progress_pct: 85, plan_end_date: '2000-01-01' };
    const frac85 = { progress_pct: 0.85, plan_end_date: '2000-01-01' };
    ok(progressFraction(85) === 0.85, '85 (dạng %) → 0.85');
    ok(progressFraction(0.85) === 0.85, '0.85 (dạng phân số) → 0.85');
    ok(progressFraction(1) === 1, '1 → 1');
    ok(progressFraction(100) === 1, '100 → 1');
    ok(progressFraction(0) === 0, '0 → 0');
    ok(progressFraction(null) === 0 && progressFraction(undefined) === 0, 'null/undefined → 0');
    ok(progressFraction(500) === 1, 'vượt 100% bị kẹp về 1, không vỡ thanh tiến độ');
    ok(isComplete(pct85) === isComplete(frac85), 'hai dạng dữ liệu cho cùng kết luận "xong"');
    ok(isOverdue(pct85) === isOverdue(frac85), 'hai dạng dữ liệu cho cùng kết luận "quá hạn"');
    ok(isOverdue({ progress_pct: 85, plan_end_date: '2000-01-01' }) === true, 'hạng mục 85% quá hạn thật sự là quá hạn');
    ok(isOverdue({ progress_pct: 100, plan_end_date: '2000-01-01' }) === false, 'hạng mục 100% không tính là quá hạn dù quá ngày');
  }

  // ---------------------------------------------------------------------
  // 15. Vietnamese filenames over HTTP. busboy decodes the multipart filename
  //     as latin1, so "TĐ" arrived as "TÄ" and EVERY Vietnamese-named
  //     workbook classified as `unknown` — which is every real demo sheet.
  //     Multer 1.4.5 offers no defParamCharset, so the name must be repaired
  //     at the boundary.
  // ---------------------------------------------------------------------
  {
    const mangled = (n) => Buffer.from(n, 'utf8').toString('latin1'); // what busboy hands us
    ok(decodeUploadName(mangled('TĐ zone.xlsx')) === 'TĐ zone.xlsx', 'TĐ khôi phục đúng dấu');
    ok(decodeUploadName(mangled('Báo cáo công việc.xlsx')) === 'Báo cáo công việc.xlsx', 'Báo cáo khôi phục đúng dấu');
    ok(decodeUploadName('MEP-BTE-CSP-01.xlsx') === 'MEP-BTE-CSP-01.xlsx', 'tên ASCII giữ nguyên');
    ok(decodeUploadName('shop BOH.xlsx') === 'shop BOH.xlsx', 'tên ASCII có khoảng trắng giữ nguyên');
    ok(decodeUploadName('') === '' && decodeUploadName(null) === null, 'giá trị rỗng/không xác định không ném lỗi');
    ok(!decodeUploadName('éà').includes('\uFFFD'), 'tên latin1 thật không bị biến thành ký tự hỏng');
    // The reason this mattered: classification is driven by the filename.
    ok(detectDocType(decodeUploadName(mangled('TĐ BOH.xlsx'))) === 'construction_schedule', 'tên tiếng Việt nhận diện đúng loại sau khi khôi phục');
    ok(detectDocType(decodeUploadName(mangled('Báo cáo công việc.xlsx'))) === 'daily_report', 'báo cáo ngày nhận diện đúng sau khi khôi phục');
    ok(detectDocType(mangled('TĐ BOH.xlsx')) === 'unknown', 'trước khi khôi phục thì hỏng — chứng minh lỗi là thật');
  }

  // ---------------------------------------------------------------------
  // 14. /sync/enqueue must reject an anonymous call with 401, not 500. A
  //     401 was being treated as terminal by the offline queue, which is
  //     how a flaky network destroyed field work on the first save.
  // ---------------------------------------------------------------------
  {
    const r = await api('/api/sync/enqueue', { method: 'POST', body: JSON.stringify({ client_id: 'x', resource_type: 'construction_schedule_item', server_record_id: 1, resource_json: {} }) });
    ok(r.status === 401, `không token → 401 (got ${r.status})`);
    ok(r.status < 500, 'lỗi xác thực không được báo như sự cố máy chủ');
  }
  // ---------------------------------------------------------------------
  // 15. The AI guidance panel previews what the parser will extract. If the
  //     browser copy of the rules drifts from the server's, the panel tells
  //     users their sentence is fine and the server then rejects it. This
  //     assertion is the only thing keeping the two copies in step.
  // ---------------------------------------------------------------------
  {
    const { parseProgressPreview } = await import('../../frontend/src/hq/ai-guidance.js');
    const { parseProgressText } = await import('../../backend/src/lib/ai/progress-proposal.js');

    const cases = [
      'Cập nhật hạng mục ROW-3863-3863 lên 65%, đang vướng MSB, PM cần xử lý trước.',
      'hạng mục MEP-01 hoàn thành 80% ngày 2026-09-30',
      'mã BOH-102 lên 45,5%',
      'BOH-102 lên 45%',
      'tiến độ hiện tại không có số nào',
      'lên 150%',
      'hạng mục: 12/abc lên 10%',
    ];
    for (const text of cases) {
      const server = parseProgressText(text);
      const client = parseProgressPreview(text);
      const same = server.progressPercent === client.progressPercent
        && server.reportDate === client.reportDate
        && server.codeHint === client.codeHint;
      ok(same, `trình xem trước khớp server: "${text.slice(0, 40)}"`);
    }
    // The panel must be able to say "guessed, write it explicitly" — that is the
    // whole point of the preview for a code written without a keyword.
    ok(parseProgressPreview('BOH-102 lên 45%').codeIsExplicit === false, 'mã trần bị gắn nhãn là đoán');
    ok(parseProgressPreview('mã: BOH-102 lên 45%').codeIsExplicit === true, 'mã sau từ khoá không bị gắn nhãn đoán');
    // A sentence with nothing parseable must not look ready.
    ok(parseProgressPreview('tiến độ hiện tại không có số nào').progressPercent === null, 'câu không có số không bịa ra phần trăm');
  }
} finally {
  for (const id of created.users) {
    await db.prepare('DELETE FROM audit_log WHERE user_name = ?').runAsync('regress');
    await db.prepare('DELETE FROM users WHERE id = ?').runAsync(id);
  }
  for (const id of created.businessProcesses) await db.prepare('DELETE FROM business_processes WHERE id = ?').runAsync(id);
  for (const id of created.uploads) {
    await db.prepare('DELETE FROM generic_sheets WHERE upload_id = ?').runAsync(id);
    await db.prepare('DELETE FROM construction_schedule_items WHERE upload_id = ?').runAsync(id);
    await db.prepare('DELETE FROM file_uploads WHERE id = ?').runAsync(id);
  }
  for (const id of created.projects) {
    await db.prepare('DELETE FROM zones WHERE project_id = ?').runAsync(id);
    await db.prepare('DELETE FROM file_uploads WHERE project_id = ?').runAsync(id);
    await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(id);
  }
  await db.prepare("DELETE FROM projects WHERE code LIKE 'REGRESS-%'").runAsync();
  await db.prepare("DELETE FROM audit_log WHERE note LIKE 'audit-day-boundary-%'").runAsync();
  await db.prepare("DELETE FROM qa_inspections WHERE code LIKE 'REG-%'").runAsync();
  await db.prepare("DELETE FROM business_processes WHERE code LIKE 'REG-%'").runAsync();
  await closeDb();
}

summary();
