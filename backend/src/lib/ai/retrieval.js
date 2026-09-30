// Semantic retrieval (v0.7.0 §2): corpus registry, backfill, permission-first
// top-k over pgvector. One DB row = one chunk (rows are short; no splitter v1).
// Retrieval filters tenant + project membership BEFORE ranking — cross-tenant
// rows are unrankable by construction (plus RLS underneath).
import { getDb } from '../../db/index.js';
import { callEmbed } from './providers.js';
import { canAccess } from '../permissions.js';

// Every indexed source must be readable through the same module matrix as its
// REST counterpart. Project membership alone is not enough: SITE, for example,
// may read schedule data but must never retrieve payment amounts through AI.
export const SOURCE_ACCESS = Object.freeze({
  issue: ['issue', 'read'],
  directive: ['directive', 'read'],
  daily_note: ['daily_report', 'read'],
  shop_drawing: ['shop', 'read'],
  material: ['material', 'read'],
  material_submittal: ['material', 'read'],
  schedule_item: ['schedule', 'read'],
  ar_line: ['payment', 'read'],
  payment_request: ['payment', 'read'],
  payment: ['payment', 'read'],
});

function preferredSourceTypes(query) {
  const q = String(query || '').toLowerCase();
  if (/shop\s*drawing|shopdrawing|bản vẽ|bptc|ifc/.test(q)) return ['shop_drawing', 'schedule_item', 'material_submittal'];
  if (/payment|thanh toán|retention|công nợ|tiền mặt/.test(q)) return ['payment_request', 'payment', 'ar_line'];
  if (/vật tư|material|msb|submittal|giao hàng/.test(q)) return ['material_submittal', 'material', 'schedule_item'];
  if (/gate|hạng mục|tiến độ|schedule|trễ/.test(q)) return ['schedule_item', 'issue', 'directive'];
  if (/site|hôm nay|daily|nhân lực|an toàn/.test(q)) return ['daily_note', 'schedule_item', 'issue'];
  return [];
}

export async function visibleSourceTypes({ role, userId, projectId = null, bypass = false }) {
  if (bypass) return Object.keys(SOURCE_ACCESS);
  if (!role || !userId) return [];
  const allowed = [];
  const seen = new Map();
  for (const [resourceType, [module, action]] of Object.entries(SOURCE_ACCESS)) {
    const key = `${module}:${action}`;
    let ok = seen.get(key);
    if (ok === undefined) {
      ok = await canAccess(role, module, action, projectId, userId);
      seen.set(key, ok);
    }
    if (ok) allowed.push(resourceType);
  }
  return allowed;
}

