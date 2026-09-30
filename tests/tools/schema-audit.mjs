// Schema-aware query audit. It is intentionally conservative: dynamic SQL,
// aliases, CTEs, SQL functions and literals are excluded from column checks.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { psqlQuery } from './env.mjs';

const tables = psqlQuery("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'").split('\n').filter(Boolean);
const schema = {};
for (const table of tables) {
  const columns = psqlQuery(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}'`).split('\n').filter(Boolean);
  schema[table] = new Set(columns);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend', 'src');
const files = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) walk(file);
    else if (name.endsWith('.js')) files.push(file);
  }
}
walk(root);

const KEYWORDS = new Set([
  'all', 'and', 'any', 'as', 'asc', 'begin', 'between', 'both', 'by', 'case', 'cast', 'check',
  'coalesce', 'collate', 'column', 'commit', 'constraint', 'create', 'cross', 'current_date',
  'current_time', 'current_timestamp', 'default', 'delete', 'desc', 'distinct', 'do', 'else',
  'end', 'except', 'exists', 'false', 'fetch', 'for', 'foreign', 'from', 'full', 'group', 'having',
  'if', 'ilike', 'in', 'index', 'inner', 'insert', 'intersect', 'into', 'is', 'join', 'key', 'left',
  'like', 'limit', 'not', 'null', 'offset', 'on', 'only', 'or', 'order', 'outer', 'over', 'partition',
  'primary', 'references', 'returning', 'right', 'rollback', 'select', 'set', 'some', 'table', 'then',
  'to', 'transaction', 'true', 'union', 'unique', 'update', 'using', 'values', 'when', 'where', 'with',
  'conflict', 'nothing', 'nulls', 'last', 'interval', 'text', 'int', 'workflow_status', 'cols', 'map', 'upload_ids', '__limit__',
]);
const FUNCTIONS = new Set([
  'avg', 'coalesce', 'count', 'current_date', 'date_trunc', 'greatest', 'jsonb_build_object',
  'least', 'lower', 'max', 'min', 'now', 'nullif', 'round', 'similarity', 'sum', 'unnest', 'upper',
]);
const IDENTIFIER = /\b([a-z_][a-z0-9_]*)\b/gi;
const issues = [];

function addIssue(file, line, sql, bad, available) {
  issues.push({ file: file.replace(root, ''), line: line + 1, sql: sql.slice(0, 180), bad, available });
}

for (const file of files.filter((name) => name.includes('/routes/') || name.includes('/lib/'))) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  for (let line = 0; line < lines.length; line++) {
    const matches = lines[line].match(/`(?:[^`\\]|\\.)*`|'[^']*'|"[^"]*"/g) || [];
    for (const match of matches) {
      let sql = match.slice(1, -1);
      if (!/\b(?:FROM|UPDATE|INSERT|SELECT)\b/i.test(sql)) continue;

      // Remove JS interpolations and SQL literals before collecting identifiers.
      sql = sql.replace(/\$\{[^}]*\}/g, ' ');
      sql = sql.replace(/\$\d+/g, ' ');
      sql = sql.replace(/'(?:''|[^'])*'/g, ' ');
      sql = sql.replace(/--[^\n]*/g, ' ');

      const tablesInQuery = new Set();
      const aliases = new Map();
      const tableRefs = /\b(FROM|JOIN|UPDATE|INTO)\s+([a-z_][a-z0-9_]*)(?:\s+(?:AS\s+)?([a-z_][a-z0-9_]*))?/gi;
      for (const match of sql.matchAll(tableRefs)) {
        const table = match[2].toLowerCase();
        if (schema[table]) tablesInQuery.add(table);
        const alias = match[3]?.toLowerCase();
        if (alias && !['set', 'where', 'on', 'values', 'select', 'from', 'join'].includes(alias)) {
          aliases.set(alias, table);
          if (schema[table]) tablesInQuery.add(table);
        }
      }
      if (!tablesInQuery.size) continue;
      if (/^\s*[a-z_][a-z0-9_]*\s+(?:IN|=|LIKE|ILIKE)\s*\(\s*SELECT\b/i.test(sql)) continue;

      const cteNames = new Set([...sql.matchAll(/\bWITH\s+([a-z_][a-z0-9_]*)\s+AS/gi)].map((match) => match[1].toLowerCase()));
      const declaredAliases = new Set([...sql.matchAll(/\bAS\s+([a-z_][a-z0-9_]*)/gi)].map((match) => match[1].toLowerCase()));
      const allColumns = new Set();
      for (const table of tablesInQuery) for (const column of schema[table]) allColumns.add(column);

      const words = new Set();
      let token;
      IDENTIFIER.lastIndex = 0;
      while ((token = IDENTIFIER.exec(sql)) !== null) {
        const word = token[1].toLowerCase();
        if (word.length <= 2 || KEYWORDS.has(word) || FUNCTIONS.has(word)) continue;
        if (tablesInQuery.has(word) || cteNames.has(word) || declaredAliases.has(word) || aliases.has(word)) continue;
        // Dynamic template fragments such as bql_l${level}_response are not
        // statically knowable and must not be reported as missing columns.
        if (/^bql_l_/.test(word) || word === 'bql_l' || /^_(?:response|date|comment)$/.test(word)) continue;
        if (allColumns.has(word)) continue;
        words.add(word);
      }

      // Validate qualified references against their actual table/alias.
      for (const match of sql.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi)) {
        const qualifier = match[1].toLowerCase();
        const column = match[2].toLowerCase();
        const table = aliases.get(qualifier) || (tablesInQuery.has(qualifier) ? qualifier : null);
        if (table && !schema[table].has(column)) {
          addIssue(file, line, sql, `${table}.${column}`, [...schema[table]]);
        }
      }

      // For unqualified references, one shared column name may belong to any
      // joined table. Only report it when no referenced table has that column.
      for (const word of words) {
        if (allColumns.has(word)) continue;
        for (const table of tablesInQuery) addIssue(file, line, sql, `${table}.${word}`, [...schema[table]]);
      }
    }
  }
}

const seen = new Set();
const unique = issues.filter((issue) => {
  const key = `${issue.file}|${issue.bad}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log(`\n=== ${unique.length} UNIQUE ISSUES in routes/lib ===`);
for (const issue of unique) {
  console.log(`\n${issue.file}:${issue.line}`);
  console.log(`  SQL: ${issue.sql}`);
  console.log(`  ❌ ${issue.bad}`);
  console.log(`  Available: ${issue.available.join(', ')}`);
}

if (unique.length) process.exitCode = 1;
