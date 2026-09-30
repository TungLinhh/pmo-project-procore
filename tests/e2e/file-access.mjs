// Project-level file authorization regression.
// A same-tenant user who is not a project member must receive 404 for every
// project-scoped file route. This test fails on the old tenant-only handlers.
import * as XLSX from 'xlsx';
import { getDb, closeDb } from '../../backend/src/db/index.js';
import { storage } from '../../backend/src/lib/storage.js';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
let pass = 0;
let fail = 0;
const ok = (condition, message) => {
  if (condition) { pass += 1; console.log(`  PASS — ${message}`); }
  else { fail += 1; console.log(`  FAIL — ${message}`); }
};


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['FILE-ACCESS-%'], { label: 'file-access' });
async function api(path, options = {}) {
  const response = await fetch(BASE + path, options);
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, response };
}

const json = (token, body) => ({
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const admin = (await api('/api/auth/login', json(null, { email: 'admin@hbg.com', password: 'admin123' }))).body?.token;
const site = (await api('/api/auth/login', json(null, { email: 'site@hbg.com', password: 'admin123' }))).body?.token;
if (!admin || !site) throw new Error('login setup failed');

const db = getDb();
let project;
let dailyReport;
let photo;
let upload;
try {
  const stamp = Date.now();
  project = (await api('/api/projects', json(admin, { code: `FILE-ACCESS-${stamp}`, name_vi: 'File access test' }))).body;
  ok(project?.id, `project created (${project?.id})`);

  dailyReport = (await api(`/api/projects/${project.id}/daily-reports`, json(admin, {
    report_date: new Date().toISOString().slice(0, 10),
  }))).body;

  const photoForm = new FormData();
  photoForm.append('photos', new Blob(['private-photo-bytes'], { type: 'image/png' }), 'private.png');
  const photoResponse = await api(`/api/daily-reports/${dailyReport.id}/photos`, {
    method: 'POST', headers: { Authorization: `Bearer ${admin}` }, body: photoForm,
  });
  photo = photoResponse.body?.photos?.[0];
  ok(photo?.id, `photo uploaded (${photo?.id})`);

  const photoDenied = await api(`/api/daily-reports/photos/${photo.id}/download`, {
    headers: { Authorization: `Bearer ${site}` },
  });
  ok(photoDenied.status === 404, `non-member photo download → 404 (got ${photoDenied.status})`);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['code'], ['FILE-ACCESS-ROW']]), 'S1');
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  // A name this endpoint cannot classify must be REFUSED. It used to be
  // accepted and written into construction_schedule_items (ingestProjectLevel's
  // catch-all branch), so a daily report or an unrecognised file silently became
  // progress rows with no confirmation step.
  const unknownForm = new FormData();
  unknownForm.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'private.xlsx');
  unknownForm.append('project_code', project.code);
  const unknown = await api('/api/upload', {
    method: 'POST', headers: { Authorization: `Bearer ${admin}` }, body: unknownForm,
  });
  ok(unknown.status === 422, `tên file không nhận diện được bị từ chối, không ghi nhầm bảng (got ${unknown.status})`);
  ok(!unknown.body?.upload_id, 'không tạo bản ghi upload cho file không xác định loại');

  const uploadForm = new FormData();
  uploadForm.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'TĐ shop BOH.xlsx');
  uploadForm.append('project_code', project.code);
  const uploadResponse = await api('/api/upload', {
    method: 'POST', headers: { Authorization: `Bearer ${admin}` }, body: uploadForm,
  });
  upload = uploadResponse.body;
  ok(upload?.upload_id, `upload committed/staged (${upload?.upload_id})`);

  const uploadDenied = await api(`/api/uploads/${upload.upload_id}/download`, {
    headers: { Authorization: `Bearer ${site}` },
  });
  ok(uploadDenied.status === 404, `non-member upload download → 404 (got ${uploadDenied.status})`);

  const list = await api('/api/uploads', { headers: { Authorization: `Bearer ${site}` } });
  ok(!Array.isArray(list.body) || !list.body.some((row) => Number(row.id) === Number(upload.upload_id)),
    'non-member upload list excludes project file');
} finally {
  if (photo) {
    await db.prepare('DELETE FROM daily_photos WHERE id = ?').runAsync(photo.id);
  }
  if (dailyReport?.id) {
    await db.prepare('DELETE FROM daily_reports WHERE id = ?').runAsync(dailyReport.id);
  }
  if (upload?.upload_id) {
    const row = await db.prepare('SELECT storage_key FROM file_uploads WHERE id = ?').getAsync(upload.upload_id);
    await db.prepare('DELETE FROM file_uploads WHERE id = ?').runAsync(upload.upload_id);
    if (row?.storage_key) storage.remove(row.storage_key);
  }
  if (project?.id) {
    await db.prepare('DELETE FROM project_members WHERE project_id = ?').runAsync(project.id);
    await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(project.id);
  }
  await closeDb();
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
