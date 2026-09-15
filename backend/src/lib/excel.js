// Excel helpers - normalize cells
import XLSX from 'xlsx';

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
  const wb = XLSX.readFile(filePath, { cellDates: true, cellNF: false, cellText: false });
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

// Try to detect doc_type from filename
// Order matters: more specific patterns first
// Normalize whitespace and underscores before matching
export function detectDocType(filename) {
  // Replace underscores with spaces, collapse whitespace, strip diacritics for matching
  const f = filename.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const fNoDiacritics = f.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // AR (phải thu) BEFORE generic payment: these files have their own ingestor.
  // Matches norm() diacritic-stripped style via fNoDiacritics for safety.
  if (fNoDiacritics.includes('bai tram') || f.includes('mpm') || f.includes('hstt') || f.includes('ipc') || f.includes('phải thu') || f.includes('phai thu') || f.includes('công nợ') || f.includes('cong no')) return 'payment_ar';

  // Payment progress FIRST (before generic "tiến độ" match)
  if (f.includes('thanh toán') || f.includes('thanh toan') || f.includes('payment') || f.includes('hstt')) return 'payment_progress';

  // Business process / subcontractor
  if (f.includes('quy trình thực hiện') || f.includes('quy trinh thuc hien')) return 'business_process';
  if (f.includes('thầu phụ') || f.includes('thau phu') || f.includes('tổ đội') || f.includes('to doi')) return 'subcontractor_directory';

  // Reference shapes BEFORE generic content matches (bulk folder classifier agrees:
  // SƠ ĐỒ CÂY is work_breakdown even though the name contains "tiến độ").
  if (f.includes('sơ đồ cây') || fNoDiacritics.includes('so do cay')) return 'work_breakdown';

  // Shop / material / construction
  if (f.includes('shop ') || f.startsWith('shop')) return 'shop_drawing';
  // Doc-code infixes (bulk folder classifier resolves the same types from folders)
  if (/shd-/i.test(f)) return 'shop_drawing';
  if (/csp-/i.test(f)) return 'construction_schedule';
  if (/msa/i.test(f)) return 'material_supply';
  // Material: match "vat tu" in either diacritic or non-diacritic form
  if (f.includes('vật tư') || f.includes('vat tu') || fNoDiacritics.includes('vat tu')) return 'material_supply';
  if (f.includes('tđ ') || f.includes('td ') || f.includes('tiến độ') || f.includes('tiendo') || fNoDiacritics.includes('tien do')) return 'construction_schedule';

  // Daily report
  if (f.includes('báo cáo công việc') || f.includes('bao cao cong viec') || f.includes('daily')) return 'daily_report';

  // RFA / Material master
  if (f.includes('mcr-mm') || f.includes('rfa') || f.includes('rfa-submission')) return 'rfa_log';
  if (f.includes('mcr-mpm') || f.includes('mpm')) return 'manpower_master_plan';

  // Shop master / work management
  if (f.includes('bte-mshop') || f.includes('mshop')) return 'shop_master';
  if (f.includes('bte-wm') || f.includes('wm-01')) return 'work_management';

  // Other
  if (f.includes('sơ đồ') && f.includes('khu vực')) return 'zone_map';
  if (f.includes('sơ đồ cây') || f.includes('cây')) return 'work_breakdown';
  if (f.includes('file start')) return 'file_index';
  if (f.includes('nguồn lực') || f.includes('nguon luc') || f.includes('tài nguyên')) return 'resource_directory';
  // DUYỆT KHÁC folder classifies bulk as rfa_log — single-file agrees (was other_approved dead-end).
  if (f.includes('duyệt khác') || f.includes('duyet khac')) return 'rfa_log';
  return 'unknown';
}
