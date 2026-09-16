// HolidaysPanel — site_holidays CRUD (P1: API shipped in v0.6.1, no UI at all).
// Tenant-global calendar (global VN rows are read-only seed data).
// Mounted as the 'holidays' tab inside MasterDataList.
import { useEffect, useState } from 'react';
import { getToken } from '../api/index.js';
import { toast } from './Toast.jsx';
import { ICON } from '../icons.jsx';
import { useConfirm } from './Confirm.jsx';

const authH = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

export default function HolidaysPanel() {
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await fetch('/api/holidays', { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json());
      setItems(Array.isArray(d) ? d : []);
    } catch { setItems([]); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast.error('Chọn ngày YYYY-MM-DD'); return; }
    if (!name.trim()) { toast.error('Nhập tên ngày nghỉ'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/holidays', { method: 'POST', headers: authH(), body: JSON.stringify({ holiday_date: date, name: name.trim() }) }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      toast.success(`Đã thêm ngày nghỉ ${date}`);
      setDate(''); setName('');
      load();
    } catch (e) { toast.error('Thêm thất bại: ' + e.message); } finally { setBusy(false); }
  }

  async function remove(id, label) {
    const ok = await confirm({ title: 'Xóa ngày nghỉ', message: `Xóa "${label}"?`, confirmText: 'Xóa', confirmStyle: 'danger' });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/holidays/${id}`, { method: 'DELETE', headers: authH() }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      toast.success('Đã xóa ngày nghỉ');
      setItems(items.filter(h => h.id !== id));
    } catch (e) { toast.error('Xóa thất bại: ' + e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: 6 }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Tên ngày nghỉ (vd: Tết Dương lịch)" style={{ flex: 1, minWidth: 200, padding: 6 }} />
        <button className="btn" onClick={create} disabled={busy}><ICON.plus size={13} />Thêm</button>
        <button className="btn btn-secondary" onClick={load}><ICON.refresh size={12} />Refresh</button>
      </div>
      <div className="data-table"><div className="data-table-body">
        {loading ? <div className="empty">Loading...</div> :
         items.length === 0 ? <div className="empty">Chưa có ngày nghỉ.</div> :
        <table>
          <thead><tr><th>Ngày</th><th>Tên</th><th>Phạm vi</th><th></th></tr></thead>
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
      <p className="empty" style={{ marginTop: 12, fontSize: 11 }}>
        Ngày global (lịch VN) chỉ đọc — do seed quản lý. Ngày tenant tự thêm sẽ tự động gộp vào tính nén tiến độ.
      </p>
    </div>
  );
}
