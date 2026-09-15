# PMO MVP — Product Technical Documentation

> **Version**: 0.4.0 · **Last updated**: 2026-09-12 · **Audience**: Engineers, technical PMs, integrators
>
> This document is the **single source of truth** for the PMO MVP. It replaces the previous collection of scattered docs (ARCHITECTURE, CODEBASE, USER_GUIDE, OPERATIONS, etc.). UML diagrams referenced from `docs/srs/`.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Architecture](#2-architecture)
3. [Data Model](#3-data-model)
4. [Backend Reference](#4-backend-reference)
5. [Frontend Reference](#5-frontend-reference)
6. [Authentication & Permissions](#6-authentication--permissions)
7. [Business Workflows](#7-business-workflows)
8. [API Reference](#8-api-reference)
9. [Excel Upload Pipeline](#9-excel-upload-pipeline)
10. [Notifications](#10-notifications)
11. [Background Jobs](#11-background-jobs)
12. [Local Development](#12-local-development)
13. [Testing](#13-testing)
14. [Deployment](#14-deployment)
15. [Operations & Troubleshooting](#15-operations--troubleshooting)
16. [Appendix: Migration History](#16-appendix-migration-history)

---

## 1. Product Overview

### 1.1 What it is

PMO MVP is a **construction project management system** built for a multi-zone construction company. It centralizes the data that was previously scattered across 9+ Excel templates per project, providing:

- **Single source of truth** for project state (construction schedule, shop drawings, materials, payments, issues, manpower)
- **Role-based dashboards** for 7 personas (admin, CEO, PM, PMO, site, procurement, accounting)
- **Approval workflows** with multi-level routing (L1-L5 for shop drawings, 4-step chain for payments)
- **SLA tracking** for material submittals (TVGS = Technical Validation & General Survey, 3-day supervisor deadline)
- **OTD KPI** (On-Time Delivery) measuring schedule adherence per project
- **Photo gallery** for daily site reports
- **Audit log** of every business action with before/after diffs

### 1.2 Who uses it

| Persona | Primary workflows | Key screens |
|---------|-------------------|-------------|
| **Admin** | System config, user management, all projects | All screens |
| **CEO** | Portfolio overview, KPI trends, approve high-value payments | Control Center, Dashboard, Payment |
| **PM** | Manage assigned project: schedule, issues, materials | Control Center, Issues, Manpower, Materials |
| **PMO** | Cross-project monitoring, KPI targets, governance | Control Center, Audit Log, KPI |
| **Site engineer** | Daily reports (manpower, photos, weather), field issues | Field Home, Daily Report, Photo Upload |
| **Procurement** | Material submittals, contracts, vendor management | Materials, Material Submittal, Master Data |
| **Accounting** | Payment chain (contract → invoice → request → payment) | Payment, Contracts, Invoices |

### 1.3 Out of scope (v0.4.0)

- Native mobile apps (web-responsive only)
- Full multi-tenant (HBG-only seam: `tenant_id` from user, membership backfilled)
- S3 storage (interface + hardened local driver; S3 stub fails loud)
- Nested departments (flat list; `parent_id` deferred)
- Offline enqueue endpoint (CLIENT apply works on seeded rows; field app posts online)
- Real-time collaboration (CRDTs, presence)
- Gantt chart auto-scheduling (manual entry only)
- BIM / 3D model viewer

---

## 2. Architecture

### 2.1 System diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (React SPA)                        │
│  Vite + React 19 + React Router 7                                   │
│  ─ App.jsx (Router + Auth)                                          │
│  ─ HqShell (CEO/PM/PMO)  ─ FieldShell (Site)                        │
│  ─ 12 HQ screens + 4 Field screens + 3 Governance screens           │
│  ─ 10 reusable components                                           │
└──────────────────┬──────────────────────────────────────────────────┘
                   │ HTTP (Bearer token in localStorage)
                   │ XHR/fetch
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Express 4 Backend (Node.js 20)                      │
│  backend/src/index.js (130 LOC composition)                          │
│  ─ 22 route files in routes/                                        │
│  ─ 3 lib helpers (auth, tx, with-audit) + 6 utility libs            │
│  ─ 1 service layer (ingest/, notify.js, export.js)                  │
│  ─ static SPA serving in production (dist/)                         │
└─────┬─────────────────────┬──────────────────┬──────────────────────┘
      │                     │                  │
      ▼                     ▼                  ▼
┌─────────────┐  ┌──────────────────┐  ┌─────────────────┐
│ PostgreSQL  │  │ Local FS         │  │ Background jobs │
│ 16 (raw pg) │  │ data/uploads/    │  │ (setInterval)   │
│ 43 tables   │  │ (Excel, photos)  │  │ TVGS escalation │
└─────────────┘  └──────────────────┘  └─────────────────┘
```

### 2.2 Tech stack rationale

| Choice | Why |
|--------|-----|
| **PostgreSQL (raw `pg`)** | Schema is mature (51 tables). Raw SQL gives full control over CTEs, window functions, `RETURNING`, `ON CONFLICT`. |
| **Express (not Fastify/Nest)** | Team familiarity, middleware ecosystem, simple. ~3k req/s is sufficient. |
| **React + Vite (not Next.js)** | SPA with role-based routing; no SSR needed (internal tool). Vite gives fast dev loop + small bundle. |
| **JWT + rotating refresh** | Stateless access (24h) + opaque single-use refresh (30d) + denylist. No Redis needed on one server. |
| **multer (not busboy)** | Battle-tested, simple, sufficient for ≤20 file uploads per request. |
| **Docker Compose** | Local dev parity. One command brings up PG + backend. |

### 2.3 Request lifecycle

```
HTTP request
    │
    ▼
[1] CORS + body parsing
    │
    ▼
[2] Router matched (e.g. POST /api/projects/:id/issues)
    │
    ▼
[3] Sub-router (e.g. /api/projects/:id mounted router) ← mergeParams: true
    │
    ▼
[4] requireAuth middleware → verifies JWT → reloads user row → sets req.user
    │
    ▼
[5] permissionMiddleware (module check) + requireRole(...) (if applied) + project-access (404 no-leak)
    │
    ▼
[6] Handler:
    ├── db.prepare(sql).runAsync/getAsync/allAsync (NUMERIC arrives as number)
    ├── checkTransition(resource, from, to) for status changes (422 on illegal jump)
    ├── withAudit/txAudit(req, {...}, async (client) => {...})  ← atomic business + audit log
    │       │
    │       ├── BEGIN
    │       ├── business action
    │       ├── INSERT INTO audit_log (...)
    │       └── COMMIT (or ROLLBACK on throw)
    │
    ▼
[7] Response: res.json(...) or res.status(4xx).json({error})
    │
    ▼
[8] (if error) Error caught by tx wrapper → ROLLBACK → 500 with error message
```

### 2.4 File organization

```
backend/
├── src/
│   ├── index.js                # Express composition (24 routers + serves SPA + safe shutdown)
│   ├── lib/                    # 18 helpers — see §4.2
│   ├── routes/                 # 26 files — see §4.4
│   ├── db/
│   │   ├── index.js            # Single Pool, NUMERIC→number, upsert helper
│   │   ├── migrate.js          # checksum ledger runner
│   │   └── init.js             # migrate + indexes + sequences + seeds
│   └── services/
│       ├── notify.js           # notify(user, payload), notifyMany(...) (in_app/email/zalo)
│       ├── export.js           # CSV export
│       └── ingest/             # 12 parsers — see §9
├── drizzle/                    # SQL migrations
└── scripts/
    └── pg-ctl.sh               # local PG start/stop/backup (WSL/Linux)
```

```
frontend/
└── src/
    ├── App.jsx                 # Router + Protected + 2 shells (HqShell, FieldShell)
    ├── main.jsx                # Vite entry, imports global.css
    ├── api/
    │   └── index.js            # 240 LOC — typed API client (projects, issues, daily, ...)
    ├── components/             # 10 reusable (BellDropdown, ProjectPicker, DailyReportForm, ...)
    ├── hq/                     # 12 HQ screens
    ├── field/                  # 4 Field screens
    ├── governance/             # 3 screens (Approval, Audit, MasterData)
    ├── styles/                 # design system + dark mode
    └── icons.jsx               # 50+ inline SVG icons
```

---

## 3. Data Model

### 3.1 Tables (51 total)

**Core (multi-tenant base)**
- `tenants` — top-level org (`hbg = HBG Construction`)
- `users` — login accounts: `role` + `is_ceo` flag, bcrypt `password_hash`, nullable `department_id`
- `projects` — real projects only (`BTE-WP4-HBC`, `HBG-LVK-BCTH`; placeholder seeds removed), nullable `department_id`
- `zones` — sub-areas within a project (`BOH`, `BPV`, `HPV-1BR`, etc.)
- `departments` — flat list (`KT`, `TC`, `AT`, `VP`); chain scope, no nesting yet
- `approval_chains` — `(department_id NULL=default, resource_type)` → `levels` JSONB (max 5, roles from matrix)

**Construction**
- `construction_schedule_items` — Gantt rows per zone (`plan_start_date`, `actual_end_date`, `progress_pct`, `baseline_version`)
- `schedule_baselines` — versioned snapshots of plan for diff/history
- `wbs` — Work Breakdown Structure (hierarchical)
- `work_items` — individual tasks under WBS
- `area_hierarchy` — geo/area tree
- `rfa_log` — Request For Approval events

**Shop drawings**
- `shop_drawings` — drawing records with **L1-L5 level columns** (`bql_l1_response`..`bql_l5_response`, `_date`, `_comment`), `status`, `notes` (offline sync), `planned_submit_date`, `actual_submit_date`. Effective levels come from `approval_chains`, not the columns.

**Materials**
- `materials` — material catalog per project/zone (`material_code`, `progress_pct`, 4 request/delivery dates)
- `material_submittals` — submittal workflow with **TVGS** (`supervisor_approval_days=3`, `sla_deadline`, `supervisor_deadline`, `escalated_at`)
- `vendors` / `suppliers` / `subcontractors` / `cost_codes` / `workers` / `teams` / `resources` — master data

**Payments (4-step chain)**
- `contracts` — contract with vendor (`amount`, `retention_pct`)
- `invoices` — invoice against contract
- `payment_requests` — request to pay invoice (status: PENDING → APPROVED → PAID, REJECTED → DRAFT/PENDING)
- `payments` — actual payment record (bank ref, paid_date)
- `ar_contracts` + `ar_lines` — receivables from HSTT/MPM files (`kind`: invoice/payment/dossier)

**Auth sessions**
- `auth_refresh_tokens` — opaque rotating refresh tokens (`token_hash`, `expires_at`, `revoked_at`)
- `auth_revoked_jti` — access-token denylist for logout

**Daily reports (field)**
- `daily_reports` — header (`report_date`, `weather_am/pm`, `prepared_by`, counters, `notes` for offline sync)
- `daily_work_items` — tasks done today
- `daily_manpower` — workers count by role
- `daily_materials` — materials used
- `daily_acceptance` — accepted items
- `daily_safety` — safety incidents
- `daily_recommendations` — site recommendations
- `daily_infos` — info notes
- `daily_photos` — uploaded photos (`file_path`, `caption`, `uploaded_by`)

**KPI & governance**
- `kpi_targets` — current/effective KPI targets per code (`effective_from`, `effective_to`)
- `issues` — issue tracker (`severity`, `owner_user_id`, `project_id`, `status`)
- `directives` — CEO/PMO directives on issues (`notify_to_user_ids[]`, `from_user_id`)
- `audit_log` — universal audit trail (JSONB `before/after/context/field_changes`, written in the same tx as the business change)
- `notifications` — in-app + email/zalo results (`read_at`, `severity`, `resource_type`)
- `notifications` — in-app + email notifications (`read_at`, `severity`, `resource_type`)
- `offline_sync_queue` — field offline queue
- `generic_sheets` — catch-all for unknown doc types
- `business_processes` + `business_process_steps` — BP templates (`process_id`, `ordinal`, `name_vi`, `content_vi`)

**Ingest support**
- `file_uploads` — upload history (`original_filename`, `storage_key`, `status`, `report_json`, `zone_id`, `relative_path`, `skip_reason`)
- `schema_migrations` — ledger: every applied file + sha256 (`ran once, checksum-verified`)

### 3.2 Enums

| Enum | Values | Used in |
|------|--------|---------|
| `workflow_status` | `DRAFT, SUBMITTED, REVIEW, APPROVED, REJECTED, CLOSED, PAID` | shop_drawings, material_submittals, payment_requests |
| `master_status` | `ACTIVE, INACTIVE, CLOSED` | projects, contracts |
| `notification_channel` | `in_app, email` | notifications |
| `notification_status` | `pending, sent, delivered, failed` | notifications |
| `user_role` | `admin, ceo, pm, pmo, site, procurement, accounting, bql` | users (note: `ceo` is also `is_ceo=true`) |

### 3.3 Schema migrations

Located in `backend/drizzle/`, applied **exactly once** via the `schema_migrations` ledger (`db/migrate.js`): each file's sha256 is recorded; re-running skips; changed-after-apply → boot refuses (drift). First boot on a pre-ledger DB adopts existing files without re-running.

| File | Purpose |
|------|---------|
| `0000_naive_nick_fury.sql` | Base schema (Drizzle-generated) |
| `0001_departments_chains.sql` | `departments`, `approval_chains`, `projects/users.department_id` |
| `0002_sync_notes.sql` | `daily_reports.notes`, `shop_drawings.notes` (offline apply) |
| `0003_file_uploads_zone.sql` | `file_uploads.zone_id` (was dev-only, broke fresh DBs) |
| `9991_project_members.sql` | Membership seam (HBG-only backfill) |
| `9992_auth_session.sql` | Refresh tokens + denylist |
| `9993_auth_password.sql` | `password_hash` (bcrypt) |
| `9994_payment_ar.sql` | `ar_contracts` + `ar_lines` |
| `9995_schedule_source_status.sql` | `source_status` (raw text, display never uses it) |
| `9996_item_upload_lineage.sql` | `upload_id` lineage on schedule/shop/materials |
| `9997_batch_intake.sql` | `relative_path`, `skip_reason` on uploads |
| `9998_align_schema_with_routes.sql` | Route-driven patches (must run after `9999`: explicit order, not alphabetical) |
| `9999_add_issues_table.sql` | `issues` + `daily_infos` |

Sequences are resynced once at boot (`init.js`); inserts are single round-trip (no per-INSERT `setval`).

### 3.4 Multi-tenant readiness

HBG-only seam: `tenant_id` always comes from `req.user` (never hardcoded), `project_members` backfilled per tenant, cross-tenant reads/writes answer 404 (no leak). Full multi-tenant = manage memberships explicitly instead of the backfill.

---

## 4. Backend Reference

### 4.1 Composition (`src/index.js`)

Pure composition layer. Mounts 24 routers + serves SPA in production. Sockets are tracked so `SIGTERM`/`SIGINT` always terminate (lingering keep-alive/half-open connections are destroyed after 2s; 10s force-exit).

```js
import express from 'express';
import cors from 'cors';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 22 routers imported + mounted
app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/projects/:id/kpi-targets', kpiTargetsRouter);
app.use('/api/projects/:id/otd', otdRouter);
// ... 17 more

// Static SPA (production only)
app.use(express.static(join(__dirname, '..', '..', 'frontend', 'dist')));
app.get('*', (req, res) => res.sendFile(join(__dirname, '..', '..', 'frontend', 'dist', 'index.html')));
```

### 4.2 Lib helpers (18 files)

#### `lib/auth.js` — JWT sessions
- Access: stateless HS256, TTL `ACCESS_TTL_SEC` (24h). `requireAuth` verifies signature and reloads the user row (never trusts payload).
- Refresh: opaque, rotating, single-use, 30d (`auth_refresh_tokens`); denylist (`auth_revoked_jti`) + `token_version` for logout-all.

#### `lib/tx.js` + `lib/with-audit.js` — one pool, atomic audit
- **Single shared `pg` Pool** (`db/index.js`; `PG_POOL_MAX`, idle/connection timeouts, idle-client error handler). `tx(fn)` = BEGIN/COMMIT/ROLLBACK.
- `withAudit(req, meta, fn)` (alias `txAudit`): business + `audit_log` in one tx. `defer: true` lets the business result fill `before/after` (used by sync CLIENT apply).

#### `lib/transitions.js` — the only state machine
`TRANSITIONS` per resource (`shop_drawing`, `payment_request`, `material_submittal`, `project`, `sync_item`); `checkTransition()` → routes answer 422 on illegal jumps.

#### `lib/approval.js` — flexible chains
`resolveChain(tenant, project, resource)`: department override → tenant default → null (legacy single-step). Max 5 levels (fits `bql_l1..l5`); `validateLevels()` checks role names against the matrix; ADMIN/CEO bypass per level.

#### `lib/storage.js` — content-addressed files
`storage.save/path/exists/remove` over a local driver (`UPLOADS_DIR`, key = `sha256.ext`, dedupe by content). `STORAGE_DRIVER=s3` fails loud (no SDK wired). Legacy `saveFile/getFilePath/fileExists` wrappers kept.

#### `lib/sync-apply.js` — offline CLIENT appliers
Allowlist only (`construction_schedule_item.progress_pct`, `daily_report.notes`, `shop_drawing.notes` + validators). Anything else → 422, never silent.

#### `db/migrate.js` — ledger runner
`runMigrations()`: checksum ledger, drift refusal, pre-ledger adoption, explicit 9999-before-9998 order.

#### `db/index.js` — driver facts that matter
- **Single Pool** (see above). Inserts are one round-trip; `RETURNING id` auto-added only when the table has an `id` column (probed once, cached).
- **`NUMERIC` (oid 1700) parses to JS number** at the driver — money is never a string downstream (the `NaN tỷ` class).

```js
const stmt = db.prepare('SELECT * FROM users WHERE id = $1');
const user = await stmt.getAsync(42);         // first row or undefined
const users = await stmt.allAsync(42);        // rows[]
const result = await stmt.runAsync(42, 'x');  // { lastInsertRowid, changes }

const result = await db.upsert('projects', {
  conflictCols: ['tenant_id', 'code'],
  row: { tenant_id: 1, code: 'X', name_vi: 'X' }
});
// → INSERT ... ON CONFLICT (tenant_id, code) DO UPDATE SET ...
```

**Helper: `convertSql`**. Detects `?` placeholders and converts to `$1, $2, ...` for `pg`. Skips if SQL already has `$N` (avoids double-conversion).

### 4.3 Database (`src/db/`)

- **`index.js`** — single shared Pool, `prepare()`/`upsert()`, NUMERIC→number parsing, `buildDatabaseUrl()`
- **`migrate.js`** — checksum ledger (`schema_migrations`), drift refusal, adoption
- **`init.js`** — migrate + unique indexes + sequence resync + seeds (tenant, admin, BTE, zones, departments)

### 4.4 Routes (26 files)

| File | Mount | Endpoints | Purpose |
|------|-------|-----------|---------|
| `auth.js` | `/api/auth` | `POST /login`, `POST /refresh`, `POST /logout`, `POST /logout-all` | JWT login (bcrypt), rotate refresh, logout, logout-all |
| `me.js` | `/api/me` | `GET /`, `GET /permissions`, `GET /notification-prefs`, `PUT /notification-prefs` | Self-service: whoami, my permissions, notification preferences |
| `projects.js` | `/api/projects` | 14 endpoints | List, close/revoke, zones, materials, contracts, payments, daily-reports, issues, construction-schedule, shop-drawings, material-breakdown, submittals (overdue/pending-supervisor), schedule-baselines |
| `kpi.js` | `/api/kpis` | `GET /`, `POST /`, `GET /:kpi_code/history` | KPI current values + history |
| `kpi-targets.js` | `/api/projects/:id/kpi-targets` | `PUT /:id` | Update target (auto-creates history row) |
| `issues.js` | `/api/issues` | `GET /`, `GET /:id`, `POST /` | Issue list, detail, create |
| `audit.js` | `/api/audit` | `GET /`, `GET /export` | Audit log with filters, CSV export |
| `shop.js` | `/api/shop-drawings` | 8 endpoints | Create, list, get, patch, transition, **L1-L5 approve-level**, **approval-state**, **history** |
| `material-submittals.js` | `/api/material-submittals` | 6 endpoints | CRUD + submit/reject/approve |
| `payment.js` | `/api/payment*` | 8 endpoints | 4-step chain: contracts → invoices → payment_requests → payments |
| `notifications.js` | `/api/notifications` | 4 endpoints | List (with `unread=1` filter), mark read, mark all read, admin create |
| `directives.js` | `/api/directives` | `GET /`, `POST /` | CEO/PMO directives on issues |
| `materials.js` | `/api/materials` | `POST /` | Create material |
| `daily.js` | `/api/daily*` | 6 endpoints | Daily reports CRUD, add manpower, **upload photos (multipart)**, **list photos**, **manpower rollup** |
| `sync.js` | `/api/sync` | `GET /queue`, `POST /resolve` | Offline queue (field) |
| `dashboard.js` | `/api/dashboard` | `GET /`, `GET /portfolio-kpi` | Tenant portrait + cross-project KPI |
| `master-data.js` | `/api/master-data/:resource` | `GET /:resource`, `POST /:resource` | Generic CRUD (vendors, subcontractors, teams, departments…) with required-column validation |
| `business-process.js` | `/api/business-process/:code` | `GET /:code` | BP template by code |
| `upload.js` | `/api/upload`, `/api/uploads` | `POST /` (multipart), `GET /` | Upload Excel, list uploads |
| `wizard.js` | `/api/wizard*` | (see code) | 4-step Excel ingest wizard (analyze → map → commit → report) |
| `otd.js` | `/api/projects/:id/otd` | `GET /?grace_days=0` | OTD KPI: on-time / late / total / by_zone / 6mo trend |
| `jobs.js` | `/api/jobs` | `POST /escalate-tvgs`, `GET /escalate-tvgs/status` | TVGS escalation trigger + status |
| `approval-chains.js` | `/api/approval-chains` | `GET /`, `POST /`, `DELETE /:id` | Chain config per (dept, resource) — admin/CEO |
| `admin.js` | `/api/admin` | `GET /users`, `PATCH /users/:id` | User list (no hash) + department assign — admin/CEO |

**Note**: Many routes use `Router({ mergeParams: true })` because they're mounted under `/api/projects/:id/...` and need `req.params.id` to be visible inside the sub-router. **This is the #1 source of "missing param" bugs** — never forget it.

### 4.5 Services

#### `services/notify.js`

```js
export async function notify(req, userId, { title, body, severity, resourceType, resourceId, projectId, issueId }) {
  await db.prepare(`
    INSERT INTO notifications (tenant_id, user_id, project_id, issue_id, channel, delivery_status, severity, title, body, resource_type, resource_id)
    VALUES ($1, $2, $3, $4, 'in_app', 'pending', $5, $6, $7, $8, $9)
  `).runAsync(req.user.tenant_id, userId, projectId || null, issueId || null,
              severity || 'INFO', title, body || null, resourceType || null, resourceId || null);
}
```

Note: **no `link` or `is_read` columns**. Use `read_at IS NULL` for unread check, `resource_type` + `resource_id` for navigation target.

#### `services/ingest/` (12 parsers + `failures.js` + `index.js` router)

| File | Doc type |
|------|----------|
| `shop_drawing.js` | Shop drawings |
| `construction_schedule.js` | Construction schedule (status derived, never trusted from text) |
| `material_supply.js` | Material supply (MSA) |
| `subcontractor_directory.js` | Subcontractor list |
| `resource_directory.js` | Workers/machinery |
| `daily_report.js` | Daily report (work items, manpower, materials, photos) |
| `rfa_log.js` | RFA log |
| `business_process.js` | BP templates |
| `project_level.js` | Project meta |
| `generic_tabular.js` | Catch-all (incl. `manpower_master_plan` monthly dossiers) |
| `sp_ap.js` | Supplier payments (contract→invoice→PR→PAID) |
| `payment_ar.js` | Receivables (contracts + monthly HSTT dossiers) |

Each parser: `parse(filePath, …) → { sheets[] }` → `commit(parsed, …) → { ok, errors, items[] }` (structured failures `{sheet,row,field,message,ref}`). Wizard: stage → configure → commit via `/api/upload[/:id/...]`.

---

## 5. Frontend Reference

### 5.1 Entry & routing

`App.jsx`:
- `BrowserRouter` + `ConfirmProvider` + style injection
- `<Protected>` wraps `<HqShell>` or `<FieldShell>` based on role
- Routes:
  - `/login` (public)
  - `/hq/*` — HQ shell (CEO, PM, PMO, admin, procurement, accounting)
  - `/field/*` — Field shell (site)
  - `/governance/*` — Audit + MasterData
  - `/audit` — Audit log
  - `/otd` — OTD KPI page

### 5.2 Shells

#### `HqShell.jsx` (HQ + admin + procurement + accounting)
- Sidebar nav (collapsible)
- Header with BellDropdown + theme toggle
- Outlet for child routes

#### `FieldShell.jsx` (site engineer)
- Bottom tab bar (mobile-first)
- Top bar with project selector + BellDropdown
- Outlet for field pages

### 5.3 HQ screens (12)

| File | Route | Purpose |
|------|-------|---------|
| `ControlCenter.jsx` | `/hq` | 4-pillar dashboard (Construction / Shop / Material / Payment) with pie chart + hover tooltip |
| `ProjectOverview.jsx` | `/hq/overview/:projectId` | Single project: KPIs, schedule, contacts |
| `ProgressDetail.jsx` | `/hq/progress/:projectId` | Gantt chart view |
| `ShopList.jsx` | `/hq/shop` | Shop drawing list + level approve UI (chain-aware) |
| `Issues.jsx` | `/hq/issues` | Issue list with filters |
| `IssueDetail.jsx` | `/hq/issues/:id` | Issue detail + directive form |
| `Materials.jsx` | `/hq/materials` | Material catalog |
| `Manpower.jsx` | `/hq/manpower` | Manpower rollup (4 tabs: Workers/Machinery/Teams/Suppliers) |
| `Payment.jsx` | `/hq/payment` | 4-step payment chain UI |
| `OTDPage.jsx` | `/hq/otd` | OTD KPI (on-time / late / by_zone / trend) |
| `NotificationCenter.jsx` | `/hq/notifications` | All notifications with filters (in-app) |
| `ReviewQueue.jsx` | `/hq/uploads` | Staged-file review queue + generic rows viewer |
| `ChainConfig.jsx` | `/hq/approval-chains` | Chain editor + user↔department assignment |

### 5.4 Field screens (4)

| File | Route | Purpose |
|------|-------|---------|
| `FieldHome.jsx` | `/field` | Field home with shortcuts |
| `DailyProgress.jsx` | `/field/progress` | Daily progress entry |
| `DailyReportForm.jsx` | `/field/daily-report` | **NEW** — full daily report with photo upload + manpower |
| `FieldStubs.jsx` | `/field/*` | Materials / shopdrawing / issues / sync queue + resolve |

### 5.5 Governance screens (3)

| File | Route | Purpose |
|------|-------|---------|
| `AuditLog.jsx` | `/audit` | Audit log with filters + CSV export |
| `MasterDataList.jsx` | `/hq/master-data` | List vendors/subcontractors/departments/… |
| `MasterDataEdit.jsx` | `/hq/master-data/edit` | Create form |
| `Approval.jsx` | `/hq/approval` | Pending approvals hub (chain-aware shop approve) |
| `ChainConfig.jsx` | `/hq/approval-chains` | Chains + departments + user assignment |

### 5.6 Reusable components (10)

| File | Purpose |
|------|---------|
| `Login.jsx` | Email/password + 7 demo chips |
| `BellDropdown.jsx` | Notification bell with unread badge + panel |
| `ProjectPicker.jsx` | Reusable project selector (replaces `<select>`) |
| `ProjectOverview.jsx` | (also a screen) |
| `PieChart.jsx` + `PieTooltip.jsx` | Custom SVG pie chart |
| `CursorTooltip.jsx` | Hover tooltip |
| `Toast.jsx` | Toast notifications |
| `Confirm.jsx` | Confirm dialog |
| `UploadWizard.jsx` | 4-step Excel upload wizard |
| `DailyReportForm.jsx` | Daily report form with photo upload |
| `SubmittalHistory.jsx` | Modal showing audit history of a submittal |

### 5.7 API client (`api/index.js`, 240 LOC)

Typed-ish API client. Example:

```js
export const projects = {
  list: () => request('/projects'),
  get: (id) => request(`/projects/${id}`),
  close: (id) => request(`/projects/${id}/close`, { method: 'POST' }),
  issues: (id) => request(`/projects/${id}/issues`),
  createIssue: (id, data) => request(`/projects/${id}/issues`, { method: 'POST', body: JSON.stringify(data) }),
  // ...
};

export const daily = {
  reports: (projectId) => request(`/projects/${projectId}/daily-reports`),
  create: (projectId, data) => request(`/projects/${projectId}/daily-reports`, { method: 'POST', ... }),
  addManpower: (id, data) => request(`/daily-reports/${id}/manpower`, { method: 'POST', ... }),
  listPhotos: (id) => request(`/daily-reports/${id}/photos`),
  uploadPhotos: (id, files) => { /* FormData */ },
};

export const materialSubmittals = {
  list: (params) => request(`/material-submittals${params ? '?' + new URLSearchParams(params) : ''}`),
  get: (id) => request(`/material-submittals/${id}`),
  submit: (id) => request(`/material-submittals/${id}/submit`, { method: 'POST' }),
  approve: (id) => request(`/material-submittals/${id}/approve`, { method: 'POST' }),
  reject: (id, reason) => request(`/material-submittals/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  history: (id) => request(`/material-submittals/${id}/history`),
};

export const otd = {
  get: (projectId, graceDays = 0) => request(`/projects/${projectId}/otd?grace_days=${graceDays}`),
};
```

Auto-includes `Authorization: Bearer <token>` from `localStorage.pmo_token`.

---

## 6. Authentication & Permissions

### 6.1 Login flow

1. `POST /api/auth/login { email, password }` → bcrypt `password_hash` check
2. Access JWT (24h) + opaque rotating refresh token (30d, single-use)
3. Return `{ token, refresh_token, user: { id, email, name, role, is_ceo, tenant_id } }`
4. Frontend stores both; `Authorization: Bearer <token>`; auto-refresh on 401
5. `POST /api/auth/logout` revokes refresh + denies access jti; `/logout-all` bumps `token_version`

### 6.2 7 demo accounts

| Email | Password (dev) | Role | `is_ceo` |
|-------|----------|------|----------|
| `admin@hbg.com` | `admin123` | `admin` | false |
| `ceo@hbg.com` | `admin123` | `pmo` | true |
| `pm@hbg.com` | `admin123` | `pm` | false |
| `pmo@hbg.com` | `admin123` | `pmo` | false |
| `site@hbg.com` | `admin123` | `site` | false |
| `procurement@hbg.com` | `admin123` | `procurement` | false |
| `accounting@hbg.com` | `admin123` | `accounting` | false |

**Note**: demo shares one dev password (per-user passwords never worked — the old hardcode accepted only `admin123`). Passwords ARE bcrypt-hashed; set per-user hashes before production.

### 6.3 Permission matrix

| Action | admin | ceo | pm | pmo | site | procurement | accounting |
|--------|:-----:|:---:|:--:|:---:|:----:|:-----------:|:----------:|
| View all projects | ✅ | ✅ | own | ✅ | assigned | assigned | ✅ |
| Close project | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit KPI target | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create issue | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Resolve issue | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create directive | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Approve shop L1-L5 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Submit material submittal | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Approve material submittal | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| Create contract | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Approve payment request | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Record payment | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Upload Excel | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| View audit log | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Field daily report | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |

### 6.4 Middleware

```js
// Apply to route
router.use(requireAuth);              // all routes need auth
router.post('/critical', requireRole('admin', 'ceo'), handler);  // role check
```

---

## 7. Business Workflows

### 7.1 Shop Drawing approval (chain-aware)

**State machine** (`lib/transitions.js`, illegal jumps → 422):

```
DRAFT → SUBMITTED → APPROVED | REJECTED ⇄ DRAFT (re-submit)
```

With a multi-level chain (`approval_chains`, resolved dept → default), approval goes level by level via `/approve-level { level, response: P|F|C }` — each level checks its configured role (ADMIN/CEO bypass). Pass at the final level → APPROVED; Fail anywhere → REJECTED. The direct `→ APPROVED` shortcut is rejected (422) under multi-level chains; with no chain (legacy) single-step approval stays allowed. Max 5 levels (fits `bql_l1..l5` columns).

**GET /:id/approval-state** returns:
```json
{
  "current_level": 2,
  "is_fully_approved": false,
  "chain": [{ "level": 1, "role": "PM" }, { "level": 2, "role": "ADMIN" }],
  "max_level": 2,
  "levels": [
    { "level": 1, "response": "P", "date": "2026-09-01", "comment": "OK", "is_current": false },
    { "level": 2, "response": "PENDING", "is_current": true }
  ]
}
```

### 7.2 Material Submittal + TVGS

**Flow**:
1. Procurement creates `material_submittal` (status: `DRAFT`)
2. `POST /:id/submit` → status: `REVIEW`, set `submit_date = now()`, compute `sla_deadline = submit_date + sla_days` (default 7)
3. **TVGS**: supervisor must approve within `supervisor_approval_days` (default 3)
   - `supervisor_deadline = submit_date + 3 days`
   - If `supervisor_deadline < today` → escalate (see §11)
4. `POST /:id/approve` → status: `APPROVED`, set `approved_by`, `approved_date`
5. `POST /:id/reject { reason }` → status: `REJECTED`, set `rejected_by`, `rejected_at`, `rejected_reason`

**Overdue detection**: `status NOT IN ('APPROVED', 'CLOSED') AND (sla_deadline < today OR supervisor_deadline < today)`.

### 7.3 Payment 4-step chain

```
CONTRACT (vendor agreement, amount, retention_pct)
  └─ POST /:id/invoices { amount, due_date } → INVOICE
       └─ POST /:id/payment-requests { amount, retention_amount, due_date } → PAYMENT_REQUEST (status: DRAFT → SUBMITTED)
            └─ PUT /:id { status: 'APPROVED' } (role: admin/ceo/accounting) → APPROVED
                 └─ POST /:id/payments { bank_ref, paid_date, amount } → PAYMENT
```

**Strict**: cannot skip steps. `payment-requests` requires `invoices.status = 'SUBMITTED'`. `payments` requires `payment_requests.status = 'APPROVED'`.

### 7.4 OTD (On-Time Delivery)

**Definition**: `actual_end_date ≤ planned_end_date + grace_days`

**API**: `GET /api/projects/:id/otd?grace_days=0`

**Response**:
```json
{
  "project_id": 1,
  "grace_days": 0,
  "total_items": 47,
  "on_time": 32,
  "late": 15,
  "otd_pct": 68.1,
  "by_zone": [
    { "zone_id": 1, "zone_code": "BOH", "total": 8, "on_time": 6, "otd_pct": 75 },
    ...
  ],
  "trend_6mo": [
    { "month": "2026-04", "total": 5, "on_time": 4, "otd_pct": 80 },
    ...
  ]
}
```

**Threshold (UI color)**: ≥90% green, ≥70% yellow, <70% red.

### 7.5 Issues + Directives

- **Issue**: created with `severity` (NORMAL/HIGH/CRITICAL), `owner_user_id`
- **Directive**: CEO/PMO can attach a directive to an issue, which notifies specific users (`notify_to_user_ids[]`)
- **Status flow**: `OPEN → IN_PROGRESS → RESOLVED → CLOSED`

### 7.6 Daily Report (field)

- `POST /api/projects/:id/daily-reports` (header: date, weather_am/pm)
- `POST /api/daily-reports/:id/manpower { role_code, headcount }` (add multiple)
- `POST /api/daily-reports/:id/photos` (multipart, ≤20 files)
- Counters auto-incremented (`work_items_count`, `manpower_count`, etc.)

---

## 8. API Reference

**Base URL**: `http://localhost:3000/api` (or your server's URL)

**Auth header**: `Authorization: Bearer <token>` (required for all except `/auth/login` and `/health`)

### 8.1 Auth

```http
POST /auth/login
Body: { email: "admin@hbg.com", password: "admin123" }
→ 200 { token: "<jwt>", refresh_token: "<opaque>", user: { id, email, name, role, is_ceo, tenant_id } }
→ 401 { error: "Invalid credentials" }

POST /auth/refresh  Body: { refresh_token } → 200 { token, refresh_token } (rotated, old one dead)
POST /auth/logout              (auth) → revokes refresh + denies access jti
POST /auth/logout-all          (auth) → bumps token_version (all sessions dead)
```

### 8.2 Me

```http
GET /me                        (auth) → { id, email, name, role, is_ceo, tenant_id }
GET /me/permissions            (auth) → { role, matrix: {...} }
GET /me/notification-prefs     (auth) → { email: true, in_app: true }
PUT /me/notification-prefs     (auth) Body: { email, in_app }
```

### 8.3 Projects

```http
GET    /projects                                      → [{ id, code, name_vi, name_en, status, ... }]
GET    /projects/:id                                  → full project + zones
POST   /projects/:id/close                            (admin/ceo) → close project
POST   /projects/:id/revoke-close                     (admin/ceo) → reopen
GET    /projects/:id/zones                            → [{ id, code, name_vi, name_en }]
GET    /projects/:id/construction-schedule            → ordered by plan_start_date
GET    /projects/:id/shop-drawings                    → list
GET    /projects/:id/materials                       → list
GET    /projects/:id/contracts                       → list
GET    /projects/:id/payments                        → list
GET    /projects/:id/daily-reports                   → list
GET    /projects/:id/issues                          → list
POST   /projects/:id/issues                          → create issue
GET    /projects/:id/material-breakdown              → [{ zone_id, count }]
GET    /projects/:id/material-submittals/overdue     → list
GET    /projects/:id/material-submittals/pending-supervisor → list
GET    /projects/:id/schedule-baselines              → versions
POST   /projects/:id/schedule-baselines              → create baseline
GET    /projects/:id/schedule-baselines/:version     → get baseline
```

### 8.4 OTD

```http
GET /projects/:id/otd?grace_days=0
→ { project_id, grace_days, total_items, on_time, late, otd_pct, by_zone[], trend_6mo[] }
```

### 8.5 Shop Drawings

```http
POST   /shop-drawings                    → create
GET    /shop-drawings                    → list
GET    /shop-drawings/:id                → detail (with zone_code, history_count)
PATCH  /shop-drawings/:id                → edit (only DRAFT/REJECTED)
POST   /shop-drawings/:id/transition     Body: { to_status, rejection_reason? } → state transition
POST   /shop-drawings/:id/approve-level  (admin/ceo/pm/pmo) Body: { level: 1-5, response: 'P'|'F'|'C', comment? }
GET    /shop-drawings/:id/approval-state → current state per level
GET    /shop-drawings/:id/history        → audit log entries
```

### 8.6 Material Submittals

```http
POST   /material-submittals                 → create (procurement/pm)
GET    /material-submittals?project_id=&status=  → list with filters
GET    /material-submittals/:id             → detail
POST   /material-submittals/:id/submit      → move to REVIEW
POST   /material-submittals/:id/approve     → move to APPROVED
POST   /material-submittals/:id/reject      Body: { reason } → REJECTED
```

### 8.7 Payment chain

```http
POST /payment/projects/:id/contracts          Body: { vendor_id, amount, retention_pct, ... }
GET  /payment/invoices/:id/payment-requests
POST /payment/invoices/:id/payment-requests   Body: { amount, retention_amount, due_date }
GET  /payment/payment-requests/:id
PUT  /payment/payment-requests/:id            (admin/ceo/accounting) Body: { status: 'APPROVED', notes? }
POST /payment/payment-requests/:id/payments   (admin/ceo/accounting) Body: { bank_ref, paid_date, amount }
```

### 8.8 Notifications

```http
GET    /notifications?unread=1&limit=50
POST   /notifications/:id/read                → mark 1 as read
POST   /notifications/mark-all-read           → mark all as read
POST   /notifications                         (admin) Body: { user_ids: [...], title, body, severity }
```

### 8.9 KPI

```http
GET    /kpis                                  → current values per code
POST   /kpis                                  Body: { kpi_code, value, period }
GET    /kpis/:kpi_code/history                → all values over time
PUT    /projects/:id/kpi-targets/:id          Body: { value, note? } → updates + creates history
```

### 8.10 Daily Reports

```http
GET    /projects/:id/daily-reports            → list
POST   /projects/:id/daily-reports            Body: { report_date, weather_am, weather_pm, source_sheet_name }
GET    /daily-reports/:id/full                → header + work_items + manpower + materials + photos
POST   /daily-reports/:id/manpower            Body: { role_code, role_name_vi, headcount, notes }
POST   /daily-reports/:id/photos              (multipart, field name: photos) → uploads ≤20 files
GET    /daily-reports/:id/photos              → list photos
GET    /manpower/rollup?from=&to=&group_by=week|month  → cross-project rollup
```

### 8.11 Issues & Directives

```http
GET    /issues?project_id=&status=&severity=
GET    /issues/:id
POST   /issues                                Body: { project_id, zone_id, title, description, severity, owner_user_id }

GET    /directives
POST   /directives                            (admin/ceo/pmo) Body: { issue_id, content, notify_to_user_ids[] }
```

### 8.12 Audit

```http
GET    /audit?resource_type=&resource_id=&user_id=&action=&from=&to=
GET    /audit/export                          → CSV
```

### 8.13 Dashboard

```http
GET /dashboard                                → tenant portrait { projects_active, materials_pending, ... }
GET /dashboard/portfolio-kpi                  → cross-project rollup
```

### 8.14 Upload wizard

```http
POST /upload                                  (multipart, field: file) → { id, storage_key, status: 'PENDING' }
GET  /uploads                                 → list (last 100)

POST /wizard/:uploadId/analyze                → parse Excel, detect doc type
POST /wizard/:uploadId/map                    Body: { mappings: [...] }
POST /wizard/:uploadId/commit                 → execute ingest
GET  /wizard/:uploadId/report                 → { inserted, updated, skipped, errors }
```

### 8.15 Jobs (background)

```http
POST /jobs/escalate-tvgs                      → trigger escalation now
GET  /jobs/escalate-tvgs/status               → { last_run, escalated_count }
```

### 8.16 Master data (generic)

```http
GET  /master-data/vendors                      → vendors list
POST /master-data/vendors                      → create
# Same for: subcontractors, suppliers, workers, teams, cost_codes
```

### 8.17 Business process

```http
GET /business-process/:code                    → { ...process, steps[] }
```

### 8.18 Approval chains & admin (Wave 2)

```http
GET /approval-chains[?resource_type=]           → chains + department labels
POST /approval-chains      (admin/CEO) Body: { department_id|null, resource_type, levels:[{level,role,label}] }
DELETE /approval-chains/:id (admin/CEO) → back to legacy single-step
GET /admin/users           (admin/CEO) → users without password_hash
PATCH /admin/users/:id     (admin/CEO) Body: { department_id|null }
PATCH /projects/:id        (admin/CEO) Body: { name_vi?, package?, department_id? }
```

### 8.19 Sync resolve (CLIENT apply)

```http
POST /sync/resolve Body: { queue_id, winner: SERVER|CLIENT }
→ SERVER: keep server record, mark RESOLVED (unchanged)
→ CLIENT: apply resource_json onto server_record_id (allowlisted types/fields only)
  + SYNC_APPLY audit with before/after, same tx; else 422. Owner or admin/CEO only.
```

**Money rule**: all `amount`/`total_value`/`retention_*`/`vat_*` fields arrive as JSON numbers (driver parses NUMERIC). Never string-concatenate them.

---

## 9. Excel Upload Pipeline

### 9.1 Supported doc types

| Doc type | Sheets expected | Parser |
|----------|-----------------|--------|
| Shop drawing | 1+ sheets named "Shop drawing" / "Drawing" | `shop_drawing.js` |
| Construction schedule | Multi-zone, multi-sheet | `construction_schedule.js` |
| Material supply | Material sheets | `material_supply.js` |
| Subcontractor directory | Subcontractor sheets | `subcontractor_directory.js` |
| Resource directory | Resource sheets | `resource_directory.js` |
| Daily report | 1 sheet per report | `daily_report.js` |
| RFA log | RFA sheets | `rfa_log.js` |
| Business process | BP sheets | `business_process.js` |
| Project level | Project info | `project_level.js` |
| Generic tabular | Anything else | `generic_tabular.js` |

### 9.2 Wizard flow

1. **Upload** (`POST /upload`): Excel file → multer stores at `data/uploads/<storage_key>` → DB row in `file_uploads` (status: PENDING)
2. **Analyze** (`POST /wizard/:id/analyze`): parse each sheet → detect doc type via header pattern match → for each, run parser → return `{ sheets: [{ name, detected_type, rows, errors }] }`
3. **Map** (`POST /wizard/:id/map`): user confirms column mappings if needed
4. **Commit** (`POST /wizard/:id/commit`): for each sheet, call `commit(rows, ctx)` → `db.upsert()` per row → atomic per sheet
5. **Report** (`GET /wizard/:id/report`): `{ inserted, updated, skipped, errors[] }`

### 9.3 Idempotency

`db.upsert()` uses unique constraints. Re-uploading same Excel updates existing rows (no duplicates). Required unique indexes:

```sql
CREATE UNIQUE INDEX construction_schedule_items_uq ON construction_schedule_items (project_id, zone_id, source_sheet, ordinal);
CREATE UNIQUE INDEX materials_project_zone_code_uq ON materials (project_id, zone_id, material_code);
CREATE UNIQUE INDEX business_process_steps_process_ord_uq ON business_process_steps (process_id, ordinal);
-- ...
```

### 9.4 Error handling

Per-row errors are collected, not thrown. Wizard report shows:
- `errors[]` with `{ row, column, message }`
- Counters: `inserted` / `updated` / `skipped`
- Valid rows still committed (unless `abort_on_error=true`)

---

## 10. Notifications

### 10.1 Schema (real)

```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  project_id INTEGER,
  issue_id INTEGER,
  channel notification_channel NOT NULL,         -- 'in_app' | 'email'
  delivery_status notification_status NOT NULL,   -- 'pending' | 'sent' | 'delivered' | 'failed'
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  severity VARCHAR(20) NOT NULL,                  -- 'info' | 'warning' | 'critical'
  title TEXT NOT NULL,
  body TEXT,
  resource_type VARCHAR(50),                      -- 'issue' | 'shop_drawing' | 'material_submittal' | ...
  resource_id INTEGER,
  read_at TIMESTAMP,                              -- NULL = unread
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

**No `link` or `is_read` columns** — use `read_at IS NULL` and `resource_type` + `resource_id` for navigation.

### 10.2 Sending

```js
import { notify, notifyMany } from './services/notify.js';

await notify(req, userId, {
  title: 'Submittal rejected',
  body: 'Reason: ...',
  severity: 'warning',
  resourceType: 'material_submittal',
  resourceId: 42,
  projectId: 1,
});

await notifyMany(req, [userId1, userId2], { ... });
```

### 10.3 Receiving (UI)

`BellDropdown.jsx` polls `/api/notifications` every 30s, shows unread badge. Click → mark read + navigate to `resource_type` URL:

- `issue` → `/hq/issues?item={resource_id}`
- `directive` → `/hq/issues?item={issue_id}`
- `shop_drawing` → `/hq/shop?drawing={resource_id}`

---

## 11. Background Jobs

### 11.1 TVGS Auto-Escalation

Runs every 1 hour (setInterval in `src/index.js`, skipped if `NODE_ENV=test`).

```js
setInterval(async () => {
  if (process.env.NODE_ENV === 'test') return;
  await escalateOverdueTvgs();
}, 60 * 60 * 1000);
```

**Logic**:
1. Find submittals: `status NOT IN ('APPROVED', 'CLOSED') AND supervisor_deadline < CURRENT_DATE AND escalated_at IS NULL`
2. For each: notify PM (if `projects.pm_user_id` set) + all CEO users
3. Set `escalated_at = now()` (idempotent — won't re-escalate)

**Manual trigger**: `POST /api/jobs/escalate-tvgs`

---

## 12. Local Development

### 12.1 One-time setup

```bash
git clone https://github.com/TungLinhh/pmo-project.git
cd pmo-project
npm install              # workspaces
cd backend && npm run init-db && cd ..
```

`init-db`:
- Applies `drizzle/0000_naive_nick_fury.sql` (if no `tenants` table)
- Applies `drizzle/9998_align_schema_with_routes.sql` (patches)
- Applies `drizzle/9999_add_issues_table.sql`
- Creates 7 unique indexes for `db.upsert()`
- Seeds: tenant `hbg`, 7 users, 2 projects, 19 zones for `BTE-WP4-HBC`

### 12.2 Daily dev

```bash
npm run dev              # backend (port 3000) + frontend (port 5173) concurrently
# OR separately:
npm run dev:backend      # node --watch
npm run dev:frontend     # vite HMR
```

### 12.3 Hot reload

- Backend: `node --watch src/index.js` — auto-restart on file change
- Frontend: Vite HMR — instant reload, preserves state

### 12.4 Database tools

```bash
# WSL/Linux local PG (port 5433)
./backend/scripts/pg-ctl.sh start
./backend/scripts/pg-ctl.sh psql
./backend/scripts/pg-ctl.sh backup
./backend/scripts/pg-ctl.sh restore <file>

# Or use system psql directly
PGPASSWORD=pmo_dev_pwd psql -h 127.0.0.1 -p 5433 -U pmo_user -d pmo
```

---

## 13. Testing

### 13.1 Suites (`tests/e2e/`, ~75 files)

| Suite | What it guards |
|-------|----------------|
| `pipeline-guard.mjs` | **Full pipeline on scratch DB**: synth workbooks → upload→configure→commit → pillars/OTD → approve→pay → CLIENT sync → DROP. CI-safe. |
| `demo-walkthrough.mjs` | 28 checks of the demo flow on real data |
| `p5-golden.mjs` | Demo-data goldens (77 contracts, 248 PRs, AR sums, project set, empty bell) |
| `p5-money.mjs` | Every amount is `number`; JS sum = SQL SUM; no NaN |
| `ingest-happy.mjs` | Happy-path commits of the 6 minor ingestors |
| `p3-*.mjs` | Ledger, single pool + safe shutdown, sequences, txAudit atomicity + defer, transitions 422 |
| `approval-chains.mjs` | Chain enforce + roles + department override + negatives |
| `p4-*.mjs` | Storage interface, deploy surface, CLIENT apply, container smoke |
| `api/payment-sla/shop-approval/schema/browser` | Legacy CI chain (also in `npm test`) |
| `cleanup-demo.mjs` | Removes test junk from dev DB (not a test) |
| `lib.mjs` | Shared helpers (login/api/psql, no absolute paths) |

Rule: every suite cleans up what it creates; `cleanup-demo.mjs` sweeps leftovers.

### 13.2 Commands

```bash
npm test                    # CI chain: api + payment-sla + shop-approval + schema
node tests/e2e/pipeline-guard.mjs   # full pipeline on scratch DB (see 13.1)
node tests/e2e/demo-walkthrough.mjs # 28 demo checks (needs dev DB + :3000)
node tests/e2e/cleanup-demo.mjs     # sweep test junk from dev DB
BASE_URL=http://localhost:3000 node tests/e2e/<name>.mjs  # any single suite
```

### 13.3 Schema vs SQL audit

```bash
npm run audit:schema
# Scans backend/src/routes + lib for SQL strings
# Compares column references to actual PG schema
# Reports: <file>:<line>  ❌ table.column  available: [a, b, c]
```

**Why**: catches column mismatches BEFORE runtime (which would crash → white screen). Run after editing routes.

### 13.4 CI (`.github/workflows/ci.yml`)

- `backend-lint`: `node --check` on all `lib/` + `routes/` files
- `backend-tests`: spins up PG, applies migrations, starts backend, runs 4 E2E suites
- `frontend-build`: Vite build + upload artifact
- `schema-audit`: runs `tests/tools/schema-audit.mjs`

### 13.5 Adding a new test

1. Add test function to existing file OR create `tests/e2e/<feature>.mjs`
2. Follow pattern: `const result = await api(token, '/path', { method: 'POST', body: JSON.stringify({...}) })`
3. Track `pass`/`fail` counters
4. Print `=== Results: N/M PASS ===` at end
5. Add to root `package.json` `test:xxx` script + to `test` chain
6. Add to `.github/workflows/ci.yml` `Run E2E suite` step

---

## 14. Deployment

### 14.1 Single-server (recommended for ≤100 users)

**Option A: Native**
```bash
# On server
git clone https://github.com/TungLinhh/pmo-project.git
cd pmo-project
npm install
npm run build              # frontend/dist/
DB_HOST=10.0.0.5 DB_USER=pmo_user DB_PASSWORD=<real> npm start
```

**Option B: Docker Compose**
```bash
git clone ...
cd pmo-project
docker compose up -d       # postgres + backend
# Behind nginx/cloudflare proxy
```

**Option C: Cloudflare tunnel** (current demo)
- Backend on `localhost:3000`
- `cloudflared tunnel --url http://localhost:3000` → public URL
- No domain/SSL config needed

### 14.2 Multi-server

Access tokens are stateless JWT (no shared session store needed); refresh rotation is a single-row UPDATE (safe on one PG). Would still need:
- `pgbouncer` for PG connection pooling
- Shared uploads volume (NFS) or the S3 driver

### 14.3 Database backup

```bash
# Native
./backend/scripts/pg-ctl.sh backup
```

### 14.4 Coolify / VPS (container)

Build from `Dockerfile` (multi-stage `node:22-slim`). Env: `DATABASE_URL` (or `DB_*`), `JWT_SECRET` (**required**), `UPLOADS_DIR` (mount a volume). Entrypoint waits for PG → `init-db` (ledger, idempotent) → boot. See `.env.example`.

### 14.5 Production checklist

- [x] Hash passwords (bcrypt)
- [x] Migrations ledgered + idempotent entrypoint
- [ ] Set real `DB_PASSWORD` (not `pmo_dev_pwd`)
- [ ] Set strong `JWT_SECRET`
- [ ] HTTPS via reverse proxy (nginx + Let's Encrypt)
- [ ] Set `NODE_ENV=production`
- [ ] Automated backups + test restore
- [ ] Monitor: `pm2`/`systemd`, alerts on `/api/health`
- [ ] Replace demo accounts with real users (per-user password hashes)
- [ ] CORS whitelist (currently open in dev)

---

## 15. Operations & Troubleshooting

### 15.1 Health check

```http
GET /api/health
→ { status: "ok", timestamp: "...", authenticated: false, user: null }
```

Use for: load balancer health, monitoring, CI smoke test.

### 15.2 Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `ECONNREFUSED 127.0.0.1:5433` | PG not running | `./backend/scripts/pg-ctl.sh start` or `docker compose up -d postgres` |
| `EADDRINUSE :::3000` | Port 3000 taken | `lsof -i :3000` → `kill -9 <pid>` |
| `column "xyz" does not exist` | Schema drift | `npm run audit:schema` to find bad queries |
| `inconsistent types deduced for parameter $1` | PG can't infer type from `CASE WHEN $1 = ...` | Add explicit cast: `$1::workflow_status` |
| `relation "users" does not exist` | Migrations not applied | `cd backend && npm run init-db` |
| White screen on dashboard | Frontend runtime error | Check browser console, then `npm test` |
| `Cannot read properties of undefined (reading 'unread')` | API shape mismatch | Check `api/notifications` returns array, not `{items, counts}` |
| 502 from Cloudflare tunnel | Tunnel disconnect | Check `cloudflared` process, restart if needed |
| `npm test` fails with timeout | Backend not running | Start backend: `npm run dev:backend` |

### 15.3 Database maintenance

```bash
# Vacuum (reclaim space, update planner stats)
PGPASSWORD=pmo_dev_pwd psql -h 127.0.0.1 -p 5433 -U pmo_user -d pmo -c "VACUUM ANALYZE"

# Reindex (after heavy writes)
PGPASSWORD=pmo_dev_pwd psql -h 127.0.0.1 -p 5433 -U pmo_user -d pmo -c "REINDEX DATABASE pmo"

# Check table sizes
PGPASSWORD=pmo_dev_pwd psql -h 127.0.0.1 -p 5433 -U pmo_user -d pmo -c "
  SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
  FROM pg_stat_user_tables
  ORDER BY pg_total_relation_size(relid) DESC
  LIMIT 10;"
```

### 15.4 Logs

- Backend: stdout (in `pm2`/`systemd` journal)
- Frontend: browser console + Vite dev server
- DB: `data/pg_log/`
- Tunnel: cloudflared process output

### 15.5 Restart recipes

```bash
# Backend only
pkill -f "node src/index.js"
cd backend && nohup node src/index.js > /tmp/pmo.log 2>&1 &

# Full stack (docker)
docker compose restart backend

# After schema change
cd backend && npm run init-db
docker compose restart backend
```

---

## 16. Appendix: Migration History

| Date | Phase | Description | Commit |
|------|-------|-------------|--------|
| 2026-08-29 | MVP launch | Initial 20-screen MVP, SQLite, 1166 LOC index.js | `6091f50` |
| 2026-09-03 | DB migration | SQLite → PostgreSQL, Drizzle setup | `5810c85` |
| 2026-09-04 | Phase 1+2 | Refactor: 22 routers + 3 lib helpers, 70/70 tests pass | `9c66506` |
| 2026-09-05 | Phase 3 | TVGS auto-escalation, L1-L5 shop approval, OTD page, photo gallery, submittal history modal | (in `9c66506`) |
| 2026-09-05 | White screen fix | 11 column mismatches fixed, schema-audit tool created | (in `9c66506`) |
| 2026-09-05 | Cleanup | Tests/ folder, Docker PG, deleted CHECKLIST, dead code removed | `5de7f0d` |
| 2026-09-05 | Docs v0.3.0 | Unified Product Technical Documentation | (this commit) |
| 2026-09-11 | P3–P5 + Wave 2 | Pool/ledger/sequences/txAudit/transitions; departments + chains; storage/sync-apply/money-proof; cleanup | (this commit) |
| 2026-09-12 | Docs v0.4.0 | README (VI), PTD v0.4.0, SRS refresh, pipeline-guard, LAWRENCE removal | (this commit) |

### 16.1 Known limitations (v0.4.0)

1. **Shared dev password** — all demo users `admin123`; set per-user hashes for prod
2. **No real-time updates** — frontend polls (BellDropdown 30s)
3. **No mobile native apps** — web responsive only
4. **HBG-only tenant seam** — no multi-tenant UI
5. **No S3 driver** — local FS only (stub fails loud)
6. **Audit log retention** — no auto-prune, grows forever
7. **Flat departments** — no nesting (`parent_id` deferred)
8. **No offline enqueue** — CLIENT apply works; field app posts online

### 16.2 Roadmap (suggested)

- v0.5: per-user passwords UI + rate limiting review + audit prune
- v0.6: WebSocket / SSE for real-time notifications
- v0.7: S3 driver for uploads + AI image storage
- v0.8: nested departments + multi-tenant admin
- v0.9: offline enqueue endpoint for field app
- v1.0: Gantt auto-scheduling + BIM viewer

---

## License

Proprietary — internal use only. © 2026 HBG Construction.

## Contact

Engineering: Tùng Linh — tunglinh@hbg.com
