# Traceability SRS Rev-01 ↔ AI và cập nhật tiến độ

Nguồn chính: `Procore_PMO SRS.docx`, mã `ONX-PM-SRS-PO-001`, Rev-01, ban hành 23/08/2026.  
Bản trích xuất DOCX được tạo bằng `python-docx` trong vòng audit; kết quả đầy đủ nằm tại `/tmp/opencode/srs-extracted.txt` trong môi trường phát triển.

## Yêu cầu SRS đã trích

| Mã/điều | Yêu cầu nguyên văn/ý nghĩa | Code hiện tại | Trạng thái |
|---|---|---|---|
| Mục 0 | Phần mềm phải phản ánh MEPF, có single source of truth và điều khiển 4 trụ cột; chia GĐ1/GĐ2 | Dashboard, ingest, gate, `pillar-scenarios` | Đạt có điều kiện; gate mới chủ yếu hiển thị, chưa chặn đủ nghiệp vụ |
| Mục 1.2 | GĐ1 số hóa 4 trụ cột; GĐ2 mô phỏng ảnh hưởng lan truyền | `progress`, `materials`, `payment`, `pillar-sim` | Đạt có điều kiện |
| FR-1.1 | Nhập/cập nhật shopdrawing & BPTC theo hạng mục, vòng trình duyệt | `routes/shop.js`, `shop_drawings`, L1–L5 | Đạt có điều kiện; cần test race/CAS đầy đủ |
| FR-1.2 | Nhập/cập nhật MSB, lead time đặt hàng–giao hàng | `material-submittals`, `materials`, SLA/TVGS | Đạt có điều kiện; thêm project/parent/CAS/reopen trong vòng sửa |
| FR-1.3 | Nhập kế hoạch/thực tế nhân lực, máy theo chuyên môn, theo tuần | `manpower-plan`, `daily`, productivity | Đạt có điều kiện |
| FR-1.4 | Nhập AB/thầu phụ/NCC: đề nghị, duyệt, ngày giải ngân | `payment.js`, `payment_requests`, `payments`, retention | Đạt có điều kiện; vai trò và invoice status còn cần chốt |
| FR-1.5 | Dashboard dự án 4 khối đúng thứ tự, cập nhật tối thiểu hằng ngày | `ControlCenter`, dashboard APIs | Đạt có điều kiện; UAT chưa ký |
| FR-1.6 | Dashboard roll-up cấp công ty, ngưỡng cấu hình | `dashboard.js`, health | Đạt có điều kiện |
| FR-1.7 | S-curve kế hoạch/thực tế từng trụ cột | `s-curves.js` | Đạt ở API; cần UAT số liệu |
| FR-1.8 | Cảnh báo khi vượt ngưỡng | `health`, SLA watcher, attention | Đạt có điều kiện |
| FR-1.9 | Export PDF/Excel định kỳ | `project-report` | Một phần; route legacy còn `ENABLED=false` |
| FR-1.10 | RBAC theo vai trò và dự án | `permissions.js`, RLS, project-access | Đạt có điều kiện; đã đóng thêm AI/draft/upload scope, còn các list legacy |
| Mục 2.1–2.4 | Bốn trụ cột và vòng lặp gate | schema + dashboard | Đạt có điều kiện; gate chưa enforce trước mọi downstream write |
| Mục 3.1 | Người quyết định, hệ thống đề xuất; mọi GĐ2 là simulation trước baseline | `pillar-scenarios`, `withAudit`, fingerprint | Đạt ở đường `pillar_scenarios`; legacy deadline/schedule-compress chưa đồng nhất |
| Mục 4.2 / Bảng 7 | Đủ CTL-01→CTL-06, before/after, tác động 4 trụ cột | `pillar-sim.js` | Đạt có điều kiện; CTL-05 đã chuyển nén qua CPM, còn UAT nghiệp vụ |
| Mục 4.2.3 | Lưu creator, thời điểm, biến số, kết quả; không tự gửi notification ngoài | scenario + audit | Đạt ở scenario; proposal progress cũng audit, không gửi ngoài |
| Mục 5 / Bảng 8 | Layout L0→L5 theo thứ tự, gate hiển thị WAITING | Control Center/Pillar panel | Đạt có điều kiện |
| Bảng 9 | CEO/PMO/PM được xem/apply; site/procurement/technical/accounting nhập theo trụ cột | permission matrix | **Mâu thuẫn cần quyết định**: AGENTS/user yêu cầu CEO/Admin apply; bảng SRS ghi PM/PMO có thể apply trong thẩm quyền |
| Mục 7 / Bảng 11 | Hiệu năng, RBAC, mã hóa, audit, backup, API mở, Việt/Anh, responsive | nhiều module | Một phần; production/Docker/TLS/secret còn thiếu |
| Mục 9.1 | Hai pilot, 0% sai số khối lượng/giá trị, dashboard đúng, RBAC/audit, UAT | reconciliation + SRS gate | Chưa đạt; còn 36 dòng lặp, 8 workbook và chưa có chữ ký |
| Mục 9.2 | Chạy đủ 6 CTL, PM đối chiếu, apply/rollback, CEO họp quyết định | `pillar-sim.mjs`, UI | Code/test đạt; UAT thật chưa ký |

## AI trong SRS và phần mở rộng đề xuất

SRS Rev-01 nói kiến trúc **sẵn sàng kết nối AI Agent** ở giai đoạn sau; chưa định nghĩa API progress proposal tự nhiên. Vì vậy phần sau là một change request cần PMO/CEO phê duyệt, không được gọi là đã được SRS Rev-01 yêu cầu:

> `AI-EXT-01`: nhận cập nhật tiến độ bằng tiếng Việt, tạo proposal có before/after/citation/fingerprint, cho PM/PMO/site/procurement/technical/accounting gửi/xem, chỉ người được ủy quyền apply, có stale/idempotency/audit/rollback.

## Đối chiếu implementation AI-EXT-01

| Hạng mục | Đã có trong code | Bằng chứng |
|---|---|---|
| Natural-language input | `parseProgressText` + parser deterministic | `backend/src/lib/ai/progress-proposal.js` |
| Luôn tạo proposal | `needs_input` khi thiếu target/percent; `proposed` khi đủ | `tests/e2e/ai-progress-proposals.mjs` |
| Before/after + citation | payload proposal | test PASS |
| Idempotency | `Idempotency-Key` + advisory lock | test replay PASS |
| Stale protection | fingerprint + `409 STALE_PROPOSAL` | test PASS |
| Apply | CEO/Admin, work item + linked schedule, transaction/audit | test PASS |
| Rollback | reverse progress, precondition, audit | test PASS |
| UI | tab Cập nhật tiến độ, preview, apply/rollback | `frontend/src/hq/Assistant.jsx` |
| Q&A source/citation | source permission, relevance, model citation, deterministic evidence fallback | `ai-assistant.mjs`, `ai-srs-evaluation.mjs` |

## Điều kiện còn phải khóa trước UAT

1. PMO/CEO chốt mâu thuẫn role apply trong Bảng 9 với quyết định an toàn hiện tại.
2. Chốt `AI-EXT-01` có được đưa vào PO/change request hay giữ demo ngoài SRS.
3. Quyết định 36 dòng lặp, 8 workbook, invoice status và số liệu tài chính/retention.
4. Gate enforcement phải được chứng minh bằng API test, không chỉ hiển thị `WAITING`.
5. Production readiness, secret, TLS, backup restore, browser desktop/mobile và OpenRouter trên production vẫn chưa đạt.
