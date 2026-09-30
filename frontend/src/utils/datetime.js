// Parse timestamps returned by PostgreSQL in one place. `timestamp without
import { t } from '../i18n/index.js';
// time zone` values are UTC in this app; date-only values stay calendar dates.
export function parseApiDate(value) {
  if (value instanceof Date) return value;
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  const normalized = dateOnly
    ? `${raw}T00:00:00Z`
    : (hasZone ? raw : `${raw.replace(' ', 'T')}Z`);
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatApiDate(value, locale = 'vi-VN') {
  const date = parseApiDate(value);
  return date ? date.toLocaleString(locale) : '—';
}

// Calendar date only, no clock time.
//
// Tồn tại vì `report_date` là cột `date` nhưng API trả về chuỗi ISO đầy đủ
// (`2026-09-27T00:00:00.000Z`). In thẳng ra UI thì người công nhân thấy
// "2026-09-27T00:00:00.000Z" — không phải thứ ai đọc được ngoài đời.
//
// Dùng hàm này thay vì `String(x).slice(0, 10)`: cắt chuỗi là cách làm thô, bỏ qua
// múi giờ người xem và bỏ qua ngôn ngữ.
export function formatApiDay(value, locale = 'vi-VN') {
  const date = parseApiDate(value);
  return date ? date.toLocaleDateString(locale) : '—';
}

export function relativeTimeVi(value) {
  const date = parseApiDate(value);
  if (!date) return '—';
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (seconds < 60) return t('time.just_now');
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} ngày trước`;
  return date.toLocaleDateString('vi-VN');
}

// Calendar date in the viewer's own timezone, as YYYY-MM-DD.
// `new Date().toISOString().slice(0,10)` returns the UTC date, which is
// yesterday for any user east of UTC (Vietnam, UTC+7) between 00:00 and 07:00
// local — so field crews logged into the wrong day's daily report and payments
// were stamped with yesterday's paid_date.
export function todayLocal(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Monday of the week containing `date`, as YYYY-MM-DD (local).
export function mondayLocal(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return todayLocal(d);
}
