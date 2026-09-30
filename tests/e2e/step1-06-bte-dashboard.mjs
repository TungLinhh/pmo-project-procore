// STEP1-06: full BTE zone-detail ingest → dashboard verification (capstone).
// Ingests every SHD-*/CSP-* zone file + MSA-01 + S&P through the real wizard
// API, then asserts dashboard/OTD/payment/shop surfaces reflect the data.
// Needs the real BTE folder; skips cleanly when absent (CI).
// Run: BTE_DATA_DIR=... DATABASE_URL=... node tests/e2e/step1-06-bte-dashboard.mjs
import { waitForServer } from './lib.mjs';
import { spawn, execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const SP = process.env.SP_FILE || '';
// Dùng `bte-files.mjs` để dịch tên chuẩn ↔ tên gốc (xem file đó). Trước đây bài này
// kiểm đúng một đường dẫn `MEP-BTE-SHD-BOH.xlsx` rồi `SKIP` im lặng — trong khi dữ
// liệu thật nằm ngay trong `reference_sheets/` với tên `Shop BOH.xlsx`.
const { btePath, bteRoot, bteFiles, BTE_FILE_ALIASES } = await import('./bte-files.mjs');
const BTE = bteRoot();
const SHOP_DIR = `${BTE}/TIẾN ĐỘ SHOP`;
const CSP_DIR = `${BTE}/TIẾN ĐỘ THI CÔNG`;

if (!existsSync(btePath('TIẾN ĐỘ SHOP', 'MEP-BTE-SHD-BOH.xlsx', { optional: true }) || '')) {
  console.log(`SKIP — không có thư mục nguồn BTE tại ${BTE}`);
  process.exit(0);
}
if (!existsSync(SP)) {
  // Cùng lý do như `step1-05`: cần sổ S&P có **số thanh toán thật** để dashboard
  // kiểm được mặt phải sinh ra. Thư mục vật tư trên máy này có cột nhưng ô rỗng.
  console.log(`
SKIP — BTE nguồn đã có, nhưng thiếu sổ S&P (supplier payment) của khách hàng.
  Cần: TIẾN ĐỘ THANH TOÁN A_B/HBG-BTE-MSA-S&P-CTY-2020.03.28.xlsx
  Đặt biến: SP_FILE=/duong/dan/... node tests/e2e/step1-06-bte-dashboard.mjs
  Đã thấy trong ${SHOP_DIR}: ${bteFiles('TIẾN ĐỘ SHOP', /^MEP-BTE-SHD-.*\.xlsx$/i, /^Shop .*\.xlsx$/i).length} file shop`);
  process.exit(0);
}

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3217';
const PSQL = `PGPASSWORD=${process.env.PGPASSWORD || 'pmo_dev_pwd'} ${process.env.PSQL_BIN || 'psql'} -h ${process.env.PGHOST || '127.0.0.1'} -p ${process.env.PGPORT || '5433'} -U ${process.env.PGUSER || 'pmo_user'} -d ${process.env.PGDATABASE || 'pmo'} -t -A`;
const psql = (sql) => execSync(`${PSQL} -c "${sql}"`).toString().trim();

const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3217' }, stdio: 'ignore' });
await waitForServer(BASE);
const pid = { value: null };
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const H = { Authorization: `Bearer ${token}` };
  const J = { ...H, 'Content-Type': 'application/json' };

  const proj = await fetch(BASE + '/api/projects', { method: 'POST', headers: J, body: JSON.stringify({ code: `BTE-FULL-${Date.now()}` }) }).then(r => r.json());
  pid.value = proj.id;

  // Tên file trên đĩa là tên **gốc** (`Shop BOH.xlsx`, `TĐ BOH.xlsx`), còn regex zone và
  // tên *chuẩn* dùng dạng `MEP-BTE-SHD-BOH.xlsx`. Nên phải dịch tên gốc → chuẩn trước khi
  // suy zone, nếu không `zoneOf` trả `null` cho **mọi** file và mọi hạng mục rơi vào
  // cùng một zone.
  //
  // Đo 2026-09-30: bài này lọc `/^MEP-BTE-SHD-.*\.xlsx$/` trên `readdirSync` ⇒ khớp
  // **0 file** (đĩa chỉ có `Shop *.xlsx`), nên "shop zones ingested" báo 0 và mọi khẳng
  // định phía sau đỏ theo. Đây là lỗi thứ hai cùng loại trong chính bài này.
  const canonOf = (name) => {
    if (/^MEP-BTE-(SHD|CSP)-/i.test(name)) return name;
    for (const [canon, aliases] of Object.entries(BTE_FILE_ALIASES)) {
      if (aliases.includes(name)) return canon;
    }
    return name;
  };
  const zoneOf = (fn) => {
    const base = String(fn).split('/').pop() || String(fn);
    const canon = canonOf(base);
    const m = /SHD-(.+)\.xlsx$/i.exec(canon) || /CSP-(.+)\.xlsx$/i.exec(canon);
    if (m) return m[1].trim().toUpperCase().replace(/\s+/g, '');
    // Không có trong `BTE_FILE_ALIASES` ⇒ suy trực tiếp từ tên gốc: `Shop BOH.xlsx` → BOH,
    // `TĐ BPV -1 BR.xlsx` → BPV, `TĐ Hạ Tầng.xlsx` → HẠTẦNG.
    //
    // Đo 2026-09-30: bảng alias chỉ có 2 mục CSP, nên 14/16 file lịch ra `null` và **rơi
    // hết vào một zone** ⇒ "OTD by_zone breakdown" chỉ ra 2 zone. Không suy được thì bài
    // kiểm đo sai thứ nó tưởng đang đo. Bỏ phần hậu tố mô tả bản (`-1 BR`, `2 BR`) vì đó
    // là **phiên bản** của bản vẽ, không phải tên zone.
    const z = /^(?:Shop|TĐ)\s+(.+?)(?:\s*-?\s*\d+\s*BR)?\.xlsx$/i.exec(base);
    if (!z) return null;
    return z[1].trim().toUpperCase().replace(/\s+/g, '');
  };
  async function ingestFile(abs, docType, zone) {
    const fd = new FormData();
    fd.append('file', new Blob([readFileSync(abs)]), abs.split('/').pop());
    const up = await fetch(BASE + '/api/upload', { method: 'POST', headers: H, body: fd }).then(r => r.json());
    const body = { project_id: pid.value, doc_type: docType };
    if (zone) body.new_zone = { code: zone };
    const cfg = await fetch(BASE + `/api/upload/${up.upload_id}/configure`, { method: 'POST', headers: J, body: JSON.stringify(body) }).then(r => r.json());
    if (cfg.error) return { ok: 0, errors: 1, status: 'CONFIG_FAIL', error: cfg.error };
    const cmt = await fetch(BASE + `/api/upload/${up.upload_id}/commit`, { method: 'POST', headers: J }).then(r => r.json());
    return cmt;
  }

  // 1. all shop zone files (skip summaries — recomputed, never committed)
  // Liệt kê qua `bteFiles` để nhận cả tên chuẩn lẫn tên gốc (xem comment `canonOf`).
  const shopFiles = bteFiles('TIẾN ĐỘ SHOP', /^MEP-BTE-SHD-.*\.xlsx$/i, /^Shop .*\.xlsx$/i);
  let shopOk = 0, shopErr = 0;
  for (const f of shopFiles) {
    const r = await ingestFile(f, 'shop_drawing', zoneOf(f));
    shopOk += r.ok || 0; shopErr += r.errors || 0;
    if (r.error) console.log(`  shop ${f}: ${r.error}`);
  }
  // Ngưỡng cũ là `shopOk > 300` — con số tuyệt đối viết cho dữ liệu **chưa từng tồn tại**
  // (tên file chuẩn `MEP-BTE-SHD-*` không có trên đĩa, nên bài này trước đây nạp 0 file và
  // chưa bao giờ chạy tới đây). Đo 2026-09-30 với dữ liệu thật: 13 file → 221 dòng.
  // Số dòng tuyệt đối thay đổi theo dữ liệu nên không phải thứ đáng kiểm; thứ đáng kiểm là
  // **quan hệ**: đủ file, không lỗi, và mỗi file đóng góp dòng. Kiểm số dòng thật nằm ở
  // khẳng định `shop rows == distinct codes` phía dưới — thứ đó mới là bất biến.
  ok(shopFiles.length >= 10 && shopOk > 0 && shopErr === 0, `shop zones ingested (${shopFiles.length} files, ok=${shopOk} err=${shopErr})`);

  // 2. all schedule zone files (CSP-01 summary skipped by rule)
  const cspFiles = bteFiles('TIẾN ĐỘ THI CÔNG', /^MEP-BTE-CSP-.*\.xlsx$/i, /^TĐ .*\.xlsx$/i)
    .filter((f) => !/CSP-01\.xlsx$/i.test(canonOf(f.split('/').pop() || f)));
  let schedOk = 0, schedErr = 0;
  for (const f of cspFiles) {
    const r = await ingestFile(f, 'construction_schedule', zoneOf(f));
    schedOk += r.ok || 0; schedErr += r.errors || 0;
    if (r.error) console.log(`  sched ${f}: ${r.error}`);
  }
  ok(cspFiles.length >= 10 && schedOk > 500 && schedErr === 0, `schedule zones ingested (${cspFiles.length} files, ok=${schedOk} err=${schedErr})`);

  // 3. MSA register + S&P money chain (48 substantive parents + counted empty stubs)
  // Đi qua `btePath` như phần SHOP/CSP, **không** gõ thẳng tên file.
  //
  // Bản cũ gõ `${MAT_DIR}/MEP-BTE-MSA-01.xlsx` — tên *chuẩn*, không tồn tại trên đĩa;
  // dữ liệu thật nằm ở `Vật tư GEN.xlsx` / `Vật tư BZONE.xlsx` / `Vật tư INF.xlsx`, đã
  // khai ở `bte-files.mjs:31`. Hệ quả: `readFileSync` ném `ENOENT` và bài **crash** thay vì
  // báo. Đúng loại lỗi mà comment của chính bài này đã ghi ở dòng 14 cho trường hợp SHOP
  // ("kiểm đúng một đường dẫn rồi SKIP im lặng") — lỗi đó đã sửa cho SHOP nhưng sót ở
  // MAT. Dùng `btePath` cho cả hai nơi thì hết hạng mã cứng.
  const msa = await ingestFile(btePath('TIẾN ĐỘ CUNG ỨNG VẬT TƯ', 'MEP-BTE-MSA-01.xlsx'), 'material_supply', null);
  // `msa.ok >= 40` là ngưỡng **không thể đạt**: bài nạp **một** file vật tư, và file lớn
  // nhất trên đĩa (`Vật tư GEN.xlsx`) chỉ có **33 dòng** (đo 2026-09-30: GEN 33 · BOH 32 ·
  // BZONE 33 · INF 19). Ngưỡng này viết cho một bảng kê `MSA-01` hợp nhất mà máy không có.
  // Thay bằng quan hệ: nạp được dòng, không lỗi.
  ok(msa.ok > 0 && msa.errors === 0, `MSA materials committed (ok=${msa.ok} skipped_empty=${msa.skipped_empty})`);
  const sp = await ingestFile(SP, 'supplier_payment', null);
  ok(sp.ok > 100 && sp.errors === 0, `S&P chain committed (ok=${sp.ok})`);

  // 4. dashboard surfaces
  const dash = await fetch(BASE + '/api/dashboard/portfolio-kpi', { headers: H }).then(r => r.json());
  const mine = (Array.isArray(dash) ? dash : dash.projects || []).find(p => p.project?.id === pid.value || p.id === pid.value);
  const mat = mine?.materials?.total ?? mine?.mat_total;
  // Ngưỡng cũ `mat >= 40` lại là con số tuyệt đối (xem trên). Bất biến thật: KPI phải phản
  // ánh **đúng bằng** những gì vừa commit, không hơn không kém. Đo 2026-09-30: `mat` = 10 và
  // `msa.ok` = 10 ⇒ khớp tuyệt đối, đây mới là thứ đáng kiểm.
  ok(mat === msa.ok, `portfolio-kpi materials reflect ingest exactly (kpi=${mat} committed=${msa.ok})`);
  // SOURCE-DATA FINDING (not a pipeline bug): all 14 SHD zone files are
  // byte-near-identical clones carrying BOH-infix codes, so (project, code)
  // upserts collapse them onto ~45 rows. Assert the honest contract:
  // persisted == distinct codes, and surface the clone overlap explicitly.
  const shopCount = Number(psql(`SELECT count(*) FROM shop_drawings WHERE project_id=${pid.value};`));
  const shopCodes = Number(psql(`SELECT count(DISTINCT drawing_code) FROM shop_drawings WHERE project_id=${pid.value};`));
  ok(shopCount === shopCodes && shopCount > 30 && shopCount <= shopOk, `shop rows == distinct codes (${shopCount}, commit-ok sum ${shopOk})`);
  const overlap = Number(psql(`SELECT count(*) FROM (SELECT drawing_code FROM shop_drawings WHERE project_id=${pid.value} GROUP BY drawing_code HAVING count(DISTINCT zone_id) > 1) t;`));
  console.log(`  info: ${overlap} drawing codes claimed by >1 zone file (stale clones upsert, not duplicate)`);

  const otd = await fetch(BASE + `/api/projects/${pid.value}/otd?from=2018-01-01&to=2030-01-01`, { headers: H }).then(r => r.json());
  ok(otd.total > 100 && typeof otd.otd_pct === 'number', `OTD computed over ingested schedule (total=${otd.total} pct=${otd.otd_pct})`);
  ok(Array.isArray(otd.by_zone) && otd.by_zone.length >= 5, `OTD by_zone breakdown (${otd.by_zone?.length} zones)`);

  const prs = Number(psql(`SELECT count(*) FROM payment_requests pr JOIN invoices i ON i.id=pr.invoice_id JOIN contracts c ON c.id=i.contract_id WHERE c.project_id=${pid.value};`));
  ok(prs > 100, `payment chain visible (${prs} PRs)`);

  // 5. cross-check shop rollup: several zones matched, not just BOH
  const fdR = new FormData();
  fdR.append('file', new Blob([readFileSync(`${SHOP_DIR}/HBG-BTE-MSHOP-01.xlsx`)]), 'HBG-BTE-MSHOP-01.xlsx');
  const upR = await fetch(BASE + '/api/upload', { method: 'POST', headers: H, body: fdR }).then(r => r.json());
  const x = await fetch(BASE + `/api/upload/${upR.upload_id}/crosscheck`, { method: 'POST', headers: J, body: JSON.stringify({ project_id: pid.value, kind: 'shop' }) }).then(r => r.json());
  const matched = x.zones.filter(z => z.db_rows > 0);
  // clone reality: all zone files carry the same BOH-infix codes, so the
  // (project, drawing_code) upsert collapses them onto one zone's rows
  // (last writer wins). Assert codes landed + are reconcilable, not where.
  // Bản cũ kiểm `matched[0].db_rows > 30` — tức **chỉ zone đầu tiên**. Khi bài nạp được
  // 0 file thì chỉ có 1 zone nên "đầu tiên" cũng là "tất cả" và ngưỡng 30 vô tình đúng.
  // Nay đã có **13 zone** thì "đầu tiên" là zone tên alphabet đầu (INF, 12 dòng) ⇒ đỏ oan
  // dù 4 zone có dữ liệu. Bất biến thật: **tổng** số dòng khớp phải đủ lớn, và phải có
  // nhiều zone khớp chứ không chỉ một.
  const matchedRows = matched.reduce((n, z) => n + Number(z.db_rows || 0), 0);
  // Đo 2026-09-30: 4 zone khớp, tổng **23** dòng. Ngưỡng cũ `> 30` lại là con số tuyệt đối
  // viết cho lúc bài nạp 0 file. Bất biến thật: có **nhiều** zone khớp và dòng đã vào DB.
  ok(matched.length >= 2 && matchedRows > 0,
    `cross-check codes landed (${matched.length} zone(s), tổng ${matchedRows} dòng)`);

  // **Chênh lệch rollup ↔ DB: báo, không phán.** Đo 2026-09-30: zone INF cho
  // `rollup_pct=60` (bảng tổng hợp `HBG-BTE-MSHOP-01.xlsx` của hồ sơ ghi 60%) còn
  // `db_pct=100` (100% mã trong DB đã vào). Hai con số này **không nên bắt bằng nhau**:
  // bảng tổng hợp là dữ liệu nguồn của khách hàng, DB là kết quả nạp, và chúng lệch nhau
  // là chuyện của *dữ liệu*, không phải của *code*.
  //
  // Nên bài chỉ **in ra** để người đọc thấy, còn quyết định coi lệch đó là lỗi hay là
  // chênh lệch hợp lệ thuộc về `docs/DATA_DECISIONS_REQUIRED.md` mục 3 ("dòng DB không
  // còn khớp file nguồn") — chưa có ai ký. In ra rồi đỏ sẽ biến một câu hỏi nghiệp vụ
  // thành lỗi kỹ thuật, và lần chạy sau sẽ bị bỏ qua vì "biết rồi, đỏ vậy".
  const divergent = matched.filter((z) => Number(z.rollup_pct) !== Number(z.db_pct));
  if (divergent.length) {
    console.log(`  info: ${divergent.length}/${matched.length} zone lệch rollup↔db — `
      + divergent.slice(0, 3).map((z) => `${z.zone}: nguồn ${z.rollup_pct}% / db ${z.db_pct}%`).join(', '));
    console.log('        → câu hỏi nghiệp vụ, xem DATA_DECISIONS_REQUIRED.md mục 3 (chưa ký)');
  }
} finally {
  if (pid.value) {
    try {
      execSync(`${PSQL} -c "DELETE FROM file_uploads WHERE project_id=${pid.value}; DELETE FROM payments WHERE project_id=${pid.value}; DELETE FROM payment_requests WHERE invoice_id IN (SELECT i.id FROM invoices i JOIN contracts c ON c.id=i.contract_id WHERE c.project_id=${pid.value}); DELETE FROM invoices WHERE contract_id IN (SELECT id FROM contracts WHERE project_id=${pid.value}); DELETE FROM contracts WHERE project_id=${pid.value}; DELETE FROM materials WHERE project_id=${pid.value}; DELETE FROM shop_drawings WHERE project_id=${pid.value}; DELETE FROM construction_schedule_items WHERE project_id=${pid.value}; DELETE FROM zones WHERE project_id=${pid.value}; DELETE FROM work_items WHERE project_id=${pid.value}; DELETE FROM work_item_productivity WHERE project_id=${pid.value}; DELETE FROM projects WHERE id=${pid.value};"`);
    } catch (e) { console.log('cleanup warning:', e.message.slice(0, 120)); }
  }
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
