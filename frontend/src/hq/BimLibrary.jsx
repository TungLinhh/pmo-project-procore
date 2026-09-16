// BIM model library, store-only v1 (Wave 3 C1): upload .ifc, version table
// with parsed storeys/spaces, zone link + suggestions, project quota display.
// No browser viewer in v1 — the viewer column says so honestly.
// Enterprise-only ('bim-library'): backend 403s below Enterprise.
import { useEffect, useState } from 'react';
import { projects, getToken, preferDemoProject } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';

const authH = () => ({ Authorization: `Bearer ${getToken()}` });
const fmtMB = (b) => `${(Number(b) / 1048576).toFixed(1)} MB`;

export default function BimLibrary() {
  const [allowed, setAllowed] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [zoneCode, setZoneCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState({}); // upload_id -> suggestions

  useEffect(() => {
    fetch('/api/me/entitlements', { headers: authH() })
      .then(r => r.json()).then(j => setAllowed(Array.isArray(j?.features) && j.features.includes('bim-library')))
      .catch(() => setAllowed(false));
    projects.list().then(list => {
      setAllProjects(list);
      setSelectedProject(preferDemoProject(list));
    }).catch(() => {});
  }, []);

  async function load(pid) {
    if (!pid) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${pid}/bim-models`, { headers: authH() }).then(r => r.json());
      setModels(Array.isArray(r) ? r : []);
    } catch (e) { toast.error('Lỗi tải thư viện BIM: ' + e.message); } finally { setLoading(false); }
  }
  useEffect(() => { if (allowed) load(selectedProject); }, [allowed, selectedProject]); // eslint-disable-line

  async function upload() {
    if (!file || !selectedProject) { toast.error('Chọn dự án + file .ifc'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (zoneCode.trim()) fd.append('zone_code', zoneCode.trim());
      const r = await fetch(`/api/projects/${selectedProject}/bim/models`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      const meta = typeof r.report_json === 'string' ? JSON.parse(r.report_json) : r.report_json;
      toast.success(`Đã lưu ${r.original_filename} (${(meta?.storeys || []).length} tầng)`);
      setFile(null);
      setZoneCode('');
      load(selectedProject);
    } catch (e) { toast.error('Upload thất bại: ' + e.message); } finally { setBusy(false); }
  }

  async function showSuggestions(m) {
    try {
      const r = await fetch(`/api/bim/models/${m.id}/zone-suggestions`, { headers: authH() }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      setSuggest(prev => ({ ...prev, [m.id]: r.suggestions || [] }));
    } catch (e) { toast.error('Lỗi gợi ý zone: ' + e.message); }
  }

  async function linkZone(m, zid) {
    try {
      const r = await fetch(`/api/bim/models/${m.id}/link-zone`, {
        method: 'POST', headers: { ...authH(), 'Content-Type': 'application/json' }, body: JSON.stringify({ zone_id: zid }),
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      toast.success('Đã gán zone');
      load(selectedProject);
    } catch (e) { toast.error('Gán zone thất bại: ' + e.message); }
  }

  if (allowed === false) {
    return <div><div className="page-header"><h1>Thư viện BIM</h1></div>
      <div className="empty">Thư viện BIM là gói Enterprise. Liên hệ admin để nâng cấp.</div></div>;
  }

  const usedBytes = models.reduce((s, m) => s + Number(m.file_size || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Thư viện BIM</h1>
          <div className="meta">Mô hình IFC theo dự án · store-only v1 (chưa có viewer 3D) · đã dùng {fmtMB(usedBytes)} / 2048 MB</div>
        </div>
        <div className="page-header-right">
          <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder="Chọn dự án..." />
        </div>
      </div>

      <div className="section">
        <div className="section-title"><span>Tải mô hình mới</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="file" accept=".ifc" onChange={e => setFile(e.target.files?.[0] || null)} />
          <input value={zoneCode} onChange={e => setZoneCode(e.target.value)} placeholder="Zone (vd: BOH, để trống = đoán từ tên file)" style={{ padding: 6, width: 280 }} />
          <button className="btn" onClick={upload} disabled={busy || !file}>
            <ICON.upload size={12} />{busy ? 'Đang tải...' : 'Tải lên'}
          </button>
        </div>
      </div>

      <div className="data-table"><div className="data-table-body"><table>
        <thead><tr><th>File</th><th>Zone</th><th className="num">Dung lượng</th><th className="num">Tầng</th><th className="num">Spaces</th><th>Schema</th><th>Tải về</th><th>Viewer 3D</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8}>Loading...</td></tr> :
           models.length === 0 ? <tr><td colSpan={8}>Chưa có mô hình nào. Tải file .ifc lên.</td></tr> :
           models.map(m => {
             const meta = typeof m.report_json === 'string' ? JSON.parse(m.report_json || '{}') : (m.report_json || {});
             return (
               <tr key={m.id}>
                 <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.original_filename}</td>
                 <td><code>{m.zone_code || '—'}</code>{' '}
                   <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => showSuggestions(m)}>Gợi ý</button>
                   {(suggest[m.id] || []).map(s => (
                     <button key={s.zone_id} className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11, marginLeft: 4 }}
                       onClick={() => linkZone(m, s.zone_id)} title={`score ${s.score}`}>{s.zone_code}</button>
                   ))}
                 </td>
                 <td className="num">{fmtMB(m.file_size)}</td>
                 <td className="num" title={(meta.storeys || []).map(s => s.name).join(', ')}>{(meta.storeys || []).length}</td>
                 <td className="num">{meta.space_count ?? '—'}{meta.truncated ? ' (cắt ngắn)' : ''}</td>
                 <td style={{ fontSize: 11 }}>{meta.schema || '—'}</td>
                 <td><a href={`/api/uploads/${m.id}/download`} style={{ fontSize: 12 }}>Tải .ifc</a></td>
                 <td><a href={`/hq/bim/${m.id}`} style={{ fontSize: 12 }}>Mở 3D</a></td>
               </tr>
             );
           })}
        </tbody>
      </table></div></div>
    </div>
  );
}
