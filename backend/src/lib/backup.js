// Daily backup (SRS NFR: backup dữ liệu hàng ngày).
// pg_dump custom-format (-Fc) vào BACKUP_DIR (mặc định data/backups, đã
// gitignore). Giữ N bản mới nhất (BACKUP_KEEP_COUNT, mặc định 7).
// pg_dump lấy từ PGBIN hoặc PATH; thiếu → lỗi rõ ràng (503 ở route).
// Scheduler state (lastRunAt) nằm ở module để GET /admin/backups hiển thị.
import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDatabaseUrl } from '../db/index.js';

const here = dirname(fileURLToPath(import.meta.url));

export function backupDir() {
  const dir = process.env.BACKUP_DIR || join(here, '..', '..', '..', 'data', 'backups');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const keepCount = () => Math.max(1, parseInt(process.env.BACKUP_KEEP_COUNT) || 7);
export const backupHour = () => {
  const h = parseInt(process.env.BACKUP_HOUR);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 2;
};
export const dumpBin = () => process.env.PGBIN || 'pg_dump';

let _lastRunAt = null;
let _lastError = null;
export const lastRun = () => _lastRunAt ? { at: _lastRunAt, error: _lastError } : null;

// Giờ chạy tiếp theo (02:00 mặc định, giờ local server).
export function nextRunAt(now = new Date()) {
  const n = new Date(now);
  n.setHours(backupHour(), 0, 0, 0);
  if (n <= now) n.setDate(n.getDate() + 1);
  return n.toISOString();
}

// Pure: chọn bản thừa để xóa (giữ N bản mới nhất theo tên file
// pmo-YYYYMMDD-HHMMSS.dump — tên sắp xếp được theo thời gian).
export function selectVictims(files, keep = keepCount()) {
  const sorted = [...files].sort();
  return sorted.slice(0, Math.max(0, sorted.length - Math.max(1, keep)));
}

export function connectionArgs(rawUrl = process.env.BACKUP_DATABASE_URL || buildDatabaseUrl()) {
  // Keep the password in the child environment, never in argv. `ps` exposes the
  // full command line to every local user, so a URL with credentials is not an
  // acceptable pg_dump input.
  const env = { ...process.env };
  const parsed = new URL(rawUrl);
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
  parsed.password = '';
  return { url: parsed.toString(), env };
}

export function runBackup() {
  const dir = backupDir();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').replace(/(\d{8})(\d{6})/, '$1-$2');
  const file = `pmo-${stamp}.dump`;
  const full = join(dir, file);
  const { url, env } = connectionArgs();
  return new Promise((resolve, reject) => {
    execFile(dumpBin(), ['-Fc', '-f', full, url], { env, timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 }, (err) => {
      if (err) {
        _lastRunAt = new Date().toISOString();
        _lastError = String(err.message || err).slice(0, 300);
        try { rmSync(full, { force: true }); } catch {}
        const missing = err.code === 'ENOENT';
        const rlsBlocked = /row-level security|affected by row-level security/i.test(_lastError);
        reject(Object.assign(new Error(missing
          ? 'pg_dump not found — set PGBIN to its full path'
          : rlsBlocked
            ? 'Backup DB role bị RLS chặn — set BACKUP_DATABASE_URL tới role có BYPASSRLS'
            : _lastError), { status: missing || rlsBlocked ? 503 : 500 }));
        return;
      }
      _lastRunAt = new Date().toISOString();
      _lastError = null;
      const pruned = pruneBackups();
      resolve({ file, size: statSync(full).size, pruned });
    });
  });
}

export function listBackups() {
  const dir = backupDir();
  let names = [];
  try {
    names = readdirSync(dir).filter((f) => /^pmo-\d{8}-\d{6}\.dump$/.test(f)).sort().reverse();
  } catch { return []; }
  return names.map((f) => {
    try {
      const st = statSync(join(dir, f));
      return { file: f, size: st.size, mtime: st.mtime.toISOString() };
    } catch { return null; }
  }).filter(Boolean);
}

export function pruneBackups() {
  const dir = backupDir();
  const victims = selectVictims(listBackups().map((b) => b.file));
  for (const f of victims) {
    try { rmSync(join(dir, f), { force: true }); } catch {}
  }
  return victims;
}
