// Field Daily Progress entry (mục 11)
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects, construction, getToken } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';
import { enqueue, wireAutoFlush } from './outbox.js';

export default function DailyProgress() {
  const nav = useNavigate();
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [zones, setZones] = useState([]);
  const [zone, setZone] = useState('');
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    wireAutoFlush(getToken);
    projects.list().then(list => {
      setAllProjects(list);
      if (list[0]) setSelectedProject(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    construction.schedule(selectedProject).then(items => {
      const zs = Array.from(new Set(items.map(i => i.zone_code))).sort();
      setZones(zs);
      setItems(items);
    });
  }, [selectedProject]);

  const itemsForZone = items.filter(i => i.zone_code === zone);

  async function save(status) {
    if (!selectedItem) return;
    setSaving(true);
    const pct = Number(progress) / 100;
    try {
      await construction.updateProgress(selectedProject, selectedItem, {
        progress_pct: pct,
        note: notes ? `[site ${status}] ${notes}` : `[site ${status}]`,
      });
      toast.success(`Đã ${status}: ${progress}%`);
      nav('/field/home');
    } catch (e) {
      // Offline (or flaky site network): queue progress locally, flush on reconnect.
      // Notes are online-only (not in the sync allowlist) — progress is what matters.
      const offline = e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(e.message || '');
      if (offline) {
        enqueue({
          resource_type: 'construction_schedule_item',
          server_record_id: Number(selectedItem),
          resource_json: { progress_pct: pct },
        });
        toast.success(`Đã lưu offline ${progress}% — sẽ gửi khi có mạng (xem /field/sync)`);
        nav('/field/home');
      } else {
        toast.error('Lỗi: ' + e.message);
      }
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="field-card">
        <h2>New Daily Progress</h2>

        <label className="field-label">Dự án</label>
        <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder="Chọn dự án..." />

        <label className="field-label">Zone</label>
        <select className="field-input" value={zone} onChange={e => setZone(e.target.value)}>
          <option value="">— chọn zone —</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>

        {zone && (
          <>
            <label className="field-label">Hạng mục</label>
            <select className="field-input" value={selectedItem || ''} onChange={e => setSelectedItem(e.target.value)}>
              <option value="">— chọn hạng mục —</option>
              {itemsForZone.slice(0, 100).map(i => <option key={i.id} value={i.id}>{i.name_vi || '—'}</option>)}
            </select>

            <label className="field-label">Tiến độ (%)</label>
            <input
              type="number"
              className="field-input"
              min="0" max="100"
              value={progress}
              onChange={e => setProgress(Number(e.target.value))}
            />
            <div className="cell-bar" style={{ marginTop: 8 }}>
              <div className="bar"><div className="fill" style={{ width: `${progress}%` }} /></div>
              <span style={{ minWidth: 36, textAlign: 'right' }}>{progress}%</span>
            </div>

            <label className="field-label">Ghi chú</label>
            <textarea
              className="field-input"
              style={{ minHeight: 80, fontSize: 14 }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Vướng mắc, lưu ý..."
            />
          </>
        )}

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="field-button secondary" disabled={!selectedItem || saving} onClick={() => save('lưu nháp')}>
            {saving ? 'Đang lưu...' : 'Lưu nháp'}
          </button>
          <button className="field-button" disabled={!selectedItem || saving} onClick={() => save('gửi duyệt')}>
            <ICON.arrow size={14} /> {saving ? 'Đang gửi...' : 'Gửi duyệt (Submit)'}
          </button>
        </div>
      </div>
    </div>
  );
}
