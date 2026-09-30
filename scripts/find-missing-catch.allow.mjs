// Chỗ được biết là cố ý bỏ trống, kèm lý do. Nếu không có danh sách này thì
// `find-missing-catch.mjs` luôn báo 1 lỗi và người đọc tưởng còn sót.
export const ALLOW = new Map([
  ['frontend/src/hq/Manpower.jsx', {
    line: 66,
    why: 'Promise.all nhận 3 promise, cả 3 đã có .catch riêng trả về giá trị rỗng, '
       + 'nên Promise.all không thể reject. Thêm .catch ở đây là code chết. '
       + 'Rủi ro còn lại là setState ném lỗi — không xảy ra với các hàm này.',
  }],
]);
