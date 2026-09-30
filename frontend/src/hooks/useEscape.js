import { useEffect, useLayoutEffect, useRef } from 'react';

// Đóng lớp phủ bằng phím Escape.
//
// Lý do có hook này: 10 lớp phủ rải ở 8 file, mỗi lớp tự viết `onClick` trên
// backdrop để đóng. Bấm chuột thì đóng, bàn phím thì không — người dùng bàn phím
// mở được hộp thoại rồi không thoát ra nếu không tìm được nút X. Escape là kỳ
// vọng mặc định của hộp thoại desktop.
//
// Lớp phủ có thể lồng nhau: Confirm là provider toàn cục, nên một modal đang mở
// có thể bật Confirm đè lên. Escape một lần chỉ được đóng lớp trên cùng — nếu
// cả hai cùng đóng, người dùng mất sạch nội dung họ đang nhập trong modal bên
// dưới. Vì vậy dùng ngăn xếp thay vì để mọi listener cùng chạy.
//
// `active` chỉ việc bật/tắt hook; điều kiện render lớp phủ vẫn nằm ở JSX.
const stack = [];
let listening = false;

function onKeyDown(e) {
  if (e.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (top) top.fn();
}

export function useEscape(active, onEscape) {
  // ref giữ callback mới nhất mà không cần gắn lại listener mỗi lần render.
  const latest = useRef(onEscape);
  // Gán trong `useLayoutEffect`, KHÔNG gán lúc render. Gán `ref.current` khi
  // render là vi phạm vòng đời: render phải thuần, và nếu React render lại mà
  // chưa commit thì ref đã đổi trước khi DOM cập nhật. `useLayoutEffect` chạy
  // đồng bộ ngay sau commit, trước khi người dùng kịp bấm phím.
  useLayoutEffect(() => { latest.current = onEscape; });

  useEffect(() => {
    if (!active) return undefined;
    const entry = { fn: () => latest.current() };
    stack.push(entry);
    if (!listening) {
      document.addEventListener('keydown', onKeyDown);
      listening = true;
    }
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (!stack.length && listening) {
        document.removeEventListener('keydown', onKeyDown);
        listening = false;
      }
    };
  }, [active]);
}
