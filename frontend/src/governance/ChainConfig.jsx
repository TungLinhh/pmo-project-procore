// ChainConfig — cấu hình chain duyệt theo bộ phận + gán dept cho users.
// Chains: 1 row per (department|default, resource_type). Xóa = về legacy.
import { useEffect, useState } from 'react';
import { getToken } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';

const RESOURCES = ['shop_drawing', 'material_submittal'];
const ROLES = ['PM', 'PMO', 'SITE', 'PROCUREMENT', 'ACCOUNTING', 'ADMIN', 'CEO'];
const api = (path, opts = {}) => fetch('/api' + path, {
  ...opts,
  headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
}).then(async (r) => {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
});

export default function ChainConfig() {
  const [chains, setChains] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ department_id: '', resource_type: 'shop_drawing', levels: [{ level: 1, role: 'PM', label: '' }] });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [c, d, u] = await Promise.all([
        api('/approval-chains'),
        api('/master-data/departments'),
        api('/admin/users').catch(() => []),
      ]);
      setChains(Array.isArray(c) ? c : []);
      setDepartments(Array.isArray(d) ? d : []);
      setUsers(Array.isArray(u) ? u : []);
    } catch (e) { toast.error('Lỗi tải: ' + e.message); }
  }
  useEffect(() => { load(); }, []);

  const setLevel = (i, k, v) => setForm(f => ({
    ...f, levels: f.levels.map((lv, j) => (j === i ? { ...lv, [k]: v } : lv)),
  }));
  const addLevel = () => setForm(f => (f.levels.length >= 5 ? f : {
    ...f, levels: [...f.levels, { level: f.levels.length + 1, role: 'PM', label: '' }],
  }));
  const dropLevel = () => setForm(f => ({ ...f, levels: f.levels.slice(0, -1) }));

  async function save() {
    setBusy(true);
    try {
      const levels = form.levels.map((lv, i) => ({ level: i + 1, role: lv.role, label: lv.label || '' }));
      await api('/approval-chains', {
        method: 'POST',
        body: JSON.stringify({
          department_id: form.department_id ? Number(form.department_id) : null,
          resource_type: form.resource_type, levels,
        }),
      });
      toast.success('Đã lưu chain');
      load();
    } catch (e) { toast.error('Lỗi: ' + e.message); } finally { setBusy(false); }
  }

  async function remove(id) {
    if (!window.confirm('Xóa chain này (về legacy single-step)?')) return;
    try { await api('/approval-chains/' + id, { method: 'DELETE' }); toast.success('Đã xóa'); load(); }
    catch (e) { toast.error('Lỗi: ' + e.message); }
  }

  async function setUserDept(userId, departmentId) {
    try {
      await api('/admin/users/' + userId, {
        method: 'PATCH',
        body: JSON.stringify({ department_id: departmentId ? Number(departmentId) : null }),
      });
      setUsers(us => us.map(u => (u.id === userId ? { ...u, department_id: departmentId ? Number(departmentId) : null } : u)));
    } catch (e) { toast.error('Lỗi: ' + e.message); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Cấu hình duyệt</h1>
          <div className="meta">Chain theo bộ phận · tối đa 5 levels · không chain = duyệt 1 bước</div>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: 13, margin: '0 0 10px' }}>Chains hiện tại</h2>
        {chains.length === 0 ? <div className="empty">Chưa có chain — đang chạy legacy single-step</div> : (
          <table>
            <thead><tr><th>Resource</th><th>Bộ phận</th><th>Levels</th><th></th></tr></thead>
            <tbody>
              {chains.map(c => (
                <tr key={c.id}>
                  <td><code>{c.resource_type}</code></td>
                  <td>{c.department_code ? `${c.department_code} · ${c.department_name}` : <i>default</i>}</td>
                  <td>{(c.levels || []).map(l => `L${l.level}:${l.role}`).join(' → ')}</td>
                  <td><button className="btn btn-secondary" onClick={() => remove(c.id)}>Xóa</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: 13, margin: '0 0 10px' }}>Thêm / sửa chain</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <label>
            <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Resource</div>
            <select value={form.resource_type} onChange={e => setForm({ ...form, resource_type: e.target.value })}>
              {RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label>
            <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Bộ phận (trống = default)</div>
            <select value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
              <option value="">default toàn tenant</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.code} · {d.name_vi}</option>)}
            </select>
          </label>
        </div>
        {form.levels.map((lv, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <b style={{ width: 28 }}>L{i + 1}</b>
            <select value={lv.role} onChange={e => setLevel(i, 'role', e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input placeholder="Nhãn (vd: Trưởng BP)" value={lv.label} onChange={e => setLevel(i, 'label', e.target.value)} style={{ flex: 1 }} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn btn-secondary" onClick={addLevel} disabled={form.levels.length >= 5}>+ Level</button>
          <button className="btn btn-secondary" onClick={dropLevel} disabled={form.levels.length <= 1}>− Level</button>
          <button className="btn" onClick={save} disabled={busy}><ICON.check size={12} />{busy ? '...' : 'Lưu chain'}</button>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 13, margin: '0 0 10px' }}>Gán bộ phận cho users</h2>
        {users.length === 0 ? <div className="empty">Chỉ admin/CEO thấy mục này</div> : (
          <table>
            <thead><tr><th>User</th><th>Role</th><th>Bộ phận</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.name || u.email}<div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{u.email}</div></td>
                  <td><code>{u.is_ceo ? 'CEO' : u.role}</code></td>
                  <td>
                    <select value={u.department_id || ''} onChange={e => setUserDept(u.id, e.target.value)}>
                      <option value="">—</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.code}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
