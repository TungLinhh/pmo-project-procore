// 43.8 - Map zones từ bảng zones hiện tại → area_hierarchy với level='zone'
// 6 cấp: project → building → zone → floor → area → work_item
// Data hiện có: 2 projects + 19 zones. Building/Floor/Area NULL (không bịa data).
import { getDb } from './src/db/index.js';

const db = getDb();
const PG = '/home/linuxbrew/.linuxbrew/opt/postgresql@16/bin/psql';
import { execSync } from 'node:child_process';

const projects = db.prepare('SELECT id, code, name_vi FROM projects').all();
const zones = db.prepare('SELECT id, project_id, code, name_vi FROM zones').all();

console.log(`Found ${projects.length} projects, ${zones.length} zones`);

for (const p of projects) {
  // Insert project level
  const sql1 = `INSERT INTO area_hierarchy (project_id, parent_id, level, code, name_vi) VALUES (${p.id}, NULL, 'project', '${p.code.replace(/'/g, "''")}', '${(p.name_vi || '').replace(/'/g, "''")}') ON CONFLICT DO NOTHING`;
  execSync(`${PG} -h localhost -U pmo_user -d pmo -c "${sql1}"`, { stdio: 'pipe' });
  console.log(`  Project ${p.code} inserted`);
}

for (const z of zones) {
  const sql2 = `INSERT INTO area_hierarchy (project_id, parent_id, level, code, name_vi) VALUES (${z.project_id}, NULL, 'zone', '${z.code.replace(/'/g, "''")}', '${(z.name_vi || '').replace(/'/g, "''")}') ON CONFLICT DO NOTHING`;
  execSync(`${PG} -h localhost -U pmo_user -d pmo -c "${sql2}"`, { stdio: 'pipe' });
}

console.log(`Inserted ${zones.length} zones into area_hierarchy`);

// Verify
const out = execSync(`${PG} -h localhost -U pmo_user -d pmo -c "SELECT level, COUNT(*) FROM area_hierarchy GROUP BY level ORDER BY level;"`).toString();
console.log('\n' + out);
