# Đề xuất giải quyết xung đột vai trò — Control Layer apply

**Ngày:** 2026-09-25
**Bối cảnh:** SRS Rev-01 (ONX-PM-SRS-PO-001) Bảng 9 cho phép **PM/PMO apply baseline trong thẩm quyền**. Bản triển khai đầu tiên chỉ cho **CEO/Admin** apply (an toàn hơn) → mâu thuẫn với SRS, và mọi kịch bản mô phỏng đều phải leo lên trên.

## Vì sao không chọn một trong hai cực

| Phương án | Rủi ro |
|---|---|
| Chỉ CEO/Admin apply | PM/PMO không bao giờ dùng được phần "trong thẩm quyền" của SRS; quy trình PMO bị nghẽn |
| Mở cho tất cả PM/PMO | Một kịch bản dời lịch 200 ngày cũng được ký bởi PM; không có ranh giới kiểm soát được |

## Đề xuất: "thẩm quyền" = ngưỡng tác động đo được

Quyết định không dựa trên **tên role** mà dựa trên **mức tác động** của kịch bản. Cài đặt: `backend/src/lib/pillar-authority.js`.

```
CEO / Admin          → luôn được phép, không giới hạn
PM                   → chỉ trên dự án mình phụ trách (projects.pm_user_id = user.id)
PMO                  → trên dự án được gán (membership đã kiểm ở requireProjectAccess)
PM / PMO trong giới hạn → được phép
Vượt giới hạn        → 403 OUTSIDE_AUTHORITY + nêu rõ vế bị vượt + ai có quyền ký
```

Ba ngưỡng, cấu hình bằng biến môi trường:

| Biến | Mặc định | Ý nghĩa |
|---|---:|---|
| `PILLAR_APPLY_MAX_SHIFT_DAYS` | 14 | Dời lịch tuyệt đối (ngày) |
| `PILLAR_APPLY_MAX_COST_VND` | 500.000.000 | Chi phí ước tính (VND) |
| `PILLAR_APPLY_MAX_AFFECTED_ITEMS` | 20 | Số hạng mục bị ảnh hưởng |
| `PILLAR_APPLY_AUTHORITY` | `on` | `off` = quay về CEO/Admin-only |

Phản hồi khi bị chặn (trả về cho UI hiển thị, không phải 403 trần):

```json
{
  "error": "Vượt thẩm quyền: dời lịch 90 ngày > 14 ngày — cần CEO/Admin ký",
  "code": "OUTSIDE_AUTHORITY",
  "basis": "cap_exceeded",
  "exceeded": ["dời lịch 90 ngày > 14 ngày"],
  "escalate_to": "CEO/Admin"
}
```

## Những gì **không** đổi

- Apply vẫn nằm trong **một transaction** có audit (`withAudit`).
- Vẫn có **fingerprint** lịch, **TTL 24h** cho preview, khóa dự án, chặn rollback khi có baseline mới hơn.
- Rollback dùng **cùng bộ quyền** với apply: ai apply được thì hoàn tác được.
- Đề xuất tiến độ của AI vẫn **CEO/Admin** apply — AI-EXT-01 không thuộc SRS này, giữ nguyên nguyên tắc "AI chỉ đề xuất".

## Cách lùi nhanh nếu PMO/CEO không đồng ý

```bash
PILLAR_APPLY_AUTHORITY=off
```

Không cần sửa code, không cần deploy lại.

## Cần PO/PMO xác nhận

1. Ba ngưỡng mặc định (14 ngày / 500 triệu / 20 hạng mục) có phù hợp quy mô dự án không?
2. Có chấp nhận "PM chỉ apply trên dự án mình phụ trách" không, hay PMO được apply mọi dự án của tenant?
3. Có giữ `PILLAR_APPLY_AUTHORITY=off` làm trạng thái ngắt/bật cho incident không?

## Bằng chứng

- `node tests/e2e/pillar-authority.mjs` — 14/14 PASS (đọc cap từ env, CEO/Admin không giới hạn, PM vượt cap bị từ chối kèm lý do, PM không sở hữu bị từ chối, SITE luôn bị từ chối, công tắc `off` khôi phục hành vi cũ).
- `node tests/e2e/pillar-sim.mjs` — PASS, không hồi quy.
