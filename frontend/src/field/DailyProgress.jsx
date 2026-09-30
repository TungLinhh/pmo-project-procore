// Field Daily Progress entry (mục 11)
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects, construction, getToken } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';
import { t, useLang } from '../i18n/index.js';
import ProjectPicker from '../components/ProjectPicker.jsx';
import { enqueue, wireAutoFlush } from './outbox.js';

export default function DailyProgress() {
  useLang(); // đổi [VI|EN] phải thấy ngay khi đang mở
  const nav = useNavigate();
  const [, setAllProjects] = useState([]);
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
    }).catch((e) => toast.error(t('dp.err_projects') + e.message));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setSelectedItem(null);
    setProgress(0);
    setNotes('');
    construction.schedule(selectedProject).then(items => {
      const zs = Array.from(new Set(items.map(i => i.zone_code))).sort();
      setZones(zs);
      setItems(items);
    }).catch((e) => toast.error(t('dp.err_items') + e.message));
  }, [selectedProject]);

  const itemsForZone = items.filter(i => i.zone_code === zone);

  async function save() {
    if (!selectedItem) return;
    setSaving(true);
    // Send the raw 0-100 percentage and let the server normalise. Sending
    // pct/100 here AND dividing again server-side stored 150% as 1.5%.
    try {
      await construction.updateProgress(selectedProject, selectedItem, {
        progress_pct: Number(progress),
      });
      toast.success(`Đã lưu tiến độ: ${progress}%`);
      nav('/field/home');
    } catch (e) {
      // Offline (or flaky site network): queue progress locally, flush on reconnect.
      const offline = e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(e.message || '');
      if (offline) {
        enqueue({
          resource_type: 'construction_schedule_item',
          server_record_id: Number(selectedItem),
          resource_json: { progress_pct: Number(progress) },
        }, getToken);
        toast.success(`Đã lưu offline ${progress}% — sẽ gửi khi có mạng (xem /field/sync)`);
        nav('/field/home');
      } else {
        toast.error(t('dp.err_generic') + e.message);
      }
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="field-card">
        <h2>{t('dp.btn_new')}</h2>

        <label className="field-label">{t('dp.lbl_project')}</label>
        <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder={t('dp.pick_project_ph')} />

        <label className="field-label">{t('g.zone')}</label>
        <select className="field-input" value={zone} onChange={e => setZone(e.target.value)}>
          <option value="">{t('dp.pick_zone')}</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>

        {zone && (
          <>
            <label className="field-label">{t('dp.lbl_zone')}</label>
            <select className="field-input" value={selectedItem || ''} onChange={e => {
              const id = e.target.value;
              setSelectedItem(id);
              const item = itemsForZone.find((row) => String(row.id) === String(id));
              setProgress(Math.round(Number(item?.progress_pct || 0) * 100));
              setNotes(item?.notes || '');
            }}>
              <option value="">{t('dp.pick_item')}</option>
              {itemsForZone.slice(0, 100).map(i => <option key={i.id} value={i.id}>{i.name_vi || '—'}</option>)}
            </select>

            <label className="field-label">{t('dp.lbl_progress')}</label>
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

            <label className="field-label">{t('dp.lbl_note')}</label>
            <textarea
              className="field-input"
              style={{ minHeight: 80, fontSize: 14 }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t('dp.note_ph')}
            />
          </>
        )}

        <div style={{ marginTop: 16 }}>
          <button className="field-button" disabled={!selectedItem || saving} onClick={save}>
            <ICON.arrow size={14} /> {saving ? t('dp.busy_saving') : t('dp.btn_save')}
          </button>
          <div className="meta" style={{ marginTop: 6, textAlign: 'center' }}>{t('dp.note_inline')}</div>
        </div>
      </div>
    </div>
  );
}
