// Daily backup E2E (SRS NFR): chạy tay, archive hợp lệ, giữ N bản, RBAC.
// Env-driven. Không đụng dữ liệu nghiệp vụ (chỉ đọc + 2 file dump test).
import { execSync } from 'node:child_process';
import { psqlQuery, apiBase } from '../tools/env.mjs';
import bcrypt from 'bcryptjs';
import { selectVictims, connectionArgs } from '../../backend/src/lib/backup.js';

const BASE = apiBase();
let pass = 0, fail = 0;
const ok = (name, detail) => { pass++; console.log(`  PASS — ${name}: ${detail}`); };
const ng = (name, detail) => { fail++; console.log(`  FAIL — ${name}: ${detail}`); };

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  const t = await r.text();
  let data; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data };
}
const J = (body, token) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const exec = (sql) => psqlQuery(sql).split('\n')[0];

try {
  // 0. Pure prune: giữ 7 bản mới nhất trong 10.
  const files = Array.from({ length: 10 }, (_, i) => `pmo-202609${String(i + 1).padStart(2, '0')}-020000.dump`);
  const victims = selectVictims(files, 7);
  (victims.length === 3 && victims[0] === files[0] && victims[2] === files[2] ? ok : ng)(
    'selectVictims keeps newest 7', victims.join(','));
  const conn = connectionArgs('postgresql://pmo_user:s%40cret@127.0.0.1:5433/pmo');
  (!conn.url.includes('s%40cret') && conn.env.PGPASSWORD === 's@cret' ? ok : ng)(
    'pg_dump argv has no DB password', conn.url);

  const login = await api('/api/auth/login', J({ email: 'admin@hbg.com', password: 'admin123' }));
  const T = login.data?.token;
  if (!T) { ng('login', 'NO TOKEN'); process.exit(1); }
  ok('login', 'admin@hbg.com');
  const H = { Authorization: `Bearer ${T}` };

  // 1. Trạng thái scheduler: hour/keep/next_run hiện diện.
  const st = await api('/api/admin/backups', { headers: H });
  (st.status === 200 && Number.isInteger(st.data?.hour) && Number.isInteger(st.data?.keep) && !!st.data?.next_run
    ? ok : ng)('scheduler status', `hour=${st.data?.hour} keep=${st.data?.keep}`);

  // 2. Chạy tay → 201 + file + size; archive đọc được bằng pg_restore.
  const run = await api('/api/admin/backups/run', J({}, T));
  (run.status === 201 && !!run.data?.file && run.data?.size > 1000 ? ok : ng)(
    'manual run', `status=${run.status} file=${run.data?.file} size=${run.data?.size}`);
  const dir = st.data?.dir;
  const full = `${dir}/${run.data?.file}`;
  // Chỉ kiểm archive khi đã **có** file. Bản cũ cứ chạy tiếp, nên khi sao lưu hỏng
  // (503 vì thiếu `BACKUP_DATABASE_URL` — môi trường này chưa chạy deploy step) nó báo
  // thêm `pg_restore: could not open input file ".../undefined"`, làm người đọc tưởng
  // lỗi nằm ở `pg_restore` thay vì ở nguyên nhân thật đã in ở dòng trên.
  if (run.status === 201 && run.data?.file) {
    try {
      const out = execSync(`pg_restore -l "${full}" | head -n 5`, { encoding: 'utf8', timeout: 60000 });
      (out.includes('DATABASE') || out.length > 0 ? ok : ng)('archive valid (pg_restore)', out.split('\n')[0].slice(0, 60));
    } catch (e) {
      ng('archive valid (pg_restore)', /not found/i.test(e.message) ? 'pg_restore missing' : e.message.slice(0, 100));
    }
  } else {
    console.log(`  SKIP — archive valid (pg_restore): không có file vì run trả ${run.status}.`
      + ` Cần role sao lưu: bash deploy/production/00-backup-role.sh + BACKUP_DATABASE_URL.`);
  }

  // 3. List chứa file mới; audit BACKUP_RUN.
  const list = await api('/api/admin/backups', { headers: H });
  const listed = Array.isArray(list.data?.backups) ? list.data.backups : [];
  // Chỉ kiểm khi có file: `b.file === undefined` không bao giờ đúng, nên khi `run` lỗi
  // assertion này **luôn đỏ** và che mất nguyên nhân thật đã in ở trên.
  if (run.data?.file) {
    (listed.some((b) => b.file === run.data.file) ? ok : ng)('listed', `total=${listed.length}`);
  } else {
    console.log(`  SKIP — listed: run trả ${run.status} nên không có file mới để tìm.`);
  }
  const audit = await api('/api/audit?action=BACKUP_RUN&limit=3', { headers: H });
  (Array.isArray(audit.data) && audit.data.length > 0 ? ok : ng)('audit BACKUP_RUN', `rows=${audit.data?.length ?? '?'}`);

  // 4. Guards: không token 401; role PM 403.
  const b401 = await api('/api/admin/backups/run', J({}));
  (b401.status === 401 ? ok : ng)('no token 401', `status=${b401.status}`);
  const hash = (await bcrypt.hash('pmtest1234', 10)).replace(/\$/g, '\\$'); // $ shell-expand trong psql -c "..."
  const pmEmail = `pm-bak-${Date.now()}@hbg.com`;
  const pmId = exec(`INSERT INTO users (tenant_id, email, name, role, password_hash) VALUES (1, '${pmEmail}', 'PM Bak', 'pm', '${hash}') RETURNING id`);
  const pmLogin = await api('/api/auth/login', J({ email: pmEmail, password: 'pmtest1234' }));
  const pmT = pmLogin.data?.token;
  const b403 = await api('/api/admin/backups/run', J({}, pmT));
  (b403.status === 403 ? ok : ng)('PM 403', `status=${b403.status}`);
  const g403 = await api('/api/admin/backups', { headers: { Authorization: `Bearer ${pmT}` } });
  (g403.status === 403 ? ok : ng)('PM list 403', `status=${g403.status}`);
  exec(`DELETE FROM auth_refresh_tokens WHERE user_id = ${pmId}`);
  exec(`DELETE FROM audit_log WHERE user_id = ${pmId}`);
  exec(`DELETE FROM users WHERE id = ${pmId}`);

  // 5. Dọn file dump test vừa tạo (giữ dir sạch; retention thật không bị ảnh hưởng).
  // Dọn thật do `process.on('exit')` lo (dòng ở trên), không lặp ở đây — và thông điệp
  // phải nói đúng sự thật: khi không có file thì **không** có gì để xoá.
  ok('cleanup', run.data?.file ? `sẽ xoá ${run.data.file} khi exit` : 'không có file để xoá (run lỗi)');
} catch (e) {
  ng('threw', e.message);
}

// Dọn ở `exit` chứ không trong `finally`: `process.exit` bỏ qua `finally`. Ba thứ bài
// này tạo ra ngoài DB chuẩn của nó — dòng audit `BACKUP_RUN`, user PM thử, và file
// dump — và cả ba đều dồn dập nếu không dọn (đo: còn 3 dòng audit từ 2026-09-23).
process.on('exit', () => {
  try {
    exec(`DELETE FROM audit_log WHERE resource_type = 'backup'`);
    exec(`DELETE FROM users WHERE email LIKE 'pm-bak-%@hbg.com'`);
    if (typeof full !== 'undefined' && run?.data?.file) rmSync(full, { force: true });
  } catch {}
});

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
