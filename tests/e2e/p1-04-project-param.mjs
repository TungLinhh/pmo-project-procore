// P1-04: HQ pillar links preserve the selected project (?project= everywhere).
// Run: node tests/e2e/p1-04-project-param.mjs
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

const cc = readFileSync('frontend/src/hq/ControlCenter.jsx', 'utf8');
// Cấm `project_id` **tĩnh** trong link điều hướng (kiểu `?project_id=1` viết cứng) —
// đó mới là lỗi: điều hướng thì bỏ qua dự án người dùng đang chọn. Lời gọi API **có
// điều kiện** theo dự án đang chọn thì đúng và phải cho qua; mẫu cũ cấm mọi
// `project_id=` nên bắt nhầm `ControlCenter.jsx:237`.
ok(!/[?&]project_id=\d/.test(cc), 'ControlCenter không gửi project_id tĩnh trong link');
for (const link of ['/hq/progress', '/hq/shop', '/hq/materials', '/hq/payment'])
  ok(cc.includes(`${link}\${selectedProject ? \`?project=\${selectedProject}\``) || cc.includes(`\`${link}\``) || cc.includes(link + '${selectedProject'), `${link} link present`);

// every receiver reads the same key the senders write
for (const f of ['ProgressDetail', 'ShopList', 'Materials', 'Payment', 'Manpower', 'Issues']) {
  const src = readFileSync(`frontend/src/hq/${f}.jsx`, 'utf8');
  ok(src.includes(`get('project')`) || src.includes(`get("project")`), `${f} reads ?project=`);
}
// navigation links (nav('/hq/...')) must not use the dead key; ?project_id= as a
// *backend API query param* (e.g. /api/shop-drawings?project_id=) stays valid.
try {
  const hits = execSync(`grep -rn "project_id=" frontend/src --include=*.jsx || true`, { encoding: 'utf8' }).trim();
  // Lọc theo **nội dung dòng**, không theo đường dẫn: mọi màn đều nằm dưới
  // `frontend/src/hq/`, nên `l.includes('/hq/')` khớp *tên file* và mọi dòng `project_id=`
  // trong bất kỳ màn nào cũng bị tính — bài kiểm đỏ vì chính cái lọc của nó.
  // Điều cấm đúng là `nav(...)` mang theo `project_id=`.
  const navHits = hits.split('\n').filter((l) => /\bnav\s*\(/.test(l) && l.includes('project_id='));
  ok(navHits.length === 0, `no ?project_id= nav links in jsx (got "${navHits.join('; ').slice(0, 160)}")`);
} catch (e) { ok(false, 'grep failed'); }
// frontend still builds
try {
  execSync('npm run build --workspace=frontend', { encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
  ok(true, 'frontend builds');
} catch (e) { ok(false, `frontend build failed: ${(e.stdout || '') + (e.message || '')}`.slice(0, 300)); }

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
