# PMO MVP — Product Technical Documentation

> **Version**: 0.11.0 · **Last updated**: 2026-09-23 · **Audience**: Engineers, technical PMs, integrators
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
| **PMO** | Monitor assigned projects, KPI targets and governance | Control Center, assigned project views, KPI |
| **Site engineer** | Daily reports (manpower, photos, weather), field issues | Field Home, Daily Report, Photo Upload |
| **Procurement** | Material submittals, contracts, vendor management | Materials, Material Submittal, Master Data |
| **Accounting** | Payment chain (contract → invoice → request → payment) | Payment, Contracts, Invoices |

### 1.3 Out of scope (v0.5.0)

- Native mobile apps (web-responsive only)
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
│  ─ các màn hình nghiệp vụ, governance và field                   │
│  ─ các component dùng chung                                        │
└──────────────────┬──────────────────────────────────────────────────┘
                   │ HTTP (Bearer token in localStorage)
                   │ XHR/fetch
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Express 4 Backend (Node.js 20)                      │
│  backend/src/index.js (130 LOC composition)                          │
│  ─ 40 route files in routes/                                        │
│  ─ auth, transaction, audit, permissions và các lib nghiệp vụ       │
│  ─ 1 service layer (ingest/, notify.js, export.js)                  │
│  ─ static SPA serving in production (dist/)                         │
└─────┬─────────────────────┬──────────────────┬──────────────────────┘
      │                     │                  │
      ▼                     ▼                  ▼
