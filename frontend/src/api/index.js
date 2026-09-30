// API client + auth token management
import { todayLocal } from '../utils/datetime.js';
import { t } from '../i18n/index.js';
const BASE = '/api';
export const API_BASE = ''; // full URL base (use '' to go via Vite proxy or same-origin)

let _token = localStorage.getItem('pmo_token');
let _user = (() => { try { return JSON.parse(localStorage.getItem('pmo_user')); } catch { return null; } })();

function authHeaders() {
  return _token ? { Authorization: `Bearer ${_token}` } : {};
}

export function setToken(t) {
  _token = t;
  if (t) localStorage.setItem('pmo_token', t);
  else localStorage.removeItem('pmo_token');
}

export function getToken() {
  // Luôn đọc từ localStorage để khôi phục khi reload/F5 (in-memory _token có thể bị mất)
  if (_token) return _token;
  const ls = (typeof localStorage !== 'undefined' && localStorage.getItem('pmo_token')) || null;
  if (ls) { _token = ls; }
  return _token;
}

export function getUser() {
  const u = localStorage.getItem('pmo_user');
  return u ? JSON.parse(u) : null;
}

export function setUser(u) {
  _user = u;
  if (u) localStorage.setItem('pmo_user', JSON.stringify(u));
  else localStorage.removeItem('pmo_user');
}

function getRefreshToken() {
  return (typeof localStorage !== 'undefined' && localStorage.getItem('pmo_refresh')) || null;
}

export function setRefreshToken(t) {
  if (t) localStorage.setItem('pmo_refresh', t);
  else localStorage.removeItem('pmo_refresh');
}

async function tryRefresh() {
  const send = async (rt) => {
    const r = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.token ? j : null;
  };

  const rt = getRefreshToken();
  if (!rt) return false;
  try {
    const j = await send(rt);
    if (!j) {
      // A refresh token is single-use: the server revokes it on rotation and
      // treats a second presentation as a stolen token, killing the whole
      // family. That is the right call, but it punishes a benign race — two
      // tabs, or one tab whose stored value is a rotation behind. The server
      // only forgives replays inside REFRESH_REUSE_GRACE_MS, which is far
      // shorter than a 30s poll, so the losing tab logged the user out.
      //
      // If the stored token changed while we were in flight, another context
      // already rotated it. Retry once with the newer one before giving up.
      const latest = getRefreshToken();
      if (!latest || latest === rt) return false;
      const again = await send(latest);
      if (!again) return false;
      setToken(again.token);
      if (again.refresh_token) setRefreshToken(again.refresh_token);
      return true;
    }
    setToken(j.token);
    if (j.refresh_token) setRefreshToken(j.refresh_token);
    return true;
  } catch { return false; }
}

// Dựng fetch options từ `opts` (token, body, Content-Type). Tách riêng để
// `request` và `requestPage` dùng chung — khác biệt giữa hai hàm chỉ là hàm cần
// đọc header, không phải cách gọi.
async function buildRequest(path, opts) {
  const originalBody = opts.body;
  const isPlainBody = originalBody != null && !(originalBody instanceof FormData) && typeof originalBody !== 'string';
  const headers = { ...(opts.headers || {}) };
  if (_token) headers.Authorization = `Bearer ${_token}`;
  if (isPlainBody || typeof originalBody === 'string') headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  return {
    ...opts,
    headers,
    ...(originalBody != null ? { body: isPlainBody ? JSON.stringify(originalBody) : originalBody } : {}),
  };
}

export async function request(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, await buildRequest(path, opts));
  // Transparent single retry after refresh rotation (not for auth endpoints themselves).
  if (r.status === 401 && !opts._retried && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return request(path, { ...opts, _retried: true });
  }
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    // Attach status + body: flows like forced password change (403 with token
    // inside) need the payload, not just the message.
    const err = new Error(e.error || 'Request failed');
    err.status = r.status;
    err.response = e;
    throw err;
  }
  return r.status === 204 ? null : r.json();
}

