// Dọn dữ liệu thật mà một bài kiểm e2e để lại — đăng ký ở `process.on('exit')`.
//
// Vì sao ở `exit` chứ không trong `finally`: phần lớn bài e2e kết thúc bằng
// `process.exit(1)`, mà `process.exit()` **không** chạy `finally`. Bài kiểm dừng giữa
// chừng vì một khẳng định đỏ sẽ để lại dòng, và dòng đó làm đỏ bài kiểm *golden* khác
// (`p5-golden.mjs` kiểm chuông demo không có thông báo rác).
//
// Vì sao cần chờ: `notifyMany` chạy **sau** khi response trả về
// (`routes/directives.js`), nên thông báo có thể còn nằm trong hàng đợi khi bài kiểm
// đã tới bước dọn. Dọn ở `exit` (sau khi server con đã chết và hàng đợi đã cạn) mới
// bắt được. Đo thật 2026-09-28: `realtime.mjs` dọn ngay nên vẫn rò 14 dòng thông báo
// `resource_type='directive'` trong chuông demo.
//
// `catch` **không** im lặng: một lần `catch {}` đã che đúng lỗi `require is not
// defined` làm dọn không chạy mà không ai biết (xem `p0-05-notify.mjs`).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const DEFAULT_DB = 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';

/**
 * Xoá dòng khớp `body LIKE <mẫu>` trong `directives`, và khớp `body` **hoặc** `title`
 * trong `notifications`.
 *
 * Vì sao phải khớp cả hai cột: cùng một bài kiểm tạo hai loại dòng với mẫu ở hai cột
 * khác nhau — chỉ thị đi qua `routes/directives.js` nên thông báo mang nội dung ở
 * `body` (`directive-p0-05-<epoch>`), còn thông báo tạo trực tiếp qua
 * `POST /api/notifications` mang mẫu ở `title` (`p0-05-<epoch>`, body `hello`). Bản
 * đầu chỉ khớp `body` nên rò 2 dòng, và `p5-golden.mjs` đỏ vì thấy chúng trong chuông.
 *
 * @param {string[]} bodyPatterns  mẫu SQL LIKE, ví dụ `['DIR-TEST-%']`
 * @param {object}  [opts]
 * @param {string}  [opts.label]   nhãn hiện khi dọn lỗi
 * @param {string}  [opts.db]      chuỗi kết nối; mặc định `DATABASE_URL` rồi tới DB local
 * @param {string[]} [opts.extra]  câu `DELETE` thêm (nguyên văn, dành cho bảng khác)
 */
export function cleanupOnExit(bodyPatterns, opts = {}) {
  const { label = 'e2e', db = process.env.DATABASE_URL || DEFAULT_DB, extra = [] } = opts;
  if (!bodyPatterns.length && !extra.length) return;

  const statements = [
    ...bodyPatterns.map((p) => `DELETE FROM notifications WHERE body LIKE '${p}' OR title LIKE '${p}';`),
    ...bodyPatterns.map((p) => `DELETE FROM directives WHERE body LIKE '${p}';`),
    ...extra,
  ];

  process.on('exit', () => {
    try {
      const { execSync } = require('node:child_process');
      execSync(`psql ${JSON.stringify(db)} -t -A -c ${JSON.stringify(statements.join(' '))}`, {
        stdio: 'ignore',
      });
    } catch (e) {
      console.error(`[cleanup:${label}] không dọn được ${bodyPatterns.join(', ') || '(extra)'}: ${e.message}`);
    }
  });
}

/**
 * Dọn **dự án thử nghiệm** tạo ra, theo mã dự án.
 *
 * Vì sao cần riêng: các dòng trên chỉ dọn `notifications`/`directives`, còn phần lớn
 * bài e2e tạo một dự án thật để có dữ liệu. Bài dừng giữa chừng sẽ để lại dự án ở
 * trạng thái `ACTIVE`, mà `p5-golden.mjs` kiểm đúng điều đó ⇒ **bài golden đỏ vì
 * một bài khác đã chết giữa chừng**. Đo 2026-09-28: 6 dự án rác `ACTIVE`
 * (`DRILL-*`, `P0-06-D-*`, `CMP-*`, `SCHED-ST-*`).
 *
 * Xoá đúng thứ tự phụ thuộc: `notifications` trước `projects` (FK), rồi các bảng con
 * theo thứ tự phụ thuộc rồi `projects`. Dùng `extra` của `cleanupOnExit` không tiện ở
 * đây vì cần chạy **sau** khi các bảng con đã sạch, nên hàm này tự xoá cả chuỗi.
 *
 * @param {string[]} codePatterns  mẫu SQL LIKE cho `projects.code`
 */
