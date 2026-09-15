// Folder-then-filename classifier for bulk intake (pure functions + probe).
//
// Priority is deliberate: the 8-folder template is the reliable signal
// (curated by the site team); filenames refine (zone infix, doc codes,
// summary markers); content sniffing (locked? zero-cell?) only decides skips.
// Returns { family, docType, zone, summary, confidence, reason } — never
// writes to domain tables. Review queue confirms before anything commits.
//
// Families: shop | schedule | material | payment_ar | submittal | process |
//           team | resource | reference | unknown
export function norm(s) {
  return String(s || '').toLowerCase().replace(/_/g, ' ').replace(/-/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd') // Đ/đ has no NFD decomposition — map explicitly
    .replace(/\s+/g, ' ').trim();
}

const FOLDER_RULES = [
  { match: ['tien do shop'], family: 'shop', docType: 'shop_drawing' },
  { match: ['tien do thi cong'], family: 'schedule', docType: 'construction_schedule' },
  { match: ['tien do cung ung vat tu'], family: 'material', docType: 'material_supply' },
  { match: ['tien do thanh toan'], family: 'payment_ar', docType: 'payment_ar' },
  { match: ['duyet khac'], family: 'submittal', docType: 'rfa_log' },
  { match: ['quy trinh'], family: 'process', docType: 'business_process' },
  { match: ['tai nguyen', 'nguon luc'], family: 'resource', docType: 'resource_directory' },
  { match: ['so do cay'], family: 'reference', docType: 'work_breakdown' },
];

// Summary rollups are recomputed, never committed as detail rows.
// MSA-01 is a DETAIL register (per-batch rows) — not a rollup despite the -01.
const SUMMARY_RES = [/tong the/, /tđ tong/, /td tong/, /-(mshop|wm)-01(\.|$)/i, /-csp-01(\.|$)/i, /^1\. /];

const ZONE_RES = [
  /shd-([a-z0-9][a-z0-9 &+.-]*?)(?:\.xlsx|$)/i,
  /csp-([a-z0-9][a-z0-9 &+.-]*?)(?:\.xlsx|$)/i,
];

const DOC_FILENAME_RULES = [
  { re: /msa/i, family: 'material', docType: 'material_supply' },
  { re: /mpm|ipc/i, family: 'payment_ar', docType: 'payment_ar' },
  { re: /mds|itp|\both\b/i, family: 'submittal', docType: 'rfa_log' },
  { re: /fl-.*tp|thau phu|to doi/i, family: 'team', docType: 'subcontractor_directory' },
  { re: /file start/i, family: 'reference', docType: 'file_index' },
  { re: /so do/i, family: 'reference', docType: 'zone_map' },
  { re: /quy trinh thuc hien/i, family: 'process', docType: 'business_process' },
  { re: /nguon luc|tai nguyen/i, family: 'resource', docType: 'resource_directory' },
];

export function normalizeZoneCode(raw) {
  if (!raw) return null;
  let z = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (!z) return null;
  // 'LOB&SPA' stays; strip trailing revision-ish/extension leftovers
  z = z.replace(/-REV\d*$/i, '').replace(/-R\d+$/i, '');
  return z || null;
}

export function classifyFile(relativePath, filename) {
  const rel = norm(relativePath);
  const base = filename || String(relativePath || '').split('/').pop();
  const bn = norm(base);
  // Most-specific first: S&P supplier-payment files live in VẬT TƯ folders
  // but must NOT route to the material register parser.
  if (/s\s*&\s*p|supplier.*pay|cong no.*ncc|thanh toan.*ncc/i.test(base)) {
    return { family: 'payment_ap', docType: 'supplier_payment', zone: null, summary: false, confidence: 'high', reason: 'filename S&P/supplier-payment signal' };
  }
  const segments = rel.split('/').slice(0, -1);

  let family = null;
  let docType = null;
  let confidence = null;
  let reason = '';

  for (const rule of FOLDER_RULES) {
    if (rule.match.some(m => segments.some(s => s.includes(m)))) {
      family = rule.family;
      docType = rule.docType;
      confidence = 'high';
      reason = `folder signal (${rule.match.find(m => segments.some(s => s.includes(m)))})`;
      break;
    }
  }

  // QUY TRÌNH refinement: team selection vs process doc
  if (family === 'process' && /fl-.*tp|thau phu|to doi/i.test(base)) {
    family = 'team';
    docType = 'subcontractor_directory';
    reason += ' + filename team signal';
  }

  // filename doc-code refinement (fills gaps when folder missed)
  if (!family) {
    for (const rule of DOC_FILENAME_RULES) {
      if (rule.re.test(base)) {
        family = rule.family;
        docType = rule.docType;
        confidence = 'medium';
        reason = `filename signal (${rule.re})`;
        break;
      }
    }
  } else {
    for (const rule of DOC_FILENAME_RULES) {
      if (rule.re.test(base) && (rule.family !== family || rule.docType !== docType)) {
        reason += `; filename suggests ${rule.family}/${rule.docType} (folder wins)`;
        break;
      }
    }
  }

  // zone infix from filename
  let zone = null;
  for (const re of ZONE_RES) {
    const m = re.exec(base);
    if (m) { zone = normalizeZoneCode(m[1]); break; }
  }

  const summary = SUMMARY_RES.some(re => re.test(bn) || re.test(base));
  // rollups cover all zones — a '-01' infix is a version marker, not a zone
  if (summary) zone = null;
  if (!family) {
    return { family: 'unknown', docType: null, zone, summary: false, confidence: 'none', reason: 'no folder or filename signal' };
  }
  return { family, docType, zone, summary, confidence, reason };
}

// Content probe (needs xlsx read): locked? zero-cell reference?
// Returns { locked, sheets: [{name, cells}], empty } — pure inspection.
export async function probeWorkbook(filePath) {
  const XLSX = (await import('xlsx')).default;
  try {
    const wb = XLSX.readFile(filePath);
    const sheets = (wb.SheetNames || []).map(n => {
      const ws = wb.Sheets[n];
      const ref = ws?.['!ref'];
      let cells = 0;
      if (ref) {
        const m = /:([A-Z]+)(\d+)$/.exec(ref);
        cells = m ? Number(m[2]) : 0;
      }
      return { name: n, cells };
    });
    return { locked: false, sheets, empty: sheets.length > 0 && sheets.every(s => s.cells === 0) };
  } catch (e) {
    if (/password|encrypted|CDFV2/i.test(e.message)) return { locked: true, sheets: [], empty: false };
    throw e;
  }
}
