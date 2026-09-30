// Fail-open trong `lib/entitlements.js` = mất kiểm soát tính năng theo gói.
//
// Trước đây có **hai** đường mở khoá toàn bộ tính năng khi dữ liệu lỗi:
//   1. `featuresForPlan(planLạ)` → `PLAN_FEATURES.enterprise`.
//   2. `getEntitlements()` khi không đọc được dòng `tenants` → plan = `'enterprise'`.
// Cả hai đều xảy ra khi: tenant bị xoá, RLS chặn, id sai, hoặc người vận hành gõ
// sai chính tả (`'Enterprise'`, `' enterprise '`). Lúc đó mở khoá `chains`,
// `pillar-sim`, `ai-assistant`, `bim-library`, `erp-export`, `bulk-import`,
// `kpi-targets`, `schedule-compress` — và **không có dấu vết nào** trong log.
//
// Nay: plan lạ hoặc không đọc được → hạ về `small` (ít quyền nhất) **có ghi log**.
// Mất tính năng thì người dùng báo và sửa được trong một phút; mở khoá nhầm thì
// không ai biết cho tới khi có sự cố.
//
//   node tests/e2e/entitlements-fail-closed.mjs
import { ok, summary, psql } from './lib.mjs';
import { featuresForPlan, normalizePlan, getEntitlements } from '../../backend/src/lib/entitlements.js';
import { closeDb } from '../../backend/src/db/index.js';

const small = featuresForPlan('small');
const ent = featuresForPlan('enterprise');
ok(ent.size > small.size, `gói khác nhau về số tính năng — enterprise ${ent.size} > small ${small.size}`);

// 1. Chuẩn hoá: hoa thường và khoảng trắng không được đổi kết quả.
for (const raw of ['enterprise', 'Enterprise', 'ENTERPRISE', ' enterprise ']) {
  ok(normalizePlan(raw) === 'enterprise' && featuresForPlan(raw).size === ent.size,
    `plan "${raw}" vẫn ra enterprise (${featuresForPlan(raw).size} tính năng)`);
}

// 2. Plan lạ / rỗng / thiếu → đúng bằng small, KHÔNG bằng enterprise.
for (const raw of ['pro', 'gold', '', '   ', null, undefined, 0, {}]) {
  const got = featuresForPlan(raw);
  ok(got.size === small.size,
    `plan lạ ${JSON.stringify(raw) ?? 'undefined'} → ${got.size} tính năng = small (${small.size}), không phải enterprise (${ent.size})`);
}

// 3. Tenant không tồn tại: trước đây trả `enterprise`.
const ghost = await getEntitlements(999999);
ok(ghost.plan === 'small', `tenant không tồn tại → plan=small (thấy "${ghost.plan}")`);
ok(ghost.features.length === small.size,
  `tenant không tồn tại → ${ghost.features.length} tính năng, không mở khoá enterprise`);
ok(!ghost.features.includes('chains') && !ghost.features.includes('erp-export'),
  'không mở khoá `chains`/`erp-export` khi không đọc được plan');

// 4. Tenant thật vẫn phải đúng — bỏ fail-closed ở đâu đó sẽ bắt được ở đây.
const hbg = await getEntitlements(Number(psql("SELECT id FROM tenants WHERE name = 'HBG Construction' LIMIT 1") || 1));
ok(hbg.plan === 'enterprise', `tenant thật HBG vẫn enterprise (thấy "${hbg.plan}")`);
ok(hbg.features.length > small.size, `tenant thật HBG vẫn có đủ tính năng (${hbg.features.length})`);

await closeDb();
summary();
