// Field stubs cho Material, Manpower, Issue, Review, Sync, WBS
// Updated: gọi API thật cho material_submittals, area_hierarchy, issues (mục 43.4/43.8)
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { projects, issues as issuesApi, materials, daily, preferDemoProject } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';

// ===== Material Usage (mục 43.4) =====
export function FieldMaterial() {
  const [projectList, setProjectList] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code: '', name_vi: '', qty: '' });
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    projects.list().then(l => { setProjectList(Array.isArray(l) ? l : []); setProjectId(preferDemoProject(l)); }).catch(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    materials.list(projectId, 20).then(d => { setItems(Array.isArray(d) ? d.slice(0, 10) : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  async function add() {
    if (!projectId) { toast.error('Chọn dự án trước'); return; }
    if (!form.code.trim()) { toast.error('Nhập mã vật tư'); return; }
    setBusy(true);
    try {
      const r = await materials.createUsage({
        project_id: Number(projectId),
        code: form.code.trim(),
        name_vi: form.name_vi.trim() || form.code.trim(),
        notes: form.qty ? `SL dùng: ${form.qty}` : null,
      });
      setItems([r, ...items].slice(0, 10));
      setForm({ code: '', name_vi: '', qty: '' });
      toast.success('Đã ghi nhận vật tư');
    } catch (e) { toast.error('Lỗi: ' + e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="field-card">
        <h2>Material sử dụng hôm nay</h2>
        <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>Ghi nhận vật tư tại công trường</p>
        <label className="field-label">Dự án</label>
        <select className="field-input" value={projectId || ''} onChange={e => setProjectId(Number(e.target.value))}>
          {projectList.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
        </select>
        <div className="field-stat"><span className="k">Có sẵn trong DB</span><span className="v">{loading ? '...' : items.length} mã</span></div>
        <label className="field-label">Mã vật tư *</label>
        <input className="field-input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="VD: XI-MANG-PCB40" />
        <label className="field-label">Tên vật tư</label>
        <input className="field-input" value={form.name_vi} onChange={e => setForm({ ...form, name_vi: e.target.value })} placeholder="VD: Xi măng PCB40" />
        <label className="field-label">Số lượng dùng</label>
        <input className="field-input" type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="VD: 50" />
        <button className="field-button" style={{ marginTop: 12 }} onClick={add} disabled={busy}>
          <ICON.plus size={14} />{busy ? 'Đang ghi...' : 'Ghi nhận vật tư'}
        </button>
        {!loading && items.length > 0 && (
          <ul className="field-list" style={{ marginTop: 12 }}>
            {items.slice(0, 3).map(m => (
              <li key={m.id}>
                <div>
                  <div className="label">{m.name_vi || m.material_code}</div>
                  <div className="meta">#{m.material_code}{m.notes ? ` · ${m.notes}` : ''}</div>
                </div>
                <span className="v">{m.progress_pct || 0}%</span>
              </li>
            ))}
          </ul>
        )}
        <p className="empty" style={{ marginTop: 16, fontSize: 11 }}>
          Material submittal: tạo qua HQ Procurement. Field chỉ ghi nhận usage hằng ngày.
        </p>
      </div>
    </div>
  );
}

export function FieldManpower() {
  const [projectList, setProjectList] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ role_name: '', headcount: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    projects.list().then(l => { setProjectList(Array.isArray(l) ? l : []); setProjectId(preferDemoProject(l)); }).catch(() => setLoading(false));
  }, []);

  async function reload(pid) {
    setLoading(true);
    try {
      const rep = await daily.ensureToday(pid);
      const full = await daily.get(rep.id);
      setTeams(Array.isArray(full.manpower) ? full.manpower : []);
    } catch { setTeams([]); } finally { setLoading(false); }
  }
  useEffect(() => { if (projectId) reload(projectId); }, [projectId]);

  async function add() {
    if (!projectId) { toast.error('Chọn dự án trước'); return; }
    if (!form.role_name.trim() || !form.headcount) { toast.error('Nhập tổ đội + số người'); return; }
    setBusy(true);
    try {
      const rep = await daily.ensureToday(projectId);
      await daily.addManpower(rep.id, { role_name_vi: form.role_name.trim(), headcount: Number(form.headcount) });
      setForm({ role_name: '', headcount: '' });
      await reload(projectId);
      toast.success('Đã thêm tổ đội');
    } catch (e) { toast.error('Lỗi: ' + e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="field-card">
        <h2>Manpower</h2>
        <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>Số lượng công nhân theo tổ đội (báo cáo hôm nay)</p>
        <label className="field-label">Dự án</label>
        <select className="field-input" value={projectId || ''} onChange={e => setProjectId(Number(e.target.value))}>
          {projectList.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
        </select>
        <div className="field-stat"><span className="k">Tổ đội hôm nay</span><span className="v">{loading ? '...' : teams.length}</span></div>
        <div className="field-stat"><span className="k">Tổng số công nhân</span><span className="v">{teams.reduce((s, t) => s + (Number(t.headcount) || 0), 0)}</span></div>
        <label className="field-label">Tổ đội *</label>
        <input className="field-input" value={form.role_name} onChange={e => setForm({ ...form, role_name: e.target.value })} placeholder="VD: Tổ điện" />
        <label className="field-label">Số người *</label>
        <input className="field-input" type="number" value={form.headcount} onChange={e => setForm({ ...form, headcount: e.target.value })} placeholder="VD: 12" />
        <button className="field-button" style={{ marginTop: 12 }} onClick={add} disabled={busy}>
          <ICON.plus size={14} />{busy ? 'Đang thêm...' : 'Thêm tổ đội'}
        </button>
        {!loading && teams.length > 0 && (
          <ul className="field-list" style={{ marginTop: 12 }}>
            {teams.slice(0, 5).map(t => (
              <li key={t.id}>
                <div>
                  <div className="label">{t.role_name_vi || t.role_code}</div>
                  <div className="meta">{t.notes || ''}</div>
                </div>
                <span className="v">{t.headcount} người</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ===== Issue / Photo (mục 6.5) =====
export function FieldIssue() {
  const [projectList, setProjectList] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [items, setItems] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    projects.list().then(l => { setProjectList(Array.isArray(l) ? l : []); setProjectId(preferDemoProject(l)); }).catch(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    issuesApi.list(projectId).then(d => { setItems(Array.isArray(d) ? d.slice(0, 5) : []); setLoading(false); })
      .catch(() => setLoading(false));
    daily.ensureToday(projectId).then(rep => daily.listPhotos(rep.id)).then(p => setPhotos(Array.isArray(p) ? p : [])).catch(() => setPhotos([]));
  }, [projectId]);

  async function onPhoto(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !projectId) return;
    setUploading(true);
    try {
      const rep = await daily.ensureToday(projectId);
      const r = await daily.uploadPhotos(rep.id, files);
      if (r.error) throw new Error(r.error);
      const list = await daily.listPhotos(rep.id);
      setPhotos(Array.isArray(list) ? list : []);
      toast.success(`Đã upload ${files.length} ảnh vào báo cáo hôm nay`);
    } catch (err) { toast.error('Lỗi: ' + err.message); } finally { setUploading(false); e.target.value = ''; }
  }

  return (
    <div>
      <div className="field-card">
        <h2>Issue / Photo</h2>
        <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>Báo cáo vấn đề kèm ảnh (vào báo cáo ngày hôm nay)</p>
        <label className="field-label">Dự án</label>
        <select className="field-input" value={projectId || ''} onChange={e => setProjectId(Number(e.target.value))}>
          {projectList.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
        </select>
        <div className="field-stat"><span className="k">Issues open</span><span className="v">{loading ? '...' : items.length}</span></div>
        <div className="field-stat"><span className="k">Ảnh hôm nay</span><span className="v">{photos.length}</span></div>
        <label className="field-button" style={{ marginTop: 12, textAlign: 'center', cursor: 'pointer' }}>
          <ICON.camera size={14} />{uploading ? 'Đang upload...' : 'Chụp / chọn ảnh'}
          <input type="file" accept="image/*" multiple capture="environment" onChange={onPhoto} disabled={uploading} style={{ display: 'none' }} />
        </label>
        {photos.length > 0 && (
          <ul className="field-list" style={{ marginTop: 12 }}>
            {photos.slice(0, 5).map(p => (
              <li key={p.id}>
                <div>
                  <div className="label" style={{ fontSize: 11 }}>{p.file_name}</div>
                  <div className="meta">{p.uploaded_at ? String(p.uploaded_at).slice(0, 16) : ''}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!loading && items.length > 0 && (
          <ul className="field-list" style={{ marginTop: 12 }}>
            {items.slice(0, 3).map(it => (
              <li key={it.id}>
                <div>
                  <div className="label">{it.title}</div>
                  <div className="meta">{it.severity} · {it.status}</div>
                </div>
                <span className="badge" style={{ fontSize: 10 }}>{it.severity}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function FieldReview() {
  const { id } = useParams();
  return (
    <div>
      <div className="field-card">
        <h2>Review / Submit #{id}</h2>
        <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>Kiểm tra trước khi gửi</p>
        <div style={{ padding: 12, background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 6, marginBottom: 12 }}>
          <div className="field-stat"><span className="k">Ngày</span><span className="v">{new Date().toLocaleDateString('vi-VN')}</span></div>
          <div className="field-stat"><span className="k">Trạng thái</span><span className="v"><span className="badge workflow-DRAFT">DRAFT</span></span></div>
        </div>
        <button className="field-button"><ICON.arrow size={14} />Gửi duyệt (Submit)</button>
        <button className="field-button secondary"><ICON.edit size={14} />Sửa lại</button>
      </div>
    </div>
  );
}

// ===== Sync Queue (mục 43.7) =====
export function FieldSync() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const token = () => localStorage.getItem('pmo_token');
  const reload = () => {
    fetch('/api/sync/queue', { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);
  async function resolve(id, winner) {
    if (!window.confirm(winner === 'CLIENT' ? 'Ghi đè server bằng bản offline?' : 'Giữ bản server, bỏ bản offline?')) return;
    setBusy(id);
    try {
      const r = await fetch('/api/sync/resolve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue_id: id, winner }),
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      reload();
    } catch (e) { alert('Resolve thất bại: ' + e.message); } finally { setBusy(null); }
  }
  return (
    <div>
      <div className="field-card">
        <h2>Offline / Sync Queue</h2>
        <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>Trạng thái đồng bộ (mục 43.7 - last-write-wins)</p>
        <ul className="field-list">
          <li>
            <div>
              <div className="label">Network</div>
              <div className="meta">Hiện tại</div>
            </div>
            <span className="badge" style={{ background: navigator.onLine ? 'var(--c-on-track-bg)' : 'var(--c-behind-bg)', color: navigator.onLine ? 'var(--c-on-track)' : 'var(--c-behind)' }}>
              {navigator.onLine ? 'ONLINE' : 'OFFLINE'}
            </span>
          </li>
          <li>
            <div>
              <div className="label">Trong queue</div>
              <div className="meta">Items chờ sync</div>
            </div>
            <span className="v">{loading ? '...' : items.length}</span>
          </li>
          <li>
            <div>
              <div className="label">Conflicts (server thắng)</div>
              <div className="meta">Last-write-wins log</div>
            </div>
            <span className="v">{items.filter(i => i.conflict_resolution === 'SERVER_NEWER' || i.conflict_resolution === 'SERVER').length}</span>
          </li>
        </ul>
        {!loading && items.length > 0 && (
          <ul className="field-list" style={{ marginTop: 12 }}>
            {items.slice(0, 10).map(it => (
              <li key={it.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="label" style={{ fontSize: 11 }}>{it.resource_type} #{it.server_record_id || '?'}</div>
                    <div className="meta">{it.conflict_resolution || 'NONE'}</div>
                  </div>
                  <span className="badge" style={{ fontSize: 10 }}>{it.status || 'PENDING'}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="field-button secondary" style={{ fontSize: 11, padding: '6px 8px' }}
                    disabled={busy === it.id} onClick={() => resolve(it.id, 'SERVER')}>
                    Giữ server
                  </button>
                  <button className="field-button" style={{ fontSize: 11, padding: '6px 8px' }}
                    disabled={busy === it.id} onClick={() => resolve(it.id, 'CLIENT')}>
                    Dùng offline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ===== Project / Area hierarchy (mục 43.8) =====
export function ProjectWbsSelection() {
  const [step, setStep] = useState(1);
  const [projectList, setProjectList] = useState([]);
  const [hierarchy, setHierarchy] = useState([]);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    projects.list().then(d => setProjectList(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (step === 2 && selected) {
      fetch(`/api/projects/${selected}/area-hierarchy`, { headers: { Authorization: `Bearer ${localStorage.getItem('pmo_token')}` }})
        .then(r => r.json()).then(d => setHierarchy(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [step, selected]);
  return (
    <div>
      <div className="field-card">
        <h2>Project / Area</h2>
        {step === 1 ? (
          <>
            <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>Bước 1: Chọn dự án ({projectList.length} projects)</p>
            {projectList.map(p => (
              <button key={p.id} className="field-button" onClick={() => { setSelected(p.id); setStep(2); }}>
                {p.code} <span style={{ fontSize: 11, opacity: 0.7 }}>· {p.name_vi || p.name_en}</span>
              </button>
            ))}
            {projectList.length === 0 && <div className="empty">Đang tải...</div>}
          </>
        ) : (
          <>
            <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>
              Bước 2: Chọn khu vực (mục 43.8 - 6 cấp) · {hierarchy.length} nodes
            </p>
            {hierarchy.filter(n => n.level === 'zone').map(z => (
              <button key={z.id} className="field-button secondary" onClick={() => setStep(3)}>
                {z.code} <span style={{ fontSize: 11, opacity: 0.7 }}>· {z.name_vi || ''}</span>
              </button>
            ))}
            {hierarchy.filter(n => n.level === 'zone').length === 0 && <div className="empty">Không có zone nào.</div>}
            <button className="field-button" style={{ marginTop: 12, background: 'var(--c-surface-2)' }} onClick={() => setStep(1)}>
              ← Quay lại
            </button>
            <p className="empty" style={{ marginTop: 16, fontSize: 11 }}>
              Hierarchy hiện có: project + zone. Building/Floor/Area NULL (chưa có data).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
