// Mở rộng test data: tăng số dòng, thêm 2 file lỗi để test validation
// Chạy: node scripts/generate-test-excel.mjs
import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('data/test-fixtures/TEST-MASTER-01');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SHEET_META = [];

function writeFile(filename, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, data] of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const fullPath = path.join(OUT_DIR, filename);
  XLSX.writeFile(wb, fullPath);
  SHEET_META.push({ filename, fullPath, sheets: sheets.map(([n]) => n) });
  console.log(`  ✓ ${filename} (${sheets.length} sheets)`);
}

const A = (rows) => rows;

// ========== 1. Shop Drawing TST-A (50 items, 33 cols) ==========
const shopData = [];
for (let i = 0; i < 26; i++) shopData.push([` `, ...new Array(32).fill(null)]);
shopData.push(new Array(33).fill(null).map((_, i) => i === 5 ? 'Mã hiệu' : i === 6 ? 'Tên' : i === 7 ? 'Progress' : i === 8 ? 'Plan submit' : i === 9 ? 'Actual submit' : i === 11 ? 'BQL L1' : i === 12 ? 'L1 date' : i === 13 ? 'BQL L2' : i === 14 ? 'L2 date' : null));
for (let i = 1; i <= 50; i++) {
  const row = new Array(33).fill(null);
  row[0] = i;
  row[5] = `TST-A-MEP-${String(i).padStart(3,'0')}`;
  row[6] = `Bản vẽ shop TST-A số ${i} | Shop drawing #${i}`;
  row[7] = i <= 25 ? 1.0 : 0.5;
  row[8] = new Date(2026, 0, (i % 28) + 1);
  row[9] = new Date(2026, 0, (i % 28) + 2);
  row[11] = 'OK';
  row[12] = new Date(2026, 0, (i % 28) + 3);
  row[13] = i > 25 ? 'PENDING' : 'OK';
  row[14] = new Date(2026, 0, (i % 28) + 4);
  if (i <= 25) row[32] = new Date(2026, 0, (i % 28) + 5);
  shopData.push(row);
}
writeFile('Shop TST-A.xlsx', [['SHOP', A(shopData)]]);

// ========== 2. Construction Schedule TST-B (100 items) ==========
const scheduleData = [];
for (let i = 0; i < 13; i++) scheduleData.push([` `, ...new Array(14).fill(null)]);
scheduleData.push(['STT', null, null, null, 'Công việc', 'Progress', 'Trạng thái', 'Plan Start', 'Plan End', 'Actual Start', 'Actual End', 'Plan Days']);
for (let i = 0; i < 2; i++) scheduleData.push([` `, ...new Array(14).fill(null)]);
for (let i = 1; i <= 100; i++) {
  const start = new Date(2026, 0, (i % 28) + 1);
  const end = new Date(2026, 0, (i % 28) + 6);
  const done = i <= 50;
  scheduleData.push([
    null, null, null, i,
    `Hạng mục thi công ${i} | Work item ${i}`,
    done ? 100 : Math.floor(Math.random() * 80),
    done ? 'YES' : 'NO',
    start, end,
    done ? start : null, done ? end : null, 5,
  ]);
}
writeFile('TĐ TST-B.xlsx', [['TĐ TST-B', A(scheduleData)]]);

// ========== 3. Material Supply TST-C (80 items) ==========
const materialData = [];
for (let i = 0; i < 5; i++) materialData.push([` `, ...new Array(9).fill(null)]);
for (let i = 1; i <= 80; i++) {
  materialData.push([
    i, null, null, null, null,
    `TST-C-MAT-${String(i).padStart(3,'0')}`,
    `Vật tư TST-C ${i}`,
    `TST-C material #${i}`,
    null,
    Math.round((i / 80) * 100),
  ]);
}
writeFile('Vật tư TST-C.xlsx', [[`Vat tu TST-C ${Date.now()}`, A(materialData)]]);

