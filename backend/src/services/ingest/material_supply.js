// Ingestion: Material registers (BTE MSA-01, MCR MSA-01, standalone S&P).
// PG-only. Mô hình A wizard: parse() returns rows, commit() inserts them.
//
// Grain: ONE item per Reference (parent row carries A–I, follower rows carry
// delivery batches J–Q). Batches fold into the numbered request/delivery
// columns (1–4) + notes overflow. Header band located by text; parent rows
// detected by code-shaped Reference (digits required — category labels skip).
import { getDb } from '../../db/index.js';
import { recordFailure } from './failures.js';
import { readSheet, toText, toInt, toDate } from '../../lib/excel.js';
import { findOrCreateZone } from './index.js';
import { norm } from '../../lib/classify.js';

function resolveZone(zoneCode) {
  if (!zoneCode) return { code: 'GEN-MAT', name: 'Material Supply - General' };
  return { code: zoneCode, name: zoneCode };
}

// Header band: tier-1 (No/Reference/Description/Contract/Brand/Origin/
// Supplier/Contact/Status/RequestNo/Batch/Delivery/Acceptance/Owner/Remark)
// + tier-2 delivery dates under the Delivery group.
export function locateMaterialHeader(rows, maxScan = 40) {
  const N = (v) => norm(v);
  for (let r = 0; r < Math.min(maxScan, rows.length); r++) {
    const row = rows[r] || [];
    const texts = row.map(N);
    const refCol = texts.findIndex(t => /reference|tham chieu|ma hieu|ma vat tu/.test(t));
    if (refCol < 0) continue;
    const descCol = texts.findIndex(t => /description|dien giai|ten vat tu|ten hang/.test(t));
    if (descCol < 0) continue;
    const band = [row];
    for (let k = 1; k <= 2 && r + k < rows.length; k++) band.push(rows[r + k] || []);
    const at = (rr, c) => N((band[rr] || [])[c]);
    const findCol = (re, fromCol = 0) => {
      for (let rr = 0; rr < band.length; rr++) {
        const brow = band[rr] || [];
        for (let c = fromCol; c < brow.length + 20; c++) {
          if (re.test(at(rr, c))) return c;
        }
      }
      return null;
    };
    const deliveryAnchor = findCol(/thoi gian giao|delivery time|giao hang/);
    const map = {
      headerRow: r,
      refCol, descCol,
      contractCol: findCol(/so hd|contract no|hop dong/),
      brandCol: findCol(/brand|nhan hieu|hang/),
      originCol: findCol(/c\/o|xuat xu|origin|made in/),
      supplierCol: findCol(/supplier|nha cung cap|ncc/),
      contactCol: findCol(/contact|thong tin lien|lien he/),
      statusCol: findCol(/^status|tinh trang$/),
      requestNoCol: findCol(/yeu cau.*so|request no|ycvt/),
      batchCol: findCol(/lan.*ve|lan giao|batch|dot/),
      reqDateCol: findCol(/ngay yeu|site request|request date/, deliveryAnchor ?? 0),
      leadDaysCol: findCol(/thoi gian.*ngay|lead|duration/, deliveryAnchor ?? 0),
      contractDateCol: findCol(/ngay ki hd|contract date|ngay ky/, deliveryAnchor ?? 0),
      releaseCol: findCol(/thong bao xuat|ex-stock|release|notice/, deliveryAnchor ?? 0),
      etaCol: findCol(/ngay du kien|eta|etd|du kien.*ve/, deliveryAnchor ?? 0),
      actualCol: findCol(/ngay thuc te|actual|ngay ve/, deliveryAnchor ?? 0),
      acceptCol: findCol(/nghiem thu|acceptance|accept/),
      ownerCol: findCol(/nguoi thuc hien|owner|pic|phu trach/),
      remarkCol: findCol(/ghi chu|remark|note/),
    };
    let bandEnd = r;
    for (let rr = 0; rr < band.length; rr++) {
      const cells = (band[rr] || []).map(N).join(' ');
      if (/reference|description|delivery|thoi gian|ngay yeu|ngay du kien|nghiem thu|ghi chu|status|supplier|brand/.test(cells)) bandEnd = r + rr;
    }
    map.dataStart = bandEnd + 1;
    return map;
  }
  return null;
}

function parseBatch(row, map) {
  return {
    request_no: map.requestNoCol != null ? toText(row[map.requestNoCol]) : null,
    batch: map.batchCol != null ? toInt(row[map.batchCol]) : null,
    request_date: map.reqDateCol != null ? toDate(row[map.reqDateCol]) : null,
    lead_days: map.leadDaysCol != null ? toInt(row[map.leadDaysCol]) : null,
    contract_date: map.contractDateCol != null ? toDate(row[map.contractDateCol]) : null,
    release_date: map.releaseCol != null ? toDate(row[map.releaseCol]) : null,
    eta: map.etaCol != null ? toDate(row[map.etaCol]) : null,
    actual: map.actualCol != null ? toDate(row[map.actualCol]) : null,
  };
}

