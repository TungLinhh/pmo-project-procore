// Pure DbWrapper SQL checks: no database or server required.
import { convertSql, singleRowSql } from '../../backend/src/db/index.js';

let failures = 0;
const ok = (cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${detail}`);
  if (!cond) failures++;
};

ok(convertSql('SELECT * FROM projects WHERE id = ? AND tenant_id = ?') === 'SELECT * FROM projects WHERE id = $1 AND tenant_id = $2', 'question marks convert in order');
ok(convertSql('SELECT * FROM projects WHERE id = $1') === 'SELECT * FROM projects WHERE id = $1', 'native placeholders stay unchanged');
let mixed = false;
try { convertSql('SELECT * FROM projects WHERE id = $1 AND code = ?'); } catch { mixed = true; }
ok(mixed, 'mixed placeholders fail before binding the wrong argument');
ok(singleRowSql(convertSql('SELECT * FROM projects WHERE id = ?;')) === 'SELECT * FROM projects WHERE id = $1 LIMIT 1', 'trailing semicolon is removed before LIMIT');
ok(singleRowSql('SELECT * FROM projects WHERE id = $1 FOR UPDATE') === 'SELECT * FROM projects WHERE id = $1 LIMIT 1 FOR UPDATE', 'LIMIT is inserted before FOR UPDATE');
ok(singleRowSql('SELECT * FROM projects LIMIT 2') === 'SELECT * FROM projects LIMIT 2', 'explicit LIMIT is preserved');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
