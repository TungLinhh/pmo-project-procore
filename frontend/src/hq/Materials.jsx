// Material list page (Mục 6.3) — submittal workflow: DRAFT → SUBMITTED → APPROVED/REJECTED (+SLA).
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { projects, getToken, preferDemoProject } from '../api/index.js';
import { ICON } from '../icons.jsx';
import PieChart from '../components/PieChart.jsx';
import PieTooltip from '../components/PieTooltip.jsx';
import { toast } from '../components/Toast.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';

export default function Materials() {
  const [params] = useSearchParams();
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(params.get('project'));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [hovered, setHovered] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ material_code: '', name_vi: '', name_en: '', zone_id: '', progress_pct: 0 });
  const [addBusy, setAddBusy] = useState(false);

  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      if (!selectedProject) setSelectedProject(preferDemoProject(list));
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    fetch(`/api/projects/${selectedProject}/materials`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('pmo_token') || ''}` }
    }).then(r => r.json()).then(setItems).finally(() => setLoading(false));
  }, [selectedProject]);

  const filtered = items.filter(i => JSON.stringify(i).toLowerCase().includes(search.toLowerCase()));

  // Group by name prefix for pie
  const byCat = {};
  items.forEach(m => {
    const name = m.name_vi || m.material_code || 'Other';
    const first = name.split(/\s+/)[0].toUpperCase().slice(0, 16);
    byCat[first] = (byCat[first] || 0) + 1;
  });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const colors = ['#1e3a5f', '#2c5282', '#2563eb', '#7c3aed', '#b45309', '#15803d'];
  const pieData = cats.map(([label, value], i) => ({
    label, value, color: colors[i % colors.length],
    breakdown: [{ k: 'Items', v: value }, { k: 'Tỉ lệ', v: items.length > 0 ? `${Math.round(value / items.length * 100)}%` : '0%' }],
  }));

  const approved = items.filter(m => (m.progress_pct || 0) >= 1).length;
  const approvedPct = items.length > 0 ? Math.round(approved / items.length * 100) : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Materials</h1>
          <div className="meta">{items.length} items · {cats.length} categories</div>
        </div>
        <div className="page-header-right">
          <button className="btn" onClick={() => setShowAddModal(true)}><ICON.plus size={13} />Add material</button>
        </div>
      </div>

      <div className="filter-bar">
        <label>Project</label>
        <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder="Chọn dự án..." />
        <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
      </div>

      <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="kpi-card on-track">
          <div className="label">Total</div>
          <div className="value">{items.length}</div>
          <div className="sub">Tổng vật tư đã đăng ký</div>
        </div>
        <div className="kpi-card on-track">
          <div className="label">Approved ≥ 100%</div>
          <div className="value">{approved}</div>
          <div className="sub">{approvedPct}% đạt chất lượng</div>
        </div>
        <div
          className="kpi-card watch"
          onMouseEnter={() => setHovered('cats')}
          onMouseLeave={() => setHovered(null)}
          style={{ position: 'relative' }}
        >
          <div className="label">By category</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {cats.length > 0 ? (
              <div className="pie-wrap">
                <PieChart data={pieData} size={64} thickness={14} centerText={`${cats.length}`} centerSub="cats" />
                {hovered === 'cats' && <PieTooltip data={pieData} />}
              </div>
            ) : <div style={{ color: 'var(--c-text-3)' }}>—</div>}
            <div style={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>
              {cats.slice(0, 3).map(([k, v], i) => (
                <div key={k}><span style={{ display: 'inline-block', width: 8, height: 8, background: colors[i], marginRight: 4, borderRadius: 2 }} />{k}: {v}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="data-table">
        <div className="data-table-body">
          {loading ? <div className="empty">Loading...</div> :
           filtered.length === 0 ? <div className="empty">Chưa có material. Upload file "MEP [zone].xlsx".</div> :
           <table>
             <thead>
               <tr>
                 <th>Code</th>
                 <th>Name (VI)</th>
                 <th>Name (EN)</th>
                 <th>Zone</th>
                 <th className="num">Progress</th>
               </tr>
             </thead>
             <tbody>
               {filtered.slice(0, 200).map(m => (
                 <tr key={m.id}>
                   <td><code>{m.material_code}</code></td>
                   <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name_vi || '—'}</td>
                   <td style={{ color: 'var(--c-text-2)', fontSize: 12 }}>{m.name_en || '—'}</td>
                   <td>{m.zone_id ? <code>{m.zone_id}</code> : '—'}</td>
                   <td className="num">
                     <div className="cell-bar" style={{ display: 'inline-flex', minWidth: 100 }}>
                       <div className="bar"><div className="fill" style={{ width: `${(m.progress_pct || 0) * 100}%` }} /></div>
                       <span style={{ minWidth: 30 }}>{m.progress_pct ? Math.round(m.progress_pct * 100) : 0}%</span>
                     </div>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
          }
        </div>
      </div>
      {/* Add material modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => !addBusy && setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>Add Material</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              <label style={{ gridColumn: 'span 1' }}>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Mã vật tư *</div>
                <input value={addForm.material_code} onChange={e => setAddForm({...addForm, material_code: e.target.value})} required style={{ width: '100%', padding: 6 }} placeholder="Vd: MEP-PLB-001" />
              </label>
              <label>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Zone ID</div>
                <input type="number" value={addForm.zone_id} onChange={e => setAddForm({...addForm, zone_id: e.target.value})} style={{ width: '100%', padding: 6 }} />
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Tên tiếng Việt</div>
                <input value={addForm.name_vi} onChange={e => setAddForm({...addForm, name_vi: e.target.value})} style={{ width: '100%', padding: 6 }} />
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Tên tiếng Anh</div>
                <input value={addForm.name_en} onChange={e => setAddForm({...addForm, name_en: e.target.value})} style={{ width: '100%', padding: 6 }} />
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Progress (0-100%)</div>
                <input type="number" min="0" max="100" value={addForm.progress_pct} onChange={e => setAddForm({...addForm, progress_pct: e.target.value})} style={{ width: '100%', padding: 6 }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)} disabled={addBusy}>Hủy</button>
              <button className="btn" onClick={async () => {
                if (!addForm.material_code) { toast.error('Mã vật tư bắt buộc'); return; }
                setAddBusy(true);
                try {
                  const r = await fetch(`/api/projects/${selectedProject}/materials`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...addForm, progress_pct: Number(addForm.progress_pct) / 100, zone_id: Number(addForm.zone_id) || null })
                  }).then(r => r.json());
                  if (r.error) throw new Error(r.error);
                  toast.success('Đã thêm material: ' + addForm.material_code);
                  setItems([r, ...items]);
                  setShowAddModal(false);
                  setAddForm({ material_code: '', name_vi: '', name_en: '', zone_id: '', progress_pct: 0 });
                } catch (e) {
                  toast.error('Lỗi: ' + e.message);
                } finally { setAddBusy(false); }
              }} disabled={addBusy}>{addBusy ? '...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