// Gọi route có phân trang và trả về cả tổng số hàng.
//
// Thân response vẫn là mảng như mọi route; tổng nằm trong header `X-Total-Count`
// mà `request()` bỏ qua. Hàm này là nơi duy nhất biết tới header đó, để các màn
// khác chỉ cần `{ rows, total }`.
//
// `total` là null khi server không gửi header (route cũ chưa phân trang) — màn
// dùng phải coi như "không biết tổng" chứ không phải "không còn dữ liệu".
export async function requestPage(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, await buildRequest(path, opts));
  if (r.status === 401 && !opts._retried && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return requestPage(path, { ...opts, _retried: true });
  }
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    const err = new Error(e.error || 'Request failed');
    err.status = r.status;
    err.response = e;
    throw err;
  }
  const rows = r.status === 204 ? [] : await r.json();
  const header = r.headers.get('X-Total-Count');
  const total = header === null ? null : Number(header);
  return { rows: Array.isArray(rows) ? rows : [], total: Number.isFinite(total) ? total : null };
}

// Demo default project: the loaded BTE project when present, else first.
// Keeps every tab's fallback selection on the project that actually has data.
export function preferDemoProject(list, code = 'BTE-WP4-HBC') {
  if (!Array.isArray(list) || !list.length) return null;
  return list.find(p => p.code === code)?.id ?? list[0].id;
}
// (Raw `new URLSearchParams({search: undefined})` serializes the literal
// string "undefined", which the backend then filters on — empty tables.)
function qs(params) {
  if (!params) return '';
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : '';
}

// Auth
export const auth = {
  login: (email, password, tenant) => request('/auth/login', { method: 'POST', body: { email, password, tenant: tenant || undefined } }),
  refresh: () => tryRefresh(),
  logout: async () => {
    const rt = getRefreshToken();
    try { await request('/auth/logout', { method: 'POST', body: rt ? { refresh_token: rt } : {} }); } catch { /* already logged out server-side */ }
    setToken(null);
    setUser(null);
    setRefreshToken(null);
    return { ok: true };
  },
  logoutAll: () => request('/auth/logout-all', { method: 'POST' }),
  me: () => request('/auth/me'),
  // SRS: bước 2 MFA sau khi /login trả MFA_REQUIRED.
  mfaVerify: (email, password, code, tenant) => request('/auth/mfa/verify', { method: 'POST', body: { email, password, code, tenant: tenant || undefined } }),
};

// MFA self-service (trang Bảo mật).
export const mfa = {
  status: () => request('/me/mfa'),
  setup: () => request('/me/mfa/setup', { method: 'POST' }),
  enable: (code) => request('/me/mfa/enable', { method: 'POST', body: { code } }),
  disable: (password) => request('/me/mfa/disable', { method: 'POST', body: { password } }),
  changePassword: async (old_password, new_password) => {
    const result = await request('/me/password', { method: 'POST', body: { old_password, new_password } });
    if (result?.token) setToken(result.token);
    if (result?.refresh_token) setRefreshToken(result.refresh_token);
    if (result?.user) setUser(result.user);
    return result;
  },
};

// SSO OIDC IdP ngoai (task 10): start -> browser sang IdP -> /sso/callback.
export const sso = {
  start: (email, tenant) => request('/auth/sso/start', { method: 'POST', body: { email, tenant: tenant || undefined } }),
  callback: (code, state) => request('/auth/sso/callback', { method: 'POST', body: { code, state } }),
  mfaVerify: (sso_pending, code) => request('/auth/sso/mfa/verify-sso', { method: 'POST', body: { sso_pending, code } }),
  mine: () => request('/me/sso'),
  unlink: () => request('/me/sso', { method: 'DELETE' }),
};

// PDPL self-service (task 10): consents + export + DSR + tu hieu chinh ten.
export const privacy = {
  get: () => request('/me/privacy'),
  consent: (purpose, granted) => request('/me/privacy/consents', { method: 'POST', body: { purpose, granted } }),
  exportData: () => request('/me/privacy/export'),
  requestDsr: (type, detail) => request('/me/privacy/requests', { method: 'POST', body: { type, detail } }),
  rename: (name) => request('/me/privacy/profile', { method: 'PATCH', body: { name } }),
  setLocale: (locale) => request('/me/locale', { method: 'PUT', body: { locale } }),
};

// Quan tri tin cay (task 10, admin/ceo — server requireRole): SSO + DSR + status.
export const trustAdmin = {
  ssoGet: () => request('/admin/sso'),
  ssoSave: (body) => request('/admin/sso', { method: 'PUT', body }),
  ssoDelete: () => request('/admin/sso', { method: 'DELETE' }),
  ssoTest: (issuer) => request('/admin/sso/test', { method: 'POST', body: issuer ? { issuer } : {} }),
  dsr: (status) => request(`/admin/dsr${status ? `?status=${status}` : ''}`),
  dsrResolve: (id, decision, note, apply) => request(`/admin/dsr/${id}/resolve`, { method: 'POST', body: { decision, note, apply } }),
  securityStatus: () => request('/admin/security-status'),
};

