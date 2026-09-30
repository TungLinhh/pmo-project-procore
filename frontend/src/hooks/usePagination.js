import { useEffect, useMemo, useState } from 'react';

// Phân trang phía trình duyệt cho danh sách đã nạp hết về.
//
// Vì sao ở trình duyệt: các màn này vốn đã lấy toàn bộ danh sách từ API rồi cắt
// ở server (`limit`), nên vượt ngưỡng là **mất dòng, không phải trang tiếp**. Đổi
// sang cắt ở đây giữ đúng một nguồn sự thật: `rows` là toàn bộ những gì API trả về,
// nên tổng số hiển thị luôn khớp với dữ liệu thật thay vì báo "200" rồi im lặng.
//
// Hook tự đưa trang về 1 khi bộ lọc đổi — nếu không, lọc còn 3 dòng mà đang ở
// trang 9 sẽ ra trang trống trong khi người dùng tưởng hết dữ liệu.
//
// Trả về `visible` đã cắt, kèm đủ thứ cho <TablePagination>.
//
// **Hợp đồng với nơi gọi:** truyền vào danh sách ĐÃ lọc. Khi bộ lọc đổi mà độ dài
// không đổi (ví dụ lọc 20 dòng còn lại 20 dòng), hook không tự đưa về trang 1 —
// nơi gọi phải gọi `setPage(1)` trong hàm đổi bộ lọc, đúng như code hiện tại.
// Reset theo tham chiếu mảng sẽ dễ hơn nhưng nguy hiểm: nơi gọi không memoize
// `filtered` thì mảng mới mỗi lần render, và người dùng không bao giờ điều được
// sang trang 2.
export function usePagination(rows, { initialSize = 25, sizes = [25, 50, 100] } = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);

  // Khoá theo tham chiếu danh sách: mỗi lần load lại là một mảng mới, nên lọc
  // cũng reset trang theo đúng ý nghĩa "dữ liệu vừa thay".
  const signature = useMemo(() => (Array.isArray(rows) ? rows.length : 0), [rows]);
  useEffect(() => { setPage(1); }, [signature]);

  const total = Array.isArray(rows) ? rows.length : 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const visible = useMemo(
    () => (Array.isArray(rows) ? rows.slice((safePage - 1) * pageSize, safePage * pageSize) : []),
    [rows, safePage, pageSize],
  );

  return {
    visible,
    total,
    page: safePage,
    pageCount,
    pageSize,
    sizes,
    setPage,
    changePageSize: (size) => { setPageSize(size); setPage(1); },
  };
}

// Phân trang server-side: mỗi lần đổi trang thì gọi lại API với `limit`/`offset`.
//
// Dùng khi dữ liệu nhiều hơn mức mà trình duyệt nên giữ (nhật ký có hàng nghìn
// dòng). `usePagination` ở trên không thay thế được: nó cắt trên mảng đã nạp, mà
// ở đây mảng chỉ có một trang.
//
// `total` là tổng server báo. null nghĩa là server chưa gửi `X-Total-Count` —
// lúc đó vẫn cho đổi trang bằng nút ‹ ›, nhưng không hiện tổng.
export function useServerPage(total, { initialSize = 25, sizes = [25, 50, 100] } = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);

  const known = Number.isFinite(total) && total >= 0;
  const pageCount = known ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = Math.min(Math.max(1, page), pageCount);

  // Lọc mới làm tổng nhỏ lại → trang hiện tại có thể vượt quá cuối.
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  return {
    page: safePage,
    pageCount,
    pageSize,
    sizes,
    total: known ? total : null,
    // Object tham số, không phải chuỗi: màn dùng `qs()` của api/index.js nối vào
    // path. Ghép chuỗi tay thì dễ quên `&`, và mất `undefined` khi không truyền.
    params: { limit: pageSize, offset: (safePage - 1) * pageSize },
    setPage,
    changePageSize: (size) => { setPageSize(size); setPage(1); },
  };
}
