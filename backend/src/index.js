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
import { registerWizardRoutes } from './routes/wizard.js';

import authRouter from './routes/auth.js';
import meRouter from './routes/me.js';
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

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Trust proxy if behind Cloudflare tunnel
app.set('trust proxy', true);

// ============ Health ============
app.get('/api/health', async (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    authenticated: false,
    user: null,
  });
});

// ============ Mount routers ============
// Order matters: more-specific mounts phải mount TRƯỚC more-general.
// /api/projects/:id/kpi-targets phải trước /api/projects
app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/projects/:id/kpi-targets', kpiRouter);          // /api/projects/:id/kpi-targets (GET list, POST, GET history)
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
app.use('/api/upload', uploadRouter);
app.use('/api/upload', batchRouter); // POST /api/upload/batch (zip intake)
app.use('/api/upload', classifyRouter); // POST /api/upload/classify (+alias GET /review)
app.use('/api/uploads', classifyRouter); // GET /api/uploads/review (+alias POST /classify)
app.use('/api/uploads', uploadRouter);                         // GET list

// Wizard (still legacy, separate file)
registerWizardRoutes(app);

// ============ Serve frontend (Vite build) ============
app.use(express.static(path.join(__dirname, '../../frontend/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

// ============ Error handler (cuối cùng) ============
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || 'Internal error' });
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