// Issues (Mục 4-5, 6.5)
// NOTE (P1): issues.addDirective removed — it POSTed /issues/:id/directives,
// which never existed server-side (directives live at POST /directives with
// issue_id in body; see IssueDetail). Deleted to prevent future misuse.
export const issues = {
  list: (projectId, params) => request(`/projects/${projectId}/issues${qs(params)}`),
  listPage: (projectId, params) => requestPage(`/projects/${projectId}/issues${qs(params)}`),
  get: (id) => request(`/issues/${id}`),
  create: (data) => request('/issues', { method: 'POST', body: data }),
};

// Directives (CEO/PMO qualitative notes)
export const directives = {
  list: (params) => request(`/directives${qs(params)}`),
  recipients: () => request('/directives/recipients'),
  create: (data) => request('/directives', { method: 'POST', body: data }),
};

// Notifications (Bell dropdown)
export const notifications = {
  list: (unreadOnly = false) => request(`/notifications${unreadOnly ? '?unread_only=1' : ''}`),
  markRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request('/notifications/mark-all-read', { method: 'POST' }),
};

// Realtime stream. EventSource cannot send an Authorization header, so the
// access token stays in the header and we ask for a short-lived single-use
// ticket to put in the query string. Must be re-minted on every reconnect —
// the server burns a ticket on first use.
export const stream = {
  ticket: () => request('/stream/ticket', { method: 'POST' }),
};

// Audit log
export const audit = {
  list: (params) => request(`/audit${qs(params)}`),
  // Nhật ký có hàng nghìn dòng: đây là bản phân trang, `list` giữ nguyên cho
  // chỗ chỉ cần một trang (ví dụ khoá theo một bản ghi).
  listPage: (params) => requestPage(`/audit${qs(params)}`),
};

// Projects & related data
export const projects = {
  list: () => request('/projects'),
  get: (id) => request(`/projects/${id}`),
  zones: (id) => request(`/projects/${id}/zones`),
  areaHierarchy: (id) => request(`/projects/${id}/area-hierarchy`),
  scheduleBaselines: (id) => request(`/projects/${id}/schedule-baselines`),
  materialSubmittalsOverdue: (id) => request(`/projects/${id}/material-submittals/overdue`),
  payments: (id) => request(`/projects/${id}/payments`),
  contracts: (id) => request(`/projects/${id}/contracts`),
  invoices: (id) => request(`/contracts/${id}/invoices`),
  paymentRequests: (id) => request(`/invoices/${id}/payment-requests`),
  kpiTargets: (id) => request(`/projects/${id}/kpi-targets`),
  // SRS FR-1.6: đèn sức khỏe theo ngưỡng cấu hình được.
  health: (id) => request(`/projects/${id}/health`),
  healthThresholds: (id) => request(`/projects/${id}/health-thresholds`),
  saveThresholds: (id, body) => request(`/projects/${id}/health-thresholds`, { method: 'PUT', body }),
  // SRS 3.1: gate liên thông cấu hình được (scope project|tenant).
  pillarGates: (id, params) => request(`/projects/${id}/pillar-gates${qs(params)}`),
  saveGates: (id, body) => request(`/projects/${id}/pillar-gates`, { method: 'PUT', body }),
  // SRS FR-1.7: S-curve KH vs TT lũy kế từng trụ cột.
  sCurves: (id) => request(`/projects/${id}/s-curves`),
  // SRS NFR task 9: gộp 10 fetch ControlCenter thành 1 round-trip.
  controlSummary: (id) => request(`/projects/${id}/control-summary`),
  update: (id, body) => request(`/projects/${id}`, { method: 'PATCH', body }),
};

export const workItems = {
  list: (projectId) => request(`/projects/${projectId}/work-items`),
  create: (projectId, body) => request(`/projects/${projectId}/work-items`, { method: 'POST', body }),
  links: (id) => request(`/work-items/${id}/links`),
  link: (id, body) => request(`/work-items/${id}/links`, { method: 'POST', body }),
  productivity: (projectId, params) => request(`/projects/${projectId}/productivity${qs(params)}`),
  itemProductivity: (id, params) => request(`/work-items/${id}/productivity${qs(params)}`),
  saveProductivity: (id, body) => request(`/work-items/${id}/productivity`, { method: 'POST', body }),
};

