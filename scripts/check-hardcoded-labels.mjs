#!/usr/bin/env node
// Nhãn **tiếng Anh** cứng trong JSX — điểm mù của bộ đo i18n hiện có.
//
// `scripts/check-i18n.mjs` chỉ đo chuỗi có **dấu tiếng Việt**. Một nhãn viết bằng
// tiếng Anh (`>Total<`, `>Needs review<`) không có dấu nên **không bao giờ** bị đo — và
// giao diện tiếng Việt hiện chữ Anh. Đo thực tế ở đợt 14: **145 chỗ ở 40 file**.
//
//   node scripts/check-hardcoded-labels.mjs
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'frontend/src';

// Không dịch — kèm lý do, cùng nguyên tắc với `scripts/i18n-allow.mjs`.
const ALLOW = {
  'AES-256-GCM': 'tên thuật toán học',
  'O-NEXUS': 'tên sản phẩm',
  'O-NEXUS Field': 'tên sản phẩm + hệ hiện trường',
  'In / PDF': 'viết tắt định dạng tệp',
  'BEFORE': 'tên cột JSON khớp `fieldChanges` của audit',
  'AFTER': 'tên cột JSON khớp `fieldChanges` của audit',
  'GET /api/projects': 'endpoint API, tra cứu nguyên văn',
  'content': 'thuộc tính HTML',
  'chat': 'tên loại cấu hình AI',
  'embed': 'tên loại cấu hình AI',
  'default': 'giá trị enum kỹ thuật',
  'VI/EN': 'nhãn nút chuyển ngôn ngữ, giống nhau ở cả hai ngôn ngữ',
  'REQ-2026-XXX': 'mẫu số yêu cầu thanh toán, người dùng tự thay',
  'lag': 'thuộc tính kỹ thuật của quan hệ phụ thuộc',
  'NOT': 'chữ trong comment',
  'n': 'biến trong comment',
};

const VOCAB_OK = new Set([
  'XLSX', 'CSV', 'IFC', 'ZIP', 'SSO', 'MFA', 'PDPL', 'SLA', 'TVGS', 'MSB', 'PR',
  'NCC', 'BOH', 'QA', 'QC', 'OTD', 'BIM', 'PDF', 'AI', 'RBAC', 'API', 'URL', 'ID',
  'OK', 'VI', 'EN', 'SQL', 'RLS', 'CPM', 'S3', 'HSTS', 'CSP', 'SSO',
  'POST', 'PUT', 'PATCH', 'DELETE', 'GET', 'HEAD',
  'CEO', 'PMO', 'SITE', 'PROCUREMENT', 'ACCOUNTING', 'FINANCE', 'HR',
  'MEP', 'HVAC', 'N/A', 'TBD', 'TODO',
]);

// File có **chỉ** dữ liệu kỹ thuật trong JSX, không có nhãn người dùng đọc.
// `icons.jsx` toàn đường dẫn SVG (`M2 14h12` …) — không phải nhãn.
const SKIP_FILES = new Set(['frontend/src/icons.jsx']);

// Nhãn trong **biểu thức JSX** — `{cond ? 'Approve' : '...'}`, `{x || 'Other'}`.
// Không phải text node nên ba mẫu trên đều bỏ sót; đo thật 2026-09-28 trên trình duyệt
// thấy `Approve`, `Reject`, `View Details`, `Other`, `Uploading...` hiện tiếng Anh ở
// chế độ VI trong khi bộ đo báo xanh.
//
// Bỏ qua giá trị **enum**: `PENDING`, `STAGED`, `APPROVED`… là hằng so với API/DB, dịch
// chúng là làm hỏng logic lọc. Vì vậy chỉ báo nhãn **không** viết HOA toàn bộ.
const EXPR_LITERAL = /(['"])([A-Z][A-Za-z0-9 ()%./&'-]{2,30})\1/g;

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.jsx$/.test(p) ? [p] : [];
  });
}