// ========== 4. Subcontractors (50 entries) ==========
const subData = [
  ['STT', 'Tên thầu phụ', 'Năng lực', null, null, null, null, null, 'Status', null],
];
for (let i = 1; i <= 50; i++) {
  subData.push([i, `Nhà thầu phụ TEST ${i} | Subcontractor ${i}`, `Capability ${i % 5} - MEP/HVAC/Finishing`, null, null, null, null, null, 'ACTIVE', null]);
}
writeFile('Danh sách thầu phụ TEST.xlsx', [['Thầu phụ', A(subData)]]);

// ========== 5. Suppliers (30 entries) ==========
const supplierData = [
  ['STT', 'Tên NCC', 'Hệ thống', 'Loại', 'Dự án', 'Địa điểm', 'Giá', 'CL', 'BH'],
];
for (let i = 1; i <= 30; i++) {
  supplierData.push([i, `NCC TEST ${i}`, ['MEP','HVAC','Finishing','Steel'][i%4], ['Vật tư','Thiết bị'][i%2], `Past ${i}`, 'HCM', '8/10', '9/10', '7/10']);
}
writeFile('Danh sách nguồn lực TEST.xlsx', [['Nhà cung cấp', A(supplierData)]]);

// ========== 6. Daily Report (full 84 rows) ==========
const dailyData = [];
for (let i = 0; i < 28; i++) dailyData.push(new Array(27).fill(null));
dailyData.push([1, 'MEP HVAC', null, null, null, null, null, null, 'Lắp đường ống điều hòa tầng 1', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'Site Engineer']);
dailyData.push([null, null, null, null, null, null, null, 1, 'Lắp ống D150', null, 5, new Date(2026,7,1), new Date(2026,7,3), 0, 60, null, null, null, null, null, null, null, null, null, null, null]);
dailyData.push([2, 'Điện', null, null, null, null, null, null, 'Kéo cáp tầng 2', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
dailyData.push([null, null, null, null, null, null, null, 2, 'Cáp CVV 4x10', null, 3, new Date(2026,7,1), new Date(2026,7,2), 0, 80, null, null, null, null, null, null, null, null, null, null, null]);
for (let i = 0; i < 5; i++) dailyData.push(new Array(27).fill(null));
dailyData.push([null, null, null, null, null, null, null, 1, 'Ống đồng D22', null, null, new Date(2026,7,1), new Date(2026,7,2), 0, 50, null, null, null, null, null, null, null, null, null, null, null]);
dailyData.push([null, null, null, null, null, null, null, 2, 'Bông thủy tinh', null, null, new Date(2026,7,2), new Date(2026,7,3), 0, 70, null, null, null, null, null, null, null, null, null, null, null]);
for (let i = 0; i < 5; i++) dailyData.push(new Array(27).fill(null));
for (let i = 0; i < 5; i++) dailyData.push(new Array(27).fill(null));
dailyData.push([null, null, null, null, null, null, null, null, null, null, 'Chỉ Huy trưởng/Phó CHT (Site Manager)', null, null, null, null, null, null, null, null, null, 3, null, null, null, null, null, null]);
dailyData.push([null, null, null, null, null, null, null, null, null, null, 'Thợ điện (Electrician)', null, null, null, null, null, null, null, null, null, 8, null, null, null, null, null, null]);
dailyData.push([null, null, null, null, null, null, null, null, null, null, 'Thợ nước (Plumber)', null, null, null, null, null, null, null, null, null, 5, null, null, null, null, null, null]);
for (let i = 0; i < 2; i++) dailyData.push(new Array(27).fill(null));
dailyData.push([1, 'Đổ bê tông cột C1', 1, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
dailyData.push([2, 'Lắp dàn giáo tầng 2', 1, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
for (let i = 0; i < 5; i++) dailyData.push(new Array(27).fill(null));
writeFile('Báo cáo công việc TEST 1.8.2026.xlsx', [['1.8.2026', A(dailyData)]]);

// ========== 7. RFA Log (20 entries) ==========
const rfaData = [
  ['STT', 'Mã RFA', 'Mô tả', 'Bộ môn', 'Khu vực', 'Ngày gửi', 'Reviewer', 'Status'],
];
for (let i = 1; i <= 20; i++) {
  rfaData.push([i, `RFA-TEST-${String(i).padStart(3,'0')}`, `Mô tả RFA ${i} | Description ${i}`, 'MEP', `TST-${String.fromCharCode(65 + (i % 4))}`, new Date(2026, 0, i*2), 'PM', 'APPROVED']);
}
writeFile('MCR-MM TEST.xlsx', [['RFA Log', A(rfaData)]]);

// ========== 8. Business Process (8 steps) ==========
const bpData = [
  [], ['STT', 'Tiến trình', 'Nội dung', 'Thực hiện', 'Kiểm tra'], [],
  [1, 'Bước 1 - Khởi tạo', 'Tạo dự án, phân công team', 'PM', 'CEO'],
  [2, 'Bước 2 - Lập BP', 'Lập kế hoạch ngân sách', 'PMO', 'CEO'],
  [3, 'Bước 3 - Shop drawing', 'Submit shop drawing', 'PM', 'PMO'],
  [4, 'Bước 4 - Triển khai', 'Triển khai thi công', 'Site', 'PM'],
  [5, 'Bước 5 - Nghiệm thu', 'Nghiệm thu + Bàn giao', 'Site', 'PMO'],
  [6, 'Bước 6 - Lưu hồ sơ', 'Archive toàn bộ chứng từ', 'PMO', 'CEO'],
  [7, 'Bước 7 - Thanh toán', 'Thanh toán NCC + retention', 'Accounting', 'CEO'],
  [8, 'Bước 8 - Bảo hành', 'Bảo hành 12 tháng', 'PM', 'PMO'],
];
writeFile('quy trình thực hiện TEST.xlsx', [['Quy trình thực hiện dự án', A(bpData)]]);

// ========== 9. File start index ==========
const fileIndexData = [
  ['STT', 'Tên file', 'Loại', 'Ngày tạo'],
  [1, 'Shop TST-A.xlsx', 'SHOP', new Date(2026, 0, 1)],
  [2, 'TĐ TST-B.xlsx', 'SCHEDULE', new Date(2026, 0, 2)],
  [3, 'Vật tư TST-C.xlsx', 'MATERIAL', new Date(2026, 0, 3)],
  [4, 'Báo cáo công việc TEST.xlsx', 'DAILY', new Date(2026, 0, 4)],
  [5, 'MCR-MM TEST.xlsx', 'RFA', new Date(2026, 0, 5)],
  [6, 'quy trình thực hiện TEST.xlsx', 'BP', new Date(2026, 0, 6)],
];
writeFile('File start TEST.xlsx', [['File start', A(fileIndexData)]]);

// ========== 10. ERROR FILE 1: Wrong zone (zone not exist) ==========
// Should fail with "Zone 'XYZ' not found"
const errZoneData = [
  ['STT', 'Zone', 'Level', 'Công việc', 'Progress', 'Status', 'Plan Start', 'Plan End', 'Actual Start', 'Actual End', 'Plan Days'],
  [null, null, null, 1, 'Test invalid zone', 50, 'YES', new Date(2026,0,1), new Date(2026,0,5), new Date(2026,0,1), new Date(2026,0,5), 5],
];
writeFile('TĐ XYZ-BAD.xlsx', [['TĐ XYZ-BAD', A(errZoneData)]]);

// ========== 11. ERROR FILE 2: Empty file (no data rows) ==========
const emptyData = [
  ['STT', 'Mã hiệu', 'Tên'],
  // intentionally no data rows
];
writeFile('Shop EMPTY.xlsx', [['SHOP', A(emptyData)]]);

console.log(`\n=== Generated ${SHEET_META.length} files (incl. 2 error files) ===`);
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(SHEET_META, null, 2));
console.log('Manifest saved');