┌─────────────┐  ┌──────────────────┐  ┌─────────────────┐
│ PostgreSQL  │  │ Local FS         │  │ Background jobs │
│ 16 (raw pg) │  │ data/uploads/    │  │ (setInterval)   │
│ 72 tables   │  │ (Excel, photos)  │  │ TVGS escalation │
└─────────────┘  └──────────────────┘  └─────────────────┘
```

### 2.2 Tech stack rationale

| Choice | Why |
|--------|-----|
| **PostgreSQL (raw `pg`)** | Schema is mature (72 tables). Raw SQL gives full control over CTEs, window functions, `RETURNING`, `ON CONFLICT`. |
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
│   ├── index.js                # Express composition (40 route modules + serves SPA + safe shutdown)
│   ├── lib/                    # các helper/module nghiệp vụ — xem §4.2
│   ├── routes/                 # các router theo domain — xem §4.4
│   ├── db/
│   │   ├── index.js            # Single Pool, NUMERIC→number, upsert helper
│   │   ├── migrate.js          # checksum ledger runner
│   │   └── init.js             # migrate + indexes + sequences + seeds
│   └── services/
│       ├── notify.js           # notify(user, payload), notifyMany(...) (in_app/email/zalo)
│       ├── export.js           # CSV export
│       └── ingest/             # các parser Excel — xem §9
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

### 3.1 Tables (72 total on the current schema)

**Core (multi-tenant base)**
- `tenants` — top-level org (`hbg = HBG Construction`)
- `users` — login accounts: `role` + `is_ceo` flag, bcrypt `password_hash`, nullable `department_id`
- `projects` — real projects loaded by the demo/pilot pipeline; `BTE-WP4-HBC` is the primary demo project, nullable `department_id`
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
- `shop_drawings` — drawing records with **L1-L5 level columns** (`bql_l1_response`..`bql_l5_response`, `_date`, `_comment`), `status`, `notes` (offline sync), `planned_submit_date`, `actual_submit_date`, and the as-built tail (`as_built_status`, `as_built_at`). Effective levels come from `approval_chains`, not the columns.

**Materials**
- `materials` — material catalog per project/zone (`material_code`, `progress_pct`, 4 request/delivery dates)
- `material_submittals` — submittal workflow with **TVGS** (`supervisor_approval_days=3`, `sla_deadline`, `supervisor_deadline`, `escalated_at`) and physical-sample evidence (`physical_sample_status`)
- `vendors` / `suppliers` / `subcontractors` / `cost_codes` / `workers` / `teams` / `resources` — master data

**Payments (4-step chain)**
- `contracts` — contract with vendor (`amount`, `retention_pct`)
- `invoices` — invoice against contract
- `payment_requests` — request to pay invoice (status: PENDING → APPROVED → PAID, REJECTED → DRAFT/PENDING) with retention tracking (`retention_status`, release date/amount)
- `payments` — actual payment record (bank ref, paid_date, retention held/released)
- `ar_contracts` + `ar_lines` — receivables from HSTT/MPM files (`kind`: invoice/payment/dossier)

**Auth sessions**
- `auth_refresh_tokens` — opaque rotating refresh tokens (`token_hash`, `expires_at`, `revoked_at`)
- `auth_revoked_jti` — access-token denylist for logout

**Daily reports (field)**
- `daily_reports` — header (`report_date`, `weather_am/pm`, `prepared_by`, counters, `notes` for offline sync)
- `daily_work_items` — tasks done today
- `daily_manpower` — labor or equipment actuals by role (`kind= labor|equipment`)
- `work_item_productivity` — planned/actual output and headcount by canonical work item, period, role and kind; upsert key makes reruns idempotent
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
- `notifications` — in-app + email notifications (`read_at`, `severity`, `resource_type`)
- `attention_digest_runs` — idempotent daily overdue digest delivery ledger (`tenant_id`, `user_id`, `digest_date`)
- `qa_inspections` — optional QA/QC extension pillar (OPEN → FAILED/PASSED)
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
| `user_role` | `admin, pm, pmo, site, technical, procurement, accounting, data_admin, editor, viewer` | users (CEO is `role=pmo` + `is_ceo=true`) |

### 3.3 Schema migrations

Located in `backend/drizzle/`, applied **exactly once** via the `schema_migrations` ledger (`db/migrate.js`): each file's sha256 is recorded; re-running skips; changed-after-apply → boot refuses (drift). First boot on a pre-ledger DB adopts existing files without re-running.

| File | Purpose |
|------|---------|
| `0000_naive_nick_fury.sql` | Base schema (Drizzle-generated) |
| `0001_departments_chains.sql` | `departments`, `approval_chains`, `projects/users.department_id` |
| `0002_sync_notes.sql` | `daily_reports.notes`, `shop_drawings.notes` (offline apply) |
| `0003_file_uploads_zone.sql` | `file_uploads.zone_id` (was dev-only, broke fresh DBs) |
| `0004_heal_schema_drift.sql` | `projects` close columns + `directives` heal (IF NOT EXISTS, converges dev/fresh) |
| `0005_tenant_plans.sql` | `tenants.plan` (small/mid/enterprise) + `feature_flags` + `status`; HBG → enterprise |
| `9999b_tenant_rls.sql` | RLS `*_tenant_isolation` policies on all tenant/project-scoped tables (runs after every table exists) |
| `9999c_fix_rls_hatch.sql` | `app_tenant_unset()` / `app_current_tenant()` helpers; recreates all RLS policies coalesce-safe (generated, do not hand-edit) |
| `9999d_schedule_links.sql` | `schedule_links` (FS/SS/FF dependency graph) + RLS (rank 5) |
| `9999e_schedule_scenarios.sql` | `schedule_scenarios` preview/apply/rollback ledger (rank 6) |
| `9999f_site_holidays.sql` | `site_holidays` (global VN 2026–27 + per-tenant) + RLS (rank 7) |
| `9999g_ai_foundation.sql` | AI routing/index/calls/drafts tables + RLS + `tenants.ai_monthly_cap_usd` (rank 8; needs `vector` ext — see §3.5) |
| `9999h_app_role.sql` | Least-privilege `pmo_app` role + grants + default privileges (rank 9; needs CREATEROLE once — see §3.6) |
| `9999i_password_flag.sql` | `users.must_change_password` (rank 10) |
| `9999j_erp_push.sql` | `erp_profiles` + `erp_push_log` + RLS (rank 11) |
| `9999k_nested_departments.sql` | `departments.parent_id` + index (rank 12) |
| `9999l_erp_connectors.sql` | `connector` + `config` on profiles (rank 13) |
| `9999m_erp_nullable.sql` | sftp_* NULL-able for non-sftp connectors (rank 14) |
| `9991_project_members.sql` | Membership seam (HBG-only backfill) |
| `9992_auth_session.sql` | Refresh tokens + denylist |
| `9993_auth_password.sql` | `password_hash` (bcrypt) |
| `9994_payment_ar.sql` | `ar_contracts` + `ar_lines` |
| `9995_schedule_source_status.sql` | `source_status` (raw text, display never uses it) |
| `9996_item_upload_lineage.sql` | `upload_id` lineage on schedule/shop/materials |
| `9997_batch_intake.sql` | `relative_path`, `skip_reason` on uploads |
| `9998_align_schema_with_routes.sql` | Route-driven patches (must run after `9999`: explicit order, not alphabetical) |
| `9999_add_issues_table.sql` | `issues` + `daily_infos` |
| `9999am_space_bunny_fallback.sql` | OpenRouter chat fallback route `stealth/space-bunny-alpha` (rank 40) |
| `9999an_work_item_productivity.sql` | Work-item norm/actual productivity ledger + RLS (rank 41) |
| `9999w_task10_trust.sql` | Task 10 trust: `users.locale/sso_subject/sso_issuer`, `sso_configs`, `pdpl_consents`, `pdpl_requests` + RLS (rank 24) |
| `9999x_task10_colwidth.sql` | Task 10: `workers.phone→varchar(128)`, `users.zalo_user_id→varchar(256)` cho ciphertext (rank 25) |

Sequences are resynced once at boot (`init.js`); inserts are single round-trip (no per-INSERT `setval`).

### 3.4 Multi-tenant (v0.5.0: enforced, not a seam)

- **Plans**: `tenants.plan` ∈ small/mid/enterprise + `feature_flags` JSONB overrides
  (`{"+bulk-import": true}`). Entitlements resolved in `lib/entitlements.js`;
  `GET /api/me/entitlements` feeds frontend nav gating. Small = 4 pillars lean
  (P1 basic, P2 single-step, P3 basic, P4 AP-only, no AR); Mid adds SLA/TVGS
  filters, directives, OTD trend, AR-read, portfolio-read; Enterprise adds
  chains write, portfolio full, audit-export, bulk-import, kpi-targets, AR-full.
- **Isolation, two layers**: (1) app-level — `tenant_id` from `req.user`
  (never hardcoded), `project-access.js` 404s cross-tenant; (2) Postgres RLS —
  `*_tenant_isolation` policies on every tenant- or project-scoped table
  (second-hop via joins), `FORCE` so the owner role is filtered too.
- **GUC plumbing**: `requireAuth` opens an AsyncLocalStorage tenant context
  (`lib/tenant.js`); `db/index.js` SETs `app.current_tenant` per checkout and
  RESETs on release; `tx()` uses `SET LOCAL`. No-GUC sessions (migrations,
  seeds, login lookup) pass via the `app_tenant_unset()` hatch.
- **Membership is explicit**: the all-to-all backfill is removed; creators are
  auto-members; `POST/DELETE /api/projects/:id/members` (admin/CEO/PM of that
  project). `project_members` RLS requires both sides in the same tenant.
- **Pilot tenant**: `PILOT` (plan small) provisioned via
  `backend/scripts/provision-tenant.mjs`; HBG (enterprise) is the frozen
  template. Guard: `tests/e2e/cross-tenant-guard.mjs` (30 checks).

### 3.5 pgvector + the superuser lesson (v0.7.0)

- Semantic search needs the `vector` extension (pgvector 0.8.6, built from source against PG16; compose uses `pgvector/pgvector:pg16`).
- `migrate.js` runs `CREATE EXTENSION IF NOT EXISTS vector` first; missing + uninstallable → loud remediation error, never half-boot.
- **Hard lesson, locked in**: `ALTER USER ... SUPERUSER` (done once to install the extension) **silently disabled ALL RLS** — superusers bypass even `FORCE` policies. Caught by `cross-tenant-guard` (3 RLS checks went red). Fix: extension pre-installed into `template1` (inherited by every fresh/scratch DB), app role back to non-superuser, one-time DBA step documented here. Never grant the app role superuser again — Wave 2 replaces it with a dedicated least-privilege role instead.

### 3.6 Least-privilege app role (v0.8.0)

- Pool connects as `pmo_app` by default (`APP_DATABASE_URL` wins, else `APP_DB_USER`/`APP_DB_PASSWORD`, dev default `pmo_app/pmo_app_dev_pwd`). Rollback = `APP_DB_USER=pmo_user`.
- `9999h` creates the role + DML grants on all tables + `USAGE` on sequences + `EXECUTE` on functions + default privileges for future pmo_user-created objects. Needs CREATEROLE once (compose bootstrap has it; local one-time socket grant).
- `init.js` runs on the OWNER pool (`getOwnerDb`: migrations, DDL indexes, setval, seeds) and sets the role password from env each boot. Request traffic never touches the owner pool.
- `tests/e2e/db-role.mjs` fails closed on missing grants, non-pmo_app pool user, superuser/BYPASSRLS, and RLS bypass.

---

## 4. Backend Reference

### 4.1 Composition (`src/index.js`)

Pure composition layer. Mounts 40 route modules + serves SPA in production. Sockets are tracked so `SIGTERM`/`SIGINT` always terminate (lingering keep-alive/half-open connections are destroyed after 2s; 10s force-exit).

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

#### `lib/tenant.js` + `lib/entitlements.js` — tenancy + plans (v0.5.0)
- `tenant.js`: AsyncLocalStorage tenant context (`runWithTenant`), `SET`/`RESET`
  of the `app.current_tenant` RLS GUC per pooled checkout, `SET LOCAL` in `tx()`.
- `entitlements.js`: `PLAN_FEATURES` (small/mid/enterprise over the 4 pillars),
  `getEntitlements(tenantId)`, `requireFeature(flag)` / `requireAnyFeature(...)`
  (plan gates answer **403**, distinct from tenant **404**s).

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

**Helper: `convertSql`**. Detects `?` placeholders and converts to `$1, $2, ...` for `pg`. SQL that mixes `?` and `$N` is rejected before binding, rather than silently binding the wrong argument. `getAsync()` places `LIMIT 1` before a `FOR UPDATE` clause and ignores trailing semicolons.

### 4.3 Database (`src/db/`)

- **`index.js`** — single shared Pool, `prepare()`/`upsert()`, NUMERIC→number parsing, `buildDatabaseUrl()`
- **`migrate.js`** — checksum ledger (`schema_migrations`), drift refusal, adoption
- **`init.js`** — migrate + unique indexes + sequence resync + seeds (tenant, admin, BTE, zones, departments)

### 4.4 Routes (hiện tại theo inventory)

| File | Mount | Endpoints | Purpose |
|------|-------|-----------|---------|
| `auth.js` | `/api/auth` | `POST /login`, `POST /refresh`, `POST /logout`, `POST /logout-all` | JWT login (bcrypt), rotate refresh, logout, logout-all |
| `me.js` | `/api/me` | `GET /`, `GET /permissions`, `GET /entitlements`, `GET /notification-prefs`, `PUT /notification-prefs` | Self-service: whoami (+plan), my permissions, plan flags, notification preferences |
| `projects.js` | `/api/projects` | 17 endpoints | List, close/revoke, members add/remove/list, zones, materials, contracts, payments, daily-reports, issues, construction-schedule, shop-drawings, material-breakdown, submittals (overdue/pending-supervisor), schedule-baselines |
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
| `jobs.js` | `/api/jobs` | `GET /attention`, `POST /overdue-digest`, `GET /overdue-digest/status` | Unified overdue Attention view and idempotent daily digest |
| `approval-chains.js` | `/api/approval-chains` | `GET /`, `POST /`, `DELETE /:id` | Chain config per (dept, resource) — admin/CEO |
| `admin.js` | `/api/admin` | `GET /users`, `PATCH /users/:id` | User list (no hash) + department assign — admin/CEO |
| `sso.js` | `/api/auth/sso` | `POST /start`, `POST /callback`, `POST /mfa/verify-sso`, `GET /discover` | SSO OIDC IdP ngoài (task 10): JSON-only, PKCE, tôn trọng MFA |
| `qa.js` | `/api` | `GET/POST /projects/:id/qa-inspections`, `PATCH /qa-inspections/:id` | QA/QC extension pillar |
| `pillar-scenarios.js` | `/api` | `POST /projects/:id/pillar-scenarios/simulate`, `POST /pillar-scenarios/:id/apply`, `POST /pillar-scenarios/:id/rollback` | CTL-01→06, including priority-scoped CTL-02 and AR-cashflow CTL-04 |
| `export.js` | `/api/export` | `GET /project-report.xlsx`, `GET /project-report.html` | Bilingual workbook and authenticated browser-print report; exports are audited and rate-limited |
| `privacy.js` | `/api/me` | `GET /privacy`, `POST /privacy/consents`, `GET /privacy/export`, `POST /privacy/requests`, `PATCH /privacy/profile`, `GET/DELETE /sso` | PDPL self-service (task 10): consents, export, DSR, unlink SSO |

**Note**: Many routes use `Router({ mergeParams: true })` because they're mounted under `/api/projects/:id/...` and need `req.params.id` to be visible inside the sub-router. **This is the #1 source of "missing param" bugs** — never forget it.

**Fail-closed permissions (v0.5.0)**: `permission-middleware.js` maps every
`/api/*` route to a matrix module; unmatched authenticated requests get **403**
(not silent allow). Plan gates run after it: AR → `ar-read`, chains write →
`chains`, bulk zip → `bulk-import`, audit export → `audit-export`,
portfolio-kpi → `portfolio-read|portfolio`.

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

#### `services/ingest/` (các parser + `failures.js` + `index.js` router)

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
  - `/hq/audit` — Audit log
  - `/hq/otd` — OTD KPI page

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
| `Manpower.jsx` | `/hq/manpower` | Manpower rollup, weekly plan/loading và productivity theo work item |
| `Payment.jsx` | `/hq/payment` | 4-step payment chain UI |
| `OTDPage.jsx` | `/hq/otd` | OTD KPI (on-time / late / by_zone / trend) |
| `NotificationCenter.jsx` | `/hq/notifications` | All notifications with filters (in-app) |
| `ReviewQueue.jsx` | `/hq/uploads` | Staged-file review queue + generic rows viewer |
| `ChainConfig.jsx` | `/hq/approval-chains` | Chain editor + user↔department assignment |
| `DataSecurity.jsx` | `/hq/data-security` | (task 10, admin/CEO) SSO IdP config + encryption status + DSR queue + consent register |
| `Security.jsx` | `/hq/security` | Password + MFA + SSO link + PDPL self-service (task 10: 4 sections, VI/EN) |

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
| `AuditLog.jsx` | `/hq/audit` | Audit log with filters + CSV export |
| `MasterDataList.jsx` | `/hq/master-data` | List vendors/subcontractors/departments/… |
| `MasterDataEdit.jsx` | `/hq/master-data/edit` | Create form |
| `Approval.jsx` | `/hq/approval` | Pending approvals hub (chain-aware shop approve) |
| `ChainConfig.jsx` | `/hq/approval-chains` | Chains + departments + user assignment |

### 5.6 Reusable components (10)

| File | Purpose |
|------|---------|
| `Login.jsx` | Email/password + SSO button + 7 demo chips (VI/EN toggle) |
| `SsoCallback.jsx` | `/sso/callback` | (task 10) IdP code→token exchange, MFA-pending handoff |
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

### 6.2b Password rotation (v0.8.0)

- `POST /api/me/password {old_password, new_password}` (≥10 chars) — clears flag, bumps `token_version`, revokes refresh rows.
- `POST /api/admin/users/:id/reset-password` (admin/CEO) — one-time temp (returned once), sets `must_change_password`, kills sessions, audit-logged.
- Login with flag → `403 PASSWORD_CHANGE_REQUIRED` **with tokens** (so the change call authenticates); `requireAuth` gates everything else until changed. Login screen branches to the change form automatically.

### 6.2c SSO via external IdP (v0.11.0, SRS §6)

Generic OIDC (any IdP with discovery): `POST /api/auth/sso/start {email}` →
`{auth_url}` (PKCE S256, state = signed JWT carrying the verifier, no server
storage) → browser to IdP → frontend `/sso/callback?code&state` → `POST
/api/auth/sso/callback` → code exchange + userinfo email → match by
`(tenant, email)` → link `users.sso_subject` on first success. Unknown email +
`auto_provision` → creates SSO-only user (`password_hash NULL`, least-privilege
`default_role`, admin assigns projects later); otherwise 403. Changed subject →
403 (admin unlinks via `DELETE /api/me/sso`, then retry). MFA-enabled users get
`401 MFA_REQUIRED + sso_pending` → `POST /api/auth/sso/mfa/verify-sso`.
Per-tenant config `PUT /api/admin/sso` (admin/CEO): issuer, client_id,
secret_env (secret lives ONLY in server env, never DB; `ALLOW_SSO_INLINE_SECRET=1`
memory hatch is test-only), enabled, auto_provision, default_role.
`POST /api/admin/sso/test` checks discovery without secrets. Login screen has
an SSO button; `/hq/security` shows link status.

### 6.2d Column encryption + PDPL (v0.11.0, SRS NFR Bảo mật)

- **At rest**: AES-256-GCM (`lib/crypto.js`, zero-dep, `DATA_ENC_KEY` =
  base64-32B or 64-hex). Covered: `users.mfa_secret`, `users.zalo_user_id`,
  `workers.phone`, `vendors.contact` — `enc:v1:` prefix, legacy plaintext
  dual-read, random IV. No key → plaintext + warn (dev only); prod must set
  the key (`GET /api/admin/security-status` reports it). `vendors.tax_id`
  stays plaintext deliberately (pg_trgm ERP matching + byte-stable ledger;
  protected by RBAC/RLS instead). Ciphertext needs wider columns (migration
  `9999x`: phone→128, zalo→256).
- **In transit**: `nosniff` + `same-origin` Referrer-Policy + `DENY` framing
  on every response; HSTS only when `proto=https`. TLS itself terminates at
  the reverse proxy (see DOCKER.md).
- **PDPL** (policy `2026-09-v1`): consents per purpose (`account` required,
  `notify`, `analytics` opt-in; withdrawing `notify` also disables both
  channels) — `GET /api/me/privacy`, `POST /api/me/privacy/consents`;
  access right — `GET /api/me/privacy/export` (never leaks hashes/secrets);
  rectify — `PATCH /api/me/privacy/profile {name}`; erasure — `POST
  /api/me/privacy/requests {type: ERASE}` → admin queue `GET /api/admin/dsr`
  → `POST /api/admin/dsr/:id/resolve {DONE|REJECTED}` (ERASE+DONE =
  irreversible anonymization, sessions killed, cannot erase the last admin;
  audit kept). Self-service UI in `/hq/security`, register + queue in
  `/hq/data-security` (admin/CEO).

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

### 7.5 Schedule compression (v0.6.0, Enterprise `schedule-compress`)

The Procore gap: preview → apply → rollback over an FS/SS/FF link graph.

```
links (schedule_links, auto-chain bootstrap per zone ordinal)
  → CPM forward/backward (lib/cpm.js, pure, day-indexed from TODAY)
  → crash critical path round-robin vs floors (max(min_days_floor, ceil(d·min_pct), elapsed))
  → preview diff (per-item old→new + calendar dates, bottleneck with 🔒 flags)
  → apply (recomputes live, writes plan dates, snapshots before-values + audit)
  → rollback (restores byte-identical dates)
```

- Locked (DONE/progress=1) items are anchors, never shortened; started items keep elapsed days + real start; pending never starts in the past.
- **v0.6.1 additions**: suspension gaps (`policy.suspensions`, Tết-style shutdowns shift successors — Original kept, Delta shown); `site_holidays` auto-merge (global VN + tenant rows, `/api/holidays` CRUD); summary-row detection (`TỔNG`-name or >3× median, explicit `exclude_ids`, pass-through untouched); login rate limiting (10/min/IP, 429 VI message, `LOGIN_FAILED` audit).
- Infeasible answers always name blockers (at-floor criticals, locked tails, late-clamped).
- Learned on BTE: a 297-day locked summary row dominates the span — summary rows should be excluded/split before compressing real work.
- Non-goals v1: working calendar (all days working), resource leveling, cost optimization.

### 7.6 Issues + Directives

- **Issue**: created with `severity` (NORMAL/HIGH/CRITICAL), `owner_user_id`
- **Directive**: CEO/PMO can attach a directive to an issue, which notifies specific users (`notify_to_user_ids[]`)
- **Status flow**: `OPEN → IN_PROGRESS → RESOLVED → CLOSED`

### 7.7 Daily Report (field)
- `POST /api/projects/:id/daily-reports` (header: date, weather_am/pm)
- `POST /api/daily-reports/:id/manpower { role_code, headcount }` (add multiple)
- `POST /api/daily-reports/:id/photos` (multipart, ≤20 files)
- Counters auto-incremented (`work_items_count`, `manpower_count`, etc.)

### 7.8 AI assistant (v0.7.0, Enterprise `ai-assistant`)
Provider-switchable semantic search + SLA watcher, human-in-the-loop throughout.

```
provider routing (ai_provider_configs: purpose × provider/model/key-env/priority)
  → chat/embed adapters (openai|anthropic|google|openrouter, native fetch, AI_MOCK=1 shim)
  → OpenRouter demo order: Nemotron first, `stealth/space-bunny-alpha` second
  → pgvector index (ai_embeddings, HNSW, per-model rows, backfill job)
  → permission-first retrieval (tenant + membership BEFORE top-k)
  → ask (cited Vietnamese answers, no-data honesty) | watcher → ai_drafts → approve
```

- Keys in env only (`OPENAI_API_KEY` etc.); DB stores env var names; missing key → 503 naming it.
- Chat/embed routed independently (Anthropic has no embeddings → 400 at config).
- Every call logged (`ai_calls` + monthly cap, default $20, 429 on breach).
- OpenRouter fallback is opt-in by DB priority; a failed primary is retried, then Space Bunny uses low reasoning effort and a larger completion budget. It never bypasses citations or side-effect guards.
- Mock adapter is semantic-preserving (hashed bag-of-words), so CI ranking tests mean something.
- **Progress proposal (AI-EXT-01):** `POST /api/ai/progress-proposals` nhận câu tiếng Việt hoặc fields có kiểm soát; parser deterministic tạo `needs_input` hoặc `proposed` trong `ai_drafts.payload`, không ghi lịch. `GET` xem proposal theo project; `POST /:id/apply|rollback` là đường duyệt của CEO/Admin, có `Idempotency-Key`, fingerprint, stale `409`, transaction và audit. UI: tab **Cập nhật tiến độ** trong `hq/Assistant.jsx`.
- Non-goals v1: keyword fallback, auto-send, per-ERP agents.

### 7.9 Field offline outbox (v0.8.0)
- `POST /api/sync/enqueue {client_id, resource_type, server_record_id?, resource_json}` — validated against the SAME `SYNC_APPLIERS` allowlist as apply (never wider); idempotent replay by `(user_id, client_id)` (+ partial unique index, race-safe); existence checks deferred to flush.
- Field `outbox.js`: localStorage queue (survives reload), auto-flush on reconnect with backoff, per-item status in `/field/sync` (+ manual retry, clear-dead). `DailyProgress` falls back to it on network failure (progress only — notes stay online-only).
- Flush = existing resolve winners (explicit last-write-wins, audit `SYNC_APPLY`). Boundary: scalars only — no counters, money, or photo blobs.

### 7.10 BIM library + ERP round-trip (v0.9.0, Enterprise `bim-library` / `erp-export`)

- **BIM**: `POST /api/projects/:id/bim/models` (`.ifc` ≤200MB, 2GB/project quota) → content-addressed stage + `IFCBUILDINGSTOREY`/`IFCSPACE`/schema extraction (streaming, capped, `report_json`) → zone link (explicit param, filename guess, or ranked suggestions — never auto-assign). `/hq/bim` library table and lazy `web-ifc` viewer.
- **ERP**: `GET /api/export/ap-ledger.csv` (byte-stable 17 cols, BOM, tenant-scoped); vendor CSV import → pg_trgm suggestions (suggest-only, threshold 0.4) → `confirm` is the only write; `erp_profiles` (secret env name only) + manual `POST /api/jobs/erp-push` (3× retry, `erp_push_log`). No auto-cron, no per-ERP API clients in v1.
- **Incidents fixed on the way**: project-list 403 for non-admin roles (baseUrl+path trailing slash vs exact skip — normalize in middleware; `project-list-roles.mjs` locks it); `/api/erp/*` vs `/api/export/*` mount-prefix mismatch (vendor routes moved to `erp.js`); undici `text()` strips BOM (assert raw bytes).

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
GET    /projects/:id/productivity                    → định mức/actual theo work item
GET    /work-items/:id/productivity                  → các dòng của một hạng mục
POST   /work-items/:id/productivity                  Body: period_start, period_end, role_name_vi, kind,
                                                        planned_output, actual_output,
                                                        planned_headcount, actual_headcount, unit?
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
GET /dashboard/portfolio-kpi                  → cross-project rollup (6 GROUP BY queries + 10s/tenant cache, X-Cache HIT/MISS; ?fresh=1 bypasses)
```

### 8.13b Control summary (NFR task 9)

```http
GET /projects/:id/control-summary             → { schedule, shop, payments, payment_requests, materials, material_breakdown, gates, curves, health, loading }
```

Single round-trip replacing ControlCenter's 10 parallel fetches (same SQL/limits as each endpoint, byte-identical payloads; UI falls back to the 10 lẻ on error).
Perf proof: `node tests/e2e/perf.mjs` (contract: 6 dashboard endpoints <3s with 20 projects), heavy proof 10× data in `/tmp` (not committed), UI runner + roll-up table at `/hq/ops` (`scripts/ui-verify-ops.mjs`).
Indexes: migration `9999v` rank 23 (notably `daily_manpower(daily_report_id)` + `(project_id, status|date)` composites).

### 8.20 SSO (task 10, SRS §6)

```http
POST /auth/sso/start        Body: { email } → 200 { auth_url } | 404 { error }
POST /auth/sso/callback     Body: { code, state } → 200 { token, refresh_token, user } | 401 { error: MFA_REQUIRED, sso_pending } | 403
POST /auth/sso/mfa/verify-sso  Body: { sso_pending, code } → 200 { token, refresh_token, user }
GET  /admin/sso              (admin/CEO) → { config }
PUT  /admin/sso              (admin/CEO) Body: { issuer, client_id, secret_env?, enabled?, auto_provision?, default_role?, client_secret? (hatch only) }
DELETE /admin/sso            (admin/CEO)
POST /admin/sso/test         (admin/CEO) Body: { issuer? } → { ok, endpoints... }
GET  /me/sso                 (auth) → { linked, issuer }
DELETE /me/sso               (auth) → unlink
```

### 8.21 Privacy / PDPL (task 10, SRS NFR Bảo mật)

```http
GET   /me/privacy                    (auth) → { policy_version, purposes[3], requests[] }
POST  /me/privacy/consents           (auth) Body: { purpose: notify|analytics, granted } (account → 422)
GET   /me/privacy/export             (auth) → personal data JSON (no hashes/secrets)
POST  /me/privacy/requests           (auth) Body: { type: ACCESS|RECTIFY|ERASE, detail? } → 201
PATCH /me/privacy/profile            (auth) Body: { name } → self rectify
PUT   /me/locale                     (auth) Body: { locale: vi|en }
GET   /admin/dsr[?status=]           (admin/CEO) → { pending, requests[] }
POST  /admin/dsr/:id/resolve         (admin/CEO) Body: { decision: DONE|REJECTED, note?, apply? }
GET   /admin/security-status         (admin/CEO) → { encryption, tls, sso, pdpl }
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
- Seeds: tenant `hbg`, 8 users, one base demo project, 19 zones for `BTE-WP4-HBC`; pilot data is loaded separately by `scripts/reconcile-pilot-data.mjs`

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

### 13.1 Suites (`tests/e2e/`, current inventory)

| Suite | What it guards |
|-------|----------------|
| `pipeline-guard.mjs` | **Full pipeline on scratch DB**: synth workbooks → upload→configure→commit → pillars/OTD → approve→pay → CLIENT sync → DROP. CI-safe. |
| `cross-tenant-guard.mjs` | **Tenancy proof (v0.5.0)**: mutual 404s, plan entitlements + 403 gates, RLS at DB layer, pool-clean check, members round-trip. Needs PILOT tenant. |
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
- [ ] Set strong `JWT_SECRET` and a 32-byte `DATA_ENC_KEY`
- [ ] Set `APP_DB_USER`/`APP_DB_PASSWORD` to a non-superuser role without `BYPASSRLS` (or `APP_DATABASE_URL`); the request pool must not fall back to the owner URL
- [ ] Set `BACKUP_DATABASE_URL` to a dedicated PostgreSQL role with `BYPASSRLS`; `pg_dump` never receives the password in argv
- [ ] HTTPS via reverse proxy (nginx + Let's Encrypt); set `TRUST_PROXY=1` only when exactly one proxy is in front
- [ ] Set `NODE_ENV=production` and `PRODUCTION_ENFORCE_READINESS=1`
- [ ] Replace demo accounts with real users; every admin/CEO has MFA
- [ ] Automated backups + test restore (`GET /api/admin/production-readiness` must be ready)
- [ ] Monitor: `pm2`/`systemd`, alerts on `/api/health`
- [ ] CORS: set `CORS_ORIGIN` to the explicit origin list. Unset in production means same-origin only; unset in dev keeps the permissive default
- [ ] Verify the daily digest and Attention links in the target SMTP environment

The checklist is available to admin/CEO at `GET /api/admin/production-readiness`. It checks environment secrets, shared demo passwords, MFA coverage for privileged users, and whether the request database role is a superuser or bypasses RLS — without returning secret values. SSO is **out of scope** for this release: there is no `sso_enabled` gate and the public `GET /api/auth/sso/discover` route (an SSRF sink) has been removed. `ALLOW_SSO_INLINE_SECRET` must still be `0`.

Spreadsheet parsing uses the maintained `@e965/xlsx` SheetJS build through the `xlsx` package alias. `lib/optional-dep.js` configures its ESM filesystem binding so staged uploads remain readable and the vulnerable legacy npm release is not used.

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
| 2026-09-15 | Multi-tenant v0.5.0 | Tenant plans (Small/Mid/Enterprise) + entitlements, Postgres RLS + GUC plumbing, explicit membership, default-deny permissions, PILOT tenant, cross-tenant-guard, lean 4-pillar gating (hide-not-delete) | (this commit) |
| 2026-09-15 | Compression v0.6.0 | FS/SS/FF schedule_links + auto-chain, pure CPM engine, Enterprise-gated preview/apply/rollback scenarios, ProgressDetail panel, cpm/links/compress suites | (this commit) |
| 2026-09-15 | Wave 1 quick wins v0.6.1 | Suspension gaps, site_holidays auto-merge, summary-row exclusion, login rate limiting + LOGIN_FAILED audit | (this commit) |
| 2026-09-15 | AI layer v0.7.0 | pgvector (source-built) + template1 provisioning, switchable providers (env keys + DB routing), semantic index + scoped retrieval, assistant panel + SLA watcher drafts, cost caps, ai-assistant suite | (this commit) |
| 2026-09-15 | Wave 2 v0.8.0 | Least-privilege pmo_app + owner pool split, password rotation + login gate, offline enqueue + field outbox, db-role/password-rotation/field-offline suites | (this commit) |
| 2026-09-15 | Wave 3 v0.9.0 | BIM store-only library (IFC metadata, zone linking) + ERP round-trip (AP CSV export, vendor match, SFTP push), bim-intake/erp-roundtrip/project-list-roles suites | (this commit) |
| 2026-09-16 | Remainder v0.10.0 | S3 driver (MinIO-first) + storage seam async, nested departments + bottom-up chains, SSE realtime + Bell hook, FAST client + signed webhooks, three.js BIM viewer (lazy chunk) | (this commit) |
| 2026-09-16 | Bugfix audit P0 v0.10.1 | Material-create 404 → createUsage; async safety net (ah + Router/application patch, /api JSON 404, error handler pre-fallback); SSE 401 pre-writeHead; area-hierarchy route (zones fallback); exposed 2 SPA-HTML false-200s → real material-submittals/manpower routes | `aab4022` |
| 2026-09-16 | Bugfix audit P1 v0.10.2 | CompressPanel scenario list+rollback + link create/delete; HolidaysPanel tab; stale helper deletion; cron overlap guards; SSE 90s reap + Bell overlap guard/onopen reset | `93e538a` |
| 2026-09-16 | Bugfix audit P2 v0.10.3 | optional-dep 503 guards (ssh2/aws-sdk/xlsx); guarded frontend awaits; Toast/UploadWizard/DailyReportForm timer hygiene | `11e09e4` |
| 2026-09-16 | Bugfix audit P3 v0.10.4 | Upload canonical-prefix table; install-script audit (ssh2 optional binding tolerated, pure-JS fallback); orphan sweep — dashboard/portfolio-kpi/kpi-history kept (e2e-covered), business-process/:code wired into MasterDataList | (this commit) |
| 2026-09-23 | Trust layer v0.11.0 | i18n VI/EN (chrome + login + security + bilingual xlsx, users.locale), PDPL consents + DSR + anonymize, AES-256-GCM column encryption + security headers, generic OIDC SSO (PKCE, env-only secret, MFA-aware), /hq/security 4 sections + /hq/data-security admin page, crypto/pdpl/sso/i18n suites + ui-verify-task10 | (uncommitted) |

### 16.1 Known limitations (v0.8.0)

1. **Shared dev password** — demo users still `admin123` until rotated via the new endpoints
2. **No real-time updates** — frontend polls (BellDropdown 30s)
3. **No mobile native apps** — web responsive only
4. **RLS bootstrap hatch** — no-GUC sessions bypass RLS by design (migrations/seeds/login); request traffic always sets the GUC (pool layer does)
5. **No S3 driver** — local FS only (stub fails loud)
6. **Audit log retention** — no auto-prune, grows forever
7. **Flat departments** — no nesting (`parent_id` deferred)
8. **Photos stay online** — offline outbox covers scalar edits only

### 16.2 Remainder notes (v0.10.0)

- **Storage**: seam is async (`withTempFile`/`download`/`stat`/`readBuffer`); parsers take temp paths, downloads redirect (S3) or stream (local). `getFilePath` is local-only legacy. Uploads phải nằm trên volume riêng: `uploads_volume` trong `getProductionReadiness` fail khi `UPLOADS_DIR` không tồn tại hoặc cùng `st_dev` với thư mục cha (tức nằm trong container). `scripts/storage-gc.mjs` báo cáo file không còn dòng nào tham chiếu (dry-run mặc định, `--apply` để xoá, bỏ qua file < 24h, từ chối chạy khi `STORAGE_DRIVER=s3`).
- **Realtime**: `/api/stream` mounts FIRST (bare `/api` routers run header-only requireAuth on every subpath and would 401 the SSE handshake). Handshake dùng **vé một lần** 45s lấy từ `POST /api/stream/ticket` (header-auth), đốt qua `auth_revoked_jti` nên single-use đúng cả khi nhiều instance; `?token=` cũ trả 401. `BellDropdown` tự xin vé mới mỗi lần reconnect vì server cắt stream mỗi 90s. Events: notification.created (all notify paths + TVGS), approval.decided + compression.applied (tenant admins).
- **Monitoring**: `/api/health` chỉ liveness (không chạm DB, có `uptime_s`); `/api/ready` query thật, trả `degraded` khi >2s và 503 khi DB chết — probe không bao giờ được trả `ok` cứng. `lib/retention.js` dọn phiên hết hạn + `ai_calls`; mọi cửa sổ có sàn 1 ngày, `RETENTION_MIN_ROWS=10000` giữ dữ liệu demo, `audit_log` chỉ dọn khi `AUDIT_RETENTION_DAYS>0`. Cron 00:xx; `GET|POST /api/jobs/retention[/run]` (admin/CEO).
- **RLS hatch**: policy phải dùng `app_tenant_unset() OR tenant_id = app_current_tenant()`. Dạng thô `current_setting('app.current_tenant', true) = ''` trả NULL (không phải TRUE) khi GUC chưa từng SET — đúng case của job nền — nên chặn im lặng. Job nền phải tự sở hữu tenant context, không trông chờ callsite.
- **BIM viewer**: `SetWasmPath` appends bare names — must pass a custom `locateFile` returning the hashed `?url` asset. `FlatMesh.geometries` is an Emscripten Vector (size/get), not iterable.
- **Migrations**: SQL files reject `//` comments at runner level (3 strikes in v0.9.0); connector columns documented per rank above.
- **Bugfix audit P0–P3 (v0.10.1–v0.10.4)**: Express 4 async safety net lives in `lib/async-handler.js`: prototype patch (future registrations) + retroactive `wrapAllRouters` (existing stacks — must recurse into `layer.route.stack`, wrapping the Route dispatcher alone does NOT catch handler rejections; proven live: forced PG 22P02 in a bare handler → JSON 500, process alive). `/api` unknown paths are JSON 404 (the old SPA `*` fallback returned HTML 200 for missing API routes, which made 2 e2e assertions false-pass). Upload canonical prefixes: writes `/api/upload`, reads `/api/uploads` (mount-site table in `index.js`). Install scripts: only ssh2 has one (`install.js` builds an OPTIONAL crypto binding, failure tolerated → pure-JS fallback active); aws-sdk/xlsx pure JS; own packages have no install hooks.

### 16.3 Roadmap (current)

Shipped out of order vs the original sketch — this is the honest remainder:
- Real MinIO run (compose service exists; checklist untested against live MinIO)
- Multi-tenant admin UI (provisioning is script-only)
- ERP auto-cron + per-customer FAST path tuning
- Viewer measurements / storey isolation (spatial query)
- S3 migration for the existing 560MB local disk
- Audit retention policy (table still small)

---

## License

Proprietary — internal use only. © 2026 HBG Construction.

## Contact

Engineering: Tùng Linh — tunglinh@hbg.com
