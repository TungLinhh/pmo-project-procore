// OTDPage — hiển thị chỉ số OTD (On-Time Delivery) theo dự án
// Decision 2026-09-05: OTD threshold = bám sát kế hoạch (actual_end ≤ planned_end + grace_days)

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { projects, otd, preferDemoProject } from '../api/index.js';
import ProjectPicker from '../components/ProjectPicker.jsx';
import { toast } from '../components/Toast.jsx';
import { t, th, useLang } from '../i18n/index.js';

export default function OTDPage() {
  useLang(); // re-render table headers on VI/EN toggle
  const [params] = useSearchParams();
  const [, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(params.get('project'));
  const [data, setData] = useState(null);
  const [graceDays, setGraceDays] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      if (!selectedProject) setSelectedProject(preferDemoProject(list));
    }).catch((e) => toast.error(t('otd.err_projects') + e.message));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    otd.get(selectedProject, { grace_days: graceDays })
      .then(setData)
      .catch((e) => { toast.error(t('otd.err_load') + e.message); setData(null); })
      .finally(() => setLoading(false));
  }, [selectedProject, graceDays]);

  function getColor(pct) {
    if (pct >= 90) return '#22c55e';
    if (pct >= 70) return '#facc15';
    return '#ef4444';
  }

  return (
    <div>
      <h2>OTD — On-Time Delivery</h2>
      <p className="muted">{t('otd.subtitle')}</p>

      <div className="otd-filters">
        <label>{t('otd.lbl_project')}</label>
        <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder={t('otd.pick_project_ph')} />

        <label>{t('otd.lbl_grace')}</label>
        <input
          type="number"
          min="0"
          max="30"
          value={graceDays}
          onChange={e => setGraceDays(Number(e.target.value) || 0)}
          style={{ width: 80 }}
        />
      </div>

      {loading && <p>{t('otd.busy_loading')}</p>}

      {data && (
        <div>
          <div className="otd-summary" style={{ borderColor: getColor(data.otd_pct) }}>
            <div className="otd-pct" style={{ color: getColor(data.otd_pct) }}>
              {data.otd_pct}%
            </div>
            <div className="otd-detail">
              <div><strong>{data.on_time}</strong> / {data.total} đúng hạn</div>
              <div className="muted">{t('g.from')} {data.from} → {data.to}</div>
              {data.late > 0 && <div style={{ color: '#ef4444' }}>{data.late} trễ hạn</div>}
            </div>
          </div>

          {data.by_zone?.length > 0 && (
            <div className="otd-section">
              <h3>{t('otd.by_zone')}</h3>
              <table className="otd-table">
                <thead>
                  <tr>
                    <th>{th("Khu vực")}</th>
                    <th>{th("Tổng")}</th>
                    <th>{th("Đúng hạn")}</th>
                    <th>{th("OTD %")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_zone.map(z => (
                    <tr key={z.zone_id ?? 'null'}>
                      <td>{z.zone_code || '(no zone)'}</td>
                      <td>{z.total}</td>
                      <td>{z.on_time}</td>
                      <td style={{ color: getColor(z.otd_pct), fontWeight: 600 }}>{z.otd_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.trend?.length > 0 && (
            <div className="otd-section">
              <h3>{t('otd.sec_trend')}</h3>
              <table className="otd-table">
                <thead>
                  <tr>
                    <th>{th("Tháng")}</th>
                    <th>{th("Tổng")}</th>
                    <th>{th("Đúng hạn")}</th>
                    <th>{th("OTD %")}</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Tham số không tên `t` — xem scripts/check-i18n-shadow.mjs */}
                  {data.trend.map((row) => (
                    <tr key={row.month}>
                      <td>{new Date(row.month).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit' })}</td>
                      <td>{row.total}</td>
                      <td>{row.on_time}</td>
                      <td style={{ color: getColor(row.otd_pct), fontWeight: 600 }}>{row.otd_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
