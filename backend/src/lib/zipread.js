// Minimal dependency-free ZIP reader (central directory + stored/deflate).
// Why not yauzl: yauzl validates entry paths lazily and stalls the cursor
// permanently on the first hostile entry ('invalid relative path'), making
// per-entry skip-with-reason impossible. This reader never writes archive
// paths anywhere (saveFile() generates its own safe key), so zip-slip is
// structurally impossible at extraction time; batch.js still records hostile
// names as SKIPPED_FORMAT for review visibility.
//
// Bounds discipline: NOTHING is allocated before size checks — callers must
// reject entries via entry.uncompressedSize first. Encrypted entries (flag
// bit 0) and unknown methods are reported, never extracted.
import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;

export function listZipEntries(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 22) throw new Error('Invalid zip: too small');
  // Find EOCD (scan last 64KB + 22, per spec max comment size).
  let eocd = -1;
  const start = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Invalid zip: end-of-central-directory not found');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (process.env.ZIPREAD_DEBUG) console.error('[zipread]', { len: buf.length, eocd, count, off });
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (off + 46 > buf.length) throw new Error('Invalid zip: truncated central directory');
    if (buf.readUInt32LE(off) !== CD_SIG) throw new Error('Invalid zip: bad central header');
    const flags = buf.readUInt16LE(off + 8);
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const uncompSize = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.push({
      name: name.replace(/\\/g, '/'),
      method,
      compressedSize: compSize,
      uncompressedSize: uncompSize,
      encrypted: (flags & 0x1) !== 0,
      isDir: name.endsWith('/'),
      localOff,
    });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function extractZipEntry(buffer, entry) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (entry.encrypted) throw new Error('Encrypted entry not supported');
  if (entry.method !== 0 && entry.method !== 8) throw new Error(`Unsupported compression method ${entry.method}`);
  const o = entry.localOff;
  if (o + 30 > buf.length) throw new Error('Invalid zip: bad local header offset');
  const nameLen = buf.readUInt16LE(o + 26);
  const extraLen = buf.readUInt16LE(o + 28);
  const dataOff = o + 30 + nameLen + extraLen;
  if (dataOff + entry.compressedSize > buf.length) throw new Error('Invalid zip: entry data out of bounds');
  const comp = buf.subarray(dataOff, dataOff + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(comp);
  return inflateRawSync(comp);
}
