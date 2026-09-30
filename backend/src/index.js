// PMO Backend — Express server (refactored Phase 1+2)
// Mount routers (tách theo domain) thay vì viết 73 endpoint inline.
//  - lib/auth.js: requireAuth, requireRole, session management
//  - lib/with-audit.js: transaction wrapper cho business + audit
//  - lib/tx.js: BEGIN/COMMIT/ROLLBACK
//  - routes/: 11 file router (auth, projects, issues, audit, kpi, kpi-targets, shop,
//            material-submittals, payment, notifications, directives, materials,
//            daily, sync, dashboard, master-data, business-process, upload, me)

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, closeDb } from './db/index.js';
import { installAsyncSafetyNet, wrapAllRouters } from './lib/async-handler.js';
import { errorBody } from './lib/error-body.js';

// P0-2 safety net FIRST: patches Router.METHOD/use so any bare async handler
// rejection flows to the Express error handler instead of hanging.
installAsyncSafetyNet();
// Retroactive half of the net (P3): route modules above already registered
// with the unpatched prototype (import hoisting) — wrap their stacks in place.
wrapAllRouters([
  authRouter, meRouter, privacyRouter, ssoRouter, projectsRouter, issuesRouter, auditRouter, kpiRouter,
  kpiTargetsRouter, shopRouter, materialSubmittalsRouter, paymentRouter,
  notificationsRouter, directivesRouter, materialsRouter, dailyRouter,
  syncRouter, dashboardRouter, masterDataRouter, businessProcessRouter,
  uploadRouter, batchRouter, classifyRouter, otdRouter, jobsRouter,
  approvalChainsRouter, adminRouter, scheduleLinksRouter,
  scheduleCompressRouter, holidaysRouter, aiRouter, aiAssistantRouter,
  bimRouter, exportRouter, erpRouter, streamRouter, pillarScenariosRouter, qaRouter, workItemsRouter,
]);
import { registerWizardRoutes } from './routes/wizard.js';

import authRouter from './routes/auth.js';
import ssoRouter from './routes/sso.js';
import meRouter from './routes/me.js';
import privacyRouter from './routes/privacy.js';
import projectsRouter from './routes/projects.js';
import issuesRouter from './routes/issues.js';
import auditRouter from './routes/audit.js';
import kpiRouter from './routes/kpi.js';
import kpiTargetsRouter from './routes/kpi-targets.js';
import shopRouter from './routes/shop.js';
import materialSubmittalsRouter from './routes/material-submittals.js';
import paymentRouter from './routes/payment.js';
import notificationsRouter from './routes/notifications.js';
import directivesRouter from './routes/directives.js';
import materialsRouter from './routes/materials.js';
import dailyRouter from './routes/daily.js';
import syncRouter from './routes/sync.js';
import dashboardRouter from './routes/dashboard.js';
import masterDataRouter from './routes/master-data.js';
import businessProcessRouter from './routes/business-process.js';
import uploadRouter from './routes/upload.js';
import batchRouter from './routes/batch.js';
import classifyRouter from './routes/classify.js';
import otdRouter from './routes/otd.js';
import jobsRouter from './routes/jobs.js';
import approvalChainsRouter from './routes/approval-chains.js';
import adminRouter from './routes/admin.js';
import scheduleLinksRouter from './routes/schedule-links.js';
import scheduleCompressRouter from './routes/schedule-compress.js';
import pillarScenariosRouter from './routes/pillar-scenarios.js';
import workItemsRouter from './routes/work-items.js';
import holidaysRouter from './routes/holidays.js';
import aiRouter from './routes/ai.js';
import aiAssistantRouter from './routes/ai-assistant.js';
import bimRouter from './routes/bim.js';
import exportRouter from './routes/export.js';
import erpRouter from './routes/erp.js';
import streamRouter from './routes/stream.js';
import qaRouter from './routes/qa.js';
import { evaluateProductionEnv } from './lib/production-readiness.js';

