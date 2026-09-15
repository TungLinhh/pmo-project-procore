// Storage interface — local driver today, S3-compatible driver later.
// Select with STORAGE_DRIVER (default 'local'). UPLOADS_DIR sets the volume
// path (coolify mount). Keys are content-addressed (sha256 + ext): same bytes
// → same key, so re-uploads dedupe instead of piling up Date.now() files.
// Legacy Date.now() keys keep resolving (getFilePath joins any key).
//
// NOTE: multer still buffers uploads (see routes); true streaming ingest is
// future work. This module only guarantees where bytes land and how keys form.
import { createHash } from 'node:crypto';
import { writeFileSync, statSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(__dirname, '..', '..', 'uploads');

function extOf(name) {
  const parts = String(name || 'upload.bin').split(/[\\/]/).pop().split('.');
  return parts.length > 1 ? parts.pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin' : 'bin';
}

const localDriver = {
  name: 'local',
  dir() {
    const dir = process.env.UPLOADS_DIR || DEFAULT_DIR;
    mkdirSync(dir, { recursive: true });
    return dir;
  },
  save(buffer, originalFilename) {
    if (!buffer?.length) throw new Error('storage.save: empty buffer');
    const hash = createHash('sha256').update(buffer).digest('hex');
    const key = `${hash}.${extOf(originalFilename)}`;
    const fullPath = join(this.dir(), key);
    if (!existsSync(fullPath)) writeFileSync(fullPath, buffer);
    return { key, fullPath, hash, size: statSync(fullPath).size };
  },
  path(key) {
    return join(this.dir(), String(key).split(/[\\/]/).pop());
  },
  exists(key) {
    return existsSync(this.path(key));
  },
  remove(key) {
    rmSync(this.path(key), { force: true });
  },
};

// Seam for the future S3-compatible driver (AI image storage). No SDK is
// wired today — selecting it fails LOUD instead of silently writing local.
const s3StubDriver = {
  name: 's3',
  dir() { throw new Error('STORAGE_DRIVER=s3 selected but the S3 driver is deferred (no SDK wired)'); },
  save() { this.dir(); },
  path() { this.dir(); },
  exists() { this.dir(); },
  remove() { this.dir(); },
};

function driver() {
  return process.env.STORAGE_DRIVER === 's3' ? s3StubDriver : localDriver;
}

export const storage = {
  get driverName() { return driver().name; },
  save: (buffer, name) => driver().save(buffer, name),
  path: (key) => driver().path(key),
  exists: (key) => driver().exists(key),
  remove: (key) => driver().remove(key),
};

// Legacy wrappers — existing callers (stage.js, daily.js, upload/classify/
// wizard routes) stay untouched.
export function saveFile(buffer, originalFilename) {
  return storage.save(buffer, originalFilename);
}
export function getFilePath(key) {
  return storage.path(key);
}
export function fileExists(key) {
  return storage.exists(key);
}
