// Excel helpers - normalize cells
// P2-9: xlsx loads via needSync so a missing dep throws an actionable 503 at
// first use instead of crashing backend boot (static import would fail load).
import { needSync } from './optional-dep.js';
import { readFileSync } from 'node:fs';
const XLSX = needSync('xlsx');

export function readWorkbook(filePath) {
  const buffer = readFileSync(filePath);
  return XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: false, cellText: false });
}

export function isError(v) {
  if (v === null || v === undefined) return false;
  if (typeof v !== 'object') return false;
  return v.error === true || typeof v.w === 'string';
}

const EXCEL_ERRORS = new Set(['#N/A', '#REF!', '#DIV/0!', '#VALUE!', '#NAME?', '#NULL!', '#NUM!', '#GETTING_DATA']);

export function normalizeCell(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && v.error) return null; // #N/A, #REF!
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '' || EXCEL_ERRORS.has(s)) return null;
    return s;
  }
  return v;
}

export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    // Try dd/mm/yyyy
    const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const [, d, mo, y] = m;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return null;
}

export function toFloat(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(',', '.').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  return null;
}

export function toInt(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Math.round(v);
  if (typeof v === 'string') {
    const n = parseInt(v.replace(/[^\d\-]/g, ''), 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

export function toText(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && v.error) return null;
  if (typeof v === 'string') return v.trim() || null;
  return String(v).trim() || null;
}

// Parse bilingual "Foo | Bar" or "Foo / Bar"
export function splitBilingual(v) {
  if (!v) return { vi: null, en: null };
  const text = String(v);
  // Try "|", "/", " - "
  const parts = text.split(/\s*[\|\/\-]\s*/);
  if (parts.length >= 2) {
    return { vi: parts[0].trim() || null, en: parts[1].trim() || null };
  }
  // No separator - try to detect Vietnamese (has diacritics)
  const hasViet = /[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵÀÁẢÃẠẰẮẲẴẶẦẤẨẪẬÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴ]/.test(text);
  if (hasViet) return { vi: text, en: null };
  return { vi: null, en: text };
}

// Renumber ordinals (1, 2, 3, ...) - for STT gaps
export function renumber(items, key = 'ordinal') {
  return items.map((item, idx) => ({ ...item, [key]: idx + 1 }));
}

export function readSheet(filePath, sheetName) {
  const wb = readWorkbook(filePath);
  if (!wb.Sheets[sheetName]) {
    throw new Error(`Sheet "${sheetName}" not found in ${filePath}. Available: ${wb.SheetNames.join(', ')}`);
  }
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });
}

// =====================================================================
// findDataStart(): find the first row of REAL data, skipping headers
// and any leading metadata. Replaces brittle dataStart heuristics
// scattered across ingestors.
// =====================================================================
//
// Usage:
//   const dataStart = findDataStart(rows, {
//     headerKeywords: ['mã hiệu', 'tên', 'stt'],  // Vietnamese/English column headers
//     codeCol: 5,       // column where a unique code/ID should appear
//     nameCol: 6,       // column where a human name should appear
//     maxScan: 40,      // max rows to scan
//   });
//   for (let r = dataStart; r < rows.length; r++) { ... }
//
// Heuristic:
//   1. Scan up to maxScan rows
//   2. Skip rows where codeCol is empty OR nameCol is empty
//   3. Skip rows where codeCol is a header keyword (case-insensitive)
//   4. Skip rows where codeCol doesn't contain a digit (header text rarely has digits)
//   5. Return the first row that passes all filters, OR 0 if none found
// =====================================================================
export function findDataStart(rows, opts = {}) {
  const {
    headerKeywords = ['mã hiệu', 'mã', 'tên', 'name', 'stt', 'tt', 'no', 'no.', 'code', 'reference', 'tham chiếu'],
    codeCol = 0,
    nameCol = 1,
    maxScan = 40,
  } = opts;
  if (!Array.isArray(rows)) return 0;
  for (let i = 0; i < Math.min(maxScan, rows.length); i++) {
    const row = rows[i] || [];
    const code = toText(row[codeCol]);
    const name = toText(row[nameCol]);
    if (!code) continue;
    if (nameCol !== null && nameCol !== undefined && !name) continue;
    const codeLower = code.toLowerCase().trim();
    if (headerKeywords.some(k => codeLower === k || codeLower.includes(k))) continue;
    // Most real data codes have at least one digit
    if (!/\d/.test(code)) continue;
    return i;
  }
  return 0;
}

