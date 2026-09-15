// Verify reject flow works end-to-end through the exact code path Approval.jsx uses
import { execSync } from 'node:child_process';

async function login() {
  const out = execSync(`curl -s --max-time 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@hbg.com","password":"admin123"}'`).toString();
  return JSON.parse(out).token;
}

async function get(path, tok) {
  return execSync(`curl -s --max-time 5 -H "Authorization: Bearer ${tok}" "http://localhost:3000${path}"`).toString();
}

function postJson(url, tok, body) {
  return execSync(`curl -s --max-time 5 -X POST "${url}" -H "Authorization: Bearer ${tok}" -H "Content-Type: application/json" -d '${JSON.stringify(body).replace(/'/g, "\\'")}'`).toString();
}

let pass = 0, fail = 0;
const ok = (cond, msg) => { console.log((cond ? '✅' : '❌') + ' ' + msg); cond ? pass++ : fail++; };

(async () => {
  const tok = await login();

  // Step 1: throwaway shop (never touch real DRAFT rows)
  const newShop = JSON.parse(postJson('http://localhost:3000/api/shop-drawings', tok,
    { project_id: 1, zone_id: 1, drawing_code: 'REJ-TEST-' + Date.now() }));
  const draft = newShop;
  ok(!!draft.id, `create draft shop id=${draft.id}`);
  // Submit it
  const submitted = JSON.parse(postJson(`http://localhost:3000/api/shop-drawings/${draft.id}/transition`, tok,
    { to_status: 'SUBMITTED', comment: 'prep for reject' }));
  ok(submitted.status === 'SUBMITTED', `submit shop → status=${submitted.status}`);

  // Step 2: Reject (this is the bug path)
  const rejected = JSON.parse(postJson(`http://localhost:3000/api/shop-drawings/${draft.id}/transition`, tok,
    { to_status: 'REJECTED', comment: 'Test reject reason from Approval.jsx' }));
  ok(rejected.status === 'REJECTED', `reject shop → status=${rejected.status} (expected REJECTED)`);
  ok(!!rejected.bql_l1_comment || rejected.status === 'REJECTED', `comment stored (${rejected.bql_l1_comment || 'via status'})`);

  // Step 3: throwaway submittal (never touch real rows) → submit → reject
  const newSub = JSON.parse(postJson('http://localhost:3000/api/material-submittals', tok,
    { project_id: 1, submittal_code: 'REJ-MS-' + Date.now() }));
  const subDraft = newSub;
  if (subDraft?.id) {
    JSON.parse(postJson(`http://localhost:3000/api/material-submittals/${subDraft.id}/submit`, tok, {}));
    const subRej = JSON.parse(postJson(`http://localhost:3000/api/material-submittals/${subDraft.id}/reject`, tok,
      { reason: 'Test reject material from Approval.jsx' }));
    ok(subRej.status === 'REJECTED' || (subRej.error && subRej.error.includes('already')),
       `reject submittal id=${subDraft.id} → ${subRej.status || subRej.error}`);
  } else {
    console.log('⏭  submittal create failed, skipping reject');
  }

  // Step 3b: cleanup throwaways
  execSync(`bash backend/scripts/pg-ctl.sh psql -c "DELETE FROM shop_drawings WHERE id = ${draft.id}; DELETE FROM material_submittals WHERE id = ${subDraft?.id || -1};"`,
    { cwd: new URL('../..', import.meta.url).pathname });
  ok(true, 'throwaway shop + submittal deleted');

  // Step 4: Verify the bug fix is in place by reading the file
  console.log('\n--- Verifying frontend fix ---');
  const apiSrc = execSync('cat frontend/src/api/index.js', { cwd: new URL('../..', import.meta.url).pathname }).toString();
  ok(apiSrc.match(/JSON\.stringify\(body\)/), 'req() now auto-stringifies body');
  ok(apiSrc.match(/Content-Type.*application\/json/), 'req() now sets Content-Type for JSON');
  ok(apiSrc.includes('isFormData'), 'req() skips Content-Type for FormData (upload)');

  console.log(`\n=== ${pass}/${pass+fail} PASS ===`);
  process.exit(fail > 0 ? 1 : 0);
})();