// Shop drawings (state machine 43.3)
export const shopApi = {
  drawings: (projectId, params) => request(`/projects/${projectId}/shop-drawings${qs(params)}`),
  drawingsPage: (projectId, params) => requestPage(`/projects/${projectId}/shop-drawings${qs(params)}`),
  transition: (id, newStatus, reason) => request(`/shop-drawings/${id}/transition`, { method: 'POST', body: { to_status: newStatus, comment: reason } }),
  approvalState: (id) => request(`/shop-drawings/${id}/approval-state`),
  approveLevel: (id, level, response, comment) => request(`/shop-drawings/${id}/approve-level`, { method: 'POST', body: { level, response, comment } }),
  asBuilt: (id, notes) => request(`/shop-drawings/${id}/as-built`, { method: 'POST', body: { notes } }),
};
// Alias for backward compat
export const shop = shopApi;

// Material (submittal workflow 43.4)
export const materials = {
  list: (projectId, limit = 50) => request(`/projects/${projectId}/materials?limit=${limit}`),
  createUsage: (data) => request('/materials', { method: 'POST', body: data }),
  createSubmittal: (data) => request('/material-submittals', { method: 'POST', body: data }),
  lifecycle: (id, body) => request(`/materials/${id}/lifecycle`, { method: 'POST', body }),
  physicalSample: (id, status, note) => request(`/material-submittals/${id}/physical-sample`, { method: 'PATCH', body: { status, note } }),
  submit: (id) => request(`/material-submittals/${id}/submit`, { method: 'POST' }),
  reject: (id, reason) => request(`/material-submittals/${id}/reject`, { method: 'POST', body: { reason } }),
  overdue: (projectId) => request(`/projects/${projectId}/material-submittals/overdue`),
};

// Material breakdown (pie tooltip)
export const attention = {
  get: (projectId) => request(`/jobs/attention?project_id=${projectId}`),
};

export const bim = {
  list: (projectId) => request(`/projects/${projectId}/bim-models`),
  listPage: (projectId, params) => requestPage(`/projects/${projectId}/bim-models${qs(params)}`),
  upload: (projectId, file, zoneCode) => {
    const fd = new FormData();
    fd.append('file', file);
    if (zoneCode) fd.append('zone_code', zoneCode);
    return request(`/projects/${projectId}/bim/models`, { method: 'POST', body: fd });
  },
  suggestions: (id) => request(`/bim/models/${id}/zone-suggestions`),
  linkZone: (id, zoneId) => request(`/bim/models/${id}/link-zone`, { method: 'POST', body: { zone_id: zoneId } }),
};

export const qa = {
  list: (projectId) => request(`/projects/${projectId}/qa-inspections`),
  listPage: (projectId, params) => requestPage(`/projects/${projectId}/qa-inspections${qs(params)}`),
  create: (projectId, body) => request(`/projects/${projectId}/qa-inspections`, { method: 'POST', body }),
  update: (id, status) => request(`/qa-inspections/${id}`, { method: 'PATCH', body: { status } }),
};

export const materialBreakdown = {
  byProject: (projectId) => request(`/projects/${projectId}/material-breakdown`),
};

export const construction = {
  // NOTE (P1): construction.byZone removed — no GET /projects/:id/zones/:code/items
  // route exists; the canonical zone filter is ?zone= on construction.schedule.
  schedule: (projectId, params) => request(`/projects/${projectId}/construction-schedule${qs(params)}`),
  updateProgress: (projectId, itemId, data) => request(`/projects/${projectId}/construction-schedule/${itemId}`, { method: 'PATCH', body: data }),
};

