import { evaluateProductionEnv, uploadsDirProblem } from '../../backend/src/lib/production-readiness.js';

const good = {
  NODE_ENV: 'production',
  JWT_SECRET: '9f0c2d7a4b1e6835aa72c914f0d63b8274e15ca9d8f230416b5e897c3d1a4f602',
  DATA_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
  ALLOW_DEV_PASSWORD: '0',
  ALLOW_SSO_INLINE_SECRET: '0',
  BACKUP_DATABASE_URL: 'postgresql://backup:secret@db:5432/pmo',
  APP_DB_USER: 'pmo_app',
  APP_DB_PASSWORD: '4b9f21d7a0c6e38f52a1b7c9d0e3f6a8c5b2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f',
  UPLOADS_DIR: '/data/uploads',
};
// A synthetic env cannot own a real mount, so the volume fact is injected: dev
// 42 vs parent 7 means "own filesystem", which is what production must have.
const asVolume = { exists: true, dev: 42, parentDev: 7 };
const pass = evaluateProductionEnv(good, asVolume);
const fail = evaluateProductionEnv({ ...good, JWT_SECRET: 'change_me', DATA_ENC_KEY: '', ALLOW_DEV_PASSWORD: '1' }, asVolume);
const passed = pass.length === 9 && pass.every((check) => check.ok);
const failed = fail.filter((check) => !check.ok).map((check) => check.id);
const find = (checks, id) => checks.find((check) => check.id === id);

console.log(`${passed ? 'PASS' : 'FAIL'} — complete production environment passes all env checks`);
console.log(`${['jwt_secret', 'data_key', 'dev_password'].every((id) => failed.includes(id)) ? 'PASS' : 'FAIL'} — weak/missing secrets and dev password hatch fail`);

// SSO is out of scope for this release: it must not appear as a hard gate.
console.log(`${!pass.some((check) => check.id.startsWith('sso_enabled')) ? 'PASS' : 'FAIL'} — no SSO readiness gate (SSO out of scope)`);

// Least privilege: request pool must not silently fall back to the owner URL.
const ownerFallback = evaluateProductionEnv({ ...good, APP_DB_USER: '', DATABASE_URL: 'postgresql://pmo_user:pw@db/pmo' }, asVolume);
console.log(`${find(ownerFallback, 'app_db_user')?.ok === false ? 'PASS' : 'FAIL'} — owner URL fallback without APP_DB_* fails app_db_user`);
const ownerNamed = evaluateProductionEnv({ ...good, APP_DB_USER: 'pmo_user' }, asVolume);
console.log(`${find(ownerNamed, 'app_db_user')?.ok === false ? 'PASS' : 'FAIL'} — APP_DB_USER=pmo_user (owner) fails app_db_user`);
const appUrl = evaluateProductionEnv({ ...good, APP_DATABASE_URL: 'postgresql://pmo_app:pw@db/pmo' }, asVolume);
console.log(`${find(appUrl, 'app_db_user')?.ok === true ? 'PASS' : 'FAIL'} — APP_DATABASE_URL is an explicit least-privilege declaration`);
const weakAppPwd = evaluateProductionEnv({ ...good, APP_DB_PASSWORD: 'pmo_app_dev_pwd' }, asVolume);
console.log(`${find(weakAppPwd, 'app_db_password')?.ok === false ? 'PASS' : 'FAIL'} — dev APP_DB_PASSWORD fails`);

// Uploads must live on their own filesystem. Production compose mounts a volume
// at /app/backend/uploads on purpose, so a path spelled inside the app tree is
// NOT the signal — being a mount point is. Pure function, synthetic facts.
const volume = { exists: true, dev: 42, parentDev: 7 };
const sameFs = { exists: true, dev: 7, parentDev: 7 };
const missing = { exists: false };
const isOk = (env, facts) => uploadsDirProblem(env, facts) === null;
console.log(`${isOk(good, volume) ? 'PASS' : 'FAIL'} — UPLOADS_DIR là mount point riêng thì đạt`);
console.log(`${isOk(good, sameFs) ? 'FAIL' : 'PASS'} — UPLOADS_DIR cùng filesystem với app thì fail`);
console.log(`${isOk(good, missing) ? 'FAIL' : 'PASS'} — UPLOADS_DIR không tồn tại thì fail (không đoán bừa)`);
console.log(`${isOk({ ...good, STORAGE_DRIVER: 's3', UPLOADS_DIR: undefined }, sameFs) ? 'PASS' : 'FAIL'} — STORAGE_DRIVER=s3 không áp dụng check thư mục`);
console.log(`${uploadsDirProblem(good, sameFs).includes('container') ? 'PASS' : 'FAIL'} — lý do fail nói rõ hậu quả (mất khi thay image)`);

const results = [
  passed,
  ['jwt_secret', 'data_key', 'dev_password'].every((id) => failed.includes(id)),
  !pass.some((c) => c.id.startsWith('sso_enabled')),
  find(ownerFallback, 'app_db_user')?.ok === false,
  find(ownerNamed, 'app_db_user')?.ok === false,
  find(appUrl, 'app_db_user')?.ok === true,
  find(weakAppPwd, 'app_db_password')?.ok === false,
  find(evaluateProductionEnv(good), 'uploads_volume')?.id === 'uploads_volume',
  isOk(good, volume),
  !isOk(good, sameFs),
  !isOk(good, missing),
  isOk({ ...good, STORAGE_DRIVER: 's3', UPLOADS_DIR: undefined }, sameFs),
  uploadsDirProblem(good, sameFs).includes('container'),
];
process.exit(results.every(Boolean) ? 0 : 1);
