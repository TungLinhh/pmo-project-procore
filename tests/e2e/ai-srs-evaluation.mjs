// SRS AI evaluation: call the real /api/ai/ask path and score the answer
// contract. It never changes business data. A missing provider or corpus is a
// BLOCKED result, not a fabricated PASS.
import { writeFileSync } from 'node:fs';
import { apiBase } from '../tools/env.mjs';
import { getDb, closeDb } from '../../backend/src/db/index.js';

const BASE = apiBase();
const projectId = process.env.AI_EVAL_PROJECT_ID || null;
const output = process.env.AI_EVAL_OUTPUT || '/tmp/opencode/ai-srs-evaluation.json';
const mock = process.env.AI_MOCK === '1';

const questions = [
  { key: 'ceo_portfolio', role: 'ceo', email: 'ceo@hbg.com', department: 'Ban điều hành', question: 'Dự án nào cần Ban điều hành ra quyết định ngay về tiến độ hoặc dòng tiền? Nêu hạng mục, số liệu và quyết định cần chốt.', expect: ['dự án', 'quyết định'] },
  { key: 'pm_gate', role: 'pm', email: 'pm@hbg.com', department: 'PM', question: 'Gate nào đang chặn tiến độ? Hạng mục nào cần PM xử lý trước và bằng chứng nào cho thấy?', expect: ['gate', 'hạng mục'] },
  { key: 'pmo_rollup', role: 'pmo', email: 'pmo@hbg.com', department: 'PMO', question: 'Tóm tắt sức khỏe tiến độ và các việc quá hạn cần đưa vào báo cáo Ban điều hành.', expect: ['quá hạn', 'báo cáo'] },
  { key: 'site_today', role: 'site', email: 'site@hbg.com', department: 'Chỉ huy trưởng công trường', question: 'Hôm nay site cần làm gì, thiếu vật tư nào chặn hạng mục, và rủi ro an toàn nào cần báo?', expect: ['vật tư', 'hạng mục'] },
  { key: 'procurement_material', role: 'procurement', email: 'procurement@hbg.com', department: 'Phòng Vật tư/Thu mua', question: 'Vật tư nào đang chờ MSB hoặc chưa đủ điều kiện giao, và Procurement cần chuyển việc gì tiếp theo?', expect: [['msb'], ['giao', 'chờ giao', 'chưa đủ điều kiện giao']] },
  { key: 'technical_drawing', role: 'technical', email: 'technical@hbg.com', department: 'Phòng Kỹ thuật/Thiết kế', question: 'Shopdrawing nào bị trả hoặc đang chờ duyệt, và cần xử lý hạng mục nào để mở điều kiện downstream?', expect: [['shopdrawing', 'shop drawing', 'bản vẽ shop'], ['duyệt', 'trả', 'pending']] },
  { key: 'accounting_payment', role: 'accounting', email: 'accounting@hbg.com', department: 'Phòng Tài chính/Kế toán', question: 'Payment request nào được duyệt nhưng chưa chi, retention nào cần theo dõi, và bước tiếp theo của Kế toán là gì?', expect: [['thanh toán', 'payment', 'payment request'], ['retention', 'giữ lại', 'bảo hành']] },
  { key: 'insufficient', role: 'ceo', email: 'ceo@hbg.com', department: 'Ban điều hành', question: 'Con số doanh thu năm 2035 của dự án chưa có trong hệ thống là bao nhiêu?', expect: null, insufficient: true },
];

const normalize = (value) => String(value || '')
  .toLowerCase()
  .replace(/đ/g, 'd')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const hasExpectedTerm = (text, expected) => {
  const alternatives = Array.isArray(expected) ? expected : [expected];
  const compactText = normalize(text).replace(/ /g, '');
  return alternatives.some((term) => compactText.includes(normalize(term).replace(/ /g, '')));
};

