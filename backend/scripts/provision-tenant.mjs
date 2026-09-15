// Provision a new tenant end-to-end (Phase A6): tenant row (plan) + admin user
// + 1 project + zones + departments. Idempotent on tenant code.
// Run: node backend/scripts/provision-tenant.mjs --code PILOT --plan small \
//        --admin-email admin@pilot.test --project PILOT-001
// Env: DATABASE_URL or DB_* parts (same as init.js).
import bcrypt from 'bcryptjs';
import { getDb, closeDb } from '../src/db/index.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
    return acc;
  }, [])
);

const code = args.code || 'PILOT';
const plan = ['small', 'mid', 'enterprise'].includes(args.plan) ? args.plan : 'small';
const adminEmail = args['admin-email'] || `admin@${code.toLowerCase()}.test`;
const projectCode = args.project || `${code}-001`;
const name = args.name || `${code} Pilot`;
const zones = (args.zones || 'A,B,C').split(',').map((s) => s.trim()).filter(Boolean);
const departments = [
  { code: 'KT', name_vi: 'Kỹ thuật' },
  { code: 'TC', name_vi: 'Thi công' },
  { code: 'AT', name_vi: 'An toàn' },
  { code: 'VP', name_vi: 'Văn phòng' },
];

const db = getDb();
try {
  let tenant = await db.prepare('SELECT * FROM tenants WHERE code = ?').getAsync(code);
  if (!tenant) {
    const r = await db.prepare('INSERT INTO tenants (code, name, plan) VALUES (?, ?, ?)').runAsync(code, name, plan);
    tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').getAsync(r.lastInsertRowid);
    console.log(`+ tenant ${code} (id=${tenant.id}, plan=${plan})`);
  } else {
    await db.prepare('UPDATE tenants SET plan = ? WHERE id = ?').runAsync(plan, tenant.id);
    console.log(`= tenant ${code} exists (id=${tenant.id}); plan → ${plan}`);
  }

  let admin = await db.prepare('SELECT id FROM users WHERE tenant_id = ? AND email = ?').getAsync(tenant.id, adminEmail);
  if (!admin) {
    const hash = await bcrypt.hash('admin123', 10);
    const r = await db.prepare(
      'INSERT INTO users (tenant_id, email, name, role, password_hash) VALUES (?, ?, ?, ?, ?) RETURNING id'
    ).runAsync(tenant.id, adminEmail, `Admin ${code}`, 'admin', hash);
    console.log(`+ admin ${adminEmail} (dev password admin123)`);
    admin = { id: Number(r.lastInsertRowid) };
  } else {
    console.log(`= admin ${adminEmail} exists`);
  }

  let project = await db.prepare('SELECT id FROM projects WHERE tenant_id = ? AND code = ?').getAsync(tenant.id, projectCode);
  if (!project) {
    const r = await db.prepare(
      'INSERT INTO projects (tenant_id, code, name_vi, name_en) VALUES (?, ?, ?, ?) RETURNING id'
    ).runAsync(tenant.id, projectCode, `Dự án ${projectCode}`, `${code} Project 001`);
    project = { id: Number(r.lastInsertRowid) };
    console.log(`+ project ${projectCode} (id=${project.id})`);
  } else {
    console.log(`= project ${projectCode} exists (id=${project.id})`);
  }

  for (const z of zones) {
    const exists = await db.prepare('SELECT id FROM zones WHERE project_id = ? AND code = ?').getAsync(project.id, z);
    if (!exists) await db.prepare('INSERT INTO zones (project_id, code) VALUES (?, ?) RETURNING project_id').runAsync(project.id, z);
  }
  console.log(`= zones: ${zones.join(', ')}`);

  for (const d of departments) {
    const exists = await db.prepare('SELECT id FROM departments WHERE tenant_id = ? AND code = ?').getAsync(tenant.id, d.code);
    if (!exists) await db.prepare('INSERT INTO departments (tenant_id, code, name_vi) VALUES (?, ?, ?)').runAsync(tenant.id, d.code, d.name_vi);
  }
  console.log('= departments KT/TC/AT/VP');

  // Explicit membership: admin works on the pilot project (no backfill anymore).
  await db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING project_id')
    .runAsync(project.id, admin.id);
  console.log('= admin added to project members');

  console.log(`\nOK tenant=${code} plan=${plan} admin=${adminEmail} project=${projectCode}`);
} finally {
  await closeDb();
}