// Each source: how to select (tenant_id, project_id, id, text). text NULLs drop.
const SOURCES = {
  issue: {
    sql: `SELECT tenant_id, project_id, id, '[' || COALESCE(severity,'') || '] ' || title || ': ' || COALESCE(body,'') AS text
          FROM issues WHERE tenant_id = ?`,
  },
  directive: {
    sql: `SELECT tenant_id, project_id, id, body AS text FROM directives WHERE tenant_id = ?`,
  },
  daily_note: {
    sql: `SELECT p.tenant_id, dr.project_id, dr.id, dr.report_date || ' ' || dr.notes AS text
          FROM daily_reports dr JOIN projects p ON p.id = dr.project_id AND p.tenant_id = ?
          WHERE dr.notes IS NOT NULL AND dr.notes <> ''`,
  },
  shop_drawing: {
    sql: `SELECT p.tenant_id, sd.project_id, sd.id,
                 sd.drawing_code || ' ' || COALESCE(sd.name_vi,'') || ' trang-thai:' || COALESCE(sd.status::text,'') ||
                 ' tien-do:' || COALESCE(CAST(CAST(COALESCE(sd.progress_pct,0)*100 AS INTEGER) AS TEXT),'0') || '%' ||
                 ' BQL:' || COALESCE(sd.bql_l1_response,'') || '/' || COALESCE(sd.bql_l2_response,'') || '/' || COALESCE(sd.bql_l3_response,'') ||
                 ' ly-do-tra:' || COALESCE(sd.rejected_reason,'') || ' ' || COALESCE(sd.notes,'') AS text
          FROM shop_drawings sd JOIN projects p ON p.id = sd.project_id AND p.tenant_id = ?`,
  },
  material: {
    sql: `SELECT p.tenant_id, m.project_id, m.id,
                 m.material_code || ' ' || COALESCE(m.name_vi,'') ||
                 ' tien-do:' || COALESCE(CAST(CAST(COALESCE(m.progress_pct,0)*100 AS INTEGER) AS TEXT),'0') || '%' ||
                 ' ' || COALESCE(m.notes,'') AS text
          FROM materials m JOIN projects p ON p.id = m.project_id AND p.tenant_id = ?`,
  },
  schedule_item: {
    sql: `SELECT p.tenant_id, csi.project_id, csi.id,
                 COALESCE(csi.name_vi,'') || ' trang-thai:' || COALESCE(csi.status,'') ||
                 ' tien-do:' || COALESCE(CAST(CAST(COALESCE(csi.progress_pct,0)*100 AS INTEGER) AS TEXT),'0') || '%' ||
                 ' KH:' || COALESCE(CAST(csi.plan_start_date AS TEXT),'') || '->' || COALESCE(CAST(csi.plan_end_date AS TEXT),'') AS text
          FROM construction_schedule_items csi JOIN projects p ON p.id = csi.project_id AND p.tenant_id = ?`,
  },
  ar_line: {
    sql: `SELECT p.tenant_id, al.project_id, al.id,
                 COALESCE(al.kind,'') || ' ' || COALESCE(al.label,'') || ' so-tien:' || COALESCE(CAST(al.amount AS TEXT),'') ||
                 ' ' || COALESCE(al.note,'') AS text
          FROM ar_lines al JOIN projects p ON p.id = al.project_id AND p.tenant_id = ?`,
  },
  material_submittal: {
    sql: `SELECT p.tenant_id, ms.project_id, ms.id,
                 ms.submittal_code || ' trạng thái:' || COALESCE(ms.status::text,'') ||
                 ' vật tư:' || COALESCE(m.material_code,'') || ' ' || COALESCE(m.name_vi,'') ||
                 ' SLA:' || COALESCE(CAST(ms.sla_deadline AS TEXT),'') ||
                 ' MSB deadline:' || COALESCE(CAST(ms.supervisor_deadline AS TEXT),'') ||
                 ' ' || COALESCE(ms.rejection_reason,'') AS text
          FROM material_submittals ms
          JOIN projects p ON p.id = ms.project_id AND p.tenant_id = ?
          LEFT JOIN materials m ON m.id = ms.material_id`,
  },
  payment_request: {
    sql: `SELECT p.tenant_id, c.project_id, pr.id,
                 pr.request_no || ' trạng thái:' || COALESCE(pr.status::text,'') ||
                 ' hợp đồng:' || COALESCE(c.contract_no,'') ||
                 ' hóa đơn:' || COALESCE(i.invoice_no,'') ||
                 ' số tiền:' || COALESCE(CAST(pr.amount AS TEXT),'') ||
                 ' retention:' || COALESCE(CAST(pr.retention_amount AS TEXT),'') ||
                 ' hạn:' || COALESCE(CAST(pr.due_date AS TEXT),'') ||
                 ' retention_status:' || COALESCE(pr.retention_status,'') ||
                 ' ' || COALESCE(pr.notes,'') AS text
          FROM payment_requests pr
          JOIN invoices i ON i.id = pr.invoice_id
          JOIN contracts c ON c.id = i.contract_id
          JOIN projects p ON p.id = c.project_id AND p.tenant_id = ?`,
  },
  payment: {
    sql: `SELECT p.tenant_id, pay.project_id, pay.id,
                 'payment ' || COALESCE(pay.contract_no,'') || ' ' || COALESCE(pay.invoice_no,'') ||
                 ' trạng thái:' || COALESCE(pay.status::text,'') ||
                 ' đã chi:' || COALESCE(CAST(pay.paid_amount AS TEXT),'') ||
                 ' retention giữ:' || COALESCE(CAST(pay.retention_held AS TEXT),'') ||
                 ' retention đã release:' || COALESCE(CAST(pay.retention_released_amount AS TEXT),'') ||
                 ' ngày chi:' || COALESCE(CAST(pay.paid_at AS TEXT),'') ||
                 ' ' || COALESCE(pay.notes,'') AS text
          FROM payments pay JOIN projects p ON p.id = pay.project_id AND p.tenant_id = ?`,
  },
};

