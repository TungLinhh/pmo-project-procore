// Schema-aware query audit v3 - only routes/ + show context (env-driven DB + repo root)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { psqlQuery } from './env.mjs';

const tables = psqlQuery("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'").split('\n').filter(Boolean);
const schema = {};
for (const t of tables) {
  const cols = psqlQuery(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}'`).split('\n').filter(Boolean);
  schema[t] = new Set(cols);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend', 'src');
const files = [];
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.js')) files.push(p);
  }
}
walk(root);
const SKIP = new Set(['id','code','name','email','role','status','type','key','value','label','url','body','date','note','title','data','result','e','c','each','ids','query','index','total','count','max','min','avg','sum','as','by','or','and','in','on','is','to','if','for','do','now','set','as','of','or','an','be','we','it','at','he','us','no','so','if','or','in','to','is','it','as','at','on','or','to','of','in','it','is','an','as','or','if','so','we','no','at','by','he','us']);

const COL_REGEX = /\b([a-z_][a-z0-9_]*)\b/g;
const issues = [];
for (const f of files.filter(f => f.includes('/routes/') || f.includes('/lib/'))) {
  const c = fs.readFileSync(f, 'utf8');
  if (f.includes('drizzle/') || f.includes('migrations/')) continue;
  const lines = c.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Find SQL strings in line
    const sqlMatches = line.match(/`(?:[^`\\]|\\.)*`|'[^']*'|"[^"]*"/g) || [];
    for (const sqlStr of sqlMatches) {
      const sql = sqlStr.slice(1, -1);
      if (!/\b(FROM|UPDATE|INSERT|SELECT)\b/i.test(sql)) continue;
      const cleanSql = sql.replace(/\$\{[^}]+\}/g, '');
      const tbls = [];
      const fromMatch = cleanSql.match(/\bFROM\s+([a-z_][a-z0-9_]*)/i);
      const updateMatch = cleanSql.match(/\bUPDATE\s+([a-z_][a-z0-9_]*)/i);
      const insertMatch = cleanSql.match(/\bINTO\s+([a-z_][a-z0-9_]*)/i);
      for (const j of [...(cleanSql.matchAll(/\bJOIN\s+([a-z_][a-z0-9_]*)/gi))]) tbls.push(j[1]);
      if (fromMatch) tbls.push(fromMatch[1]);
      if (updateMatch) tbls.push(updateMatch[1]);
      if (insertMatch) tbls.push(insertMatch[1]);
      if (!tbls.length) continue;
      const words = new Set();
      let m;
      COL_REGEX.lastIndex = 0;
      while ((m = COL_REGEX.exec(cleanSql)) !== null) {
        if (m[1].length > 2 && !SKIP.has(m[1])) words.add(m[1]);
      }
      for (const tbl of tbls) {
        if (!schema[tbl]) continue;
        for (const col of words) {
          if (col === tbl) continue;
          if (!schema[tbl].has(col)) {
            issues.push({ file: f.replace(root, ''), line: i+1, sql: cleanSql.slice(0, 150), bad: `${tbl}.${col}`, available: [...schema[tbl]] });
          }
        }
      }
    }
  }
}

const seen = new Set();
const unique = issues.filter(i => {
  const k = `${i.file}|${i.bad}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

console.log(`\n=== ${unique.length} UNIQUE ISSUES in routes/lib ===`);
for (const i of unique) {
  console.log(`\n${i.file}:${i.line}`);
  console.log(`  SQL: ${i.sql}`);
  console.log(`  ❌ ${i.bad}`);
  console.log(`  Available: ${i.available.join(', ')}`);
}

const fs2 = [];
function walk2(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk2(p);
    else if (f.endsWith('.js')) fs2.push(p);
  }
}
walk2(root);
