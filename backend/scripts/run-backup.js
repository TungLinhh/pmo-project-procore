#!/usr/bin/env node
import { runBackup } from '../src/lib/backup.js';

try {
  const result = await runBackup();
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: String(error.message || error) })}\n`);
  process.exitCode = error.status === 503 ? 2 : 1;
}
