// Semantic retrieval (v0.7.0 §2): corpus registry, backfill, permission-first
// top-k over pgvector. One DB row = one chunk (rows are short; no splitter v1).
// Retrieval filters tenant + project membership BEFORE ranking — cross-tenant
// rows are unrankable by construction (plus RLS underneath).
import { getDb } from '../../db/index.js';
import { callEmbed } from './providers.js';

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
                 sd.drawing_code || ' ' || COALESCE(sd.name_vi,'') || ' ' || COALESCE(sd.notes,'') AS text
          FROM shop_drawings sd JOIN projects p ON p.id = sd.project_id AND p.tenant_id = ?`,
  },
  material_submittal: {
    sql: `SELECT p.tenant_id, ms.project_id, ms.id,
                 ms.submittal_code || ' ' || COALESCE(ms.status::text,'') || ' ' || COALESCE(ms.rejection_reason,'') AS text
          FROM material_submittals ms JOIN projects p ON p.id = ms.project_id AND p.tenant_id = ?`,
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
  const have = new Set((await db.prepare(
    `SELECT resource_type || ':' || resource_id AS k FROM ai_embeddings WHERE tenant_id = ? AND embed_model = ?`
  ).allAsync(tenantId, model)).map((r) => r.k));
  const missing = corpus.filter((c) => !have.has(`${c.resource_type}:${c.resource_id}`));
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
         ON CONFLICT (resource_type, resource_id, embed_model) DO UPDATE
         SET chunk_text = EXCLUDED.chunk_text, embedding = EXCLUDED.embedding, project_id = EXCLUDED.project_id`
      ).runAsync(tenantId, c.project_id, c.resource_type, c.resource_id, c.text.slice(0, 2000), vec, model);
      embedded++;
    }
  }
  await db.prepare(
    `INSERT INTO ai_index_state (tenant_id, embed_model, stale, last_backfill_at, updated_at)
     VALUES (?, ?, false, now(), now())
     ON CONFLICT (tenant_id, embed_model) DO UPDATE SET stale = false, last_backfill_at = now(), updated_at = now()`
  ).runAsync(tenantId, model);
  return { corpus: corpus.length, embedded, model };
}

// Permission-first top-k. membershipBypass for admin/CEO (still tenant-scoped).
export async function retrieve(tenantId, { userId, bypass = false, projectId = null, query, k = 12 }) {
  const db = getDb();
  const configs = await db.prepare(
    `SELECT * FROM ai_provider_configs WHERE tenant_id = ? AND purpose = 'embed' AND enabled ORDER BY priority, id`
  ).allAsync(tenantId);
  const model = currentEmbedModel(configs);
  if (!model) throw Object.assign(new Error('no embed provider configured'), { status: 503 });
  const { vectors } = await callEmbed(tenantId, [query]);
  const vec = `[${vectors[0].join(',')}]`;
  const params = [vec, tenantId, model];
  let scope = `e.tenant_id = $2 AND e.embed_model = $3`;
  if (projectId) { params.push(projectId); scope += ` AND e.project_id = $${params.length}`; }
  if (!bypass) {
    params.push(userId);
    scope += ` AND (e.project_id IS NULL OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = e.project_id AND m.user_id = $${params.length}))`;
  }
  params.push(k);
  return db.prepare(
    `SELECT e.resource_type, e.resource_id, e.project_id, e.chunk_text,
            (e.embedding <=> $1::vector) AS dist
     FROM ai_embeddings e WHERE ${scope}
     ORDER BY e.embedding <=> $1::vector LIMIT $${params.length}`
  ).allAsync(...params);
}
