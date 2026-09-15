// Shared test env: CI runners and dev machines differ — never hardcode hosts,
// ports, passwords, or store-specific psql paths here. Override via env:
//   PGHOST (default 127.0.0.1), PGPORT (default 5433), PGUSER (default pmo_user),
//   PGPASSWORD (default pmo_dev_pwd), PGDATABASE (default pmo),
//   BASE_URL (default http://localhost:3000), PSQL_BIN (default `psql` from PATH).
import { execSync } from 'node:child_process';

export const PG = {
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || '5433',
  user: process.env.PGUSER || 'pmo_user',
  password: process.env.PGPASSWORD || 'pmo_dev_pwd',
  database: process.env.PGDATABASE || 'pmo',
};
const PSQL_BIN = process.env.PSQL_BIN || 'psql';

export function psqlQuery(sql, { tuplesOnly = true } = {}) {
  const t = tuplesOnly ? '-tA' : '';
  return execSync(
    `${PSQL_BIN} -h ${PG.host} -p ${PG.port} -U ${PG.user} -d ${PG.database} ${t} -c "${sql.replace(/"/g, '\\"')}"`,
    { env: { ...process.env, PGPASSWORD: PG.password }, encoding: 'utf8' },
  ).trim();
}

export function apiBase() {
  return (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}