async function call(path, options = {}) {
  const started = Date.now();
  const response = await fetch(BASE + path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  return { status: response.status, body, latency_ms: Date.now() - started };
}

const report = { generated_at: new Date().toISOString(), base_url: BASE, mode: mock ? 'AI_MOCK' : 'real-provider', project_id: projectId, results: [], summary: {} };
const db = getDb();
const businessSnapshot = async () => {
  const rows = await Promise.all([
    db.prepare('SELECT COUNT(*) AS c FROM pillar_scenarios').getAsync(),
    db.prepare('SELECT COUNT(*) AS c FROM schedule_baselines').getAsync(),
    db.prepare('SELECT COUNT(*) AS c FROM ai_drafts').getAsync(),
    db.prepare('SELECT COUNT(*) AS c FROM notifications').getAsync(),
  ]);
  return rows.map((row) => Number(row.c || 0));
};
const beforeSideEffects = await businessSnapshot();
for (const item of questions) {
  const login = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: item.email, password: 'admin123' }) });
  if (login.status !== 200 || !login.body?.token) {
    report.results.push({ ...item, status: 'BLOCKED', reason: `login ${login.status}` });
    continue;
  }
  const accessibleProjects = await call('/api/projects', { headers: { Authorization: `Bearer ${login.body.token}` } });
  const accessible = Array.isArray(accessibleProjects.body) ? accessibleProjects.body : [];
  const effectiveProjectId = accessible.some((project) => Number(project.id) === Number(projectId))
    ? Number(projectId)
    : (accessible[0]?.id || null);
  const answer = await call('/api/ai/ask', {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify({ question: item.question, project_id: effectiveProjectId, k: 12 }),
  });
  const text = String(answer.body?.answer || '');
  const citations = Array.isArray(answer.body?.citations) ? answer.body.citations : [];
  const citationShape = citations.every((citation) => citation.resource_type && citation.resource_id != null);
  let verdict = 'PASS';
  let reason = 'answer, citations, and role-routing contract satisfied';
  if (answer.status !== 200 || !text.trim()) {
    verdict = 'BLOCKED';
    reason = `ask returned ${answer.status}: ${answer.body?.error || 'empty answer'}`;
  } else if (!citationShape) {
    verdict = 'FAIL';
    reason = 'citation entries are missing resource_type/resource_id';
  } else if (item.insufficient) {
    const refuses = /không đủ dữ liệu|chưa có dữ liệu/i.test(text);
    verdict = refuses ? 'PASS' : 'FAIL';
    reason = refuses ? 'insufficient-data question refused without inventing a value' : 'insufficient-data question did not refuse cleanly';
  } else if (citations.length === 0) {
    const refuses = /không đủ dữ liệu|chưa có dữ liệu/i.test(text);
    verdict = refuses ? 'BLOCKED' : 'FAIL';
    reason = refuses ? 'no accessible project corpus; refusal is correct but usefulness is not proven' : 'answer has no source citation';
  } else if (item.expect && !item.expect.every((term) => hasExpectedTerm(text, term))) {
    verdict = 'FAIL';
    reason = `answer did not preserve expected business routing terms: ${item.expect.join(', ')}`;
  }
  report.results.push({
    key: item.key, role: item.role, department: item.department, project_id: effectiveProjectId, status: verdict,
    http_status: answer.status, latency_ms: answer.latency_ms, provider: answer.body?.provider || null,
    model: answer.body?.model || null, route_status: answer.body?.route_status || null,
    fallback: !!answer.body?.fallback, answer_source: answer.body?.answer_source || 'model',
    cited_by_model: answer.body?.cited_by_model ?? null, citation_count: citations.length, reason,
    answer_excerpt: text.slice(0, 500),
  });
}

const afterSideEffects = await businessSnapshot();
report.business_rows_before = beforeSideEffects;
report.business_rows_after = afterSideEffects;
report.no_business_side_effects = beforeSideEffects.every((value, index) => value === afterSideEffects[index]);
const counts = report.results.reduce((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {});
report.summary = { total: report.results.length, ...counts, no_business_side_effects: report.no_business_side_effects, release_blocked: Object.values(counts).some((v) => v > 0) && (counts.FAIL || counts.BLOCKED) > 0 };
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
for (const row of report.results) console.log(`${row.status} — ${row.key}: ${row.reason}`);
await closeDb();
process.exit(report.summary.release_blocked ? 1 : 0);
