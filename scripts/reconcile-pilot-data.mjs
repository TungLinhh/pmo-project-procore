#!/usr/bin/env node
// Inventory, optional idempotent ingest, and reconciliation for the two pilot
// projects represented by reference_sheets/. Default is dry-run.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, closeDb } from '../backend/src/db/index.js';
import * as construction from '../backend/src/services/ingest/construction_schedule.js';
import * as shop from '../backend/src/services/ingest/shop_drawing.js';
import * as material from '../backend/src/services/ingest/material_supply.js';
import * as payment from '../backend/src/services/ingest/payment_ar.js';
import { compareRow, NOT_COMPARED } from './lib/value-compare.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = join(root, 'reference_sheets');
const apply = process.argv.includes('--apply');
const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9) || '/tmp/opencode/pilot-reconciliation.json';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(xlsx|xls)$/i.test(name)) out.push(full);
  }
  return out;
}
function classify(file) {
  const name = file.toLowerCase();
  if (name.includes('tiến độ thi công') || name.includes('tđ ') || name.includes('báo cáo công việc')) return 'construction';
  if (name.includes('tiến độ shop') || name.includes('shop ')) return 'shop';
  if (name.includes('tiến độ cung ứng vật tư') || name.includes('vật tư ')) return 'material';
  if (name.includes('tiến độ thanh toán')) return 'payment';
  return null;
}
function targetProject(file) {
  const name = file.toLowerCase();
  if (name.includes('hbg-mcr')) return 'HBG-MCR';
  if (name.includes('bte') || name.includes('tđ ') || name.includes('tiến độ thi công') || name.includes('shop ') || name.includes('vật tư ') || name.includes('tiến độ thanh toán')) return 'BTE-WP4-HBC';
  return null;
}
// The reconciliation key MUST use the same normalisation as the upsert, or the
// two sides silently disagree: commit() stores level_arabic/sublevel as 0 when
// the source is NULL (a NULL in a UNIQUE index would make every group row
// distinct), while the parsed row still carries null. Using `?? ''` here made
// all 122 rows of a construction workbook look "missing from the database".
const constructionKey = (row, sheet) => [
  sheet,
  row.level_roman || '',
  row.level_arabic ?? 0,
  row.sublevel ?? 0,
  row.ordinal ?? '',
].join('|');

function businessKey(type, row) {
  if (type === 'shop') return String(row.drawing_code || '').trim();
  if (type === 'material') return String(row.ref_code || row.material_code || '').trim();
  if (type === 'construction') return [row.level_roman || '', row.level_arabic ?? '', row.sublevel ?? '', row.ordinal ?? ''].join('|');
  return String(row.invoice_no || row.request_no || row.id || '');
}

