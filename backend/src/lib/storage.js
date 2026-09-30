// Storage interface — local driver today, S3-compatible driver later.
// Select with STORAGE_DRIVER (default 'local'). UPLOADS_DIR sets the volume
// path (coolify mount). Keys are content-addressed (sha256 + ext): same bytes
// → same key, so re-uploads dedupe instead of piling up Date.now() files.
// Legacy Date.now() keys keep resolving (getFilePath joins any key).
//
// Seam contract every driver implements:
//   save(buffer, name) -> { key, hash, size }
//   path(key)          -> local path ONLY (local driver; S3 throws — use withTempFile)
//   exists(key) -> bool | stat(key) -> { size } | remove(key)
//   withTempFile(key, fn) -> fn(localPath) (local: zero-copy; S3: download-cleanup)
//   download(res, key, filename) -> local: res.download; S3: signed-URL redirect
//   readBuffer(key) -> Buffer (local: fs; S3: GetObject)
// NOTE: multer still buffers uploads (see routes); true streaming ingest is
// future work. This module only guarantees where bytes land and how keys form.
import { createHash } from 'node:crypto';
import { need } from './optional-dep.js'; // P2-9: missing @aws-sdk → 503 naming the dep
import { writeFileSync, statSync, existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

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
  stat(key) {
    try { return { size: statSync(this.path(key)).size }; }
    catch { return null; }
  },
  readBuffer(key) {
    return readFileSync(this.path(key));
  },
  async withTempFile(key, fn) {
    return fn(this.path(key)); // zero-copy on local
  },
  async download(res, key, filename) {
    return res.download(this.path(key), filename || basename(String(key)));
  },
};

// S3-compatible driver (Wave D1): @aws-sdk/client-s3 against any endpoint
// (MinIO/R2/Viettel via S3_ENDPOINT + path style). Same content-addressed keys.
// S3_EMULATOR=1 (or injected client): in-memory Map transport for e2e — same
// doctrine as AI_MOCK/ERP_SFTP_MOCK. Secrets from env only, never logged.
let _s3Client = null;
let _emulator = null; // Map<key, Buffer> when S3_EMULATOR=1
async function s3() {
  if (process.env.S3_EMULATOR === '1') {
    if (!_emulator) _emulator = new Map();
    return { emulator: _emulator };
  }
  if (!_s3Client) {
    const { S3Client } = await need('@aws-sdk/client-s3');
    _s3Client = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || '',
        secretAccessKey: process.env.S3_SECRET_KEY || '',
      },
    });
  }
  return { client: _s3Client };
}
const s3Bucket = () => process.env.S3_BUCKET || (() => { throw new Error('S3_BUCKET env required for STORAGE_DRIVER=s3'); })();

