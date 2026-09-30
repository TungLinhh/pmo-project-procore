// Lớp phủ dùng chung cho 10 hộp thoại trong ứng dụng.
//
// Trước khi có file này, mỗi hộp thoại tự viết riêng `<div className="modal-backdrop">`
// với `onClick` đóng. Hệ quả đo được, không phải suy đoán:
//   · 9/10 hộp thoại không đóng bằng phím Escape — người dùng bàn phím mở được
//     rồi không thoát ra được nếu không tìm được nút X.
//   · 9/10 không có `role="dialog"`/`aria-modal`, nên trình đọc màn hình không
//     công bố đây là hộp thoại.
//   · Không ai chuyển focus vào hộp thoại, cũng không trả focus về nút đã mở nó.
//   · Không khóa Tab, nên Tab thoát ra các nút phía sau lớp phủ.
//
// Component này gom bốn việc đó vào một chỗ. Chỉ còn `Confirm.jsx` là đã tự làm
// đúng từ trước; nó cũng chuyển sang dùng Modal để không còn hai cơ chế cạnh
// tranh nhau trên cùng một phím.
import { useEffect, useRef } from 'react';
import { useEscape } from '../hooks/useEscape.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ onClose, maxWidth = 480, labelledBy, describedBy, initialFocusRef, children }) {
  const boxRef = useRef(null);
  const openerRef = useRef(null);

  // Lấy focus vào hộp thoại và trả lại về nút đã mở nó khi đóng. `null` ref sau
  // khi đóng là hợp lệ (component cha đã bị unmount cùng lúc).
  useEffect(() => {
    openerRef.current = document.activeElement;
    const box = boxRef.current;
    const target = initialFocusRef?.current
      || box?.querySelector(FOCUSABLE)
      || box;
    target?.focus?.();
    return () => {
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape chỉ đóng lớp trên cùng, kể cả khi Confirm bật đè lên modal khác.
  useEscape(true, onClose);

  // Giữ Tab bên trong hộp thoại. Không có trap này, Tab đi tới các nút của
  // trang nằm sau lớp phủ — nhìn thấy được nhưng bấm không đúng ý.
  function trapTab(e) {
    if (e.key !== 'Tab') return;
    const items = [...(boxRef.current?.querySelectorAll(FOCUSABLE) || [])].filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !boxRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !boxRef.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={boxRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>
  );
}