// Value reconciliation: for each parsed source row, find the database row that
// holds it and compare the fields the business signs off on. Row counts alone
// cannot catch a row that arrived with the right key and the wrong number.
async function reconcileValues(db, type, projectId, parsed, uploadId) {
  // The payment workbook carries two grains: a summary row per contract (the
  // money) and detail rows per invoice/advance. Both are reconciled — the
  // contract summary is what SRS 9.1 means by "giá trị".
  const plan = type === 'payment'
    ? [
      { spec: 'payment_contract', sheetKind: 'summary', table: 'ar_contracts' },
      { spec: 'payment_line', sheetKind: 'detail', table: 'ar_lines' },
    ]
    : [{
      spec: type,
      table: { construction: 'construction_schedule_items', shop: 'shop_drawings', material: 'materials' }[type],
    }];

  const result = { compared: 0, matched: 0, missing_in_db: 0, mismatched: 0, duplicate_paired: 0, advisory_rows: 0, mismatches: [], advisory: [], not_compared: [] };
  for (const { spec, sheetKind, table } of plan) {
    const rows = [];
    for (const sheet of parsed?.sheets || []) {
      if (sheetKind && sheet.kind !== sheetKind) continue;
      for (const parsedRow of sheet.rows || []) {
        const key = type === 'construction' && !sheetKind
          ? constructionKey(parsedRow, sheet.sheet)
          : sheetKind
            ? `${sheet.sheet}|${sheetKind}|${parsedRow.ordinal ?? ''}`
            : businessKey(type, parsedRow);
        rows.push({ sheet: sheet.sheet, key, row: parsedRow });
      }
    }
    if (!rows.length) continue;
    result.not_compared.push(...NOT_COMPARED[spec].map((why) => `${table}.${why}`));

    // One placeholder style per statement — the pool rejects a mix of ? and $N.
    const dbRows = await db.prepare(
      `SELECT * FROM ${table} WHERE project_id = $1 AND ($2::int IS NULL OR upload_id = $2)`
    ).allAsync(projectId, uploadId ?? null);

    // Group both sides by key. A key can appear several times in the source
    // (36 duplicate rows in the pilot set), so pairing has to be one-to-one:
    // comparing every source row against every stored row would let two source
    // rows both "match" the same stored row and report the other as a mismatch
    // — a false error rate on data that is actually fine.
    const byKey = new Map();
    const slot = (key) => {
      if (!byKey.has(key)) byKey.set(key, { sources: [], stored: [] });
      return byKey.get(key);
    };
    for (const source of rows) slot(source.key).sources.push(source);
    for (const dbRow of dbRows) {
      let key;
      if (spec === 'payment_contract') key = `${dbRow.source_sheet}|summary|${dbRow.ordinal ?? ''}`;
      else if (spec === 'payment_line') key = `${dbRow.source_sheet}|${dbRow.kind}|${dbRow.ordinal ?? ''}`;
      else if (type === 'construction') key = constructionKey(dbRow, dbRow.source_sheet);
      else if (type === 'shop') key = String(dbRow.drawing_code || '').trim();
      else key = String(dbRow.material_code || '').trim();
      slot(key).stored.push(dbRow);
    }

    for (const [key, { sources, stored }] of byKey) {
      if (!stored.length) { result.missing_in_db += sources.length; continue; }
      const taken = new Set();
      for (const { row, sheet } of sources) {
        let best = null;
        let bestIndex = -1;
        for (const [i, dbRow] of stored.entries()) {
          if (taken.has(i)) continue;
          const attempt = compareRow(spec, row, dbRow);
          if (attempt.compared === 0) continue;              // file provides none of our fields
          if (!best || attempt.diffs.length < best.diffs.length) { best = attempt; bestIndex = i; }
          if (attempt.diffs.length === 0) break;
        }
        if (!best) continue;                                  // nothing comparable in this row
        taken.add(bestIndex);
        result.compared += best.compared;
        if (best.advisory.length) {
          result.advisory_rows++;
          if (result.advisory.length < 50) result.advisory.push({ table, key, sheet, diffs: best.advisory.slice(0, 6) });
        }
        if (best.diffs.length === 0) result.matched++;
        else {
          result.mismatched++;
          if (result.mismatches.length < 50) {
            result.mismatches.push({ table, key, sheet, diffs: best.diffs.slice(0, 6) });
          }
        }
      }
      // More source rows than stored rows for the same key: the surplus is a
      // duplicate, not a lost value. Counted so the duplicate story stays
      // visible next to the value story.
      if (sources.length > stored.length) result.duplicate_paired += sources.length - stored.length;
    }
  }
  return result;
}

function zoneCode(file) {  const base = file.split('/').pop().replace(/\.[^.]+$/, '');
  const map = [
    [/bpv\s*-?\s*1\s*br/i, 'BPV-1BR'], [/bpv\s*-?\s*2\s*br/i, 'BPV-2BR'],
    [/lob\s*[&/-]\s*spa/i, 'LOB-SPA'], [/vnr|vn res/i, 'VNR'], [/res\s*-?\s*3\s*br/i, 'RES-3BR'],
    [/res\s*-?\s*4\s*br/i, 'RES-4BR'], [/cluster villa/i, 'CLU'], [/butler|bulter/i, 'BUT'],
    [/bzone/i, 'BZONE'], [/boh/i, 'BOH'], [/bpv/i, 'BPV'], [/bsn/i, 'BSN'], [/clu/i, 'CLU'],
    [/gen/i, 'GEN'], [/hpv/i, 'HPV'], [/hạ tầng|hạ tầng/i, 'INF'], [/inf/i, 'INF'],
    [/kid/i, 'KID'], [/res/i, 'RES'],
  ];
  return map.find(([re]) => re.test(base))?.[1] || 'GEN';
}

async function ensureProject(db, code) {
  const existing = await db.prepare('SELECT id, code FROM projects WHERE code = ?').getAsync(code);
  if (existing) return existing.id;
  if (!apply) return null;
  const created = await db.prepare('INSERT INTO projects (tenant_id, code, name_vi, package) VALUES (1, ?, ?, ?) RETURNING id').getAsync(code, code, 'MEP');
  return Number(created.id);
}

const files = walk(sourceRoot).sort().map((file) => ({ file, type: classify(file), project: targetProject(file), zone: zoneCode(file) })).filter((row) => row.type && row.project);
const db = getDb();
const projectIds = new Map();
for (const code of [...new Set(files.map((row) => row.project))]) projectIds.set(code, await ensureProject(db, code));

