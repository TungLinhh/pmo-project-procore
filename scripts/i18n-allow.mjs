// Danh sách miễn trừ cho bộ đo i18n: những chuỗi tiếng Việt trong mã mà
// **không được dịch**, kèm lý do.
//
// `scripts/check-i18n.mjs` bỏ qua các chuỗi ở đây. Nếu không có file này thì bộ
// đo tính chúng vĩnh viễn, và số "còn lại" luôn lớn hơn thực tế — làm nghẩt số
// dùng để quyết định có đáng dịch tiếp không.
//
// Cùng nguyên tắc với `find-missing-catch.allow.mjs`: mỗi mục phải kèm lý do,
// nếu không thì đó chỉ là cách tắt cảnh báo.
export default {
  // Từ khoá khớp **tên file** trong `UploadWizard.jsx`. File thật đặt tên tiếng
  // Việt, nên dịch chúng sẽ phá vỡ phân loại tài liệu: file `TĐ zone.xlsx` sẽ
  // không còn khớp `construction_schedule`.
  //
  // Đây là loại dễ mắc nhất trong toàn bộ việc dịch: nhìn thì giống nhãn, thực ra
  // là dữ liệu. Đã có người thử dịch và phân loại hỏng.
  'file-keyword': [
    'tđ', 'vật tư', 'duyệt khác', 'cây', 'báo cáo', 'quy trình', 'thanh toán',
    'bãi tràm', 'phải thu', 'công nợ', 'thầu phụ', 'nguồn lực', 'shop', 'xây dựng',
  ],

  // Câu hỏi mẫu gửi cho AI trong `hq/ai-guidance.js`. Đây là thứ **gửi vào hệ
  // thống**, không phải chữ hiển thị: dữ liệu, prompt và từ khoá tra cứu đều tiếng
  // Việt, nên hỏi bằng tiếng Anh sẽ giảm chất lượng trả lời. Nhãn nút bên cạnh
  // (`Đủ thông tin`, `Có ngày báo cáo`…) thì có dịch — chỉ phần `text` giữ nguyên.
  // Nhãn cột trong `governance/master-data-columns.js`. Chúng là **khoá tra cứu**
  // cho `th()`, không phải chữ hiển thị: `visibleColumns()` gọi `th(label)` lúc
  // render nên chúng đã được dịch. Bộ đo không thấy điều đó vì nó chỉ nhìn thấy
  // mảng dữ liệu, không thấy lời gọi ở nơi tiêu thụ.
  //
  // Bù lại bằng kiểm tra thật: `scripts/check-table-headers.mjs` đọc chính file này
  // và bắt buộc mọi nhãn phải có trong `HEADERS_EN` — nên xoá bản dịch thì bài kiểm
  // vẫn đỏ. Không phải miễn trừ suông.
  'master-data-column-label': [
    'Mã', 'Tên', 'MST', 'Nhóm', 'Liên hệ', 'Trạng thái', 'Họ tên', 'Vai trò',
    'Điện thoại', 'Tổ', 'Đội trưởng', 'Năng lực', 'Nội bộ', 'Hệ', 'Địa điểm',
    'Đơn vị', 'Cấp', 'Loại', 'Mã bộ phận', 'Tên bộ phận', 'Mô tả', 'Hạn mức',
    'Đơn vị tính', 'Đơn giá', 'Phân loại', 'Đánh giá giá', 'Đánh giá chất lượng',
    'Bảo hành', 'Dự án', 'Hợp đồng', 'Ngày', 'Số lượng', 'Tiến độ',
    'Bộ phận cha', 'Tên (EN)',
  ],

  'ai-sample-query': [
    'submittal nào đang quá hạn TVGS?',
    'bản vẽ nào chờ duyệt quá 3 ngày?',
    'hạng mục nào đang trễ tiến độ?',
    'vật tư nào đang chậm giao so với kế hoạch?',
    'dự án nào cần Ban điều hành đưa vào danh sách ra quyết định?',
    'tổng giá trị thanh toán tháng này là bao nhiêu?',
    'Cập nhật hạng mục ROW-3863-3863 lên 65%, đang vướng MSB, PM cần xử lý trước.',
    'hạng mục MEP-01 hoàn thành 80% ngày 2026-09-30',
    'mã BOH-102 lên 45,5%',
  ],
};
