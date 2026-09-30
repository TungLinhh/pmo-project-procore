// Production-readiness is an explicit, rerunnable check. It never changes
// configuration; admins use the result to block a release until fail items are
// resolved.
import bcrypt from 'bcryptjs';
import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../db/index.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DEFAULT_UPLOADS_DIR = join(appRoot, 'uploads');

// Uploads have to live on their own filesystem (a Docker volume / bind mount),
// not in the container's writable layer. The path being spelled inside the app
// tree is NOT the problem — production compose mounts a volume at
// /app/backend/uploads on purpose — so the test is whether the directory is a
// mount point of its own. A same-filesystem directory means every upload, and
// every byte e2e runs and demos leave behind, rides in the image and in any
// snapshot taken of it.
function uploadFacts(env = process.env) {
  const dir = env.UPLOADS_DIR || DEFAULT_UPLOADS_DIR;
  try {
    return { exists: true, dev: statSync(dir).dev, parentDev: statSync(dirname(dir)).dev };
  } catch {
    return { exists: false };
  }
}

// Pure so the policy can be asserted without a container: returns null when
// the setup is fine, or a human-readable reason when it is not.
export function uploadsDirProblem(env, facts) {
  if (env.STORAGE_DRIVER === 's3') return null;   // no local directory at all
  const dir = env.UPLOADS_DIR || DEFAULT_UPLOADS_DIR;
  if (!facts?.exists) return `${dir}: chưa tồn tại, không xác minh được — cần volume riêng`;
  if (facts.dev !== facts.parentDev) return null;
  return `${dir}: cùng filesystem với cây ứng dụng — upload sẽ nằm trong container, mất khi thay image`;
}