export const daily = {
  reports: (projectId) => request(`/projects/${projectId}/daily-reports`),
  get: (id) => request(`/daily-reports/${id}/full`),
  create: (projectId, data) => request(`/projects/${projectId}/daily-reports`, { method: 'POST', body: data }),
  // Field helper: today's report, created on demand so site can log photos/manpower.
  ensureToday: async (projectId) => {
    const today = todayLocal();
    const list = await daily.reports(projectId);
    const found = (Array.isArray(list) ? list : []).find(r => (r.report_date || '').slice(0, 10) === today);
    if (found) return found;
    return daily.create(projectId, { report_date: today });
  },
  addManpower: (id, data) => request(`/daily-reports/${id}/manpower`, { method: 'POST', body: data }),
  listPhotos: (id) => request(`/daily-reports/${id}/photos`),
  photoUrl: (photoId) => `/api/daily-reports/photos/${photoId}/download`,
  photoBlob: async (photoId) => {
    const r = await fetch(`/api/daily-reports/photos/${photoId}/download`, { headers: { ...authHeaders() } });
    if (!r.ok) throw new Error(t('toast.err_load_image'));
    return URL.createObjectURL(await r.blob());
  },
  uploadPhotos: async (id, files) => {
    const fd = new FormData();
    for (const f of files) fd.append('photos', f);
    const r = await fetch(`/api/daily-reports/${id}/photos`, {
      method: 'POST',
      headers: { ...authHeaders() },
      body: fd,
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
  },
};

export const manpower = {
  rollup: (params = {}) => {
    const q = qs(params).slice(1);
    return request(`/manpower/rollup?${q}`);
  },
  // SRS FR-1.3: kế hoạch PMO vs. thực tế + loading % theo tuần.
  plan: (projectId) => request(`/projects/${projectId}/manpower-plan`),
  savePlan: (projectId, rows) => request(`/projects/${projectId}/manpower-plan`, { method: 'PUT', body: { rows } }),
  loading: (projectId, weeks = 8) => request(`/projects/${projectId}/manpower-loading?weeks=${weeks}`),
};

export const otd = {
  get: (projectId, params = {}) => {
    const q = qs(params).slice(1);
    return request(`/projects/${projectId}/otd?${q}`);
  },
};

export const materialSubmittals = {
  list: (params = {}) => {
    const q = qs(params).slice(1);
    return request(`/material-submittals?${q}`);
  },
  pendingSupervisor: (projectId, withinDays = 3) => request(`/projects/${projectId}/material-submittals/pending-supervisor?within_days=${withinDays}`),
  overdue: (projectId) => request(`/projects/${projectId}/material-submittals/overdue`),
  submit: (id) => request(`/material-submittals/${id}/submit`, { method: 'POST' }),
  approve: (id) => request(`/material-submittals/${id}/approve`, { method: 'POST' }),
  reject: (id, reason) => request(`/material-submittals/${id}/reject`, { method: 'POST', body: { reason } }),
  history: (id) => {
    // History = audit log entries
    return request(`/audit?resource_type=material_submittal&resource_id=${id}`);
  },
};

export const businessProcess = {
  get: (code) => request(`/business-process/${code}`),
};

export const uploads = {
  list: () => request('/uploads'),
  upload: async (file, projectCode, opts = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    if (projectCode) fd.append('project_code', projectCode);
    const rel = opts.relativePath || file.webkitRelativePath || '';
    if (rel) fd.append('relative_path', rel);
    const r = await fetch(`${BASE}/upload`, { method: 'POST', body: fd, headers: _token ? { Authorization: `Bearer ${_token}` } : {} });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
  },
  batchZip: async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`${BASE}/upload/batch`, { method: 'POST', body: fd, headers: _token ? { Authorization: `Bearer ${_token}` } : {} });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
  },
  // Mô hình A wizard endpoints
  wizard: {
    docTypes: () => request('/upload/doc-types'),
    configure: (uploadId, body) => request(`/upload/${uploadId}/configure`, { method: 'POST', body }),
    preview: (uploadId) => request(`/upload/${uploadId}/preview`, { method: 'POST' }),
    commit: (uploadId) => request(`/upload/${uploadId}/commit`, { method: 'POST' }),
  },
  // Project / zone creation
  createProject: (body) => request('/projects', { method: 'POST', body }),
  createZone: (projectId, body) => request(`/projects/${projectId}/zones`, { method: 'POST', body }),
};

export const exportApi = {
  // Báo cáo dự án FR-1.9 (LIVE): workbook 6 sheets qua
  // GET /api/export/project-report.xlsx?project_id= (mọi plan, RBAC schedule-read).
  projectReport: (projectId) => `${BASE}/export/project-report.xlsx?project_id=${projectId}`,
  projectPrintReport: (projectId, lang = 'vi', print = true) =>
    `${BASE}/export/project-report.html?project_id=${projectId}&lang=${encodeURIComponent(lang)}&print=${print ? 1 : 0}`,
  // SCOPE DECISION (P1): các export xlsx lẻ theo module (construction-schedule,
  // shop-drawings, daily-report) vẫn OUT — backend chưa có route, format HBG/PCR
  // thật chưa về nên mọi format đóng cứng lúc này đều sai. Nút nào dùng các URL
  // dưới phải giữ sau cờ ENABLED=false. Muốn mở: implement route + flip cờ.
  ENABLED: false,
  constructionSchedule: (projectId) => `${BASE}/export/construction-schedule/${projectId}.xlsx`,
  shopDrawings: (projectId) => `${BASE}/export/shop-drawings/${projectId}.xlsx`,
  dailyReport: (id) => `${BASE}/export/daily-report/${id}.xlsx`,
};

