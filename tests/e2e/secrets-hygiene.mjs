// Secret hygiene (G1). A live-looking OPENROUTER_API_KEY once sat in
// backend/.env, which .dockerignore did not exclude (bare patterns are matched
// against the build-context root), so `COPY backend/ ./backend/` baked it into
// an image layer and db/index.js auto-loaded it as a fallback connection.
//
// This suite asserts the guards, never the secret value.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { ok, summary } from './lib.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (rel) => readFileSync(`${ROOT}${rel}`, 'utf8');

const SECRET_PREFIXES = ['sk-or-v1-', 'sk-proj-', 'sk-ant-', 'AIza', 'ghp_', 'xoxb-', 'eyJhbGciOi'];
const TEXT_EXT = /\.(js|mjs|ts|tsx|jsx|json|md|sql|yml|yaml|sh|example|env|txt|css|html)$/i;

try {
  // 1. Nothing tracked by git looks like a secret.
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => f && f !== 'Procore_PMO SRS.docx');
  const offenders = [];
  for (const file of tracked) {
    if (!TEXT_EXT.test(file)) continue;
    let text;
    try { text = readFileSync(`${ROOT}/${file}`, 'utf8'); } catch { continue; }
    for (const prefix of SECRET_PREFIXES) {
      if (text.includes(prefix)) { offenders.push(`${file} (${prefix}…)`); break; }
    }
  }
  ok(offenders.length === 0, `no tracked file contains a credential prefix${offenders.length ? ` — ${offenders.join(', ')}` : ''}`);

  // 2. .env files are ignored by git at any depth.
  const gitignore = read('/.gitignore');
  ok(/(^|\n)\.env\s*($|\n)/.test(gitignore), '.gitignore ignores .env');
  const ignored = execSync('git check-ignore -q backend/.env; echo $?', { cwd: ROOT, encoding: 'utf8' }).trim();
  ok(ignored === '0', 'git ignores backend/.env (nested env files are covered)');

  // 3. .dockerignore blocks nested env files and key material.
  const dockerignore = read('/.dockerignore');
  ok(/(^|\n)\*\*\/\.env\s*($|\n)/.test(dockerignore), '.dockerignore blocks **/.env');
  ok(dockerignore.includes('backend/.env'), '.dockerignore names backend/.env explicitly');
  for (const pattern of ['*.pem', '*.key', '*.p12']) {
    ok(new RegExp(`\\*\\*${pattern.replace('.', '\\.')}`).test(dockerignore) || dockerignore.includes(pattern),
      `.dockerignore covers ${pattern}`);
  }

  // 4. Production never auto-loads a local env file.
  const dbIndex = read('/backend/src/db/index.js');
  ok(/NODE_ENV !== 'production'[\s\S]{0,120}dotenv\.config/.test(dbIndex),
    'db/index.js skips dotenv auto-load in production');
  ok(/NODE_ENV === 'production' && !hasDatabaseEnv/.test(dbIndex),
    'db/index.js refuses to guess a database connection in production');

  // 5. Provider secrets are referenced by env NAME only, never by value.
  const aiRoutes = read('/backend/src/routes/ai.js');
  const aiProviders = read('/backend/src/lib/ai/providers.js');
  const aiSurface = aiRoutes + aiProviders;
  ok(/secret_env|API_KEY/.test(aiSurface) && !SECRET_PREFIXES.some((p) => aiSurface.includes(p)),
    'AI provider config references an env name, not a secret value');

  // 6. Readiness output exposes no secret values.
  const readiness = read('/backend/src/lib/production-readiness.js');
  const leaksValue = ['JWT_SECRET', 'DATA_ENC_KEY', 'APP_DB_PASSWORD', 'BACKUP_DATABASE_URL']
    .filter((key) => new RegExp(`\\$\\{env\\.${key}\\}|env\\.${key}\\b[^\\n]*\\btemplate`).test(readiness));
  ok(leaksValue.length === 0, `readiness reports state, not secret values${leaksValue.length ? ` (${leaksValue.join(', ')})` : ''}`);

  // 7. Nothing in the repo root or backend dir is accidentally committed as env.
  const stray = [];
  for (const dir of ['', 'backend', 'frontend']) {
    const abs = `${ROOT}/${dir}`;
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (/^\.env(\.|$)/.test(name) && !name.endsWith('.example')) {
        const isTracked = execSync(`git ls-files --error-unmatch ${dir ? `${dir}/` : ''}${name} 2>/dev/null; echo $?`, { cwd: ROOT, encoding: 'utf8' }).trim() === '0';
        if (isTracked) stray.push(`${dir}/${name}`);
      }
    }
  }
  ok(stray.length === 0, `no .env file is tracked by git${stray.length ? ` — ${stray.join(', ')}` : ''}`);
} catch (e) {
  ok(false, e.message);
} finally {
  summary();
}
