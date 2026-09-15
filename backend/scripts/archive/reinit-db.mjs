// Run schema.sql against existing DB
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
const db = new Database('/home/vutun/pmo_project/backend/data/pmo.db');
const sql = readFileSync('/home/vutun/pmo_project/backend/src/db/schema.sql', 'utf8');
// SQLite execute: split on semicolon carefully
db.exec(sql);
console.log('Schema applied');
['issues', 'notifications', 'audit_log', 'directives'].forEach(t => {
  console.log(`  ${t}: ${db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c}`);
});