export function listSheets(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  return wb.SheetNames;
}

// Dạng chuẩn hoá tên file để khớp từ khoá.
//
// Vì sao cần bốn biến thể: chuẩn hoá cũ chỉ thay `_` bằng khoảng trắng, nên dấu gạch
// nối — dấu phân cách phổ biến nhất trong tên file tiếng Việt ngoài đời — không được
// xử lý, còn bảng từ khoá viết dạng có khoảng trắng. Đo 2026-09-28 trên 20 tên file
// thật: `tien-do.xlsx`, `ban-ve-shop.xlsx`, `vat-tu-thang9.xlsx`,
// `bao-cao-thanh-toan.xlsx` đều ra `unknown` trong khi thông điệp lỗi của chính
// `POST /api/upload` bảo người dùng đặt tên theo đúng các từ khoá đó.
export function normalizeFileName(filename) {
  const lower = String(filename || '').toLowerCase();
  // Mọi dấu phân cách thành khoảng trắng, gộp khoảng trắng về một.
  const spaced = lower
    .replace(/[_\-.,+()[\]{}#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // `đ`/`Đ` là chữ riêng, KHÔNG tách theo NFD nên `normalize` không bỏ được —
  // phải thay tay. Không có dòng này, mọi tên gõ nửa dấu (`tien độ`, `vật tu`
  // bị gõ thiếu dấu ở chữ nào đó) không bao giờ khớp từ khoá bỏ dấu.
  const strip = (v) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  return {
    // Như cũ: chỉ `_` → khoảng trắng. Giữ lại để các mẫu có dấu gạch nối
    // (`bte-wm`, `wm-01`, `mcr-mm`, `shd-`) vẫn khớp đúng như trước.
    f: lower.replace(/_/g, ' ').replace(/\s+/g, ' ').trim(),
    // Tất cả dấu phân cách → khoảng trắng: `tien-do` → `tien do`.
    g: spaced,
    // Như `g` nhưng bỏ dấu: `vật tư` → `vat tu`.
    t: strip(spaced),
    // Bỏ cả khoảng trắng, giữ dấu: `TienDo` → `tiendo`.
    u: lower.replace(/\s+/g, ''),
  };
}

// Try to detect doc_type from filename
// Order matters: more specific patterns first
export function detectDocType(filename) {
  const { f, g, t, u } = normalizeFileName(filename);
  const fNoDiacritics = t;
  // Khớp mẫu trên **mọi** biến thể. Dùng cho từ khoá viết bằng chữ; mẫu có dấu
  // gạch nối (`bte-wm`, `wm-01`, `shd-`) thì tra thẳng trên `f` như cũ.
  const has = (...pats) => pats.some((pat) => f.includes(pat) || g.includes(pat) || t.includes(pat) || u.includes(pat));

  // AR (phải thu) BEFORE generic payment: these files have their own ingestor.
  // Matches norm() diacritic-stripped style via fNoDiacritics for safety.
  if (has('bai tram', 'mpm', 'hstt', 'ipc', 'phải thu', 'phai thu', 'công nợ', 'cong no')) return 'payment_ar';

  // Payment progress FIRST (before generic "tiến độ" match)
  if (has('thanh toán', 'thanh toan', 'payment', 'hstt')) return 'payment_progress';

  // Business process / subcontractor
  if (has('quy trình thực hiện', 'quy trinh thuc hien')) return 'business_process';
  if (has('thầu phụ', 'thau phu', 'tổ đội', 'to doi')) return 'subcontractor_directory';

  // Reference shapes BEFORE generic content matches (bulk folder classifier agrees:
  // SƠ ĐỒ CÂY is work_breakdown even though the name contains "tiến độ").
  if (has('sơ đồ cây', 'so do cay')) return 'work_breakdown';

  // Shop / material / construction
  // Trước luật `shop ` chung: `bte-mshop-01` hoá ra là `bte mshop 01` ở biến thể
  // `g`, tức chứa `shop ` — nếu luật chung đứng trước thì file shop master ra
  // `shop_drawing` (đã xảy ra ở đợt 15 khi thêm biến thể `g`).
  if (has('bte-mshop', 'mshop')) return 'shop_master';
  if (has('bte-wm', 'wm-01')) return 'work_management';

  // Doc-code infixes (bulk folder classifier resolves the same types from folders)
  if (/shd-/i.test(f)) return 'shop_drawing';
  if (/csp-/i.test(f)) return 'construction_schedule';
  if (/msa/i.test(f)) return 'material_supply';
  // `shop` chỉ khớp khi đứng **đầu** tên (sau khi bỏ tiền tố mã dự án) — không khớp ở
  // giữa/cuối. Bản cũ dùng `includes('shop ')`, và biến thể `g` biến `BTE-SHOP-01` thành
  // `bte shop 01` nên `shop ` khớp, kéo theo **che mất** `csp-`/`shd-` đứng sau nó
  // (`BTE-SHOP-CSP-01` ra `shop_drawing` thay vì `construction_schedule`).
  if (/^shop/.test(u) || /shop(drawing|bangve)?\d/.test(u)) return 'shop_drawing';
  // `<mã dự án>-SHOP…`: mã dự án BTE có tiền tố `SHOP` nên tên như
  // `BTE-WP4-SHOP.xlsx` hay `BTE-SHOP-01.xlsx` ra `unknown` ở bản cũ. Khớp khi
  // `shop` đứng sau một đoạn mã dự án (trước đó đã phải là `shd-`/`csp-`/`msa` thì
  // không tới được đây — chúng đứng trước).
  if (/^[a-z0-9]+-wp\d*\d?-.?shop/.test(f) || /^[a-z0-9]+-shop/.test(f)) return 'shop_drawing';
  // `bản vẽ shop` / `ban-ve-shop`: `shop` ở **cuối** tên. Trước khi siết luật trên,
  // dạng này ra `unknown` vì `includes('shop ')` cần khoảng trắng phía sau mà `shop`
  // lại ở cuối tên. Bắt bằng dạng không dấu `ban ve … shop` / `banve … shop`.
  // Bỏ **cả** khoảng trắng, nên `bản vẽ shop.xlsx` → `banveshopxlsx`; mẫu cũ giữ
  // khoảng trắng nên không khớp (đo được: vẫn ra `unknown`).
  if (/^banve.*shop/.test(t.replace(/\s+/g, '')) || /^banve.*shop/.test(u.replace(/\s+/g, ''))) return 'shop_drawing';
  // Material: match "vat tu" in either diacritic or non-diacritic form
  if (has('vật tư', 'vat tu')) return 'material_supply';
  if (has('tđ ', 'td ', 'tiến độ', 'tiendo', 'tien do', 'khoang cach', 'khoảng cách')) return 'construction_schedule';

  // Daily report


  // RFA / Material master
  if (has('mcr-mm', 'rfa', 'rfa-submission')) return 'rfa_log';
  if (has('mcr-mpm', 'mpm')) return 'manpower_master_plan';

  // `resource_directory` phải thử TRƯỚC lưới `báo cáo` chung: bản cũ để `báo cáo tài
  // nguyên` khớp `daily_report` vì luật daily đứng trước.
  if (has('nguồn lực', 'nguon luc', 'tài nguyên')) return 'resource_directory';
  if (has('báo cáo công việc', 'bao cao cong viec', 'báo cáo ngày', 'bao cao ngay', 'bao cao', 'bao cáo', 'daily')) return 'daily_report';
  // Shop master / work management

  // Other
  if (has('sơ đồ') && has('khu vực')) return 'zone_map';
  if (has('sơ đồ cây', 'cây')) return 'work_breakdown';
  if (has('file start')) return 'file_index';
  // DUYỆT KHÁC folder classifies bulk as rfa_log — single-file agrees (was other_approved dead-end).
  if (has('duyệt khác', 'duyet khac')) return 'rfa_log';
  return 'unknown';
}
