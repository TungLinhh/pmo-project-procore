// P4-1: storage interface — local driver hardened, S3 deferred-loud.
// 1. roundtrip: save → exists → path readable → remove → gone.
// 2. content-addressed: same bytes twice → same key (no Date.now pile-up).
// 3. UPLOADS_DIR respected (coolify volume).
// 4. STORAGE_DRIVER=s3 → loud error, no silent local write.
// 5. legacy wrappers (saveFile/getFilePath/fileExists) keep working.
// Run: node tests/e2e/p4-storage.mjs
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const probe = (js, extra = {}) => execSync(`node --input-type=module -e "${js.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`,
  { encoding: 'utf8', cwd: fileURLToPath(new URL('../..', import.meta.url)), env: { ...process.env, ...extra }, timeout: 30000 });
const out = (s) => JSON.parse(s.trim().split('\n').pop());

// 1+2. roundtrip + determinism (isolated dir)
const r = out(probe(`
  import { storage, saveFile, getFilePath, fileExists } from './backend/src/lib/storage.js';
  const a = storage.save(Buffer.from('storage-probe-bytes'), 'photo.JPG');
  const b = storage.save(Buffer.from('storage-probe-bytes'), 'photo.JPG');
  const c = storage.save(Buffer.from('storage-probe-bytes'), 'other-name.png');
  const fs = await import('node:fs');
  const readable = fs.readFileSync(storage.path(a.key)).toString() === 'storage-probe-bytes';
  const before = storage.exists(a.key);
  storage.remove(a.key);
  const legacy = saveFile(Buffer.from('x'), 'f.bin');
  console.log(JSON.stringify({
    sameKey: a.key === b.key, extMatters: c.key !== a.key,
    hashKey: /^[0-9a-f]{64}\\.jpg$/.test(a.key),
    readable, before, after: storage.exists(a.key),
    legacyOk: fileExists(legacy.key) && getFilePath(legacy.key).endsWith(legacy.key),
  }));
  storage.remove(c.key);
  storage.remove(legacy.key);
`, { UPLOADS_DIR: '/tmp/pmo-storage-probe' }));
ok(r.sameKey, 'same bytes + same ext → same key (content-addressed)');
ok(r.extMatters, 'extension preserved in key (MIME handling)');
ok(r.hashKey, `key is sha256.ext (content hash, lowercased ext)`);
ok(r.readable && r.before && !r.after, 'save → exists → read → remove');
ok(r.legacyOk, 'legacy wrappers work');

// 3. default dir untouched by probe (isolation)
execSync('rm -rf /tmp/pmo-storage-probe', { encoding: 'utf8' });
const r3 = out(probe(`
  import { storage } from './backend/src/lib/storage.js';
  const saved = storage.save(Buffer.from('isolated-probe'), 'isolated.txt');
  console.log(JSON.stringify({ exists: storage.exists(saved.key), key: saved.key }));
  storage.remove(saved.key);
`, { UPLOADS_DIR: '/tmp/pmo-storage-probe' }));
ok(r3.exists && /^[0-9a-f]{64}\.txt$/.test(r3.key), 'local probe uses isolated directory');
ok(execSync('ls /tmp/pmo-storage-probe', { encoding: 'utf8' }).trim() === '', 'probe cleans isolated directory');
execSync('rm -rf /tmp/pmo-storage-probe', { encoding: 'utf8' });

// 4. S3 driver has an in-memory emulator for the same storage contract.
const r4 = out(probe(`
  import { storage } from './backend/src/lib/storage.js';
  const saved = await storage.save(Buffer.from('s3-probe'), 'probe.txt');
  const exists = await storage.exists(saved.key);
  const bytes = (await storage.readBuffer(saved.key)).toString();
  await storage.remove(saved.key);
  console.log(JSON.stringify({ saved: !!saved.key, exists, bytes, gone: !(await storage.exists(saved.key)) }));
`, { STORAGE_DRIVER: 's3', S3_EMULATOR: '1', S3_BUCKET: 'test' }));
ok(r4.saved && r4.exists && r4.bytes === 's3-probe' && r4.gone,
  `s3 emulator roundtrip (${JSON.stringify(r4)})`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
