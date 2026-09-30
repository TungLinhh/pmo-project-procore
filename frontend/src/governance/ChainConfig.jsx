// ChainConfig — cấu hình chain duyệt theo bộ phận + gán dept cho users.
// Chains: 1 row per (department|default, resource_type). Xóa = về legacy.
import { useEffect, useState } from 'react';
import { request } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { ICON } from '../icons.jsx';
import { t, th, useLang } from '../i18n/index.js';

const RESOURCES = ['shop_drawing', 'material_submittal'];
const ROLES = ['PM', 'PMO', 'SITE', 'PROCUREMENT', 'ACCOUNTING', 'ADMIN', 'CEO'];
const api = request;

export default function ChainConfig() {
  useLang(); // re-render table headers on VI/EN toggle
  const confirm = useConfirm();
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
    } catch (e) { toast.error(t('cc.err_load') + e.message); }
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
      toast.success(t('cc.toast_saved'));
      load();
    } catch (e) { toast.error(t('cc.err_generic') + e.message); } finally { setBusy(false); }
  }

  async function remove(id) {
    const ok = await confirm({
      title: t('cc.confirm_delete_title'),
      message: t('cc.confirm_delete_msg'),
      confirmText: t('cc.btn_delete'), confirmStyle: 'danger',
    });
    if (!ok) return;
    try { await api('/approval-chains/' + id, { method: 'DELETE' }); toast.success(t('cc.toast_deleted')); load(); }
    catch (e) { toast.error(t('cc.err_generic') + e.message); }
  }

  async function setUserDept(userId, departmentId) {
    try {
      await api('/admin/users/' + userId, {
        method: 'PATCH',
        body: JSON.stringify({ department_id: departmentId ? Number(departmentId) : null }),
      });
      setUsers(us => us.map(u => (u.id === userId ? { ...u, department_id: departmentId ? Number(departmentId) : null } : u)));
    } catch (e) { toast.error(t('cc.err_generic') + e.message); }
  }

  // Department tree (Wave D2): depth from parent_id map, cycle-guarded locally.
  const deptDepth = (() => {
    const byId = new Map(departments.map(d => [d.id, d]));
    const memo = new Map();
    const depth = (id, seen = new Set()) => {
      if (id == null || seen.has(id)) return 0;
      if (memo.has(id)) return memo.get(id);
      seen.add(id);
      const d = 1 + depth(byId.get(id)?.parent_id ?? null, seen);
      memo.set(id, d);
      return d;
    };
    return new Map(departments.map(d => [d.id, depth(d.id)]));
  })();
  const deptLabel = (d) => `${'— '.repeat(Math.max(0, (deptDepth.get(d.id) || 1) - 1))}${d.code} · ${d.name_vi}`;

  async function setDeptParent(deptId, parentId) {
    try {
      await api('/master-data/departments/' + deptId, {
        method: 'PATCH',
        body: JSON.stringify({ parent_id: parentId ? Number(parentId) : null }),
      });
      toast.success(t('cc.toast_updated'));
      load();
    } catch (e) { toast.error(t('cc.err_generic') + e.message); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('cc.h1')}</h1>
          <div className="meta">{t('cc.subtitle')}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: 13, margin: '0 0 10px' }}>{t('cc.sec_chains')}</h2>
        {chains.length === 0 ? <div className="empty">{t('cc.empty_chains')}</div> : (
          <table>
            <thead><tr><th>{th("Tài nguyên")}</th><th>{th("Bộ phận")}</th><th>{th("Cấp")}</th><th></th></tr></thead>
            <tbody>
              {chains.map(c => (
                <tr key={c.id}>
                  <td><code>{c.resource_type}</code></td>
                  <td>{c.department_code ? `${c.department_code} · ${c.department_name}` : <i>default</i>}</td>
                  <td>{(c.levels || []).map(l => `L${l.level}:${l.role}`).join(' → ')}</td>
                  <td><button className="btn btn-secondary" onClick={() => remove(c.id)}>{t('cc.btn_delete')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: 13, margin: '0 0 10px' }}>{t('cc.btn_add_chain')}</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <label>
            <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('g.resource')}</div>
            <select value={form.resource_type} onChange={e => setForm({ ...form, resource_type: e.target.value })}>
              {RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label>
            <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('cc.lbl_dept')}</div>
            <select value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
              <option value="">{t('cc.lbl_default_tenant')}</option>
              {departments.map(d => <option key={d.id} value={d.id}>{deptLabel(d)}</option>)}
            </select>
          </label>
        </div>
        {form.levels.map((lv, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <b style={{ width: 28 }}>L{i + 1}</b>
            <select value={lv.role} onChange={e => setLevel(i, 'role', e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input placeholder={t('cc.lbl_step_label')} value={lv.label} onChange={e => setLevel(i, 'label', e.target.value)} style={{ flex: 1 }} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn btn-secondary" onClick={addLevel} disabled={form.levels.length >= 5}>+ Level</button>
          <button className="btn btn-secondary" onClick={dropLevel} disabled={form.levels.length <= 1}>− Level</button>
          <button className="btn" onClick={save} disabled={busy}><ICON.check size={12} />{busy ? '...' : t('cc.btn_save_chain')}</button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: 13, margin: '0 0 10px' }}>{t('cc.sec_tree')}</h2>
        {departments.length === 0 ? <div className="empty">{t('cc.empty_depts')}</div> : (
          <table>
            <thead><tr><th>{th("Bộ phận")}</th><th>{th("Thuộc")}</th></tr></thead>
            <tbody>
              {departments.map(d => (
                <tr key={d.id}>
                  <td>{deptLabel(d)}</td>
                  <td>
                    <select value={d.parent_id || ''} onChange={e => setDeptParent(d.id, e.target.value)}>
                      <option value="">{t('cc.t_root')}</option>
                      {departments.filter(x => x.id !== d.id).map(x => <option key={x.id} value={x.id}>{x.code}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 13, margin: '0 0 10px' }}>{t('cc.sec_assign')}</h2>
        {users.length === 0 ? <div className="empty">{t('cc.admin_only')}</div> : (
          <table>
            <thead><tr><th>{th("Người dùng")}</th><th>{th("Vai trò")}</th><th>{th("Bộ phận")}</th></tr></thead>
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
