// Export: read data from DB → write Excel file matching HBG format
import XLSX from 'xlsx';
import { getDb } from '../db/index.js';

export async function exportDailyReport(dailyReportId) {
  const db = getDb();
  const report = db.prepare('SELECT * FROM daily_reports WHERE id = ?').get(dailyReportId);
  if (!report) throw new Error('Daily report not found');

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(report.project_id);

  const workItems = db.prepare('SELECT * FROM daily_work_items WHERE daily_report_id = ? ORDER BY id').all(dailyReportId);
  const materials = db.prepare('SELECT * FROM daily_materials WHERE daily_report_id = ? ORDER BY id').all(dailyReportId);
  const manpower = db.prepare('SELECT * FROM daily_manpower WHERE daily_report_id = ? ORDER BY id').all(dailyReportId);
  const acceptance = db.prepare('SELECT * FROM daily_acceptance WHERE daily_report_id = ? ORDER BY id').all(dailyReportId);

  // Build workbook mimicking HBG format
  const wb = XLSX.utils.book_new();
  const ws = {};

  // R1: Project name (merged)
  ws['A1'] = { t: 's', v: 'BÁO CÁO CÔNG VIỆC HÀNG NGÀY / DAILY WORK REPORT' };
  ws['A2'] = { t: 's', v: `Dự án / Project: ${project.name_vi}` };
  ws['A3'] = { t: 's', v: `Ngày / Date: ${report.report_date}` };
  ws['A4'] = { t: 's', v: `Người lập / Prepared by: ${report.prepared_by || ''}` };

  // Section I header
  ws['A6'] = { t: 's', v: 'I. HẠNG MỤC & TIẾN ĐỘ / ITEMS & PROGRESS' };
  ws['A7'] = { t: 's', v: 'TT' };
  ws['B7'] = { t: 's', v: 'Hạng mục / System' };
  ws['C7'] = { t: 's', v: 'Vướng mắc / Blocker' };
  ws['D7'] = { t: 's', v: 'STT' };
  ws['E7'] = { t: 's', v: 'Công việc / Work item' };
  ws['F7'] = { t: 's', v: 'Hệ / System' };
  ws['G7'] = { t: 's', v: 'Tỉ lệ NV' };
  ws['H7'] = { t: 's', v: 'Ngày bắt đầu' };
  ws['I7'] = { t: 's', v: 'Ngày kết thúc' };
  ws['J7'] = { t: 's', v: 'Ngày lỗ' };
  ws['K7'] = { t: 's', v: 'Tiến độ %' };

  // Data
  let row = 8;
  for (const wi of workItems) {
    ws[`A${row}`] = { t: 'n', v: wi.ordinal || '' };
    ws[`B${row}`] = { t: 's', v: wi.name_vi || '' };
    ws[`C${row}`] = { t: 's', v: wi.blocker_notes || '' };
    row++;
  }

  // Add sheet
  wb.Sheets['DailyReport'] = ws;
  wb.SheetNames.push('DailyReport');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export async function exportConstructionSchedule(projectId) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  const items = db.prepare(`
    SELECT csi.*, z.code AS zone_code, z.name_vi AS zone_name
    FROM construction_schedule_items csi
    JOIN zones z ON z.id = csi.zone_id
    WHERE csi.project_id = ?
    ORDER BY z.code, csi.level_arabic, csi.level_roman, csi.ordinal
  `).all(projectId);

  // Group by zone
  const wb = XLSX.utils.book_new();
  const groupedByZone = {};
  for (const item of items) {
    if (!groupedByZone[item.zone_code]) groupedByZone[item.zone_code] = [];
    groupedByZone[item.zone_code].push(item);
  }

  // One sheet per zone
  for (const [zoneCode, zoneItems] of Object.entries(groupedByZone)) {
    const data = zoneItems.map((it, i) => ({
      'STT': i + 1,
      'Level (Roman)': it.level_roman || '',
      'Level (Arabic)': it.level_arabic || '',
      'Sublevel': it.sublevel || '',
      'Tên / Name': it.name_vi || '',
      'Tiến độ %': it.progress_pct ? (it.progress_pct * 100).toFixed(0) : '',
      'Trạng thái': it.status || '',
      'Ngày bắt đầu KH': it.plan_start_date || '',
      'Ngày bắt đầu TT': it.actual_start_date || '',
      'Ngày kết thúc KH': it.plan_end_date || '',
      'Ngày kết thúc TT': it.actual_end_date || '',
      'Số ngày KH': it.plan_duration_days || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, zoneCode.slice(0, 30));
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export async function exportShopDrawings(projectId) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  const items = db.prepare(`
    SELECT sd.*, z.code AS zone_code
    FROM shop_drawings sd
    JOIN zones z ON z.id = sd.zone_id
    WHERE sd.project_id = ?
    ORDER BY z.code, sd.drawing_code
  `).all(projectId);

  const groupedByZone = {};
  for (const item of items) {
    if (!groupedByZone[item.zone_code]) groupedByZone[item.zone_code] = [];
    groupedByZone[item.zone_code].push(item);
  }

  const wb = XLSX.utils.book_new();
  for (const [zoneCode, zoneItems] of Object.entries(groupedByZone)) {
    const data = zoneItems.map((it, i) => ({
      'STT': i + 1,
      'Mã bản vẽ / Code': it.drawing_code || '',
      'Tên / Name': it.name_vi || '',
      'Tiến độ %': it.progress_pct ? (it.progress_pct * 100).toFixed(0) : '',
      'Lần 1 - Phản hồi': it.bql_l1_response || '',
      'Lần 1 - Ngày': it.bql_l1_date || '',
      'Lần 2 - Phản hồi': it.bql_l2_response || '',
      'Lần 2 - Ngày': it.bql_l2_date || '',
      'Ngày phê duyệt': it.approval_date || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, zoneCode.slice(0, 30));
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