export function currentEmbedModel(configs) {
  const c = (configs || []).filter((x) => x.purpose === 'embed' && x.enabled).sort((a, b) => a.priority - b.priority)[0];
  return c ? c.model : null;
}

export async function collectCorpus(tenantId) {
  const db = getDb();
  const rows = [];
  for (const [type, src] of Object.entries(SOURCES)) {
    const rs = await db.prepare(src.sql).allAsync(tenantId);
    for (const r of rs) {
      const text = String(r.text || '').trim();
      if (text) rows.push({ resource_type: type, resource_id: r.id, project_id: r.project_id, text });
    }
  }
  return rows;
}

// Backfill missing embeddings for the tenant's CURRENT embed model.
// Deletes rows of retired models (keeps the table lean, never mixed-model compare).
// Returns { corpus, embedded, model }.
export async function backfillTenant(tenantId, { batch = 100 } = {}) {
  const db = getDb();
  const configs = await db.prepare(
    `SELECT * FROM ai_provider_configs WHERE tenant_id = ? AND purpose = 'embed' AND enabled ORDER BY priority, id`
  ).allAsync(tenantId);
  const model = currentEmbedModel(configs);
  if (!model) throw Object.assign(new Error('no embed provider configured'), { status: 503 });
  await db.prepare('DELETE FROM ai_embeddings WHERE tenant_id = ? AND embed_model <> ?').runAsync(tenantId, model);
  const corpus = await collectCorpus(tenantId);
  // Self-healing: re-embed rows whose source text changed (so chunk_text
  // khong lac hau khi du lieu goc doi). So sanh tren text da slice(0,2000).
  const have = new Map((await db.prepare(
    `SELECT resource_type || ':' || resource_id AS k, chunk_text AS t FROM ai_embeddings WHERE tenant_id = ? AND embed_model = ?`
  ).allAsync(tenantId, model)).map((r) => [r.k, r.t]));
  const missing = corpus.filter((c) => have.get(`${c.resource_type}:${c.resource_id}`) !== c.text.slice(0, 2000));
  let embedded = 0;
  for (let i = 0; i < missing.length; i += batch) {
    const chunk = missing.slice(i, i + batch);
    const { vectors } = await callEmbed(tenantId, chunk.map((c) => c.text));
    for (let j = 0; j < chunk.length; j++) {
      const c = chunk[j];
      const vec = `[${vectors[j].join(',')}]`;
      await db.prepare(
        `INSERT INTO ai_embeddings (tenant_id, project_id, resource_type, resource_id, chunk_text, embedding, embed_model)
         VALUES (?, ?, ?, ?, ?, ?::vector, ?)
         ON CONFLICT (tenant_id, resource_type, resource_id, embed_model) DO UPDATE
         SET chunk_text = EXCLUDED.chunk_text, embedding = EXCLUDED.embedding, project_id = EXCLUDED.project_id`
      ).runAsync(tenantId, c.project_id, c.resource_type, c.resource_id, c.text.slice(0, 2000), vec, model);
      embedded++;
    }
  }
  // Remove embeddings whose source row was deleted. Without this, a removed
  // issue/payment remains searchable and produces a citation that opens 404.
  await db.prepare(
    `DELETE FROM ai_embeddings e
     WHERE e.tenant_id = ? AND e.embed_model = ?
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_to_recordset(?::jsonb) AS live(resource_type TEXT, resource_id INTEGER)
         WHERE live.resource_type = e.resource_type AND live.resource_id = e.resource_id
       )`
  ).runAsync(tenantId, model, JSON.stringify(corpus.map(({ resource_type, resource_id }) => ({ resource_type, resource_id }))));
  await db.prepare(
    `INSERT INTO ai_index_state (tenant_id, embed_model, stale, last_backfill_at, updated_at)
     VALUES (?, ?, false, now(), now())
     ON CONFLICT (tenant_id, embed_model) DO UPDATE SET stale = false, last_backfill_at = now(), updated_at = now()`
  ).runAsync(tenantId, model);
  return { corpus: corpus.length, embedded, model };
}

