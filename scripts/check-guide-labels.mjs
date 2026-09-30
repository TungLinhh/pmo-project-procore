#!/usr/bin/env node
// Đối chiếu nhãn trong tài liệu với mã nguồn.
//
// `docs/USER_GUIDE_VI.md` là nguồn cho mọi hướng dẫn theo nhãn, nên nhãn viết trong
// tài liệu mà không tồn tại trong mã là hướng dẫn sai — người đọc tìm không thấy.
// Đây là cách kiểm tra rẻ hơn đọc thủ công 1.600 dòng tài liệu, và chạy lại được
// sau mỗi lần đổi nhãn.
//
// **Giới hạn cần biết:** đây là so sự tồn tại (substring), không phải so bằng thức.
// Nó bắt được hai lỗi thật — nhãn có trong tài liệu mà mã không có, và nhãn có ở mã
// mà quên ghi vào tài liệu. Nó **không** bắt được trường hợp nhãn bị đổi thành một
// nhãn dài hơn vẫn chứa nhãn cũ làm tiền tố (ví dụ `Vật tư chậm giao` → `VL chậm
// giao` thì bị bỏ sót). Muốn bắt cả ca đó thì phải so token, tức là phải đánh dấu
// nhãn trong tài liệu bằng một cú pháp riêng — chưa làm vì tỉ lệ được bắt/giá phí
// không đáng.
import { readFileSync } from 'node:fs';

// Markdown ngắt dòng giữa chừng nên một nhãn dài bị tách thành nhiều dòng trong
// tài liệu. Gộp khoảng trắng về một khoảng trước khi so, nếu không tài liệu đúng
// vẫn bị báo lệch.
const squash = (s) => s.replace(/\s+/g, ' ');
const GUIDE = squash(readFileSync('docs/USER_GUIDE_VI.md', 'utf8'));
// `i18n/vi.js` cũng là nơi chứa nhãn: nhãn đã dịch thì không còn nằm trong
// component mà nằm trong từ điển. Bỏ nó khỏi đây thì mọi nhãn đã dịch đều bị báo
// "thiếu trong mã" — tức là bộ kiểm phản đối việc dịch.
const SOURCE = squash([
  'frontend/src/hq/ai-guidance.js',
  'frontend/src/components/AiGuide.jsx',
  'frontend/src/hq/Assistant.jsx',
  'frontend/src/components/Modal.jsx',
  'frontend/src/i18n/vi.js',
].map((f) => readFileSync(f, 'utf8')).join('\n'));

// Nhãn mới thêm ở đợt 7 — những nhãn người đọc tài liệu sẽ đi tìm trên màn hình.
const LABELS = [
  'Gợi ý sử dụng',
  'Cách viết để AI đọc đúng',
  'Đề xuất này là gì, nên bấm gì?',
  'Hệ thống sẽ đọc được',
  'Đủ thông tin — có thể tạo đề xuất.',
  'Chọn dự án trước.',
  'Submittal nào quá hạn?',
  'Bản vẽ chờ duyệt',
  'Hạng mục trễ tiến độ',
  'Vật tư chậm giao',
  'Cần Ban điều hành quyết',
  'Dòng tiền tháng này',
  'Đủ thông tin',
  'Có ngày báo cáo',
  'Dùng dấu phẩy thập phân',
  'Số phần trăm',
  'Mã hạng mục',
  'Ngày báo cáo',
];

let bad = 0;
for (const label of LABELS) {
  const inSource = SOURCE.includes(label);
  const inGuide = GUIDE.includes(label);
  if (!inSource) { console.log(`  THIẾU trong mã:   "${label}"`); bad += 1; }
  else if (!inGuide) { console.log(`  có trong mã, chưa ghi tài liệu: "${label}"`); bad += 1; }
}
console.log(bad === 0
  ? `  ${LABELS.length}/${LABELS.length} nhãn khớp giữa tài liệu và mã nguồn`
  : `  ${bad}/${LABELS.length} nhãn lệch`);
process.exit(bad ? 1 : 0);
