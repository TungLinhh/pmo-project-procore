// Upload từng file qua API thật /api/upload, capture log cho từng file
// Verify pipeline ingestion + idempotency
// Chạy: node scripts/upload-test-pipeline.mjs
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../src/db/index.js';

const BASE = 'http://localhost:3000';
const FIXTURE_DIR = path.resolve('data/test-fixtures/TEST-MASTER-01');

// Login admin
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' })
}).then(r => r.json());
if (!loginRes.token) throw new Error('Login failed');
const TOKEN = loginRes.token;
console.log(`Logged in admin (token=${TOKEN.slice(0,8)}...)`);

// Lấy TEST-MASTER-01 project_id
const db = getDb();
const project = db.prepare("SELECT id, code FROM projects WHERE code = 'TEST-MASTER-01'").get();
if (!project) throw new Error('TEST-MASTER-01 project not found');
console.log(`Project ${project.code} = id ${project.id}\n`);

// Baseline counts
const before = {
  shop: db.prepare('SELECT COUNT(*) as c FROM shop_drawings WHERE project_id=?').get(project.id).c,
  schedule: db.prepare('SELECT COUNT(*) as c FROM construction_schedule_items WHERE project_id=?').get(project.id).c,
  materials: db.prepare('SELECT COUNT(*) as c FROM materials WHERE project_id=?').get(project.id).c,
  sub_total: db.prepare('SELECT COUNT(*) as c FROM subcontractors').get().c,
  sup_total: db.prepare('SELECT COUNT(*) as c FROM suppliers').get().c,
  daily: db.prepare('SELECT COUNT(*) as c FROM daily_reports WHERE project_id=?').get(project.id).c,
  rfa: db.prepare('SELECT COUNT(*) as c FROM rfa_log WHERE project_id=?').get(project.id).c,
  bp: db.prepare('SELECT COUNT(*) as c FROM business_process_steps').get().c,
  uploads: db.prepare('SELECT COUNT(*) as c FROM file_uploads').get().c,
};
console.log('Baseline counts:', before, '\n');

// 9 files (theo manifest.json)
const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'manifest.json'), 'utf8'));
const results = [];

for (const file of manifest) {
  console.log(`Uploading: ${file.filename}`);
  const buffer = fs.readFileSync(file.fullPath);
  const formData = new FormData();
  // FormData expects Blob - build from buffer
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  formData.append('file', blob, file.filename);
  formData.append('project_code', 'TEST-MASTER-01');
  try {
    const r = await fetch(`${BASE}/api/upload`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN },
      body: formData,
    });
    const j = await r.json();
    const status = r.status;
    const fileUploadId = j.upload_id;
    let uploadRow = null;
    if (fileUploadId) {
      uploadRow = db.prepare('SELECT status, total_rows, ok_rows, error_rows, report_json FROM file_uploads WHERE id = ?').get(fileUploadId);
    }
    const report = j.report || (uploadRow ? JSON.parse(uploadRow.report_json || '{}') : {});
    results.push({
      file: file.filename,
      httpStatus: status,
      uploadStatus: j.status || uploadRow?.status,
      expectedDocType: j.expected_doc_type,
      totalRows: j.total?.ok || j.ok || uploadRow?.ok_rows || 0,
      errorRows: j.total?.errors || j.errors || uploadRow?.error_rows || 0,
      reportSample: report.items ? report.items.slice(0, 3) : (report.sheets ? report.sheets.slice(0, 1) : null),
      error: j.error || (j.upload_id ? null : 'unknown'),
      idempotent: j.message?.includes('idempotent') || false,
    });
    const tag = status === 200 && (j.status === 'SUCCESS' || j.status === 'PARTIAL') ? '✓' : '✗';
    console.log(`  ${tag} HTTP ${status} | upload.status=${j.status} | ok=${j.ok || j.total?.ok || 0} errors=${j.errors || j.total?.errors || 0}`);
    if (j.error) console.log(`    Error: ${j.error.slice(0, 200)}`);
    if (j.message) console.log(`    Note: ${j.message}`);
  } catch (e) {
    console.log(`  ✗ Network/Error: ${e.message}`);
    results.push({ file: file.filename, error: e.message });
  }
}

console.log('\n=== Final counts (after upload) ===');
const after = {
  shop: db.prepare('SELECT COUNT(*) as c FROM shop_drawings WHERE project_id=?').get(project.id).c,
  schedule: db.prepare('SELECT COUNT(*) as c FROM construction_schedule_items WHERE project_id=?').get(project.id).c,
  materials: db.prepare('SELECT COUNT(*) as c FROM materials WHERE project_id=?').get(project.id).c,
  sub_total: db.prepare('SELECT COUNT(*) as c FROM subcontractors').get().c,
  sup_total: db.prepare('SELECT COUNT(*) as c FROM suppliers').get().c,
  daily: db.prepare('SELECT COUNT(*) as c FROM daily_reports WHERE project_id=?').get(project.id).c,
  rfa: db.prepare('SELECT COUNT(*) as c FROM rfa_log WHERE project_id=?').get(project.id).c,
  bp: db.prepare('SELECT COUNT(*) as c FROM business_process_steps').get().c,
  uploads: db.prepare('SELECT COUNT(*) as c FROM file_uploads').get().c,
};
console.log(after);

// Diff
console.log('\n=== Delta ===');
for (const k of Object.keys(before)) {
  const d = after[k] - before[k];
  console.log(`  ${k}: +${d} (${before[k]} → ${after[k]})`);
}

// Test idempotency: upload 1 file 2 lần
console.log('\n=== Idempotency test: upload Shop TST-A.xlsx 2 lần ===');
const shopFile = manifest.find(m => m.filename === 'Shop TST-A.xlsx');
const shopBuffer = fs.readFileSync(shopFile.fullPath);
const fd = new FormData();
fd.append('file', new Blob([shopBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), shopFile.filename);
fd.append('project_code', 'TEST-MASTER-01');
const r1 = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: fd });
const j1 = await r1.json();
console.log(`  1st: upload_id=${j1.upload_id} message="${j1.message}"`);

const fd2 = new FormData();
fd2.append('file', new Blob([shopBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), shopFile.filename);
fd2.append('project_code', 'TEST-MASTER-01');
const r2 = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: fd2 });
const j2 = await r2.json();
console.log(`  2nd: upload_id=${j2.upload_id} message="${j2.message}"`);
const idem = j1.upload_id === j2.upload_id || (j2.message && j2.message.includes('idempotent'));
console.log(`  ${idem ? '✓' : '✗'} Idempotency: ${idem ? 'PASS' : 'FAIL'} (same upload_id returned)`);

console.log('\n=== Summary ===');
const ok = results.filter(r => r.httpStatus === 200 && r.uploadStatus !== 'FAILED' && !r.error).length;
const failed = results.length - ok;
console.log(`Files: ${ok}/${results.length} OK, ${failed} failed`);
for (const r of results) {
  if (r.httpStatus !== 200 || r.uploadStatus === 'FAILED' || r.error) {
    console.log(`  FAIL: ${r.file} - ${r.error || r.uploadStatus}`);
  }
}

fs.writeFileSync(path.join(FIXTURE_DIR, 'upload-report.json'), JSON.stringify({ before, after, results, idempotency: { j1, j2 } }, null, 2));
console.log('\nReport saved to:', path.join(FIXTURE_DIR, 'upload-report.json'));
