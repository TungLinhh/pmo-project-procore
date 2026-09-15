// Init SQLite schema from schema.sql (idempotent)
import { getDb } from '../src/db/index.js';
import fs from 'node:fs';
import path from 'node:path';

const schemaPath = path.resolve('scripts/schema.sql');
if (fs.existsSync(schemaPath)) {
  const db = getDb();
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);
  console.log('✓ Schema applied');
} else {
  console.log('No schema.sql found - skipping');
}
