// Hướng dẫn sử dụng Trợ lý AI, tách khỏi component để nội dung kiểm thử được.
//
// `parseProgressPreview` là bản sao của `parseProgressText` ở
// backend/src/lib/ai/progress-proposal.js. Nó tồn tại để hiển thị TRƯỚC cho người
// dùng thấy hệ thống sẽ bóc ra được gì từ câu họ đang gõ — thay vì bấm
// "Tạo đề xuất AI" rồi mới nhận "Còn thiếu: work_item".
//
// Nếu hai bên lệch nhau, người dùng bị dẫn sai. Khi sửa regex ở backend, sửa cả ở
// đây — và `regression-wave5.mjs` có khẳng định so hai bản với nhau.
//
// Vì sao dữ liệu ở đây là **hàm** chứ không phải hằng ở cấp module:
// `t()` gọi ở cấp module được tính MỐT LẦN lúc nạp, nên bấm [VI|EN] sau đó nội
// dung vẫn giữ ngôn ngữ cũ. Hàm thì tính lại mỗi lần render. Đã mắc đúng lỗi này
// ở `LIFECYCLE_LABELS` của Materials.
//
// ⚠️ Trường `text` (câu hỏi mẫu) **giữ nguyên tiếng Việt, cố ý**. Đó là thứ gửi
// vào hệ thống, không phải chữ hiển thị: dữ liệu, prompt và từ khoá tra cứu
// (TVGS, MSB, PO, mã hạng mục) đều tiếng Việt, nên hỏi bằng tiếng Anh làm giảm
// chất lượng trả lời. Người đọc tiếng Anh vẫn bấm được và thấy câu hỏi gửi đi là
// tiếng Việt — đó là trung thực hơn là dịch rồi âm thầm hỏi sai cách.
import { t } from '../i18n/index.js';

// --- Bản sao hợp đồng phân tích (giữ nguyên biểu thức của backend) -------------
//
// ⚠️ Hợp đồng trả về PHẢI khớp `parseProgressText` ở
// `backend/src/lib/ai/progress-proposal.js`: `progressPercent` · `reportDate` ·
// `codeHint`. Đã từng viết sai (`workItemCode` + `candidates` thay cho `codeHint`)
// và `regression-wave5.mjs` bắt được ngay — đó là bài kiểm duy nhất giữ hai bản
// này đi cùng nhau.
//
// `codeIsExplicit` là thêm **phía giao diện**: nó cho biết mã do người dùng ghi rõ
// sau từ khoá hay hệ thống phải đoán, để thẻ xem trước nói "hãy ghi rõ mã" thay vì
// im lặng. Máy chủ không cần nên không có.
export function parseProgressPreview(text) {
  const source = String(text || '');
  const percentMatch = source.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/i);
  const dateMatch = source.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const labelledCode = source.match(/(?:mã|hạng mục|work\s*item|wbs|item)\s*(?:số|code)?\s*[:#-]?\s*([a-z0-9][a-z0-9._/-]{2,})/i);
  const codeTokens = [...source.matchAll(/\b[a-z0-9][a-z0-9._/-]{2,}\b/gi)]
    .map((match) => match[0])
    .filter((token) => /\d/.test(token) && !/^\d{1,2}$/.test(token));
  return {
    progressPercent: percentMatch ? Number(percentMatch[1].replace(',', '.')) : null,
    reportDate: dateMatch?.[1] || null,
    codeHint: labelledCode?.[1] || codeTokens[0] || null,
    codeIsExplicit: Boolean(labelledCode?.[1]),
  };
}

// --- Mẫu hỏi tab Hỏi đáp ---------------------------------------------------

// Chọn theo những gì hệ thống THỰC SỰ truy xuất được, không phải câu chào hỏi
// chung chung: mỗi câu dưới đây có một nhóm dữ liệu thật sau nó.
export function askSamples() {
  return [
    { label: t('ask.sample_submittal'), text: 'submittal nào đang quá hạn TVGS?' },
    { label: t('ask.sample_drawing'), text: 'bản vẽ nào chờ duyệt quá 3 ngày?' },
    { label: t('ask.sample_late'), text: 'hạng mục nào đang trễ tiến độ?' },
    { label: t('ask.sample_material'), text: 'vật tư nào đang chậm giao so với kế hoạch?' },
    { label: t('ask.sample_board'), text: 'dự án nào cần Ban điều hành đưa vào danh sách ra quyết định?' },
    { label: t('ask.sample_cash'), text: 'tổng giá trị thanh toán tháng này là bao nhiêu?' },
  ];
}

export function askTips() {
  return [
    t('ask.tip_scope'),
    t('ask.tip_citations'),
    t('ask.tip_keywords'),
    t('ask.tip_no_guess'),
    t('ask.tip_readonly'),
  ];
}

// --- Mẫu và quy tắc cho tab Cập nhật tiến độ -------------------------------
export function progressSamples() {
  return [
    { label: t('prog.sample_enough'), text: 'Cập nhật hạng mục ROW-3863-3863 lên 65%, đang vướng MSB, PM cần xử lý trước.' },
    { label: t('prog.sample_date'), text: 'hạng mục MEP-01 hoàn thành 80% ngày 2026-09-30' },
    { label: t('prog.sample_decimal'), text: 'mã BOH-102 lên 45,5%' },
  ];
}

export function progressRules() {
  return [
    { need: t('prog.rule_percent_need'), how: t('prog.rule_percent_how') },
    { need: t('prog.rule_code_need'), how: t('prog.rule_code_how') },
    { need: t('prog.rule_date_need'), how: t('prog.rule_date_how') },
  ];
}

export function progressTips() {
  return [
    t('prog.tip_propose_only'),
    t('prog.tip_missing'),
    t('prog.tip_applied'),
    t('prog.tip_stale'),
  ];
}

// --- Hướng dẫn tab Đề xuất -------------------------------------------------
export function draftTips() {
  return [
    t('draft.tip_generated'),
    t('draft.tip_approve_send'),
    t('draft.tip_schedule'),
    t('draft.tip_dont_approve'),
    t('draft.tip_dismiss'),
  ];
}
