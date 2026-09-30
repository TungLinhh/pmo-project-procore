// Daily overdue digest. One row per user/day makes retries safe across process
// restarts and overlapping cron ticks.
import { getDb } from '../db/index.js';
import { collectAttention } from './attention.js';
import { notify } from '../services/notify.js';
import { runWithTenant } from './tenant.js';

let _lastRun = null;

export const digestHour = () => {
  const value = parseInt(process.env.DIGEST_HOUR);
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : 7;
};

function publicUrl(href) {
  const base = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return base ? `${base}${href}` : href;
}

export async function runOverdueDigest(options = {}) {
  const tenantId = Number(options.tenantId);
  if (!Number.isInteger(tenantId) || tenantId <= 0) throw new Error('tenantId required');
  // Own the tenant context here rather than trusting the callsite. The cron runs
  // with no authenticated request, so it carries no app.current_tenant and RLS
  // rejected every attention_digest_runs INSERT — the daily digest silently
  // recorded nothing. Wrapping the argument (instead of the caller's context)
  // also guarantees tenantId and the GUC can never disagree.
  return runWithTenant(tenantId, () => digest(tenantId, options));
}

async function digest(tenantId, { date = new Date().toISOString().slice(0, 10), force = false } = {}) {
  const db = getDb();
  const [projects, users, memberships] = await Promise.all([
    db.prepare(`SELECT id, code, name_vi, pm_user_id FROM projects WHERE tenant_id = ? AND status = 'ACTIVE' ORDER BY id`).allAsync(tenantId),
    db.prepare(`SELECT id, role, is_ceo, name FROM users WHERE tenant_id = ? AND (role = 'admin' OR is_ceo OR role = 'pm') ORDER BY id`).allAsync(tenantId),
    db.prepare(`SELECT m.project_id, m.user_id FROM project_members m JOIN projects p ON p.id = m.project_id WHERE p.tenant_id = ?`).allAsync(tenantId),
  ]);
  const memberProjects = new Map();
  for (const row of memberships) {
    if (!memberProjects.has(row.user_id)) memberProjects.set(row.user_id, new Set());
    memberProjects.get(row.user_id).add(row.project_id);
  }
  const attentionByProject = new Map();
  for (const project of projects) {
    const attention = await collectAttention(project.id, 5);
    if (attention.total > 0) attentionByProject.set(project.id, attention);
  }

  const deliveries = [];
  for (const user of users) {
    const visible = projects.filter((project) =>
      user.role === 'admin' || user.is_ceo || Number(project.pm_user_id) === Number(user.id) || memberProjects.get(user.id)?.has(project.id));
    const sections = visible.filter((project) => attentionByProject.has(project.id));
    const itemCount = sections.reduce((sum, project) => sum + attentionByProject.get(project.id).total, 0);
    if (!itemCount) continue;
    if (force) {
      await db.prepare('DELETE FROM attention_digest_runs WHERE tenant_id = ? AND digest_date = ? AND user_id = ?')
        .runAsync(tenantId, date, user.id);
    }
    let runId;
    try {
      const inserted = await db.prepare(
        `INSERT INTO attention_digest_runs (tenant_id, digest_date, user_id, project_id, item_count)
         VALUES (?, ?, ?, ?, ?) RETURNING id`
      ).getAsync(tenantId, date, user.id, sections[0].id, itemCount);
      runId = Number(inserted.id);
    } catch (e) {
      if (String(e.code) === '23505') { deliveries.push({ user_id: user.id, duplicate: true, item_count: itemCount }); continue; }
      throw e;
    }

    const lines = sections.flatMap((project) => {
      const attention = attentionByProject.get(project.id);
      return attention.groups.filter((group) => group.count > 0).map((group) => {
        const first = group.items[0];
        const more = group.count > 1 ? ` (+${group.count - 1})` : '';
        return `${project.code} · ${group.title}: ${first?.label || ''}${more} → ${publicUrl(first?.href || group.href)}`;
      });
    });
    const body = `${lines.join('\n')}\n\nMở danh sách đầy đủ: ${publicUrl(`/hq/attention?project=${sections[0].id}`)}`;
    let result;
    try {
      result = await notify({
        userId: user.id,
        tenantId: Number(tenantId),
        projectId: sections[0].id,
        title: `Cần xử lý hôm nay: ${itemCount} việc`,
        body,
        severity: sections.some((project) => attentionByProject.get(project.id).groups.some((group) => group.items.some((item) => item.priority === 'HIGH'))) ? 'critical' : 'warning',
        resourceType: 'overdue_digest',
        resourceId: runId,
        channels: ['in_app', 'email'],
      });
      await db.prepare(
        `UPDATE attention_digest_runs
         SET in_app_status = ?, email_status = ?, error = ?, completed_at = now()
         WHERE id = ?`
      ).runAsync(
        result.in_app?.ok ? 'sent' : 'failed',
        result.email?.ok ? 'sent' : (result.email?.reason || 'not_configured'),
        result.in_app?.ok ? null : result.in_app?.reason || 'unknown',
        runId,
      );
      deliveries.push({ user_id: user.id, run_id: runId, item_count: itemCount, channels: result });
    } catch (e) {
      await db.prepare(
        `UPDATE attention_digest_runs SET in_app_status = 'failed', email_status = 'failed', error = ?, completed_at = now() WHERE id = ?`
      ).runAsync(String(e.message || e).slice(0, 500), runId);
      throw e;
    }
  }
  _lastRun = { at: new Date().toISOString(), tenant_id: Number(tenantId), digest_date: date, deliveries };
  return _lastRun;
}

export const attentionDigestStatus = () => _lastRun;
