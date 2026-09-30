// Phân trang ở server, dùng chung cho mọi route trả danh sách.
//
// Vì sao phải ở server: các route trước đây cắt cứng `LIMIT 200` / `100` và trả
// về một mảng, nên **người dùng không có cách nào biết còn dữ liệu phía sau**.
// Dự án BTE-WP4-HBC có đúng 200 bản vẽ — tức đang nằm ngay trên ngưỡng, thêm một
// bản nữa là dòng mới biến mất mà màn hình vẫn trông bình thường. Cắt ở trình
// duyệt không sửa được điều đó: chỉ server mới biết tổng số hàng thật.
//
// (Đo trước khi sửa có một nhầm lẫn đã gỡ: 46 bản vẽ "mất" thuộc dự án khác, không
// phải bị cắt. Cái thật sự hỏng là `slice(0, 300)` ở ShopList — một ngưỡng 300 mà
// API không hề có, nên code đó chỉ là ảo.)
//
// Vì sao **không** đổi hình dạng response: thân response vẫn là mảng, như mọi
// nơi đang mong đợi. Tổng số hàng đi kèm trong header `X-Total-Count` (số thuần
// để không cần parse). Đổi body thành `{rows,total}` sẽ phải sửa mọi nơi gọi —
// rủi ro không đáng để đổi một header là đủ.

export const TOTAL_HEADER = 'X-Total-Count';

// `defaultLimit` cố ý bằng mức trần cũ của các route (200), KHÔNG phải 25.
//
// Lý do: đặt mặc định nhỏ hơn ngay trong lúc thêm phân trang đã làm `Bản vẽ shop`
// tải 25/200 dòng mà không có thanh phân trang — tức mất dữ liệu, im lặng. Mặc định
// phải không bao giờ làm một màn cũ bị cắt bớt; màn nào muốn 25 dòng thì truyền
// `limit` tường minh. `maxLimit` chặn `?limit=99999` làm chậm cả server.
// `defaultLimit: null` ⇒ **không giới hạn** (`limit` trả về `null`).
//
// Vì sao cần: một số route cố ý trả hết danh sách (báo cáo ngày, work-items) và
// giao diện hiện dựa vào điều đó. Trước đây chúng không có `LIMIT` nên `?limit=2`
// bị **bỏ qua im lặng**. Muốn tôn trọng `limit` mà vẫn không cắt dữ liệu của bên
// gọi cũ thì phải phân biệt được "không truyền" với "truyền 0" — `null` làm
// việc đó, còn `0` thì không vì nó là số hợp lệ và kẹp dưới thành 1.
export function readPage(query = {}, { defaultLimit = 200, maxLimit = 500 } = {}) {
  const raw = Number.parseInt(query.limit, 10);
  const unlimited = defaultLimit === null;
  const limit = unlimited && !Number.isFinite(raw)
    ? null
    : Math.min(Math.max(Number.isFinite(raw) ? raw : defaultLimit, 1), maxLimit);
  const rawOffset = Number.parseInt(query.offset, 10);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);
  return { limit, offset };
}

// Gắn tổng số hàng vào header. `total` là số hàng khớp bộ lọc, không phải số hàng
// của trang này.
export function withTotal(res, total) {
  res.set(TOTAL_HEADER, String(Number(total) || 0));
  return res;
}
