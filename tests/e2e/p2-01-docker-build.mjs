// P2-01: Dockerfile structure is shippable (hermetic — no daemon, no /tmp).
// Full container boot is verified on the deploy host (coolify) + p4-docker-verify.
// Checks: multi-stage (frontend build → runtime), lockfile install, all COPYs,
// entrypoint executable + wired as ENTRYPOINT, HEALTHCHECK, no secrets baked.
// Run: node tests/e2e/p2-01-docker-build.mjs
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const df = readFileSync('Dockerfile', 'utf8');

ok(/FROM .* AS frontend-build/.test(df), 'stage 1: frontend build');
ok(/npm run build/.test(df), 'stage 1 builds frontend');
ok(/COPY --from=frontend-build \S+frontend\/dist/.test(df), 'stage 2 takes built frontend dist');
ok(/npm ci --omit=dev/.test(df), 'backend deps via lockfile (omit dev)');
for (const src of ['frontend/package', 'frontend/', 'backend/package', 'backend/', 'docker-entrypoint.sh'])
  ok(df.includes(src), `Dockerfile COPYs ${src}`);
ok(/ENTRYPOINT.*docker-entrypoint\.sh/.test(df), 'entrypoint wired');
ok((statSync('docker-entrypoint.sh').mode & 0o111) !== 0, 'entrypoint executable bit set in repo');
ok(/HEALTHCHECK[\s\S]*\/api\/health/.test(df), 'HEALTHCHECK hits /api/health');
ok(!/JWT_SECRET=\S+/.test(df) || /CHANGE_ME|#/.test(df), 'no real secret baked in Dockerfile');
ok(existsSync('backend/package-lock.json'), 'backend lockfile exists for Docker npm ci');
ok(existsSync('frontend/package-lock.json'), 'frontend lockfile exists for Docker npm ci');
const lock = JSON.parse(readFileSync('backend/package-lock.json', 'utf8'));
const pkgs = Object.keys(lock.packages || {});
for (const d of ['express', 'pg', 'jsonwebtoken', 'bcryptjs', 'multer', 'xlsx'])
  ok(pkgs.includes(`node_modules/${d}`), `lock pins ${d}`);

// ── Mọi nguồn `COPY` phải TỒN TẠI trong build context và KHÔNG bị `.dockerignore` loại.
// Lý do: cả hai đều là loại hỏng chỉ lộ ra **lúc build**, tức trên máy CI hoặc máy khách —
// không phải lúc đọc mã. Trước đó bài này chỉ kiểm "Dockerfile có chứa chuỗi
// `frontend/package`", nên một `COPY` sai đường dẫn vẫn xanh.
const ignore = readFileSync('.dockerignore', 'utf8').split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));
// `.dockerignore` dùng pattern của Docker (không phải glob của git): khớp theo từng đoạn
// đường dẫn, và `*` không vượt qua dấu `/`.
const dockerIgnoreMatch = (pat, p) => {
  const rx = new RegExp('^' + pat
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '.') + '$');
  return rx.test(p) || p.split('/').some((seg) => rx.test(seg));
};
const globToRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$');
const copySrcs = [...df.matchAll(/^COPY\s+(?:--from=\S+\s+)?(\S+)\s+/gm)].map((m) => m[1]);
ok(copySrcs.length >= 4, `Dockerfile has ${copySrcs.length} COPY source(s) to validate`);
for (const src of copySrcs) {
  if (src.startsWith('/') || src.startsWith('$')) continue; // đường dẫn tuyệt đối / biến
  const rx = globToRe(src.replace(/\/$/, ''));
  // Mẫu glob phải so với **đường dẫn đầy đủ** tương đối với gốc build context. Bản đầu
  // so với `basename()` nên `frontend/package*.json` không khớp gì (mẫu có phần thư mục,
  // tên file thì không) ⇒ hai `COPY` hợp lệ bị báo sai. Với `npm ci` thì lockfile là bắt
  // buộc: không có thì `npm ci` dừng ngay.
  const dir = src.includes('/') ? dirname(src) : '.';
  const hits = src.endsWith('/') ? [] : readdirSync(dir).filter((f) => rx.test(join(dir, f)));
  const resolved = src.endsWith('/') ? existsSync(src) : hits.length > 0;
  ok(resolved, `COPY source resolves in build context: ${src}${hits.length ? ` → ${hits.slice(0, 3).join(', ')}` : ''}`);
  if (/package\*\.json$/.test(src)) {
    const dir = dirname(src);
    ok(existsSync(join(dir, 'package-lock.json')), `npm ci needs a lockfile beside ${src}`);
  }
  const excluded = ignore.filter((p) => dockerIgnoreMatch(p.replace(/\/$/, ''), src) || dockerIgnoreMatch(p.replace(/\/$/, ''), src.replace(/\/$/, '') + '/x'));
  ok(excluded.length === 0, `COPY source not excluded by .dockerignore: ${src}${excluded.length ? ` (bị loại bởi ${excluded.join(', ')})` : ''}`);
}

// ── Mọi lệnh ngoài mà entrypoint gọi phải được CÀI trong image.
// `docker-entrypoint.sh` chờ Postgres bằng `psql`; nếu `postgresql-client` không có trong
// `apt-get install` thì vòng chờ **luôn** thất bại ⇒ sau 60 giây container thoát, và điều đó
// chỉ lộ ra lúc chạy container chứ không lộ ra khi đọc mã.
const entry = readFileSync('docker-entrypoint.sh', 'utf8');
const aptBlock = (df.match(/apt-get install[\s\S]*?(?:&&|\n\n)/) || [''])[0];
const aptPkgs = new Set((aptBlock.match(/[a-z0-9][a-z0-9.+-]*/g) || [])
  .filter((w) => !['apt', 'get', 'install', 'y', 'no', 'install', 'recommends', 'rm', 'rf', 'var', 'lib', 'apt', 'lists'].includes(w)));
// Tên nhị phân ≠ tên gói Debian: entrypoint gọi `psql`, image cài `postgresql-client`.
// Nên phải ánh xạ, không so trực tiếp. Bản đầu so thẳng nên báo sai "psql chưa có" dù
// `postgresql-client` nằm ngay trong `apt-get install`.
const BIN_PKG = {
  node: null, bash: 'bash', sh: null,            // `null` = có sẵn trong image node:22-slim
  psql: 'postgresql-client', pg_isready: 'postgresql-client',
  curl: 'curl', wget: 'wget', tini: 'tini', su: null, gosu: 'gosu',
};
for (const b of ['node', 'psql', 'pg_isready', 'curl', 'wget', 'tini', 'su', 'gosu', 'bash']) {
  if (!new RegExp(`(^|[^a-z_./-])${b}([^a-z_.-]|$)`, 'm').test(entry)) continue; // entrypoint không dùng
  const pkg = BIN_PKG[b];
  if (pkg === null) { ok(true, `entrypoint dùng "${b}" — có sẵn trong image node:22-slim`); continue; }
  const installed = new RegExp(`(^|[\\s\\\\])${pkg}([\\s\\\\]|$)`).test(aptBlock)
    || new RegExp(`ENTRYPOINT[^\\n]*\\b${b}\\b`).test(df);
  ok(installed, `entrypoint dùng "${b}" ⇒ image phải có gói "${pkg}" (apt-get install hoặc ENTRYPOINT)`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
