// Storage driver e2e (Wave D1): seam contract holds on BOTH drivers.
// Local runs against a temp UPLOADS_DIR; S3 runs against the in-memory
// emulator (S3_EMULATOR=1, same doctrine as AI_MOCK). Real MinIO is a manual
// checklist item (compose minio service), not CI.
// Run: node tests/e2e/storage-s3.mjs (no server needed)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

const PAYLOAD = Buffer.from('storage-seam-probe-bytes-0123456789');
const NAME = 'Probe Model.IFC';

async function exercise(tag, storage) {
  // save → dedupe → exists/stat → readBuffer → withTempFile → download → remove
  const s1 = await storage.save(PAYLOAD, NAME);
  ok(s1.key.endsWith('.ifc') && s1.hash?.length === 64, `${tag}: content key + sha256`);
  const s2 = await storage.save(PAYLOAD, 'other-name.ifc');
  ok(s2.key === s1.key, `${tag}: same bytes dedupe to same key`);
  ok((await storage.exists(s1.key)) === true, `${tag}: exists`);
  ok((await storage.stat(s1.key))?.size === PAYLOAD.length, `${tag}: stat size`);
  ok(!(await storage.exists('missing-key-xyz')), `${tag}: missing → false`);
  ok((await storage.stat('missing-key-xyz')) === null, `${tag}: missing stat → null`);
  const back = await storage.readBuffer(s1.key);
  ok(Buffer.compare(back, PAYLOAD) === 0, `${tag}: round-trip bytes`);
  const viaTmp = await storage.withTempFile(s1.key, async (p) => {
    const { readFileSync } = await import('node:fs');
    return readFileSync(p);
  });
  ok(Buffer.compare(viaTmp, PAYLOAD) === 0, `${tag}: withTempFile bytes`);
  // download(): local streams bytes; emulator streams bytes; real s3 redirects.
  const chunks = [];
  const fakeRes = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    download(p, fn) { this.downloaded = { p, fn }; },
    redirect(u) { this.redirected = u; },
    send(b) { chunks.push(Buffer.from(b)); },
  };
  await storage.download(fakeRes, s1.key, 'probe.ifc');
  const dlOk = fakeRes.downloaded || chunks.length > 0 || fakeRes.redirected;
  ok(!!dlOk, `${tag}: download path (${fakeRes.redirected ? 'redirect' : fakeRes.downloaded ? 'file' : 'bytes'})`);
  await storage.remove(s1.key);
  ok((await storage.exists(s1.key)) === false, `${tag}: removed`);
  let threw = false;
  try { await storage.readBuffer(s1.key); } catch { threw = true; }
  ok(threw, `${tag}: read-after-remove throws`);
}

// 1. local driver, isolated temp dir.
import { storage } from '../../backend/src/lib/storage.js';
{
  const dir = mkdtempSync(join(tmpdir(), 'pmo-storage-'));
  process.env.UPLOADS_DIR = dir;
  delete process.env.STORAGE_DRIVER;
  delete process.env.S3_EMULATOR;
  ok(storage.driverName === 'local', 'local driver selected');
  await exercise('local', storage);
  rmSync(dir, { recursive: true, force: true });
  delete process.env.UPLOADS_DIR;
}

// 2. s3 driver via in-memory emulator (driver() reads env live per call).
{
  process.env.STORAGE_DRIVER = 's3';
  process.env.S3_EMULATOR = '1';
  ok(storage.driverName === 's3', 's3 driver selected');
  await exercise('s3-emu', storage);
  delete process.env.STORAGE_DRIVER;
  delete process.env.S3_EMULATOR;
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