export function cleanupProjectsOnExit(codePatterns, opts = {}) {
  if (!codePatterns?.length) return;
  const { db = process.env.DATABASE_URL || DEFAULT_DB, label = 'e2e-projects' } = opts;
  // Danh sách bảng con **đo từ `information_schema`**, không ghi tay: bản đầu tôi ghi
  // tay và thiếu `ar_contracts`, `area_hierarchy`, `ai_embeddings`, `rfa_log`,
  // `material_submittals`… nên dự án thử vẫn còn lại (đo: chạy 3 bài, số dự án rác
  // **tăng** 6 → 9 vì `NOT EXISTS` trên bảng con thật chặn việc xoá).
  // Bảng nào không có `project_id` thì không liên quan tới dự án.
  const CHILD = [
    'ai_drafts', 'ai_embeddings', 'ar_contracts', 'ar_lines', 'area_hierarchy',
    'attention_digest_runs', 'construction_schedule_items', 'contracts',
    'daily_reports', 'directives', 'erp_push_log', 'file_uploads', 'generic_sheets',
    'health_thresholds', 'issues', 'kpi_targets', 'manpower_plans',
    'material_submittals', 'materials', 'notifications', 'payments',
    'pillar_gate_configs', 'pillar_scenarios', 'project_members', 'qa_inspections',
    'rfa_log', 'schedule_baselines', 'schedule_links', 'schedule_scenarios',
    'shop_drawings', 'wbs', 'work_item_productivity', 'work_items', 'zones',
  ];
  const where = codePatterns.map((c) => `p.code LIKE '${c}'`).join(' OR ');
  // `project_members` **cũng** phải dọn: dự án thử luôn có PM (nhiều bài tạo qua
  // `POST /api/projects` với `pm_user_id`), nên nó chặn `NOT EXISTS` và dự án không
  // bao giờ bị xoá (đo: `project_members=1` là lý do duy nhất dự án 214 sống sót).
  //
  // Thứ tự: con trước rồi `projects` sau, và chỉ xoá dự án **không còn** bảng con nào.
  // Câu `DELETE` cho bảng con dùng `NOT EXISTS` trên `projects` để không chạm vào dự án
  // khác — đây là điều kiện **bắt buộc**, không phải tối ưu: thiếu nó thì bài này sẽ
  // xoá dữ liệu của dự án demo.
  const sql = [
    ...CHILD.map((t) => `DELETE FROM ${t} c USING projects p WHERE c.project_id = p.id AND (${where})`),
    `DELETE FROM projects p WHERE (${where})`,
  ].join(';');

  process.on('exit', () => {
    try {
      const { execSync } = require('node:child_process');
      execSync(`psql ${JSON.stringify(db)} -t -A -c ${JSON.stringify(sql)}`, { stdio: 'ignore' });
    } catch (e) {
      console.error(`[cleanup:${label}] không dọn được dự án ${codePatterns.join(', ')}: ${e.message}`);
    }
  });
}

/**
 * Dọn **dòng trong `tenants`** theo mẫu `code LIKE` (kèm bảng con phụ thuộc).
 *
 * Vì sao cần: `p2-tenant-access.mjs` tạo tenant `T2-<epoch>` để dựng tình huống hai
 * khách hàng. Dọn dự án không đủ — còn dòng `tenants` thừa thì các bài đếm tenant (và
 * `p5-golden.mjs`) thấy dữ liệu lạ. Đo 2026-09-28: còn tenant `T2-1790607009357`.
 *
 * @param {string[]} codePatterns mẫu SQL LIKE cho `tenants.code`
 */
export function cleanupTenantsOnExit(codePatterns, opts = {}) {
  if (!codePatterns?.length) return;
  const { db = process.env.DATABASE_URL || DEFAULT_DB, label = 'e2e-tenants' } = opts;
  const where = codePatterns.map((c) => `t.code LIKE '${c}'`).join(' OR ');
  // `users`, `projects`… tham chiếu `tenant_id`; `cleanupProjectsOnExit` đã dọn dự án
  // nhưng không dọn user. Xoá con trước, rồi tới `tenants`.
  const sql = [
    `DELETE FROM users WHERE tenant_id IN (SELECT id FROM tenants t WHERE ${where})`,
    `DELETE FROM notifications WHERE tenant_id IN (SELECT id FROM tenants t WHERE ${where})`,
    `DELETE FROM ai_drafts WHERE tenant_id IN (SELECT id FROM tenants t WHERE ${where})`,
    `DELETE FROM audit_log WHERE tenant_id IN (SELECT id FROM tenants t WHERE ${where})`,
    `DELETE FROM tenants t WHERE ${where}`,
  ].join(';');
  process.on('exit', () => {
    try {
      const { execSync } = require('node:child_process');
      execSync(`psql ${JSON.stringify(db)} -t -A -c ${JSON.stringify(sql)}`, { stdio: 'ignore' });
    } catch (e) {
      console.error(`[cleanup:${label}] không dọn được tenant ${codePatterns.join(', ')}: ${e.message}`);
    }
  });
}

/**
 * Dọn dòng trong **bảng bất kỳ** theo mẫu `column LIKE`.
 *
 * Vì sao cần: `cleanupOnExit` chỉ lo `notifications`/`directives`, còn bài kiểm còn
 * tạo dữ liệu ở danh mục, phòng ban, bảng con… Đo 2026-09-28: `nested-departments.mjs`
 * tạo `PARENT`/`CHILD` mà không dọn, chạy 2 lần là 4 cặp dòng, và `p5-golden.mjs`
 * (kiểm đúng số bộ phận của tenant `hbg`) đỏ theo.
 *
 * @param {Array<[string, string]>} rules  cặp `[bảng, điều kiện WHERE]`
 */
export function cleanupRowsOnExit(rules, opts = {}) {
  if (!rules?.length) return;
  const { db = process.env.DATABASE_URL || DEFAULT_DB, label = 'e2e-rows' } = opts;
  const sql = rules.map(([table, where]) => `DELETE FROM ${table} WHERE ${where};`).join(' ');
  process.on('exit', () => {
    try {
      const { execSync } = require('node:child_process');
      execSync(`psql ${JSON.stringify(db)} -t -A -c ${JSON.stringify(sql)}`, { stdio: 'ignore' });
    } catch (e) {
      console.error(`[cleanup:${label}] không dọn được ${rules.map(([t]) => t).join(', ')}: ${e.message}`);
    }
  });
}