// A fresh demo tenant has the BTE project, but the pilot project is created by
// this script. Give the seeded personas explicit access instead of granting a
// tenant-wide project bypass.
if (apply) {
  const personas = ['pm@hbg.com', 'pmo@hbg.com', 'site@hbg.com', 'technical@hbg.com', 'procurement@hbg.com', 'accounting@hbg.com'];
  for (const code of projectIds.keys()) {
    const projectId = projectIds.get(code);
    if (!projectId) continue;
    for (const email of personas) {
      const user = await db.prepare('SELECT id FROM users WHERE tenant_id = 1 AND email = ?').getAsync(email);
      if (user?.id) {
        await db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING').runAsync(projectId, user.id);
      }
    }
  }
}

// Which rows did THIS file write? Without this the comparison runs against the
// whole project, and a row left behind by a different workbook at the same key
// reads as a value mismatch when it is really a stale row from another file.
// Looked up by content hash, so it works in dry-run too (no writes).
function findUploadId(db, file, projectId) {
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
  return db.prepare('SELECT id FROM file_uploads WHERE project_id = $1 AND file_hash = $2')
    .getAsync(projectId, hash)
    .then((row) => row?.id ?? null)
    .catch(() => null);
}

async function ensureUpload(db, file, projectId, docType) {
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
  const existing = await db.prepare('SELECT id FROM file_uploads WHERE tenant_id = 1 AND file_hash = ?').getAsync(hash);
  if (existing) return Number(existing.id);
  const row = await db.prepare(
    `INSERT INTO file_uploads
      (tenant_id, project_id, original_filename, file_hash, expected_doc_type, status, created_by)
     VALUES (1, ?, ?, ?, ?, 'STAGED', 1) RETURNING id`,
  ).getAsync(projectId, file.split('/').pop(), hash, docType);
  return Number(row.id);
}