function parseParent(row, map) {
  const refRaw = toText(row[map.refCol]);
  if (!refRaw || !/\d/.test(refRaw)) return null;
  // Reference cells are multi-line: first line is the code, rest is the system
  const ref = refRaw.split(/\r?\n/)[0].trim();
  if (!/\d/.test(ref)) return null;
  const description = map.descCol != null ? toText(row[map.descCol]) : null;
  const brand = map.brandCol != null ? toText(row[map.brandCol]) : null;
  const supplier = map.supplierCol != null ? toText(row[map.supplierCol]) : null;
  const status = map.statusCol != null ? toText(row[map.statusCol]) : null;
  // Stub rows (package slots like 'PP1'/'WWTP-135M3/DAY') carry no description:
  // keep them under their ref code so register coverage stays complete.
  // Fully-empty label rows (ref text only) are skipped but COUNTED.
  if (!description && !brand && !supplier && !status) return 'EMPTY';
  return {
    ref_code: ref,
    description: description || ref,
    is_stub: !description,
    contract_no: map.contractCol != null ? toText(row[map.contractCol]) : null,
    brand: map.brandCol != null ? toText(row[map.brandCol]) : null,
    origin: map.originCol != null ? toText(row[map.originCol]) : null,
    supplier: map.supplierCol != null ? toText(row[map.supplierCol]) : null,
    contact: map.contactCol != null ? toText(row[map.contactCol]) : null,
    status: map.statusCol != null ? toText(row[map.statusCol]) : null,
    acceptance: map.acceptCol != null ? toText(row[map.acceptCol]) : null,
    owner: map.ownerCol != null ? toText(row[map.ownerCol]) : null,
    remark: map.remarkCol != null ? toText(row[map.remarkCol]) : null,
  };
}

export async function parse(filePath, projectId, zoneCode) {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const { code, name } = resolveZone(zoneCode);
  const sheets = [];
  let skippedEmpty = 0;
  for (const sheetName of wb.SheetNames) {
    if (/^(foxz|sheet\d*)$/i.test(sheetName.trim())) continue;
    const rows = readSheet(filePath, sheetName);
    if (rows.length < 5) continue;
    const map = locateMaterialHeader(rows);
    if (!map) continue;
    const items = [];
    let current = null;
    for (let r = map.dataStart; r < rows.length; r++) {
      const row = rows[r] || [];
      const parent = parseParent(row, map);
      if (parent === 'EMPTY') { skippedEmpty++; continue; }
      const batch = parseBatch(row, map);
      const hasBatch = Object.values(batch).some(v => v != null);
      if (parent) {
        current = { rowIndex: r + 1, ...parent, batches: [] };
        items.push(current);
        if (hasBatch) current.batches.push({ rowIndex: r + 1, ...batch });
      } else if (current && hasBatch) {
        current.batches.push({ rowIndex: r + 1, ...batch });
      }
    }
    if (items.length > 0) sheets.push({ sheet: sheetName, rows: items });
  }
  return { zone: { code, name }, sheets, totalRows: sheets.reduce((s, x) => s + x.rows.length, 0), skippedEmpty };
}

export async function commit(parsed, projectId, zoneCode, uploadId = null) {
  const db = getDb();
  const { code } = resolveZone(zoneCode);
  const zone = await findOrCreateZone(projectId, code, code);
  const zoneId = zone.id;

  const report = { doc_type: 'material_supply', zone: code, ok: 0, errors: 0, items: [], skipped_empty: parsed.skippedEmpty || 0 };
  for (const sheet of parsed.sheets) {
    for (const [idx, row] of sheet.rows.entries()) {
      try {
        const delivered = row.batches.filter(b => b.actual != null).length;
        const progress = row.batches.length ? Math.round((delivered / row.batches.length) * 100) / 100 : null;
        const overflow = row.batches.slice(4).map(b =>
          `lot${b.batch ?? '?'}: req=${b.request_no || '-'} eta=${b.eta || '-'} actual=${b.actual || '-'}`
        );
        const notes = [row.remark, row.supplier ? `NCC: ${row.supplier}` : null, row.contract_no ? `HĐ: ${row.contract_no}` : null,
          row.acceptance ? `NT: ${row.acceptance}` : null, ...overflow].filter(Boolean).join(' | ') || null;
        const b = row.batches;
        await db.upsert('materials',
          { conflictCols: ['project_id', 'zone_id', 'material_code'] },
          {
            project_id: projectId, zone_id: zoneId, source_sheet: sheet.sheet, upload_id: uploadId,
            material_code: row.ref_code, name_vi: row.description,
            progress_pct: progress, notes,
            request_date_1: b[0]?.request_date || null, delivery_date_1: b[0]?.actual || null,
            request_date_2: b[1]?.request_date || null, delivery_date_2: b[1]?.actual || null,
            request_date_3: b[2]?.request_date || null, delivery_date_3: b[2]?.actual || null,
            request_date_4: b[3]?.request_date || null, delivery_date_4: b[3]?.actual || null,
          }
        );
        report.ok++;
      } catch (e) {
        recordFailure(report, { sheet: sheet.sheet, row: row.rowIndex ?? idx + 1, ref: row.ref_code, message: e.message, keep: { code: row.ref_code } });
      }
    }
  }
  return report;
}

export async function ingestMaterialSupply(filePath, projectId, zoneCode) {
  const parsed = await parse(filePath, projectId, zoneCode);
  return await commit(parsed, projectId, zoneCode);
}
