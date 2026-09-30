// P4-2: deploy surface is correct (no docker daemon here — static + unit checks).
// 1. entrypoint bash syntax ok; runs init-db before exec; no *** password bug.
// 2. Dockerfile: node-based HEALTHCHECK (no wget), entrypoint copied, frontend built.
// 3. compose: postgres/app/init, uploads volume mounted + declared, init one-shot.
// 4. .dockerignore keeps entrypoint in context, excludes .env + data/uploads.
// 5. buildDatabaseUrl(): DATABASE_URL wins; else DB_* parts (coolify either way).
// Run: node tests/e2e/p4-docker.mjs
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', cwd: ROOT, timeout: 30000 });
const root = `${ROOT}/`;
const read = (f) => readFileSync(root + f, 'utf8');

// 1. entrypoint
try { sh('bash -n docker-entrypoint.sh'); ok(true, 'entrypoint bash syntax ok'); }
catch (e) { ok(false, 'entrypoint bash syntax: ' + e.message.slice(0, 120)); }
const entry = read('docker-entrypoint.sh');
ok(/node backend\/src\/db\/init\.js/.test(entry), 'entrypoint runs init-db before boot');
ok(!/\*\*\*/.test(entry), 'no *** password placeholder in entrypoint');
ok(/exec "\$@"|exec '\$@'/.test(entry), 'entrypoint execs CMD (signal handling via tini)');

// 2. Dockerfile
const df = read('Dockerfile');
ok(/HEALTHCHECK[\s\S]*CMD node -e/.test(df) && !/CMD wget/.test(df), 'HEALTHCHECK uses node (wget not installed)');
ok(/COPY docker-entrypoint\.sh/.test(df), 'entrypoint copied into image');
ok(/npm run build/.test(df), 'frontend built in image');
ok(/frontend\/dist/.test(df), 'frontend dist served from image');
ok(/USER node/.test(df), 'runtime image uses unprivileged node user');
ok(!/pmo_dev_pwd/.test(df), 'Dockerfile does not bake a database password');

// 3. compose
const compose = read('docker-compose.yml');
for (const svc of ['postgres:', 'init:', 'app:']) ok(compose.includes(svc), `compose service ${svc}`);
ok(/image: pgvector\/pgvector:pg16\s+environment:/.test(compose), 'compose postgres image/environment YAML is separated');
ok((compose.match(/ALLOW_DEV_PASSWORD: "1"/g) || []).length >= 2, 'local compose enables demo password hatch for init and app');
ok(compose.includes('OPENROUTER_API_KEY:') && compose.includes('AI_MONTHLY_CAP_USD:'), 'local compose passes AI key and cap');
ok(/uploads:\/app\/backend\/uploads/.test(compose), 'uploads volume mounted on app');
ok(/^\s+uploads:\s*$/m.test(compose), 'uploads volume declared');
const initBlock = compose.split(/^  app:/m)[0].split(/^  init:/m)[1] || '';
ok(!/^\s+restart:/m.test(initBlock), 'init service has no restart (one-shot)');
const prodCompose = read('docker-compose.prod.yml');
for (const marker of ['BACKUP_DATABASE_URL:', 'DATA_ENC_KEY:', 'JWT_SECRET:', 'APP_DB_PASSWORD:', 'SKIP_DB_INIT: 1', 'read_only: true']) {
  ok(prodCompose.includes(marker), `production compose wires ${marker}`);
}
ok(!/pmo_dev_pwd/.test(prodCompose), 'production compose has no demo database password');
ok(existsSync(root + 'deploy/production/00-backup-role.sh'), 'production backup role bootstrap exists');