// Permission-first top-k. Admin/CEO may bypass project membership, but never
// tenant isolation. The source-type list is resolved through the canonical
// permission matrix before ranking.
export async function retrieve(tenantId, {
  userId, role = null, bypass = false, projectId = null, query, k = 12, maxDist = null,
}) {
  const db = getDb();
  const configs = await db.prepare(
    `SELECT * FROM ai_provider_configs WHERE tenant_id = ? AND purpose = 'embed' AND enabled ORDER BY priority, id`
  ).allAsync(tenantId);
  const model = currentEmbedModel(configs);
  if (!model) throw Object.assign(new Error('no embed provider configured'), { status: 503 });
  const allowedTypes = await visibleSourceTypes({ role, userId, projectId, bypass });
  if (!allowedTypes.length) return [];
  const { vectors } = await callEmbed(tenantId, [query]);
  const vec = `[${vectors[0].join(',')}]`;
  const params = [vec, tenantId, model];
  let scope = `e.tenant_id = $2 AND e.embed_model = $3`;
  params.push(allowedTypes);
  scope += ` AND e.resource_type = ANY($${params.length}::text[])`;
  const preferredTypes = preferredSourceTypes(query);
  params.push(preferredTypes);
  const preferredParam = `$${params.length}::text[]`;
  if (projectId) { params.push(projectId); scope += ` AND e.project_id = $${params.length}`; }
  if (!bypass) {
    params.push(userId);
    scope += ` AND (e.project_id IS NULL OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = e.project_id
        AND (p.pm_user_id = $${params.length}
          OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $${params.length}))
    ))`;
  }
  const configuredDistance = maxDist == null ? (process.env.AI_MAX_DISTANCE || 0.9) : maxDist;
  const distance = Number(configuredDistance);
  if (Number.isFinite(distance)) {
    params.push(distance);
    scope += ` AND (e.resource_type = ANY(${preferredParam}) OR (e.embedding <=> $1::vector) <= $${params.length})`;
  }
  const candidateLimit = preferredTypes.length ? Math.min(Math.max(k * 4, 12), 60) : k;
  params.push(candidateLimit);
  const rows = await db.prepare(
    `SELECT e.resource_type, e.resource_id, e.project_id, e.chunk_text,
            (e.embedding <=> $1::vector) AS dist
     FROM ai_embeddings e WHERE ${scope}
     ORDER BY array_position(${preferredParam}, e.resource_type) NULLS LAST,
              e.embedding <=> $1::vector, e.id
     LIMIT $${params.length}`
  ).allAsync(...params);
  if (!preferredTypes.length) return rows;
  const queryLower = String(query || '').toLowerCase();
  const score = (row) => {
    const typeIndex = preferredTypes.indexOf(row.resource_type);
    let value = typeIndex < 0 ? 100 : typeIndex;
    if (/shop\s*drawing|shopdrawing|bản vẽ|bptc|ifc/.test(queryLower) && row.resource_type === 'shop_drawing') {
      if (/bql:r|rejected|trả|bị trả/i.test(String(row.chunk_text || ''))) value -= 20;
      else if (/submitted|pending|chờ duyệt/i.test(String(row.chunk_text || ''))) value -= 10;
    }
    return value;
  };
  return rows.sort((a, b) => score(a) - score(b) || Number(a.dist) - Number(b.dist)).slice(0, k);
}
