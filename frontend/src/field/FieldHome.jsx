// Field Home (mục 9)
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects, daily } from '../api/index.js';
import { ICON } from '../icons.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';
import { t, useLang } from '../i18n/index.js';
import { formatApiDay } from '../utils/datetime.js';

export default function FieldHome() {
  useLang(); // trang chủ field — đổi [VI|EN] phải thấy ngay
  const [, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [recentReports, setRecentReports] = useState([]);
  const [error, setError] = useState(null);
  const nav = useNavigate();

  // Both calls were left without .catch, so a network error or an expired
  // session rendered an empty screen and the user read it as "no reports yet".
  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      if (list[0]) setSelectedProject(list[0].id);
    }).catch(e => { setError(e.message); setAllProjects([]); });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    daily.reports(selectedProject).then(setRecentReports)
      .catch(e => { setError(e.message); setRecentReports([]); });
  }, [selectedProject]);

  return (
    <div>
      <div className="field-card">
        <h2>{t('fh.sec_current_project')}</h2>
        <label className="field-label">{t('g.project')}</label>
        <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder={t('fh.pick_project_ph')} />
      </div>

      <div className="field-card">
        <h2>{t('fh.sec_today_tasks')}</h2>
        <button className="field-button" onClick={() => nav('/field/daily-report')}>
          <ICON.edit size={16} />{t('fh.task_daily_report')}</button>
        <button className="field-button" onClick={() => nav('/field/issue')}>
          <ICON.camera size={16} />{t('fh.task_photo_issue')}</button>
        <button className="field-button secondary" onClick={() => nav('/field/daily-progress')}>
          <ICON.progress size={16} />{t('fh.task_progress')}</button>
        <button className="field-button secondary" onClick={() => nav('/field/material')}>
          <ICON.materials size={16} />{t('fh.task_material')}</button>
        <button className="field-button secondary" onClick={() => nav('/field/manpower')}>
          <ICON.manpower size={16} />{t('fh.task_manpower')}</button>
      </div>

      <div className="field-card">
        <h2>{t('fh.recent_reports', { n: recentReports.length })}</h2>
        {recentReports.length === 0 ? (
          <p style={{ color: 'var(--c-text-2)', fontSize: 12, padding: 8 }}>
            {error ? `Không tải được: ${error}` : t('fh.empty_reports')}
          </p>
        ) : (
          <ul className="field-list">
            {recentReports.slice(0, 5).map(r => (
              <li key={r.id} role="button" tabIndex={0}
                onClick={() => nav(`/field/review/${r.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav(`/field/review/${r.id}`); } }}>
                <div>
                  <div className="label">{t('fh.daily_report')} {formatApiDay(r.report_date)}</div>
                  <div className="meta">{r.prepared_by_name || r.prepared_by || '—'} · {r.work_items_count || 0} items · {r.manpower_count || 0} manpower</div>
                </div>
                <span className={`badge workflow-${r.status || 'DRAFT'}`}>{r.status || 'DRAFT'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button className="field-button secondary" onClick={() => nav('/field/sync')}>
        <ICON.sync size={14} /> {t('fld.h2_queue')}
      </button>
    </div>
  );
}
