// Field Home (mục 9)
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects, daily } from '../api/index.js';
import { ICON } from '../icons.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';

export default function FieldHome() {
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [recentReports, setRecentReports] = useState([]);
  const nav = useNavigate();

  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      if (list[0]) setSelectedProject(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (selectedProject) {
      daily.reports(selectedProject).then(setRecentReports);
    }
  }, [selectedProject]);

  return (
    <div>
      <div className="field-card">
        <h2>Dự án đang làm</h2>
        <label className="field-label">Project</label>
        <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder="Chọn dự án..." />
      </div>

      <div className="field-card">
        <h2>Tác vụ hôm nay</h2>
        <button className="field-button" onClick={() => nav('/field/daily-progress')}>
          <ICON.edit size={16} /> Daily Progress mới
        </button>
        <button className="field-button secondary" onClick={() => nav('/field/material')}>
          <ICON.materials size={16} /> Material Usage
        </button>
        <button className="field-button secondary" onClick={() => nav('/field/manpower')}>
          <ICON.manpower size={16} /> Manpower
        </button>
        <button className="field-button secondary" onClick={() => nav('/field/issue')}>
          <ICON.camera size={16} /> Issue / Chụp ảnh
        </button>
      </div>

      <div className="field-card">
        <h2>Báo cáo gần đây ({recentReports.length})</h2>
        {recentReports.length === 0 ? (
          <p style={{ color: 'var(--c-text-2)', fontSize: 12, padding: 8 }}>Chưa có báo cáo nào</p>
        ) : (
          <ul className="field-list">
            {recentReports.slice(0, 5).map(r => (
              <li key={r.id} onClick={() => nav(`/field/review/${r.id}`)}>
                <div>
                  <div className="label">Báo cáo ngày {r.report_date}</div>
                  <div className="meta">{r.prepared_by || '—'} · {r.work_items_count} items · {r.manpower_count} manpower</div>
                </div>
                <span className="badge workflow-DRAFT">DRAFT</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button className="field-button secondary" onClick={() => nav('/field/sync')}>
        <ICON.sync size={14} /> Offline / Sync Queue
      </button>
    </div>
  );
}
