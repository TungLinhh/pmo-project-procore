// Minimal IFC-SPF metadata extractor (Wave 3 C1): storeys, spaces, schema.
// Streaming line reader, zero deps. Caps: MAX_LINES (default 50k) / MAX_BYTES
// (default 200MB) — giant models degrade with {truncated:true}, never OOM.
// Only parses what the library UI needs; full geometry stays in the file.
import { createReadStream } from 'node:fs';

export const BIM_CAPS = { maxLines: 50_000, maxBytes: 200 * 1024 * 1024 };

function splitArgs(s) {
  // Split top-level comma list, respecting nested parens and 'quoted' strings.
  const parts = [];
  let depth = 0, inStr = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && s[i + 1] === "'") { cur += "''"; i++; continue; }
    if (ch === "'") { inStr = !inStr; cur += ch; continue; }
    if (inStr) { cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

const unquote = (v) => {
  if (v == null || v === '$' || v === '*') return null;
  const m = /^'(.*)'$/s.exec(v);
  return m ? m[1].replace(/''/g, "'") : v;
};
const asNumber = (v) => {
  if (v == null || v === '$' || v === '*') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Multiline entities: IFC-SPF allows one entity across lines — accumulate until ';'.
export async function parseBimFile(filePath, { maxLines = BIM_CAPS.maxLines, maxBytes = BIM_CAPS.maxBytes } = {}) {
  const storeys = [];
  const spaces = [];
  let schema = null;
  let entityCount = 0;
  let linesRead = 0;
  let truncated = false;
  let buf = '';
  let bytes = 0;

  const feed = (line) => {
    buf += line;
    if (!buf.trimEnd().endsWith(';')) return;
    const text = buf.trim();
    buf = '';
    if (!text.startsWith('#')) {
      const m = /FILE_SCHEMA\(\(\s*'([^']+)'/i.exec(text);
      if (m) schema = m[1];
      return;
    }
    entityCount++;
    const m = /^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\((.*)\);?$/is.exec(text);
    if (!m) return;
    const [, , type, argStr] = m;
    const args = splitArgs(argStr);
    if (type === 'IFCBUILDINGSTOREY') {
      // IFC4 args: GlobalId, OwnerHistory, Name, Description, ObjectType,
      // ObjectPlacement, Representation, LongName, CompositionType, Elevation
      storeys.push({ name: unquote(args[2]), elevation: asNumber(args[9]) });
    } else if (type === 'IFCSPACE') {
      spaces.push({ name: unquote(args[2]), long_name: unquote(args[3]) });
    }
  };

  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: 'utf8' });
    let leftover = '';
    stream.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) { truncated = true; stream.destroy(); return resolve(); }
      const lines = (leftover + chunk).split('\n');
      leftover = lines.pop();
      for (const line of lines) {
        if (++linesRead > maxLines) { truncated = true; stream.destroy(); return resolve(); }
        feed(line + '\n');
      }
    });
    stream.on('end', () => { if (leftover.trim()) feed(leftover); resolve(); });
    stream.on('error', reject);
    stream.on('close', resolve);
  });

  return {
    schema,
    storeys: storeys.filter((s) => s.name),
    space_count: spaces.length,
    spaces: spaces.filter((s) => s.name).slice(0, 200),
    entity_count: entityCount,
    truncated,
  };
}
