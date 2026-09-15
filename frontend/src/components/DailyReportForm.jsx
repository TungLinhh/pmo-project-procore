// DailyReportForm — Tạo daily report + thêm manpower + upload photos
// Decision 2026-09-05 (sếp): ảnh đính kèm OK
// Mount: sử dụng trong FieldHome hoặc DailyProgress

import { useState, useEffect, useRef } from 'react';
import { projects, daily } from '../api/index.js';
import ProjectPicker from './ProjectPicker.jsx';
import { ICON } from '../icons.jsx';

export default function DailyReportForm({ onSaved }) {
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [weather, setWeather] = useState('');
  const [note, setNote] = useState('');
  const [currentReport, setCurrentReport] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [manpower, setManpower] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    projects.list().then(setAllProjects);
  }, []);

  async function createReport() {
    if (!selectedProject) return alert('Chọn dự án');
    const r = await daily.create(selectedProject, { report_date: reportDate, weather, note });
    setCurrentReport(r);
    if (onSaved) onSaved(r);
  }

  async function addManpower() {
    if (!currentReport) return alert('Tạo báo cáo trước');
    const role_code = prompt('Mã vai trò (VD: tho, mason, electrician)');
    if (!role_code) return;
    const role_name_vi = prompt('Tên vai trò tiếng Việt (VD: Thợ hồ)');
    const headcount = parseInt(prompt('Số người?', '1')) || 0;
    await daily.addManpower(currentReport.id, { role_code, role_name_vi, headcount });
    alert('Đã thêm manpower');
  }

  async function loadPhotos() {
    if (!currentReport) return;
    const list = await daily.listPhotos(currentReport.id);
    // thumbnails via authenticated blob fetch (no public /uploads route exists)
    const withUrls = await Promise.all((Array.isArray(list) ? list : []).map(async (p) => {
      try { return { ...p, url: await daily.photoBlob(p.id) }; }
      catch { return { ...p, url: null }; }
    }));
    withUrls.forEach(p => { if (p.url) setTimeout(() => URL.revokeObjectURL(p.url), 10 * 60 * 1000); });
    setPhotos(withUrls);
  }

  useEffect(() => {
    loadPhotos();
  }, [currentReport?.id]);

  async function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !currentReport) return;
    setUploading(true);
    try {
      const result = await daily.uploadPhotos(currentReport.id, files);
      alert(`Upload ${result.count} ảnh thành công`);
      await loadPhotos();
    } catch (err) {
      alert('Lỗi upload: ' + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="daily-report-form">
      <h3>Báo cáo công trường</h3>

      {!currentReport ? (
        <div className="form-step">
          <label>Dự án</label>
          <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder="Chọn dự án..." />

          <label>Ngày</label>
          <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} />

          <label>Thời tiết (sáng/chiều)</label>
          <input value={weather} onChange={e => setWeather(e.target.value)} placeholder="Nắng, mưa nhẹ, ..." />

          <label>Ghi chú</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} />

          <button type="button" onClick={createReport} className="btn-primary">
            Tạo báo cáo
          </button>
        </div>
      ) : (
        <div className="form-step">
          <div className="report-info">
            <strong>Report #{currentReport.id}</strong> — {currentReport.report_date}
            <button type="button" onClick={() => setCurrentReport(null)} className="btn-link">Tạo mới</button>
          </div>

          <div className="section">
            <h4>Manpower</h4>
            <button type="button" onClick={addManpower} className="btn-secondary">+ Thêm nhân sự</button>
          </div>

          <div className="section">
            <h4>Ảnh đính kèm</h4>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              disabled={uploading}
            />
            {uploading && <span>Đang upload...</span>}
            {photos.length > 0 && (
              <div className="photo-gallery">
                {photos.map(p => (
                  p.url ? (
                    <a
                      key={p.id}
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="photo-thumb"
                    >
                      <img src={p.url} alt={p.file_name} loading="lazy" />
                    </a>
                  ) : (
                    <div key={p.id} className="photo-thumb" style={{ fontSize: 11 }}>{p.file_name}</div>
                  )
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
