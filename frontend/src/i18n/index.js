// Harmon store ngon ngu (task 10, SRS Ngon ngu: VI chinh, EN cho chrome +
// bao cao doi tac). Khong dung provider — module-level store +
// useSyncExternalStore de moi component re-render khi doi ngon ngu.
// Luu localStorage `pmo_lang`; server giu ban `users.locale` (dong bo o shell).
import { useSyncExternalStore } from 'react';
import vi from './vi.js';
import en from './en.js';
import HEADERS_EN from './th.js';

const DICTS = { vi, en };

function initial() {
  try {
    const l = localStorage.getItem('pmo_lang');
    if (DICTS[l]) return l;
  } catch { /* non-browser */ }
  return 'vi';
}

let lang = initial();
const subs = new Set();

function emit() {
  for (const f of subs) {
    try { f(); } catch { /* subscriber le */ }
  }
}

export function getLang() {
  return lang;
}

export function setLang(l) {
  const next = DICTS[l] ? l : 'vi';
  if (next === lang) return;
  lang = next;
  try {
    document.documentElement.lang = next;
    localStorage.setItem('pmo_lang', next);
  } catch { /* non-browser */ }
  emit();
}

try {
  document.documentElement.lang = lang;
} catch { /* non-browser */ }

// Dich 1 key; thieu -> roi ve VI -> roi ve chinh key (khong bao gio trang).
//
// `vars` nội suy `{tên}` — cần cho mọi chuỗi có số ("Hiển thị 1–25 / 200"). Cách
// duy nhất khác là ghép tay bằng `+`, rồi mất khả năng dịch vì thứ tự từ khác nhau
// giữa tiếng Việt và tiếng Anh.
// ── CẢNH BÁO: đừng gọi `t()` ở cấp module ────────────────────────────────────
//
// `t()` đọc biến `lang` module. Gọi nó ở cấp module tức là tính MỘT LẦN lúc nạp
// module, nên bấm [VI|EN] sau đó nhãn vẫn giữ ngôn ngữ lúc nạp — tệ hơn còn chưa
// dịch, vì người dùng tưởng đã đổi ngôn ngữ.
//
// Đã mắc ba lần, mỗi lần ở một kiểu:
//   1. `LIFECYCLE_LABELS` ở `hq/Materials.jsx` — map tĩnh.
//   2. `PRIORITY`          ở `hq/Attention.jsx` — map tĩnh, và `HIGH` còn viết
//      thẳng `'Cao'` nên không bao giờ được dịch ở bất kỳ chế độ nào.
//   3. `ASK_SAMPLES` & 5 hằng khác ở `hq/ai-guidance.js`.
//
// Cách đúng: để ở dạng hàm và gọi lúc render, kèm `useLang()` trong component để
// ép render lại. Nếu component không gọi `useLang()` thì đổi ngôn ngữ cũng không có
// tác dụng — đó là lý do `ui-verify-i18n.mjs` kiểm trên trình duyệt thật.
//
// `check-i18n.mjs` KHÔNG bắt được lỗi này: nó chỉ đếm chuỗi, mà chuỗi đã được
// bọc trong `t()` thì không còn là "chuỗi cứng". Chỉ đo bằng trình duyệt mới thấy.

export function t(key, vars) {
  const d = DICTS[lang] || vi;
  const text = d[key] ?? vi[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
  ));
}

// Tieu de bang: du lieu nghiep vu giu nguyen ngon ngu goc, chi ten cot doi theo
// toggle VI/EN. Chua co ban dich -> tra ve nguyen ban tieng Viet (khong mat chu).
// Component dung th() phai goi useLang() de render lai khi doi ngon ngu.
export function th(viLabel) {
  const label = String(viLabel ?? '');
  if (lang === 'vi') return label;
  return HEADERS_EN[label] ?? label;
}

// Hook de component re-render khi doi ngon ngu. Tra ve lang hien tai;
// dich bang t('...') trong render.
export function useLang() {
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => { subs.delete(f); };
    },
    () => lang
  );
  return lang;
}

// Cho script kiem tra parity (ui-verify-task10).
export function dictKeys(l) {
  return Object.keys(DICTS[l] || {});
}
