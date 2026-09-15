// API client + auth token management
const BASE = '/api';
export const API_BASE = ''; // full URL base (use '' to go via Vite proxy or same-origin)

let _token = localStorage.getItem('pmo_token');
let _user = (() => { try { return JSON.parse(localStorage.getItem('pmo_user')); } catch { return null; } })();

function authHeaders() {
  return _token ? { Authorization: `Bearer ${_token}` } : {};
}

async function req(path, opts = {}) {
  // Auto JSON.stringify body + set Content-Type khi caller truyền object
  // (Nếu caller đã stringify sẵn thành string, vẫn set Content-Type để server parse)
  // FormData/Blob: KHÔNG set Content-Type (browser tự thêm với boundary)
  let { body, headers = {}, ...rest } = opts;
  const isFormData = body instanceof FormData;
  const isBlob = body instanceof Blob;
  const isJson = body !== undefined && body !== null && !isFormData && !isBlob;
  if (isJson && typeof body !== 'string') body = JSON.stringify(body);
  const finalHeaders = {
    ...(isJson ? { 'Content-Type': 'application/json' } : {}),
    ...authHeaders(),
    ...headers,
  };
  const r = await fetch(BASE + path, {
    ...rest,
    headers: finalHeaders,
    body,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
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
  const rt = getRefreshToken();
  if (!rt) return false;
  try {
    const r = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!r.ok) return false;
    const j = await r.json();
    if (!j.token) return false;
    setToken(j.token);
    if (j.refresh_token) setRefreshToken(j.refresh_token);
    return true;
  } catch { return false; }
}

async function request(path, opts = {}) {  const headers = { ...(opts.headers || {}) };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const r = await fetch(`${BASE}${path}`, { ...opts, headers });
  // Transparent single retry after refresh rotation (not for auth endpoints themselves).
  if (r.status === 401 && !opts._retried && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return request(path, { ...opts, _retried: true });
  }
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(e.error || 'Request failed');
  }
  return r.status === 204 ? null : r.json();
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
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
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
};

// Issues (Mục 4-5, 6.5)
export const issues = {
  list: (projectId, params) => request(`/projects/${projectId}/issues${qs(params)}`),
  get: (id) => request(`/issues/${id}`),
  create: (data) => request('/issues', { method: 'POST', body: data }),
  addDirective: (id, body, notifyTo) => request(`/issues/${id}/directives`, { method: 'POST', body: { body, notify_to_user_ids: notifyTo } }),
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

// Audit log
export const audit = {
  list: (params) => request(`/audit${qs(params)}`),
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
  update: (id, body) => request(`/projects/${id}`, { method: 'PATCH', body }),
};

// Shop drawings (state machine 43.3)
export const shopApi = {
  drawings: (projectId, params) => request(`/projects/${projectId}/shop-drawings${qs(params)}`),
  transition: (id, newStatus, reason) => request(`/shop-drawings/${id}/transition`, { method: 'POST', body: { to_status: newStatus, comment: reason } }),
  approvalState: (id) => request(`/shop-drawings/${id}/approval-state`),
  approveLevel: (id, level, response, comment) => request(`/shop-drawings/${id}/approve-level`, { method: 'POST', body: { level, response, comment } }),
};
// Alias for backward compat
export const shop = shopApi;

// Material (submittal workflow 43.4)
export const materials = {
  list: (projectId, limit = 50) => request(`/projects/${projectId}/materials?limit=${limit}`),
  createUsage: (data) => request('/materials', { method: 'POST', body: data }),
  createSubmittal: (data) => request('/material-submittals', { method: 'POST', body: data }),
  submit: (id) => request(`/material-submittals/${id}/submit`, { method: 'POST' }),
  reject: (id, reason) => request(`/material-submittals/${id}/reject`, { method: 'POST', body: { reason } }),
  overdue: (projectId) => request(`/projects/${projectId}/material-submittals/overdue`),
};

// Material breakdown (pie tooltip)
export const materialBreakdown = {
  byProject: (projectId) => request(`/projects/${projectId}/material-breakdown`),
};

export const construction = {
  schedule: (projectId, params) => request(`/projects/${projectId}/construction-schedule${qs(params)}`),
  byZone: (projectId, code) => request(`/projects/${projectId}/zones/${code}/items`),
  updateProgress: (projectId, itemId, data) => request(`/projects/${projectId}/construction-schedule/${itemId}`, { method: 'PATCH', body: data }),
};

export const daily = {
  reports: (projectId) => request(`/projects/${projectId}/daily-reports`),
  get: (id) => request(`/daily-reports/${id}/full`),
  create: (projectId, data) => request(`/projects/${projectId}/daily-reports`, { method: 'POST', body: data }),
  // Field helper: today's report, created on demand so site can log photos/manpower.
  ensureToday: async (projectId) => {
    const today = new Date().toISOString().slice(0, 10);
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
    if (!r.ok) throw new Error('Không tải được ảnh');
    return URL.createObjectURL(await r.blob());
  },
  uploadPhotos: (id, files) => {
    const fd = new FormData();
    for (const f of files) fd.append('photos', f);
    return fetch(`/api/daily-reports/${id}/photos`, {
      method: 'POST',
      headers: { ...authHeaders() },
      body: fd,
    }).then(r => r.json());
  },
};

export const manpower = {
  rollup: (params = {}) => {
    const q = qs(params).slice(1);
    return request(`/manpower/rollup?${q}`);
  },
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
  upload: (file, projectCode, opts = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    if (projectCode) fd.append('project_code', projectCode);
    // relative_path preserves bulk folder structure for the classifier
    // (File.webkitRelativePath when picked via folder mode).
    const rel = opts.relativePath || file.webkitRelativePath || '';
    if (rel) fd.append('relative_path', rel);
    return fetch(`${BASE}/upload`, { method: 'POST', body: fd, headers: _token ? { Authorization: `Bearer ${_token}` } : {} }).then(r => r.json());
  },
  batchZip: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${BASE}/upload/batch`, { method: 'POST', body: fd, headers: _token ? { Authorization: `Bearer ${_token}` } : {} }).then(r => r.json().then(j => ({ status: r.status, ...j })));
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
  // SCOPE DECISION (P1): xlsx export is OUT of the current demo — backend has no
  // /api/export routes and services/export.js uses a dead sync API. The buttons
  // are hidden via ENABLED=false instead of repaired blind: the real HBG/PCR
  // format hasn't arrived yet, so any format baked now would be wrong anyway.
  // To re-enable: implement GET /api/export/* routes + flip this flag.
  ENABLED: false,
  constructionSchedule: (projectId) => `${BASE}/export/construction-schedule/${projectId}.xlsx`,
  shopDrawings: (projectId) => `${BASE}/export/shop-drawings/${projectId}.xlsx`,
  dailyReport: (id) => `${BASE}/export/daily-report/${id}.xlsx`,
};

// Master data
export const masterData = {
  subcontractors: () => request('/master-data/subcontractors'),
  suppliers: () => request('/master-data/suppliers'),
  businessProcesses: () => request('/master-data/business-processes'),
  departments: () => request('/master-data/departments'),
  create: (resource, data) => request(`/master-data/${resource}`, { method: 'POST', body: data }),
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

export const api = { issues, directives, notifications, audit, materialBreakdown, projects, shopApi, materials, masterData, sync, kpi, permissions };
