// DailyReportForm — Tạo daily report + thêm manpower + upload photos
// Decision 2026-09-05 (sếp): ảnh đính kèm OK
// Mount: sử dụng trong FieldHome hoặc DailyProgress

import { useState, useEffect, useRef } from 'react';
import { projects, daily } from '../api/index.js';
import ProjectPicker from './ProjectPicker.jsx';
import { toast } from './Toast.jsx';
import { t, useLang } from '../i18n/index.js';
import { formatApiDay, todayLocal } from '../utils/datetime.js';

export default function DailyReportForm({ onSaved }) {
  useLang(); // form điền hằng ngày — đổi [VI|EN] phải thấy ngay
  const [, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [reportDate, setReportDate] = useState(todayLocal());
  const [weather, setWeather] = useState('');
  const [note, setNote] = useState('');
  const [currentReport, setCurrentReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [photosError, setPhotosError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  // P2-11: photo object URLs + their 10-min revoke timers. Previously
  // fire-and-forget: switching reports leaked both the URLs (until the timer
  // fired) and the timers themselves on unmount. Tracked here, revoked and
  // cleared on report change / unmount.
  const photoTimers = useRef([]);
  const photoUrls = useRef([]);
  const clearPhotoTimers = () => { photoTimers.current.forEach(clearTimeout); photoTimers.current = []; };
  const revokeAllPhotos = () => {
    clearPhotoTimers();
    photoUrls.current.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
    photoUrls.current = [];
  };
  useEffect(() => () => revokeAllPhotos(), []);

  useEffect(() => {
    projects.list().then(setAllProjects).catch(() => setAllProjects([]));
  }, []);

  useEffect(() => {
    let live = true;
    if (!selectedProject) {
      setCurrentReport(null);
      return () => { live = false; };
    }
    setLoadingReport(true);
    daily.ensureToday(selectedProject)
      .then((report) => { if (live) setCurrentReport(report); })
      .catch((error) => { if (live) toast.error(t('dr.err_load_today') + error.message); })
      .finally(() => { if (live) setLoadingReport(false); });
    return () => { live = false; };
  }, [selectedProject]);

  // Mọi lời gọi ở đây từng không có `try/catch`. Hậu quả đo được từng điểm:
  //  • `createReport` hỏng ⇒ **không có gì xảy ra**: không toast, không lỗi, biểu mẫu
  //    đứng nguyên, người dùng bấm lại.
  //  • `addManpower` hỏng ⇒ `prompt()` **đã nuốt mất** số người vừa gõ, và không có
  //    thông báo nào.
  //  • `loadPhotos` hỏng trong `useEffect` ⇒ `setPhotos` không chạy ⇒ dải ảnh trống
  //    và người dùng đọc là "báo cáo này không có ảnh", trong khi sự thật là không
  //    hỏi được.
  // Phần effect còn lại của file đã có `live` + `.catch` + `.finally` — nên đây là
  // sót, không phải lựa chọn thiết kế.
  async function createReport() {
    if (!selectedProject) { toast.error(t('dr.pick_project')); return; }
    try {
      const r = await daily.create(selectedProject, { report_date: reportDate, weather, note });
      setCurrentReport(r);
      if (onSaved) onSaved(r);
    } catch {
      toast.error(t('dr.create_failed'));
    }
  }

  async function addManpower() {
    if (!currentReport) { toast.error(t('dr.create_first')); return; }
    const role_code = prompt(t('dr.role_code_ph'));
    if (!role_code) return;
    const role_name_vi = prompt(t('dr.role_name_ph'));
    const headcount = parseInt(prompt(t('dr.ask_headcount'), '1')) || 0;
    try {
      await daily.addManpower(currentReport.id, { role_code, role_name_vi, headcount });
      toast.success(t('dr.toast_added_manpower'));
    } catch {
      toast.error(t('dr.add_manpower_failed', { role: role_code, count: headcount }));
    }
  }

  async function loadPhotos() {
    if (!currentReport) return;
    let list;
    try {
      list = await daily.listPhotos(currentReport.id);
    } catch {
      // Không set ảnh rỗng: để màn hiện lỗi thay vì "không có ảnh".
      setPhotosError(true);
      return;
    }
    // thumbnails via authenticated blob fetch (no public /uploads route exists)
    const withUrls = await Promise.all((Array.isArray(list) ? list : []).map(async (p) => {
      try { return { ...p, url: await daily.photoBlob(p.id) }; }
      catch { return { ...p, url: null }; }
    }));
    // Revoke the previous report's URLs now (not in 10 min) and drop their timers.
    revokeAllPhotos();
    setPhotosError(false);
    setPhotos(withUrls);
    withUrls.forEach(p => {
      if (p.url) {
        photoUrls.current.push(p.url);
        photoTimers.current.push(setTimeout(() => URL.revokeObjectURL(p.url), 10 * 60 * 1000));
      }
    });
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
      toast.success(`Đã tải ${result.count} ảnh`);
      await loadPhotos();
    } catch (err) {
      toast.error(t('dr.err_upload') + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="daily-report-form">
      <h3>{t('dr.h1')}</h3>

      {loadingReport ? <div className="form-step">{t('dr.busy_loading_today')}</div> : !currentReport ? (
        <div className="form-step">
          <label>{t('dr.lbl_project')}</label>
          <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder={t('dr.pick_project_ph')} />

          <label>{t('dr.lbl_date')}</label>
          <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} />

          <label>{t('dr.lbl_weather')}</label>
          <input value={weather} onChange={e => setWeather(e.target.value)} placeholder={t('dr.weather_ph')} />

          <label>{t('dr.lbl_note')}</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} />

          <button type="button" onClick={createReport} className="btn-primary">{t('dr.btn_create')}</button>
        </div>
      ) : (
        <div className="form-step">
          <div className="report-info">
            <strong>Report #{currentReport.id}</strong> — {formatApiDay(currentReport.report_date)}
            <button type="button" onClick={() => setCurrentReport(null)} className="btn-link">{t('dr.btn_create_new')}</button>
          </div>

          <div className="section">
            <h4>{t('g.manpower')}</h4>
            <button type="button" onClick={addManpower} className="btn-secondary">{t('dr.btn_add_people')}</button>
          </div>

          <div className="section">
            <h4>{t('dr.lbl_photos')}</h4>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              disabled={uploading}
            />
            {uploading && <span>{t('dr.busy_uploading')}</span>}
            {photosError && <div className="empty" style={{ fontSize: 12 }}>{t('dr.photos_failed')}</div>}
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