if (process.env.NODE_ENV === 'production' && process.env.PRODUCTION_ENFORCE_READINESS === '1') {
  const failed = evaluateProductionEnv().filter((check) => !check.ok);
  if (failed.length) {
    throw new Error(`Production readiness failed: ${failed.map((check) => `${check.id} (${check.detail})`).join(', ')}`);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// CORS: dev keeps the permissive default so the Vite proxy / local tooling
// keeps working. Production must name its origins explicitly — bare `cors()`
// answers every origin with `Access-Control-Allow-Origin: *`, which lets any
// site read unauthenticated responses (health, upload review, ...).
// Single-port production serves the SPA itself, so it needs no CORS at all.
const corsOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',').map((value) => value.trim()).filter(Boolean);
if (process.env.NODE_ENV === 'production' && corsOrigins.length === 0) {
  app.use(cors({ origin: false }));
} else if (corsOrigins.length > 0) {
  app.use(cors({ origin: corsOrigins, credentials: false }));
} else {
  app.use(cors());
}
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Only trust the exact configured proxy depth. `true` lets clients forge
// X-Forwarded-For and bypass IP-based login/export limits.
const trustProxy = String(process.env.TRUST_PROXY || '').trim();
if (trustProxy === 'true') app.set('trust proxy', 1);
else if (/^\d+$/.test(trustProxy)) app.set('trust proxy', Number(trustProxy));

// Task 10 (SRS NFR Bao mat: ma hoa khi TRUYEN TAI): headers toi thieu, khong
// CSP (pha inline <style> cua App.jsx). HSTS chi khi dang https (sau proxy),
// tranh khoa localhost http. TLS ket thuc o reverse proxy — xem DOCKER.md.
app.use((req, res, next) => {
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  if (proto === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// ============ Health ============
// Two endpoints, because a probe that cannot fail is worse than no probe:
//   /api/health  liveness  — the process is up; never touches the DB
//   /api/ready   readiness — the DB answers and the pool is not exhausted.
// The old single endpoint returned a hardcoded `ok`, so a dead database still
// looked healthy and nothing restarted or paged anyone.
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime_s: Math.round(process.uptime()),
    authenticated: false,
    user: null,
  });
});

