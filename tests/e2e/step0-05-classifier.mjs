// STEP0-05a: classifier unit coverage on real BTE folder/filename shapes (no DB).
// Run: node tests/e2e/step0-05-classifier.mjs
import { classifyFile, normalizeZoneCode } from '../../backend/src/lib/classify.js';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

const cases = [
  // [relativePath, family, docType, zone, summary]
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ SHOP/MEP-BTE-SHD-BOH.xlsx', 'shop', 'shop_drawing', 'BOH', false],
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ SHOP/MEP-BTE-SHD-LOB & SPA.xlsx', 'shop', 'shop_drawing', 'LOB&SPA', false],
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ SHOP/HBG-BTE-MSHOP-01.xlsx', 'shop', 'shop_drawing', null, true],
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ SHOP/Sơ đồ shop tổng thể các khu vực.xlsx', 'shop', 'shop_drawing', null, true],
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ THI CÔNG/MEP-BTE-CSP-BPV-1BR.xlsx', 'schedule', 'construction_schedule', 'BPV-1BR', false],
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ THI CÔNG/MEP-BTE-CSP-01.xlsx', 'schedule', 'construction_schedule', null, true],
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ CUNG ỨNG VẬT TƯ/MEP-BTE-MSA-01.xlsx', 'material', 'material_supply', null, false],
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ CUNG ỨNG VẬT TƯ/DR-MEP-BTE-MSA- VTP- 01.xlsx', 'material', 'material_supply', null, false],
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ THANH TOÁN A_B/1. Bãi Tràm.xlsx', 'payment_ar', 'payment_ar', null, true],
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ THANH TOÁN A_B/HBG-BTE-MPM-01.1.xlsx', 'payment_ar', 'payment_ar', null, false],
  ['2020.01.11 MEP-BTE-PCR/DUYỆT KHÁC/DUYỆT KHÁC.xlsx', 'submittal', 'rfa_log', null, false],
  ['2020.01.11 MEP-BTE-PCR/QUY TRÌNH/quy trình thực hiện dự án.xlsx', 'process', 'business_process', null, false],
  ['2020.01.11 MEP-BTE-PCR/QUY TRÌNH/MEP-BTE-FL-TĐ.TP-001.xlsx', 'team', 'subcontractor_directory', null, false],
  ['2020.01.11 MEP-BTE-PCR/TÀI NGUYÊN/Danh sách nguồn lực công ty.xlsx', 'resource', 'resource_directory', null, false],
  ['2020.01.11 MEP-BTE-PCR/SƠ ĐỒ CÂY/Tiến độ hạng mục.xlsx', 'reference', 'work_breakdown', null, false],
  ['2020.01.11 MEP-BTE-PCR/FILE START.xlsx', 'reference', 'file_index', null, false],
  ['random/notes.txt', 'unknown', null, null, false],
  ['2020.01.11 MEP-MCR-PCR/TIẾN ĐỘ SHOP/Shop CS.xlsx', 'shop', 'shop_drawing', null, false],
  ['2019.09.20 HBG-LVK-BCTH/TIẾN ĐỘ THI CÔNG/HBG-LVK-ZONE 01. (161-166,185).xlsx', 'schedule', 'construction_schedule', null, false],
];

for (const [rel, family, docType, zone, summary] of cases) {
  const c = classifyFile(rel);
  const pass = c.family === family && c.docType === docType && c.zone === zone && c.summary === summary;
  ok(pass, `${rel.split('/').pop()} → ${c.family}/${c.docType}/zone=${c.zone}/summary=${c.summary}${pass ? '' : ` (want ${family}/${docType}/${zone}/${summary})`}`);
  if (family !== 'unknown') ok(c.confidence === 'high' || c.confidence === 'medium', `  confidence decided (${c.confidence})`);
}

ok(normalizeZoneCode('lob & spa') === 'LOB&SPA', 'zone normalization keeps &');
ok(normalizeZoneCode('BPV-1BR ') === 'BPV-1BR', 'zone trim/upper');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
