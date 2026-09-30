#!/usr/bin/env node
// Run the SRS-focused code gate against one disposable local server.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = process.env.SRS_GATE_PORT || '3137';
const base = `http://127.0.0.1:${port}`;
const db = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const env = { ...process.env, DATABASE_URL: db, PORT: port, LOGIN_RATE_MAX: '1000' };
const server = spawn('node', ['backend/src/index.js'], { cwd: root, env, stdio: 'ignore' });
const run = (script, extraEnv = {}) => new Promise((resolve, reject) => {
  const child = spawn('node', [`tests/e2e/${script}`], {
    cwd: root,
    env: { ...env, ...extraEnv },
    stdio: 'inherit',
  });
  child.on('error', reject);
  child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${script} exited ${code ?? signal}`)));
});
const waitForServer = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('SRS gate server did not become healthy');
};

try {
  await waitForServer();
  const external = [
    ['file-access.mjs', { BASE_URL: base }],
    ['payment-sla.mjs', { BASE_URL: base }],
    ['pillar-sim.mjs', { BASE_URL: base }],
  ];
  for (const [script, extra] of external) await run(script, extra);
  const selfHosted = [
    'p1-ceo-roles.mjs',
    'p2-authz-matrix.mjs',
    'p2-tenant-access.mjs',
    'project-list-roles.mjs',
    'dashboard-scope.mjs',
    'work-items-materials.mjs',
    'p4-storage.mjs',
    'p4-docker.mjs',
    'production-readiness.mjs',
    'schema.mjs',
  ];
  for (const script of selfHosted) await run(script);
  console.log('\nSRS CODE GATE: ALL PASS');
} finally {
  server.kill('SIGTERM');
}
