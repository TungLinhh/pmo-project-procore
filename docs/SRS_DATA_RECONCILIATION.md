# Đối soát dữ liệu pilot

Tài liệu này ghi kết quả chạy pipeline thật trên `reference_sheets/2019.04.28 HBG-HBC-BCTT/`.

## Chạy lại

Chạy dry-run trước:

```bash
node scripts/reconcile-pilot-data.mjs --output=/tmp/opencode/pilot-reconciliation-dry.json
```

Chạy ingest idempotent sau khi PMO xác nhận môi trường:

```bash
node scripts/reconcile-pilot-data.mjs --apply --output=/tmp/opencode/pilot-reconciliation.json
```

Script dùng các parser production: `construction_schedule`, `shop_drawing`, `material_supply` và `payment_ar`. Mỗi file có hash SHA-256 trong `file_uploads.file_hash`; commit truyền `upload_id` để đối soát đúng file, không cộng các file có cùng tên sheet.

## Kết quả checkpoint

Lần chạy `pilot-reconciliation-final6.json` trên database local:

| Chỉ số | Kết quả |
|---|---:|
| Project thí điểm | `BTE-WP4-HBC`, `HBG-MCR` |
| File nguồn được phân loại | 52 |
| File có dữ liệu parser đọc được | 44 |
| Dòng nguồn, gồm dòng lặp khóa nghiệp vụ | 951 |
| Dòng khóa nghiệp vụ duy nhất | 915 |
| Dòng DB theo `upload_id` | 915 |
| Sai khác khóa nghiệp vụ | 0 file |
| Dòng lặp trong nguồn | 36 |
| File có dòng lặp | 8 |
| Workbook tổng hợp chưa đưa vào grain hiện tại | 8 |
| Lỗi ingest | 0 |

Báo cáo cho thấy `mismatch_files: 0` khi so sánh số khóa nghiệp vụ duy nhất với DB. Đây không phải bằng chứng UAT đã ký. Tám file có khóa lặp vẫn cần PMO xác nhận quy tắc ưu tiên trước khi nghiệm thu.

## Dòng lặp cần quyết định

| Project | Nhóm | Dòng nguồn | Khóa duy nhất | Lặp |
|---|---|---:|---:|---:|
| HBG-MCR | Material | 29 | 26 | 3 |
| BTE-WP4-HBC | Shop BOH | 46 | 45 | 1 |
| BTE-WP4-HBC | Shop BSN | 7 | 6 | 1 |
| BTE-WP4-HBC | Shop INF | 43 | 25 | 18 |
| BTE-WP4-HBC | Shop LOB-SPA | 27 | 26 | 1 |
| BTE-WP4-HBC | Construction BOH | 122 | 121 | 1 |
| BTE-WP4-HBC | Construction CLU | 27 | 21 | 6 |
| BTE-WP4-HBC | Construction INF | 79 | 74 | 5 |

Parser hiện ghi đè theo khóa hiện có. Không được coi dòng bị ghi đè là đã mất nếu chưa có quyết định về revision hoặc ưu tiên round.

## Workbook chưa đưa vào grain

Tám file sau được giữ trong báo cáo nhưng chưa commit dòng:

- `HBG-MCR-MM-01.1.xlsx`: workbook tổng hợp, không có sheet dữ liệu vật tư theo header hiện tại.
- `Tiến độ vật tư tổng thể các khu vực.xlsx`: sheet tổng hợp.
- `Sơ đồ shop tổng thể các khu vực.xlsx`: sheet tổng hợp.
- `HBG-MCR-MPM-01.1.xlsx`: báo cáo hồ sơ thanh toán theo tháng, chưa có bảng AR chuẩn.
- `Tiến độ thanh toán các khu vực.xlsx`: sheet tổng hợp thanh toán, chưa xác định grain dòng.
- `HBG-BTE-WM-01.xlsx`: sheet tổng hợp, chưa xác định grain hạng mục.
- `Sơ  đồ khu vực thi công.xlsx`: sheet sơ đồ tổng hợp, chưa xác định grain hạng mục.

Không tự động chuyển các file này thành số liệu vật tư, shop hoặc thanh toán. PMO phải chỉnh định nghĩa dòng hoặc xác nhận loại bỏ trước UAT.

## Điều kiện đóng đối soát

- PMO xác nhận 36 dòng lặp và quy tắc ưu tiên.
- Xác nhận grain cho 8 workbook tổng hợp.
- Chạy lại `--apply` và lưu báo cáo sau quyết định.
- Đối soát tiếp khối lượng, ngày và giá trị. Báo cáo hiện tại mới đối soát số khóa dòng, chưa đủ để ký nghiệm thu tài chính.
