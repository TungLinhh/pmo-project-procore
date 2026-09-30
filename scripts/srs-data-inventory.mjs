#!/usr/bin/env node
// Inventory the real pilot workbooks before ingest/reconciliation work.
// It does not mutate the database. Output is JSON so the same run can feed
// later reconciliation and acceptance reports.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = join(root, 'reference_sheets');
const allowed = new Set(['.xlsx', '.xls', '.xlsm']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (allowed.has(extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

function classify(path) {
  const p = path.toLowerCase();
  if (p.includes('tiến độ shop') || p.includes('shop')) return 'shop';
  if (p.includes('tiến độ cung ứng vật tư') || p.includes('vật tư')) return 'material';
  if (p.includes('tiến độ thi công') || p.includes('tđ ') || p.includes('báo cáo công việc')) return 'construction';
  if (p.includes('tiến độ thanh toán') || p.includes('mpm')) return 'payment';
  if (p.includes('nguồn lực')) return 'resource';
  if (p.includes('quy trình')) return 'process';
  return 'other';
}

function workbookInfo(path) {
  const bytes = readFileSync(path);
  const wb = XLSX.read(bytes, { type: 'buffer', cellDates: true, cellFormula: true });
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const ref = ws['!ref'] || 'A1';
    const decoded = XLSX.utils.decode_range(ref);
    const rows = Math.max(0, decoded.e.r - decoded.s.r + 1);
    const cols = Math.max(1, decoded.e.c - decoded.s.c + 1);
    return { name, ref, rows, cols };
  });
  return {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sheets,
    totalRows: sheets.reduce((sum, s) => sum + s.rows, 0),
  };
}

const files = walk(sourceRoot).sort();
const out = files.map((path) => {
  try {
    return {
      path: relative(root, path),
      group: classify(path),
      ...workbookInfo(path),
    };
  } catch (error) {
    return { path: relative(root, path), group: classify(path), error: String(error.message || error) };
  }
});

const byGroup = {};
for (const row of out) {
  const g = row.group;
  byGroup[g] ||= { files: 0, bytes: 0, sheets: 0, rows: 0, errors: 0 };
  byGroup[g].files += 1;
  byGroup[g].bytes += row.bytes || 0;
  byGroup[g].sheets += row.sheets?.length || 0;
  byGroup[g].rows += row.totalRows || 0;
  if (row.error) byGroup[g].errors += 1;
}

const report = {
  generated_at: new Date().toISOString(),
  source_root: relative(root, sourceRoot),
  file_count: out.length,
  by_group: byGroup,
  files: out,
};
const output = process.argv[2] || '/tmp/opencode/srs-data-inventory.json';
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (output !== '-') {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stderr.write(`Wrote ${output}\n`);
}
