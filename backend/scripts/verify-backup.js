#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

const file = process.argv[2];
if (!file) {
  process.stderr.write('Usage: node backend/scripts/verify-backup.js <archive.dump>\n');
  process.exit(64);
}

const bin = process.env.PGRESTORE_BIN || 'pg_restore';
const archive = resolve(file);
execFile(bin, ['--list', archive], { timeout: 5 * 60_000, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
  if (error) {
    process.stderr.write(stderr || `${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const entries = stdout.split('\n').filter((line) => line && !line.startsWith(';')).length;
  process.stdout.write(`${JSON.stringify({ ok: true, archive, entries })}\n`);
});
