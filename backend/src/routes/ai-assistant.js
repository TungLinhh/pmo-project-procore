// AI assistant: semantic ask, backfill trigger, drafts inbox (v0.7.0 §2–3).
// Anti-hallucination contract: no retrieved chunks → explicit "not enough
// data" (never a fabricated answer); every claim cites [#type:id].
// Mount: /api/ai. Enterprise flag on everything here.
import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireFeature } from '../lib/entitlements.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { callChat } from '../lib/ai/providers.js';
import { retrieve, backfillTenant } from '../lib/ai/retrieval.js';
import { notify } from '../services/notify.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);
router.use(requireFeature('ai-assistant'));

const isPrivileged = (u) => u.role === 'admin' || !!u.is_ceo;

const SYSTEM = `Bạn là trợ lý dự án xây dựng. Chỉ trả lời dựa trên NGỮ CẢNH được cung cấp dưới đây.
- Mỗi khẳng định phải kèm trích dẫn dạng [#loại:id] (ví dụ [#issue:12]).
- Nếu ngữ cảnh KHÔNG đủ để trả lời, hãy nói rõ "không đủ dữ liệu" — tuyệt đối không bịa thêm.
- Trả lời bằng tiếng Việt, súc tích, ưu tiên hành động cụ thể.`;

// POST /api/ai/ask {question, project_id?, k?}
router.post('/ask', async (req, res) => {
  const db = getDb();
  const { question, project_id = null, k = 12 } = req.body || {};
  if (!question || typeof question !== 'string' || !question.trim() || question.length > 2000) {
    return res.status(400).json({ error: 'question (1..2000 chars) required' });
  }
  if (project_id) {
    const { checkProjectAccess } = await import('../lib/project-access.js');
    if (!(await checkProjectAccess(req.user, Number(project_id)))) {
      return res.status(404).json({ error: 'Not found' });
    }
  }
  try {
    const chunks = await retrieve(req.user.tenant_id, {
      userId: req.user.id, bypass: isPrivileged(req.user),
      projectId: project_id ? Number(project_id) : null,
      query: question.trim(), k: Math.min(Math.max(Number(k) || 12, 1), 30),
    });
    if (!chunks.length) {
      return res.json({ answer: 'Không đủ dữ liệu trong phạm vi bạn được phép xem để trả lời câu hỏi này.', citations: [], chunks: [] });
    }
    const context = chunks.map((c) => `[#${c.resource_type}:${c.resource_id}] ${c.chunk_text}`).join('\n');
    const r = await callChat(req.user.tenant_id, {
      system: SYSTEM,
      user: `Câu hỏi: ${question.trim()}\n\nNGỮ CẢNH:\n${context}`,
      maxTokens: 800,
    });
    res.json({
      answer: r.text,
      provider: r.provider, model: r.model,
      citations: chunks.map((c) => ({ resource_type: c.resource_type, resource_id: c.resource_id, project_id: c.project_id, dist: Number(c.dist) })),
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/ai/backfill (admin/CEO) — embed missing rows for current model.
router.post('/backfill', requireRole('admin', 'ceo'), async (req, res) => {
  try {
    const out = await backfillTenant(req.user.tenant_id, { batch: 100 });
    await withAudit(req, {
      action: 'AI_BACKFILL', resourceType: 'ai_index', resourceId: req.user.tenant_id,
      after: out, note: `AI backfill: ${out.embedded}/${out.corpus} (${out.model})`,
    }, null).catch(() => {});
    res.json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/ai/drafts?status=pending — approval inbox for agent drafts.
router.get('/drafts', async (req, res) => {
  const db = getDb();
  const { status = 'pending' } = req.query;
  if (!['pending', 'approved', 'dismissed'].includes(status)) return res.status(400).json({ error: 'bad status' });
  res.json(await db.prepare(
    `SELECT d.*, p.code AS project_code FROM ai_drafts d LEFT JOIN projects p ON p.id = d.project_id
     WHERE d.tenant_id = ? AND d.status = ? ORDER BY d.created_at DESC LIMIT 100`
  ).allAsync(req.user.tenant_id, status));
});

// POST /api/ai/drafts/:id/approve — human clicks: notify owner, mark approved.
router.post('/drafts/:id/approve', async (req, res) => {
  const db = getDb();
  const d = await db.prepare('SELECT * FROM ai_drafts WHERE id = ? AND tenant_id = ?').getAsync(req.params.id, req.user.tenant_id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  if (d.status !== 'pending') return res.status(409).json({ error: `already ${d.status}` });
  try {
    await withAudit(req, {
      action: 'AI_DRAFT_APPROVE', resourceType: 'ai_draft', resourceId: Number(d.id),
      context: { kind: d.kind, project_id: d.project_id },
      before: { status: 'pending' }, after: { status: 'approved' },
      note: `Duyệt draft AI: ${d.title}`,
    }, async (client) => {
      await client.query(`UPDATE ai_drafts SET status = 'approved', decided_at = now() WHERE id = $1`, [d.id]);
      return { ok: true };
    });
    const payload = typeof d.payload === 'string' ? JSON.parse(d.payload) : (d.payload || {});
    if (payload.notify_user_id) {
      await notify({
        userId: payload.notify_user_id, tenantId: req.user.tenant_id,
        title: d.title, body: d.body, severity: payload.severity || 'warning',
        resourceType: payload.resource_type || null, resourceId: payload.resource_id || null,
        projectId: d.project_id,
      }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ai/drafts/:id/dismiss — audit-logged, no side effects.
router.post('/drafts/:id/dismiss', async (req, res) => {
  const db = getDb();
  const d = await db.prepare('SELECT * FROM ai_drafts WHERE id = ? AND tenant_id = ?').getAsync(req.params.id, req.user.tenant_id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  if (d.status !== 'pending') return res.status(409).json({ error: `already ${d.status}` });
  try {
    await withAudit(req, {
      action: 'AI_DRAFT_DISMISS', resourceType: 'ai_draft', resourceId: Number(d.id),
      before: { status: 'pending' }, after: { status: 'dismissed' },
      note: `Bỏ draft AI: ${d.title}`,
    }, async (client) => {
      await client.query(`UPDATE ai_drafts SET status = 'dismissed', decided_at = now() WHERE id = $1`, [d.id]);
      return { ok: true };
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
