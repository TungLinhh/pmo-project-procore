// Seed 6 demo users cho 6 role (mục 43.2)
// Idempotent: chỉ insert nếu chưa có
// TODO: tạm thời, chờ sếp tổng xác nhận (mục 43.2) — 6 role cố định
// Mapping: CEO (is_ceo=1, role=pmo), PM, PMO, Site, Procurement, Accounting
// Passwords hard-coded in src/lib/auth.js PASSWORDS map
import { getDb } from './src/db/index.js';

const db = getDb();
const tenantId = 1;

const demoUsers = [
  { email: 'ceo@hbg.com', name: 'Nguyễn Văn Tổng (CEO)', role: 'pmo', is_ceo: 1 },
  { email: 'pm@hbg.com', name: 'Trần Văn PM', role: 'pm', is_ceo: 0 },
  { email: 'pmo@hbg.com', name: 'Lê Thị PMO', role: 'pmo', is_ceo: 0 },
  { email: 'site@hbg.com', name: 'Phạm Văn Site', role: 'site', is_ceo: 0 },
  { email: 'procurement@hbg.com', name: 'Hoàng Thị Mua', role: 'procurement', is_ceo: 0 },
  { email: 'accounting@hbg.com', name: 'Võ Văn Kế Toán', role: 'accounting', is_ceo: 0 },
];

const existing = db.prepare('SELECT email FROM users WHERE tenant_id = 1').all().map(r => r.email);
console.log(`Existing: ${existing.length} users`);

for (const u of demoUsers) {
  if (existing.includes(u.email)) {
    console.log(`  SKIP ${u.email}`);
    continue;
  }
  db.prepare(`INSERT INTO users (tenant_id, email, name, role, is_ceo, created_at) VALUES (1, ?, ?, ?, ?, datetime('now'))`)
    .run(u.email, u.name, u.role, u.is_ceo);
  console.log(`  ADDED ${u.email} (${u.role}${u.is_ceo ? ', CEO' : ''})`);
}

console.log('\n=== Demo accounts (mục 43.2) ===');
console.log('  admin@hbg.com / admin123  →  Admin (full access)');
for (const u of demoUsers) {
  const pass = u.email.split('@')[0] + '123';
  console.log(`  ${u.email} / ${pass}  →  ${u.name} (${u.role}${u.is_ceo ? ', CEO' : ''})`);
}

