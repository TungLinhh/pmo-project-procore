#!/usr/bin/env node
// Wrap literal table headers in th('...').
//
// Business data keeps the language it was entered in; only the header text
// follows the VI/EN toggle. Headers that already contain a JSX expression
// ({k}, {c.k}, …) are skipped — those are generated columns whose label comes
// from the data. Re-running is safe: already-wrapped headers are left alone.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../frontend/src/', import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.jsx$/.test(name)) files.push(p);
  }
})(ROOT);

let changedFiles = 0;
let wrapped = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(/<th([^>]*)>([^<>{}]*[^\s<>{}][^<>{}]*)<\/th>/g, (match, attrs, label) => {
    const text = label.trim();
    if (!text || /[{}]/.test(text)) return match;
    if (/\{th\(/.test(text)) return match;
    wrapped++;
    return `<th${attrs}>{th(${JSON.stringify(text)})}</th>`;
  });
  if (out !== src) {
    writeFileSync(file, out);
    changedFiles++;
  }
}
console.log(`wrapped ${wrapped} headers across ${changedFiles} files`);
