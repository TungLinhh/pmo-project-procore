// HolidaysPanel — site_holidays CRUD (P1: API shipped in v0.6.1, no UI at all).
// Tenant-global calendar (global VN rows are read-only seed data).
// Mounted as the 'holidays' tab inside MasterDataList.
import { useEffect, useState } from 'react';
import { request } from '../api/index.js';
import { toast } from './Toast.jsx';
import { ICON } from '../icons.jsx';
import { useConfirm } from './Confirm.jsx';
import { t, th, useLang } from '../i18n/index.js';

export default function HolidaysPanel() {
  useLang(); // re-render table headers on VI/EN toggle
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await request('/holidays');
      setItems(Array.isArray(d) ? d : []);
    } catch { setItems([]); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast.error(t('hol.date_ph')); return; }
    if (!name.trim()) { toast.error(t('hol.name_ph2')); return; }
    setBusy(true);
    try {
      await request('/holidays', { method: 'POST', body: { holiday_date: date, name: name.trim() } });
      toast.success(`Đã thêm ngày nghỉ ${date}`);
      setDate(''); setName('');
      load();
    } catch (e) { toast.error(t('hol.err_add') + e.message); } finally { setBusy(false); }
  }

  async function remove(id, label) {
    const ok = await confirm({ title: t('hol.confirm_delete'), message: `Xóa "${label}"?`, confirmText: t('hol.btn_delete'), confirmStyle: 'danger' });
    if (!ok) return;
    setBusy(true);
    try {
      await request(`/holidays/${id}`, { method: 'DELETE' });
      toast.success(t('hol.toast_deleted'));
      setItems(items.filter(h => h.id !== id));
    } catch (e) { toast.error(t('hol.err_delete') + e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: 6 }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('hol.name_ph')} style={{ flex: 1, minWidth: 200, padding: 6 }} />
        <button className="btn" onClick={create} disabled={busy}><ICON.plus size={13} />{t('hol.btn_add')}</button>
        <button className="btn btn-secondary" onClick={load}><ICON.refresh size={12} />{t('g.refresh')}</button>
      </div>
      <div className="data-table"><div className="data-table-body">
        {loading ? <div className="empty">{t('g.loading')}</div> :
         items.length === 0 ? <div className="empty">{t('hol.empty')}</div> :
        <table>
          <thead><tr><th>{th("Ngày")}</th><th>{th("Tên")}</th><th>{th("Phạm vi")}</th><th></th></tr></thead>
          <tbody>
            {items.map(h => (
              <tr key={h.id}>
                <td><code>{String(h.holiday_date).slice(0, 10)}</code></td>
                <td>{h.name}</td>
                <td><span className="badge">{h.scope}</span></td>
                <td>{h.scope === 'tenant' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => remove(h.id, h.name)} disabled={busy}>×</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>}
      </div></div>
      <p className="empty" style={{ marginTop: 12, fontSize: 11 }}>{t('hol.global_readonly2')}</p>
    </div>
  );
}