app.get('/api/ready', async (req, res) => {
  const started = Date.now();
  try {
    const { getDb } = await import('./db/index.js');
    const db = getDb();
    await db.prepare('SELECT 1 AS ok').getAsync();
    const latencyMs = Date.now() - started;
    // Degraded, not failed, once the DB answers but slowly: alerting on a slow
    // database is more useful than restarting a process that is working.
    res.json({
      status: latencyMs > 2000 ? 'degraded' : 'ok',
      db: { ok: true, latency_ms: latencyMs },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(503).json({
      status: 'unavailable',
      db: { ok: false, error: String(e?.message || e).slice(0, 200) },
      timestamp: new Date().toISOString(),
    });
  }
});

// ============ Mount routers ============
// Order matters: more-specific mounts phải mount TRƯỚC more-general.
// /api/projects/:id/kpi-targets phải trước /api/projects
// /api/stream FIRST of all: bare `app.use('/api', …)` routers run requireAuth
// (header-only) on every subpath, which would 401 the query-token SSE handshake
// before streamRouter is ever reached (Wave D3 lesson).
app.use('/api/stream', streamRouter);                       // SSE realtime (Wave D3)
app.use('/api/auth/sso', ssoRouter);                      // SSO OIDC IdP ngoai (task 10, JSON-only)
app.use('/api/auth', authRouter);
app.use('/api/me', privacyRouter);                        // PDPL self-service (task 10, truoc meRouter)
app.use('/api/me', meRouter);
app.use('/api/projects/:id/kpi-targets', kpiRouter);          // /api/projects/:id/kpi-targets (GET list, POST, GET history)
app.use('/api', workItemsRouter);                              // canonical WBS/work-item links
app.use('/api/projects', projectsRouter);                      // includes /:id/issues POST etc.
app.use('/api/kpi-targets', kpiTargetsRouter);                // PUT /api/kpi-targets/:id
app.use('/api/issues', issuesRouter);
app.use('/api/audit', auditRouter);
app.use('/api/shop-drawings', shopRouter);
app.use('/api/material-submittals', materialSubmittalsRouter);
app.use('/api', paymentRouter);                                // /api/projects/:id/contracts (POST), /api/contracts/:id/invoices, /api/invoices/:id/payment-requests, /api/payment-requests/:id
app.use('/api/notifications', notificationsRouter);
app.use('/api/directives', directivesRouter);
app.use('/api/materials', materialsRouter);                    // POST /api/materials (under /api/projects/:id/materials for list)
app.use('/api', dailyRouter);                                  // /api/projects/:id/daily-reports, /api/daily-reports/:id/full, /api/daily-reports/:id/photos, /api/manpower/rollup
app.use('/api/sync', syncRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/master-data', masterDataRouter);
app.use('/api/business-process', businessProcessRouter);
app.use('/api/projects/:id/otd', otdRouter);                  // OTD KPI calculation
app.use('/api/jobs', jobsRouter);                      // background jobs (TVGS escalation)
app.use('/api/approval-chains', approvalChainsRouter);  // chain config (Wave 2)
app.use('/api/admin', adminRouter);                     // user list + department assign
app.use('/api', scheduleLinksRouter);                   // schedule dependency links (v0.6.0)
app.use('/api', scheduleCompressRouter);                // compression preview/apply/rollback (v0.6.0)
app.use('/api', pillarScenariosRouter);                  // pillar what-if CTL-01→06 (GĐ2, SRS 4.2)
app.use('/api', qaRouter);                                 // QA/QC extension pillar
app.use('/api', holidaysRouter);                        // site holidays global+tenant (v0.6.1)
app.use('/api/ai', aiRouter);                               // AI config + usage (v0.7.0)
app.use('/api/ai', aiAssistantRouter);                      // AI ask + drafts (v0.7.0)
app.use('/api', bimRouter);                                 // BIM library (v0.9.0)
app.use('/api/export', exportRouter);                       // AP ledger export (v0.9.0)
app.use('/api/erp', erpRouter);                             // ERP profiles + push log (v0.9.0)
// Upload pipeline mounts (P3-12 canonical table — READ BEFORE ADDING ALIASES).
// Frontend usage is split across both prefixes BY DESIGN, so both mounts stay:
//   singular /api/upload  → writes: POST / (file), POST /batch (zip),
//                           POST /classify, POST /:id/crosscheck,
//                           wizard POST /:id/configure|preview|commit
//   plural /api/uploads   → reads:  GET / (list), GET /review, GET /:id,
//                           GET /:id/rows, GET /:id/download
// The cross twins (POST /uploads, GET /upload, POST /uploads/classify, …)
// are served by the same handlers — intentionally kept (no 301: redirecting
// multipart POST bodies risks resend bugs for 50MB uploads; removal would
// churn 4+ frontend files for zero behavior gain). Wire NEW endpoints under
// the canonical prefix above.
// ORDER MATTERS (P3-12 fix): static subpaths (/review, /batch, /classify)
// must win over uploadRouter's greedy GET /:id — the old order let
// GET /api/upload/review fall into /:id with id='review' (400). Specific
// routers mount first on BOTH prefixes. The wizard routes are also mounted
// before uploadRouter so /doc-types is not parsed as an integer upload id.
registerWizardRoutes(app);
app.use('/api/upload', classifyRouter); // POST /api/upload/classify, GET /api/upload/review
app.use('/api/upload', batchRouter); // POST /api/upload/batch (zip intake)
app.use('/api/upload', uploadRouter);
app.use('/api/uploads', classifyRouter); // GET /api/uploads/review (+alias POST /classify)
app.use('/api/uploads', uploadRouter);                         // GET list

// P0-2: unknown /api/* must be JSON 404, never the SPA HTML (the old
// app.get('*') fallback swallowed missing API routes and SSE errors).
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ============ Error handler (before SPA fallback so /api JSON errors survive) ============
// Client-safe error body — shared with routes that answer 5xx directly
// (see lib/error-body.js).
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  // Multer rejects oversized/too-many uploads with its own error codes and no
  // `status`, so an Excel file over the 50MB limit answered 500 "Internal
  // error" — the user was told to retry something that can never succeed.
  // Translate to the real reason and the right status.
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File vượt quá giới hạn ${Math.round(err.limit / 1024 / 1024)}MB`, code: err.code });
  }
  if (err?.code === 'LIMIT_FILE_COUNT' || err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: `Upload không hợp lệ (${err.code})`, code: err.code });
  }
  res.status(err.status || 500).json(errorBody(err));
});

// ============ Serve frontend (Vite build) ============
app.use(express.static(path.join(__dirname, '../../frontend/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

// Final safety: any error escaping past static/fallback still becomes JSON.
app.use((err, req, res, next) => {
  console.error('[error:late]', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json(errorBody(err));
});

const server = app.listen(PORT, () => {
  console.log(`🚀 PMO Backend running on http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/health`);
});

// Track sockets so graceful shutdown can destroy lingering keep-alive/half-open
// connections instead of hanging forever inside server.close().
const sockets = new Set();
server.on('connection', (s) => {
  sockets.add(s);
  s.on('close', () => sockets.delete(s));
});

function gracefulShutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  const force = setTimeout(() => { console.error('Shutdown timed out, forcing exit'); process.exit(1); }, 10_000);
  // server.close() waits for open connections (keep-alive, half-open) — give
  // in-flight requests 2s, then destroy lingering sockets so exit is guaranteed.
  const destroyLingering = setTimeout(() => {
    for (const s of sockets) s.destroy();
  }, 2000);
  server.close(() => {
    clearTimeout(destroyLingering);
    closeDb().then(() => process.exit(0));
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
