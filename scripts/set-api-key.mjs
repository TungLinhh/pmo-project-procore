#!/usr/bin/env node
// Install a new API key into the local, git-ignored env file WITHOUT typing the
// secret into a shell argument (which lands in shell history) or into a chat
// transcript.
//
// Usage — paste the key, then Ctrl-D:
//   node scripts/set-api-key.mjs
// or, if you already have it in a file or a password manager pipe:
//   cat ~/.secrets/openrouter.txt | node scripts/set-api-key.mjs
//   pbpaste | node scripts/set-api-key.mjs        # macOS
//   xclip -o -sel clip | node scripts/set-api-key.mjs   # Linux X11
//
// The key is read from STDIN on purpose. argv would end up in
// ~/.bash_history / ~/.zsh_history and in any process listing.
import { readFileSync, writeFileSync, existsSync, copyFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const KEY = 'OPENROUTER_API_KEY';
// Overridable so the write path can be tested against a throwaway copy instead
// of the real key.
const ENV_FILE = process.env.PMO_ENV_FILE
  || join(homedir(), 'pmo_project_procore', 'backend', '.env');

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const raw = (await readStdin()).trim();

// Accept a whole pasted line like "OPENROUTER_API_KEY=sk-or-..." as well as a
// bare key — people paste both, and a rejected paste is a wasted round trip.
const value = raw.startsWith(`${KEY}=`) ? raw.slice(KEY.length + 1).trim() : raw;

// Validate the shape, not the value. A truncated paste is the realistic failure
// and it fails silently later as a confusing 401 from the provider.
const problems = [];
if (!value) problems.push('rỗng — bạn chưa dán gì (Ctrl-D sau khi dán)');
else if (/\s/.test(value)) problems.push('chứa khoảng trắng — có thể bị dán nhầm 2 dòng');
else if (value.length < 20) problems.push(`quá ngắn (${value.length} ký tự) — có vẻ dán thiếu`);
else if (!value.startsWith('sk-or-v1')) problems.push('không bắt đầu bằng "sk-or-v1" — đây có phải key OpenRouter không?');

if (problems.length) {
  console.error('Dừng, không ghi gì:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nCách lấy key: https://openrouter.ai/keys → Create key.');
  process.exit(1);
}

if (!existsSync(ENV_FILE)) {
  console.error(`Không tìm thấy ${ENV_FILE}`);
  console.error('Tạo file, ghi DATABASE_URL..., rồi chạy lại script này.');
  process.exit(1);
}

// Back up before rewriting — this file also holds the DB password and JWT secret.
const backup = `${ENV_FILE}.bak`;
copyFileSync(ENV_FILE, backup);

const lines = readFileSync(ENV_FILE, 'utf8').split('\n');
let replaced = 0;
const out = lines.map((line) => {
  if (line.trimStart().startsWith(`${KEY}=`)) { replaced += 1; return `${KEY}=${value}`; }
  return line;
});
if (replaced === 0) out.push(`${KEY}=${value}`); // append; commented-out line stays as history
writeFileSync(ENV_FILE, out.join('\n'));
// writeFileSync's `mode` only applies on creation, so tighten explicitly — the
// file also holds DB_PASSWORD and JWT_SECRET.
chmodSync(ENV_FILE, 0o600);

// The old key is still valid until revoked in the dashboard, so the backup now
// holds a live secret. Remove it once the new one is confirmed working.
console.log(`Đã ghi ${KEY} vào ${ENV_FILE} (${replaced ? 'thay dòng cũ' : 'thêm dòng mới'}).`);
console.log(`Bản sao lưu: ${backup}`);
try { chmodSync(backup, 0o600); } catch { /* already gone */ }
console.log('File backup vẫn chứa key cũ — xoá sau khi xác nhận key mới hoạt động.');
console.log('\nCòn lại 2 việc bạn phải tự làm trên dashboard OpenRouter:');
console.log('  1. Tạo key mới tại https://openrouter.ai/keys');
console.log('  2. Revoke (vô hiệu hoá) key cũ');
console.log('\nSau đó chạy:  npm run test:ai   để chứng minh provider thật vẫn trả lời.');