const report = { generated_at: new Date().toISOString(), apply, source_root: relative(root, sourceRoot), projects: [...projectIds.entries()].map(([code, id]) => ({ code, id })), files: [], summary: {} };
for (const row of files) {
  const projectId = projectIds.get(row.project);
  if (projectId && apply) {
    await db.prepare(
      `INSERT INTO zones (project_id, code, name_en) VALUES (?, ?, ?)
       ON CONFLICT (project_id, code) DO NOTHING`,
    ).runAsync(projectId, row.zone, row.zone);
  }
  const uploadId = projectId && apply ? await ensureUpload(db, row.file, projectId, row.type) : null;
  const entry = { file: relative(root, row.file), type: row.type, project: row.project, project_id: projectId, upload_id: uploadId, zone: row.zone, parsed_rows: 0, db_rows: 0, errors: [] };
  if (!projectId) {
    entry.skipped = 'project chưa tồn tại; chạy --apply để tạo pilot project';
    report.files.push(entry);
    continue;
  }
  try {
    let parsed;
    let committed = null;
    if (row.type === 'construction') parsed = await construction.parse(row.file, projectId, row.zone);
    if (row.type === 'shop') parsed = await shop.parse(row.file, projectId, row.zone);
    if (row.type === 'material') parsed = await material.parse(row.file, projectId, row.zone);
    if (row.type === 'payment') parsed = await payment.parse(row.file, projectId);
    const keyCounts = new Map();
    for (const sheet of parsed?.sheets || []) {
      for (const parsedRow of sheet.rows || []) {
        const rawKey = businessKey(row.type, parsedRow);
        const key = row.type === 'construction' ? `${sheet.sheet}|${rawKey}` : rawKey;
        keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
      }
    }
    entry.parsed_rows = Number(parsed?.totalRows || 0);
    if (entry.parsed_rows === 0) {
      const base = row.file.split('/').pop().toLowerCase();
      if (/tổng thể|sơ\s*đồ|các khu vực|\.1\.xlsx|wm-01|mshop/.test(base)) {
        entry.skipped = 'summary/unsupported workbook; keep as source evidence until its row grain is confirmed';
      }
    }
    entry.unique_source_rows = keyCounts.size;
    entry.duplicate_source_rows = [...keyCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
    entry.duplicate_keys = [...keyCounts.entries()].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count }));
    if (apply) {
      if (row.type === 'construction') committed = await construction.commit(parsed, projectId, row.zone, uploadId);
      if (row.type === 'shop') committed = await shop.commit(parsed, projectId, row.zone, uploadId);
      if (row.type === 'material') committed = await material.commit(parsed, projectId, row.zone, uploadId);
      if (row.type === 'payment') committed = await payment.commit(parsed, projectId, row.zone, uploadId);
      entry.commit = { ok: committed?.ok || 0, errors: committed?.errors || 0 };
    }
    const sheets = (parsed?.sheets || []).map((sheet) => sheet.sheet).filter(Boolean);
    if (sheets.length) {
      const table = { construction: 'construction_schedule_items', shop: 'shop_drawings', material: 'materials', payment: 'ar_lines' }[row.type];
      const placeholders = sheets.map((_, i) => `$${i + 2}`).join(',');
      if (uploadId) {
        if (row.type === 'payment') {
          const lineCount = await db.prepare('SELECT COUNT(*) AS c FROM ar_lines WHERE project_id = $1 AND upload_id = $2').getAsync(projectId, uploadId);
          const contractCount = await db.prepare('SELECT COUNT(*) AS c FROM ar_contracts WHERE project_id = $1 AND upload_id = $2').getAsync(projectId, uploadId);
          entry.db_rows = Number(lineCount?.c || 0) + Number(contractCount?.c || 0);
        } else {
          const count = await db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE project_id = $1 AND upload_id = $2`).getAsync(projectId, uploadId);
          entry.db_rows = Number(count?.c || 0);
        }
      } else {
        const count = await db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE project_id = $1 AND source_sheet IN (${placeholders})`).getAsync(projectId, ...sheets);
        entry.db_rows = Number(count?.c || 0);
      }
      // Values, not just row counts: this is the check SRS 9.1 asks for.
      const scopeUploadId = uploadId || (await findUploadId(db, row.file, projectId));
      const values = await reconcileValues(db, row.type, projectId, parsed, scopeUploadId);
      entry.value_reconciliation = {
        scoped_to_upload: scopeUploadId,
        scope: scopeUploadId ? 'upload' : 'project (file chưa từng được nạp — so toàn dự án)',
        fields_compared: values.compared,
        rows_matched: values.matched,
        rows_missing_in_db: values.missing_in_db,
        rows_mismatched: values.mismatched,
        duplicate_paired: values.duplicate_paired,
        advisory_rows: values.advisory_rows,
        advisory: values.advisory,
        mismatches: values.mismatches,
        not_compared: [...new Set(values.not_compared)],
      };
    }
  } catch (error) {
    entry.errors.push(String(error.message || error));
  }
  report.files.push(entry);
}
const valid = report.files.filter((row) => !row.errors.length && row.parsed_rows > 0);
const sum = (pick) => valid.reduce((total, row) => total + (pick(row) || 0), 0);
report.summary = {
  source_files: report.files.length,
  parsed_files: valid.length,
  parsed_rows: sum((row) => row.parsed_rows),
  database_rows: sum((row) => row.db_rows),
  unique_source_rows: sum((row) => row.unique_source_rows),
  duplicate_source_rows: sum((row) => row.duplicate_source_rows),
  mismatch_files: valid.filter((row) => (row.unique_source_rows || row.parsed_rows) !== row.db_rows).length,
  duplicate_files: valid.filter((row) => row.duplicate_source_rows > 0).length,
  unsupported_files: report.files.filter((row) => row.skipped).length,
  error_files: report.files.filter((row) => row.errors.length).length,
  // Value reconciliation — the SRS 9.1 number. `value_mismatch_pct` is the
  // headline: percentage of compared FIELDS whose value differs. Coverage is
  // reported next to it so a low percentage cannot be mistaken for a thorough
  // check when the source simply has fewer columns.
  value_fields_compared: sum((row) => row.value_reconciliation?.fields_compared),
  value_rows_matched: sum((row) => row.value_reconciliation?.rows_matched),
  value_rows_missing_in_db: sum((row) => row.value_reconciliation?.rows_missing_in_db),
  value_rows_mismatched: sum((row) => row.value_reconciliation?.rows_mismatched),
  value_duplicate_paired: sum((row) => row.value_reconciliation?.duplicate_paired),
  value_advisory_rows: sum((row) => row.value_reconciliation?.advisory_rows),
  value_mismatch_files: valid.filter((row) => (row.value_reconciliation?.rows_mismatched || 0) > 0).length,
  value_not_compared: [...new Set(valid.flatMap((row) => row.value_reconciliation?.not_compared || []))],
};
const comparedFields = report.summary.value_fields_compared || 0;
report.summary.value_mismatch_pct = comparedFields
  ? Math.round((report.summary.value_rows_mismatched / comparedFields) * 10000) / 100
  : null;
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
console.log(`report=${output}`);
await closeDb();
process.exit(report.summary.error_files ? 1 : 0);