const validDataKey = (value) => {
  const raw = String(value || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return true;
  try { return Buffer.from(raw, 'base64').length === 32; } catch { return false; }
};

const weakSecret = (value) => !value || value.length < 32 || /change[_-]?me|dev-only|secret/i.test(value);

export function evaluateProductionEnv(env = process.env, facts) {
  const checks = [];
  const add = (id, label, ok, detail, level = 'fail') => checks.push({ id, label, ok, level, detail });
  add('node_env', 'NODE_ENV=production', env.NODE_ENV === 'production', env.NODE_ENV || '(unset)');
  add('jwt_secret', 'JWT_SECRET riêng, ≥32 ký tự', !weakSecret(env.JWT_SECRET), env.JWT_SECRET ? 'configured' : 'missing');
  const dataKeyReady = validDataKey(env.DATA_ENC_KEY);
  add('data_key', 'DATA_ENC_KEY hợp lệ', dataKeyReady, dataKeyReady ? 'configured' : 'missing or invalid');
  add('dev_password', 'Không bật ALLOW_DEV_PASSWORD', env.ALLOW_DEV_PASSWORD !== '1', env.ALLOW_DEV_PASSWORD === '1' ? 'enabled' : 'disabled');
  add('sso_inline', 'Không bật secret SSO inline', env.ALLOW_SSO_INLINE_SECRET !== '1', env.ALLOW_SSO_INLINE_SECRET === '1' ? 'enabled' : 'disabled');
  // Least privilege follows the same precedence as buildAppDatabaseUrl():
  // APP_DATABASE_URL wins, else APP_DB_USER, else the owner URL (which means
  // request traffic runs as the owner/superuser and the gate must fail).
  const appUrlSet = !!env.APP_DATABASE_URL;
  const appUser = appUrlSet ? '(APP_DATABASE_URL)' : (env.APP_DB_USER || '');
  const appPassword = appUrlSet ? '(APP_DATABASE_URL)' : (env.APP_DB_PASSWORD || '');
  const appRoleOk = !!appUser && appUser !== env.DB_USER && appUser !== 'pmo_user' && appUser !== 'postgres';
  add('app_db_user', 'Request DB dùng role riêng, không phải owner', appRoleOk, appUser || 'missing (request pool falls back to owner)');
  add('app_db_password', 'APP_DB_PASSWORD riêng, ≥32 ký tự', appUrlSet ? true : !weakSecret(appPassword), appPassword ? 'configured' : 'missing');
  add('backup_url', 'BACKUP_DATABASE_URL riêng', !!env.BACKUP_DATABASE_URL, env.BACKUP_DATABASE_URL ? 'configured' : 'missing; FORCE RLS blocks owner pg_dump');
  // facts is injectable so the policy can be asserted without a real volume.
  const uploadsProblem = uploadsDirProblem(env, facts || uploadFacts(env));
  add('uploads_volume', 'UPLOADS_DIR nằm trên volume riêng', uploadsProblem === null, uploadsProblem || 'configured');
  return checks;
}

const PRIVILEGED_ROLES = new Set(['admin', 'ceo']);

export async function getProductionReadiness(tenantId) {
  const db = getDb();
  const envChecks = evaluateProductionEnv();
  const [users, current] = await Promise.all([
    db.prepare(
      `SELECT id, role, is_ceo, password_hash, mfa_enabled
       FROM users WHERE tenant_id = ? ORDER BY id`
    ).allAsync(tenantId),
    db.prepare('SELECT current_user AS name').getAsync(),
  ]);
  // Scan every user (no silent LIMIT truncation) in chunks so a large tenant
  // cannot report green after checking only the lowest ids.
  const devPasswordUsers = (await Promise.all(users.map(async (user) => {
    if (!user.password_hash) return false;
    try { return await bcrypt.compare('admin123', user.password_hash); } catch { return false; }
  }))).filter(Boolean).length;
  const privileged = users.filter((user) => user.is_ceo || PRIVILEGED_ROLES.has(String(user.role || '').toLowerCase()));
  const privilegedWithoutMfa = privileged.filter((user) => !user.mfa_enabled).length;
  const otherWithoutMfa = users.filter((user) => !user.mfa_enabled && !privileged.includes(user)).length;
  const appUser = current?.name || 'unknown';
  // Real check: role must not be superuser and must not bypass RLS. A name
  // blacklist alone passed any other privileged role.
  const appRole = await db.prepare('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ?').getAsync(appUser);
  const appIsPrivileged = !!(appRole?.rolsuper || appRole?.rolbypassrls);
  const checks = [
    ...envChecks,
    { id: 'shared_password_users', label: 'Không còn user dùng admin123', ok: devPasswordUsers === 0, level: 'fail', detail: `${devPasswordUsers}/${users.length} user` },
    { id: 'strong_auth', label: 'Mọi user admin/CEO có MFA', ok: privilegedWithoutMfa === 0, level: 'fail', detail: `${privilegedWithoutMfa}/${privileged.length} user thiếu` },
    { id: 'mfa_others', label: 'User vận hành nên bật MFA', ok: otherWithoutMfa === 0, level: 'warn', detail: `${otherWithoutMfa}/${users.length - privileged.length} user thiếu` },
    {
      id: 'least_privilege',
      label: 'Request DB chạy bằng role riêng',
      ok: !!appRole && !appIsPrivileged,
      level: 'fail',
      detail: appRole
        ? `current_user=${appUser}${appIsPrivileged ? (appRole.rolsuper ? ' (SUPERUSER)' : ' (BYPASSRLS)') : ''}`
        : `current_user=${appUser} (không tìm thấy trong pg_roles)`,
    },
  ];
  const failed = checks.filter((check) => !check.ok && check.level === 'fail');
  const warnings = checks.filter((check) => !check.ok && check.level !== 'fail');
  return {
    ready: failed.length === 0,
    checked_at: new Date().toISOString(),
    summary: { passed: checks.length - failed.length - warnings.length, failed: failed.length, warnings: warnings.length },
    checks,
  };
}