const findings = [];
for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  // Cả text node (`>Nhãn<`) lẫn `placeholder`/`title` — chỉ kiểm text node thì 8
  // placeholder tiếng Anh của màn Nhật ký vẫn lọt.
  for (const m of [...src.matchAll(/>([A-Za-z][A-Za-z0-9 ,.'()\-/&]{1,40})</g),
    ...src.matchAll(/(?:placeholder|title)="([A-Za-z][A-Za-z0-9 ,.'()\-/&]{2,40})"/g),
    // Text node **có biểu thức**: `>All ({c.total})<` — 14 chỗ lọt qua ở đợt 14 vì
    // mẫu `>…<` không khớp khi trong node có `{…}`.
    // Nhãn chứa **ký hiệu**: `Configure →`, `Shop Drawing (REVIEW → APPROVE)`. Mẫu
    // `>…<` trên chỉ nhận `[A-Za-z0-9 ,.'()\-/&]`, nên `→ · ≤ ≥ × … — – « » •` làm nó
    // không khớp ⇒ nhãn Anh cứng lọt. Đo 2026-09-28: 9 chỗ, trong đó `Configure →`.
    ...src.matchAll(/>([A-Za-z][^<>{}]*?[→·≤≥×…—–«»•])</g)]) {
    // Cắt ký tự đuôi trước khi lọc. Nếu không, `Unread (` **khớp** mẫu "một từ"
    // bên dưới (vì `(` nằm trong lớp ký tự được phép) nên nhãn tiếng Anh lọt —
    // đã thử âm tính và bộ đo vẫn xanh, đó là lý do có dòng này.
    // Cắt ký tự đuôi (khoảng trắng, `(`, và ký hiệu `→ · — …`) trước khi lọc. Nếu
    // không, `Configure →` **không** khớp mẫu "từ" bên dưới (vì `→` nằm ngoài lớp ký
    // tự) nên nhãn cứng lọt — đã thử âm tính và bộ đo vẫn xanh, đó là lý do có dòng này.
    const lit = m[1].trim().replace(/[\s(…→·≤≥×—–«»•-]+$/, '');
    if (!lit) continue;
    if (ALLOW[lit]) continue;
    if (VOCAB_OK.has(lit)) continue;
    // 1–3 từ. Mẫu cũ đòi **mỗi** từ sau phải bắt đầu bằng chữ cái nên bỏ sót
    // nhãn có dấu `/` đứng riêng (`Offline / Sync Queue`) — mẫu mới cho phép `/` làm
    // từ đứng riêng. Bỏ số thuần và chữ đơn dài ≤ 3 (mã).
    if (!/^[A-Za-z][A-Za-z0-9'()/&.\-]*(?: [A-Za-z/][A-Za-z0-9'()/&.\-]*){0,3}$/.test(lit)) continue;
    if (lit.length <= 3) continue;
    const line = src.slice(0, m.index).split('\n').length;
    findings.push({ file, line, lit });
  }

  if (SKIP_FILES.has(file)) continue;
  // Nhãn trong **biểu thức JSX**: `{busy ? '...' : 'Approve'}`.
  for (const m of src.matchAll(/\{([^{}]*)\}/g)) {
    const body = m[1];
    // Toán tử ba nhánh là `?` **đơn** (`c ? 'A' : 'B'`), nên mẫu cũ `[?:|]{2}` (tìm
    // `?:` liền nhau) không khớp và bỏ sót đúng những nhãn cần bắt. Phải thử `?`
    // riêng, cộng `||`/`&&`.
    if (!/\?|\|\||&&/.test(body)) continue;
    for (const q of body.matchAll(EXPR_LITERAL)) {
      const lit = q[2].trim();
      if (lit === '...') continue;
      if (ALLOW[lit] || VOCAB_OK.has(lit)) continue;
      // Enum so với API/DB: `PENDING`, `STAGED`, `APPROVED`, `ACTIVE`… giữ nguyên.
      if (lit === lit.toUpperCase() || /^[A-Z][A-Z_]{2,}$/.test(lit)) continue;
      // Chuỗi kỹ thuật: `M2 14h12` (đường dẫn SVG), `X-Cache` (tên header HTTP).
      if (/^M[\d\s.,hvz-]+/.test(lit) || /^[A-Z]-[A-Z]/.test(lit)) continue;
      if (/[àáảãạăâêôơưđĐ]/i.test(lit)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      findings.push({ file, line, lit });
    }
  }

  // Nhãn trong **object cấp module**: `{ key: 'vendors', label: 'Vendors (NCC)' }`.
  //
  // Đây là bài học đã ghi trong AGENTS.md về `t()` ở cấp module (nhãn đóng băng), ở
  // dạng tệ hơn: ở `MasterDataList.jsx` nhãn **không** gọi `t()` mà là chuỗi Anh thẳng
  // ⇒ cả hai ngôn ngữ đều hiện tiếng Anh. Không nằm trong `{…}` JSX nên hai vòng quét
  // trên không thấy. Sửa đúng cách là biến `label` thành hàm `() => t('khoá')`.
  for (const m of src.matchAll(/\b(?:label|title|name|placeholder)\s*:\s*(['"])([A-Z][A-Za-z0-9 ()%./&'-]{2,30})\1/g)) {
    const lit = m[2].trim();
    if (lit === '...') continue;
    if (ALLOW[lit] || VOCAB_OK.has(lit)) continue;
    if (lit === lit.toUpperCase() || /^[A-Z][A-Z_]{2,}$/.test(lit)) continue;
    if (/^M[\d\s.,hvz-]+/.test(lit) || /^[A-Z]-[A-Z]/.test(lit)) continue;
    if (/[àáảãạăâêôơưđĐ]/i.test(lit)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    findings.push({ file, line, lit });
  }
}

if (findings.length) {
  console.log(`  ✗ ${findings.length} nhãn tiếng Anh cứng trong JSX (bộ đo i18n không thấy vì không có dấu tiếng Việt):`);
  for (const f of findings) console.log(`     ${f.file}:${f.line}  "${f.lit}"`);
  console.log('\n     Sửa: bọc bằng `t(\'khoá\')` rồi thêm bản dịch VI + EN vào `frontend/src/i18n/{vi,en}.js`.');
  console.log('     Nếu là mã/định danh không dịch được, thêm vào ALLOW kèm lý do.');
  process.exit(1);
}
console.log('  ✓ không có nhãn tiếng Anh cứng trong JSX');