// 4. dockerignore
const ign = read('.dockerignore');
ok(!/^docker-entrypoint\.sh$/m.test(ign), 'entrypoint kept in build context');
ok(/^\.env$/m.test(ign), '.env excluded from image');
ok(/backend\/uploads\//.test(ign), 'local uploads excluded from image');
// Bất biến thật là " bí mật không được **commit**", không phải "file .env không tồn tại":
// trên máy phát triển `backend/.env` **phải** tồn tại (dev + 126 bài e2e dựa vào nó), nên
// kiểm tra sự tồn tại là kiểm tra sai và sẽ đỏ trên mọi máy dev đúng cách.
//
// Bản đầu kiểm tra `${ROOT}/.env` — **gốc repo** — trong khi sản phẩm thật sự nạp
// `backend/.env` (`db/index.js:50`). Nên nó kiểm tra một đường dẫn không mang bí mật nào
// và bỏ lọt đúng cái file cần canh. Nay kiểm cả hai, và theo dạng **có bị git bỏ qua
// không** — đó mới là thứ quyết định bí mật có lọt vào repo hay không.
// `execSync` với `stdio: 'ignore'` trả `null` chứ không phải Buffer, nên `return execSync(...)`
// là **falsy dù file ĐÃ bị ignore** — bài kiểm tự báo nhầm "không gitignore" cho cả ba file.
// Đo 2026-09-29: `git check-ignore -v` xác nhận cả `.env`, `backend/.env` và
// `deploy/single-machine/pmo.env` đều bị ignore (theo `.gitignore:21` và `:85`), nhưng bài
// báo đỏ. Nay trả `true` khi lệnh **thành công** (git trả 0 = bị ignore).
const gitIgnored = (p) => {
  try { execSync(`git check-ignore -q ${JSON.stringify(p)}`, { cwd: ROOT, stdio: 'ignore' }); return true; }
  catch { return false; }
};
ok(existsSync(root + '.env.example'), '.env.example present (documented shape of the env file)');
ok(gitIgnored('.env') || !existsSync(root + '.env'), 'root .env is gitignored (or absent)');
ok(gitIgnored('backend/.env') || !existsSync(root + 'backend/.env'), 'backend/.env is gitignored (or absent)');
ok(gitIgnored('deploy/single-machine/pmo.env') || !existsSync(root + 'deploy/single-machine/pmo.env'),
  'deploy env file is gitignored (or absent)');

// 5. connection-string wiring (real execution)
//
// Tiến trình con phải **cô lập khỏi `backend/.env`**, nếu không bài này đo sai thứ và
// tự đỏ trên mọi máy có file env thật. `db/index.js:49` bỏ qua `backend/.env` khi **cả hai**
// nhóm biến đã được cấp tường minh: nhóm owner (`DATABASE_URL`/`DB_*`) và nhóm app role
// (`APP_DATABASE_URL`/`APP_DB_USER`/`APP_DB_PASSWORD`). Nên truyền thêm `APP_DB_USER` —
// đó đúng là kịch bản thật của Coolify/khách hàng dùng `DB_*`, chứ không phải lách kiểm.
const HERMETIC = { APP_DB_USER: 'probe_app_role' };
const buildUrlIn = (env) => execSync(
  `node --input-type=module -e "import { buildDatabaseUrl } from './backend/src/db/index.js'; console.log(buildDatabaseUrl());"`,
  { encoding: 'utf8', cwd: ROOT, env: { ...HERMETIC, ...env }, timeout: 15000 },
).trim();

ok(buildUrlIn({ DATABASE_URL: 'postgresql://u:p@h:1/d' }) === 'postgresql://u:p@h:1/d',
  'DATABASE_URL wins when set');
ok(buildUrlIn({ DB_HOST: 'myhost', DB_PORT: '1111', DB_NAME: 'mydb', DB_USER: 'me', DB_PASSWORD: 'pw' })
  === 'postgresql://me:pw@myhost:1111/mydb',
  'DB_* parts build URL when DATABASE_URL is absent');
// `APP_DATABASE_URL` thuộc `buildAppDatabaseUrl()` — hàm khác. Bản đầu của bài kiểm này (của
// tôi) gọi nhầm `buildDatabaseUrl()` nên luôn đỏ; đúng hàm thì app role lấy URL riêng và
// URL owner **không** bị ảnh hưởng — đó mới là điều cần chứng minh.
const buildAppUrlIn = (env) => execSync(
  `node --input-type=module -e "import { buildAppDatabaseUrl } from './backend/src/db/index.js'; console.log(buildAppDatabaseUrl());"`,
  { encoding: 'utf8', cwd: ROOT, env: { ...HERMETIC, ...env }, timeout: 15000 },
).trim();
ok(buildAppUrlIn({ APP_DATABASE_URL: 'postgresql://a:b@c:2/e' }) === 'postgresql://a:b@c:2/e',
  'APP_DATABASE_URL wins for the app role');
ok(buildAppUrlIn({ APP_DB_USER: 'u', APP_DB_PASSWORD: 'p', DB_HOST: 'h', DB_PORT: '5', DB_NAME: 'n', DB_USER: 'o', DB_PASSWORD: 'q' })
  === 'postgresql://u:p@h:5/n',
  'app role falls back to APP_DB_* parts, not the owner credentials');

// 6. compose phải là YAML hợp lệ, và mọi dịch vụ mà test dựa vào phải có `image` hoặc `build`
// Cấu trúc compose: dịch vị ở thụt lề 2, khóa ở thụt lề 4. Không thêm phụ thuộc `yaml` chỉ để
// kiểm (`node_modules` không có `yaml` lẫn `js-yaml`) — compose ở đây là YAML phẳng, nên
// soi bằng thụt lề là đủ, và nói rõ giới hạn: **không** bắt được lỗi cú pháp YAML tổng quát.
for (const f of ['docker-compose.yml', 'docker-compose.prod.yml']) {
  const lines = read(f).split('\n');
  const services = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^ {2}([A-Za-z0-9_.-]+):\s*$/);
    if (!m) continue;
    // Thuộc tính của service khác cũng thụt lề 4 nên không bị nhầm; chỉ giữ dòng có khoá con.
    const hasChild = lines.slice(i + 1, i + 12).some((l) => /^ {4}[A-Za-z0-9_.-]+:/.test(l));
    if (hasChild) services.push({ name: m[1], block: lines.slice(i + 1, i + 40).join('\n') });
  }
  ok(services.length > 0, `${f} declares service(s): ${services.map((s) => s.name).join(', ')}`);
  for (const s of services) {
    ok(/(^|\n) {4}(image|build):/.test(s.block), `${f}: service "${s.name}" declares image or build`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
