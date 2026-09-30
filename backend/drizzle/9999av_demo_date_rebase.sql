-- Ghim phép dời ngày của dữ liệu demo, để nó chạy **đúng một lần** và không trôi.
--
-- Vấn đề: dữ liệu demo BTE lấy từ hồ sơ thật nên lịch nằm ở 2019-03 → 2020-02, còn
-- "hôm nay" là 2026. Mọi báo cáo, biểu đồ Gantt, S-curve, tuổi SLA đều hiện số của
-- 7 năm trước. Muốn sửa thì phải dời **mọi** cột ngày gắn dự án cùng lúc — dời lịch
-- mà không dời payment/contract/submittal thì demo tự mâu thuẫn.
--
-- Vì sao cần bảng này thay vì chạy `UPDATE … + interval` mỗi lần boot: `init.js` là
-- idempotent và chạy **mỗi lần khởi động**. Nếu tính offset mỗi lần thì ngày trôi mãi —
-- hôm nay demo có `plan_end` ở 2026-12, mai đã là 2027-01, và mọi báo cáo đã chép ra
-- sẽ sai. Nên offset tính **một lần** rồi ghim lại; từ đó dữ liệu đứng yên.
--
-- Bảng này là singleton toàn cục (không có `tenant_id`) vì nó mô tả **chính dữ liệu
-- demo**, không phải dữ liệu khách hàng — nên không cần RLS. Xem `scripts/rebase-demo-dates.mjs`.
CREATE TABLE IF NOT EXISTS demo_date_rebase (
  id                    smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  offset_days           integer NOT NULL,
  anchor_max_plan_end   date,
  new_max_plan_end      date,
  applied_at            timestamptz NOT NULL DEFAULT now(),
  note                  text
);