const s3Driver = {
  name: 's3',
  path() { throw new Error('s3 driver has no local paths — use withTempFile/readBuffer/download'); },
  async save(buffer, originalFilename) {
    if (!buffer?.length) throw new Error('storage.save: empty buffer');
    const hash = createHash('sha256').update(buffer).digest('hex');
    const key = `${hash}.${extOf(originalFilename)}`;
    const s = await s3();
    if (s.emulator) {
      if (!s.emulator.has(key)) s.emulator.set(key, Buffer.from(buffer));
      return { key, hash, size: buffer.length };
    }
    const { HeadObjectCommand, PutObjectCommand } = await need('@aws-sdk/client-s3');
    try {
      const head = await s.client.send(new HeadObjectCommand({ Bucket: s3Bucket(), Key: key }));
      return { key, hash, size: Number(head.ContentLength ?? buffer.length) }; // dedupe: skip PUT
    } catch (e) {
      if (e.name !== 'NotFound' && e.$metadata?.httpStatusCode !== 404) throw e;
    }
    await s.client.send(new PutObjectCommand({ Bucket: s3Bucket(), Key: key, Body: buffer }));
    return { key, hash, size: buffer.length };
  },
  async exists(key) {
    const s = await s3();
    if (s.emulator) return s.emulator.has(String(key));
    const { HeadObjectCommand } = await need('@aws-sdk/client-s3');
    try {
      await s.client.send(new HeadObjectCommand({ Bucket: s3Bucket(), Key: String(key) }));
      return true;
    } catch (e) {
      if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return false;
      throw e;
    }
  },
  async stat(key) {
    const s = await s3();
    if (s.emulator) {
      const b = s.emulator.get(String(key));
      return b ? { size: b.length } : null;
    }
    const { HeadObjectCommand } = await need('@aws-sdk/client-s3');
    try {
      const head = await s.client.send(new HeadObjectCommand({ Bucket: s3Bucket(), Key: String(key) }));
      return { size: Number(head.ContentLength ?? 0) };
    } catch (e) {
      if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  },
  async readBuffer(key) {
    const s = await s3();
    if (s.emulator) {
      const b = s.emulator.get(String(key));
      if (!b) throw new Error(`storage.readBuffer: missing key ${key}`);
      return Buffer.from(b);
    }
    const { GetObjectCommand } = await need('@aws-sdk/client-s3');
    const out = await s.client.send(new GetObjectCommand({ Bucket: s3Bucket(), Key: String(key) }));
    const chunks = [];
    for await (const chunk of out.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  },
  async remove(key) {
    const s = await s3();
    if (s.emulator) { s.emulator.delete(String(key)); return; }
    const { DeleteObjectCommand } = await need('@aws-sdk/client-s3');
    await s.client.send(new DeleteObjectCommand({ Bucket: s3Bucket(), Key: String(key) }));
  },
  async withTempFile(key, fn) {
    const buf = await this.readBuffer(key);
    const tmp = join(tmpdir(), `pmo-${randomUUID()}-${basename(String(key))}`);
    writeFileSync(tmp, buf);
    try {
      return await fn(tmp);
    } finally {
      rmSync(tmp, { force: true });
    }
  },
  async download(res, key, filename) {
    const s = await s3();
    if (s.emulator) {
      // No signed URLs in emulator — stream bytes like local.
      res.setHeader('Content-Disposition', `attachment; filename="${filename || key}"`);
      return res.send(await this.readBuffer(key));
    }
    const { GetObjectCommand } = await need('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const url = await getSignedUrl(s.client, new GetObjectCommand({ Bucket: s3Bucket(), Key: String(key) }), { expiresIn: 900 });
    return res.redirect(url);
  },
};

function driver() {
  if (process.env.STORAGE_DRIVER === 's3') return s3Driver;
  return localDriver;
}

export const storage = {
  get driverName() { return driver().name; },
  save: (buffer, name) => driver().save(buffer, name),
  path: (key) => driver().path(key), // LOCAL ONLY — throws on s3
  exists: (key) => driver().exists(key),
  remove: (key) => driver().remove(key),
  stat: (key) => driver().stat(key),
  readBuffer: (key) => driver().readBuffer(key),
  withTempFile: (key, fn) => driver().withTempFile(key, fn),
  download: (res, key, filename) => driver().download(res, key, filename),
};

// Legacy wrappers — existing callers (stage.js, daily.js, upload/classify/
// wizard routes) stay untouched.
export async function saveFile(buffer, originalFilename) {
  return storage.save(buffer, originalFilename);
}
export function getFilePath(key) {
  return storage.path(key); // local-only; parsers must use withTempFile
}
export async function fileExists(key) {
  return storage.exists(key);
}
// Xoá file đã lưu. Cần cho mọi đường "ghi ra ngoài transaction rồi ghi dòng": nếu
// phần ghi dòng hỏng, file phải bị dọn — nếu không nó thành rác vĩnh viễn và
// `scripts/storage-gc.mjs` sẽ báo mãi (xem `routes/daily.js` phần upload ảnh).
export async function removeFile(key) {
  return storage.remove(key);
}
