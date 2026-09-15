// UI-018: Master Data Edit — minimal create form per resource.
// Field map mirrors the real table columns (see information_schema).
import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { masterData } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';

const FIELDS = {
  vendors: [['code', 'Mã'], ['name', 'Tên *'], ['tax_id', 'MST'], ['contact', 'Liên hệ'], ['category', 'Nhóm']],
  subcontractors: [['name', 'Tên *'], ['capability_summary', 'Năng lực']],
  suppliers: [['name', 'Tên *'], ['system', 'Hệ'], ['category', 'Nhóm'], ['contact', 'Liên hệ'], ['location', 'Địa điểm']],
  workers: [['code', 'Mã'], ['full_name', 'Họ tên *'], ['phone', 'SĐT'], ['role', 'Vai trò']],
  teams: [['code', 'Mã'], ['name', 'Tên *']],
  departments: [['code', 'Mã *'], ['name_vi', 'Tên bộ phận *']],
};

export default function MasterDataEdit() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const resource = params.get('r') || 'subcontractors';
  const fields = FIELDS[resource] || [['name', 'Tên *']];
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const body = { tenant_id: 1 };
    for (const [k] of fields) if ((form[k] || '').trim()) body[k] = form[k].trim();
    if (!body.name && !body.full_name && !body.code) { toast.error('Nhập ít nhất tên/mã'); return; }
    setBusy(true);
    try {
      const r = await masterData.create(resource, body);
      toast.success(`Đã tạo #${r.id}`);
      nav(-1);
    } catch (e) { toast.error('Lỗi: ' + e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Thêm · {resource}</h1>
          <div className="meta">Tạo master data record mới</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={() => nav(-1)}>Hủy</button>
          <button className="btn" onClick={save} disabled={busy}><ICON.check size={13} />{busy ? '...' : 'Lưu'}</button>
        </div>
      </div>
      <div className="card" style={{ padding: 20, maxWidth: 560, display: 'grid', gap: 10 }}>
        {fields.map(([k, label]) => (
          <label key={k}>
            <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{label}</div>
            <input value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} style={{ width: '100%', padding: 6 }} />
          </label>
        ))}
      </div>
    </div>
  );
}
