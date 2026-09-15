// OTDPage — hiển thị chỉ số OTD (On-Time Delivery) theo dự án
// Decision 2026-09-05: OTD threshold = bám sát kế hoạch (actual_end ≤ planned_end + grace_days)

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { projects, otd, preferDemoProject } from '../api/index.js';
import ProjectPicker from '../components/ProjectPicker.jsx';
import { ICON } from '../icons.jsx';

export default function OTDPage() {
  const [params] = useSearchParams();
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(params.get('project'));
  const [data, setData] = useState(null);
  const [graceDays, setGraceDays] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      if (!selectedProject) setSelectedProject(preferDemoProject(list));
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    otd.get(selectedProject, { grace_days: graceDays })
      .then(setData)
      .catch(e => alert(e.message))
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
      <p className="muted">Tỷ lệ công việc hoàn thành đúng hạn theo kế hoạch</p>

      <div className="otd-filters">
        <label>Dự án</label>
        <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder="Chọn dự án..." />

        <label>Grace days (cho phép trễ tối đa)</label>
        <input
          type="number"
          min="0"
          max="30"
          value={graceDays}
          onChange={e => setGraceDays(Number(e.target.value) || 0)}
          style={{ width: 80 }}
        />
      </div>

      {loading && <p>Đang tải...</p>}

      {data && (
        <div>
          <div className="otd-summary" style={{ borderColor: getColor(data.otd_pct) }}>
            <div className="otd-pct" style={{ color: getColor(data.otd_pct) }}>
              {data.otd_pct}%
            </div>
            <div className="otd-detail">
              <div><strong>{data.on_time}</strong> / {data.total} đúng hạn</div>
              <div className="muted">From {data.from} → {data.to}</div>
              {data.late > 0 && <div style={{ color: '#ef4444' }}>{data.late} trễ hạn</div>}
            </div>
          </div>

          {data.by_zone?.length > 0 && (
            <div className="otd-section">
              <h3>Theo Zone</h3>
              <table className="otd-table">
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th>Total</th>
                    <th>On-time</th>
                    <th>OTD %</th>
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
              <h3>Xu hướng 6 tháng gần đây</h3>
              <table className="otd-table">
                <thead>
                  <tr>
                    <th>Tháng</th>
                    <th>Total</th>
                    <th>On-time</th>
                    <th>OTD %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trend.map(t => (
                    <tr key={t.month}>
                      <td>{new Date(t.month).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit' })}</td>
                      <td>{t.total}</td>
                      <td>{t.on_time}</td>
                      <td style={{ color: getColor(t.otd_pct), fontWeight: 600 }}>{t.otd_pct}%</td>
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