// Master data
export const masterData = {
  // Ba danh mục dưới đây đã có ở backend từ trước (TABLES + allowlist cột trong
  // routes/master-data.js) nhưng danh sách trên UI không hề mở — người dùng
  // không có chỗ nào xem hay thêm nhà cung cấp, công nhân, đội.
  vendors: () => request('/master-data/vendors'),
  workers: () => request('/master-data/workers'),
  teams: () => request('/master-data/teams'),
  subcontractors: () => request('/master-data/subcontractors'),
  suppliers: () => request('/master-data/suppliers'),
  businessProcesses: () => request('/master-data/business-processes'),
  departments: () => request('/master-data/departments'),
  // Nạp một danh mục theo tên — form sửa dùng để điền sẵn. Chỉ có một route GET
  // chung, nên phải lọc tại chỗ; danh mục nhỏ nên tải hết rồi tìm là hợp lý.
  list: (resource) => request(`/master-data/${resource}`),
  create: (resource, data) => request(`/master-data/${resource}`, { method: 'POST', body: data }),
  // Sửa / ẩn / kích hoạt lại (2026-09-27). Xoá là **xoá mềm**: server đặt
  // `status = 'INACTIVE'`, bản ghi còn nguyên nên hợp đồng / báo cáo đã tham chiếu
  // vẫn tra cứu được. Không có API xoá cứng — có chủ đích.
  update: (resource, id, data) => request(`/master-data/${resource}/${id}`, { method: 'PATCH', body: data }),
  deactivate: (resource, id) => request(`/master-data/${resource}/${id}`, { method: 'DELETE' }),
  restore: (resource, id) => request(`/master-data/${resource}/${id}/restore`, { method: 'POST' }),
};

// Sync queue (43.7)
export const sync = {
  queue: () => request('/sync/queue'),
  resolve: (data) => request('/sync/resolve', { method: 'POST', body: data }),
};

// KPI targets (43.10)
export const kpi = {
  list: (projectId) => request(`/projects/${projectId}/kpi-targets`),
  update: (id, data) => request(`/kpi-targets/${id}`, { method: 'PUT', body: data }),
};

// Permission check (43.2)
export const permissions = {
  me: () => request('/me/permissions'),
};

// Dashboard roll-up đa dự án (SRS FR-1.6 + NFR task 9). fresh=1 bỏ cache 10s.
export const dashboard = {
  summary: () => request('/dashboard'),
  portfolio: (fresh = false) => request(`/dashboard/portfolio-kpi${fresh ? '?fresh=1' : ''}`),
};

// Vận hành & hiệu năng (trang /hq/ops): trạng thái + chạy tay các tác vụ nền.
// Server vẫn giữ chuẩn role (admin/ceo) cho các nút chạy — 403 hiện toast.
export const ops = {
  tvgsStatus: () => request('/jobs/escalate-tvgs/status'),
  tvgsRun: () => request('/jobs/escalate-tvgs', { method: 'POST' }),
  slaStatus: () => request('/jobs/ai-sla-watch/status'),
  slaRun: () => request('/jobs/ai-sla-watch', { method: 'POST' }),
  // Both existed server-side with no UI, so the page titled "background jobs"
  // could not show or trigger two of them.
  digestStatus: () => request('/jobs/overdue-digest/status'),
  digestRun: () => request('/jobs/overdue-digest', { method: 'POST' }),
  retentionStatus: () => request('/jobs/retention'),
  retentionRun: () => request('/jobs/retention/run', { method: 'POST' }),
  aiBackfill: () => request('/ai/backfill', { method: 'POST' }),
  erpPush: (profile_id, project_id) => request('/jobs/erp-push', { method: 'POST', body: { profile_id, project_id } }),
};

export const api = { issues, directives, notifications, stream, audit, materialBreakdown, projects, shopApi, materials, masterData, sync, kpi, permissions };
