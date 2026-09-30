// BIM model library (Wave 3 C1): upload .ifc, version table
// with parsed storeys/spaces, zone link + suggestions, project quota display.
// BIM library + lightweight browser viewer.
// Enterprise-only ('bim-library'): backend 403s below Enterprise.
import { useEffect, useState } from 'react';
import { projects, bim, getToken, request, preferDemoProject } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';
import { usePagination } from '../hooks/usePagination.js';
import TablePagination from '../components/TablePagination.jsx';
import { t, th, useLang } from '../i18n/index.js';

const authH = () => ({ Authorization: `Bearer ${getToken()}` });
const fmtMB = (b) => `${(Number(b) / 1048576).toFixed(1)} MB`;

export default function BimLibrary() {
  useLang(); // re-render table headers on VI/EN toggle
  const [allowed, setAllowed] = useState(null);
  const [, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [zoneCode, setZoneCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [suggest, setSuggest] = useState({}); // upload_id -> suggestions
  const [serverTotal, setServerTotal] = useState(null);

  useEffect(() => {
    request('/me/entitlements')
      .then((j) => setAllowed(Array.isArray(j?.features) && j.features.includes('bim-library')))
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
      const { rows, total } = await bim.listPage(pid);
      setModels(rows);
      setServerTotal(total);
    } catch (e) {
      setModels([]);
      setServerTotal(null);
      toast.error(t('bim.err_load') + e.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { if (allowed) load(selectedProject); }, [allowed, selectedProject]); // eslint-disable-line

  const page = usePagination(models);
  const truncated = serverTotal != null && serverTotal > models.length;

  async function upload() {
    if (!file || !selectedProject) { toast.error(t('bim.need_project_file')); return; }
    setBusy(true);
    try {
      const r = await bim.upload(selectedProject, file, zoneCode.trim());
      if (r.error) throw new Error(r.error);
      const meta = typeof r.report_json === 'string' ? JSON.parse(r.report_json) : r.report_json;
      toast.success(`Đã lưu ${r.original_filename} (${(meta?.storeys || []).length} tầng)`);
      setFile(null);
      setZoneCode('');
      load(selectedProject);
    } catch (e) { toast.error(t('bim.err_upload') + e.message); } finally { setBusy(false); }
  }

  async function downloadModel(m) {
    setDownloading(m.id);
    try {
      const r = await fetch(`/api/bim/models/${m.id}/download`, { headers: authH() });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = m.original_filename || `bim-model-${m.id}.ifc`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(t('bim.err_download') + e.message);
    } finally {
      setDownloading(null);
    }
  }

  async function showSuggestions(m) {
    try {
      const r = await bim.suggestions(m.id);
      if (r.error) throw new Error(r.error);
      setSuggest(prev => ({ ...prev, [m.id]: r.suggestions || [] }));
    } catch (e) { toast.error(t('bim.err_zone_suggest') + e.message); }
  }

  async function linkZone(m, zid) {
    try {
      const r = await bim.linkZone(m.id, zid);
      if (r.error) throw new Error(r.error);
      toast.success(t('bim.toast_zone_set'));
      load(selectedProject);
    } catch (e) { toast.error(t('bim.err_set_zone') + e.message); }
  }

  if (allowed === false) {
    return <div><div className="page-header"><h1>{t('bim.h1')}</h1></div>
      <div className="empty">{t('bim.enterprise_only')}</div></div>;
  }

  const usedBytes = models.reduce((s, m) => s + Number(m.file_size || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('bim.h1')}</h1>
          <div className="meta">{t('bim.subtitle')}{fmtMB(usedBytes)} / 2048 MB</div>
        </div>
        <div className="page-header-right">
          <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder={t('bim.pick_project')} />
        </div>
      </div>

      <div className="section">
        <div className="section-title"><span>{t('bim.btn_new_model')}</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="file" accept=".ifc" onChange={e => setFile(e.target.files?.[0] || null)} />
          <input value={zoneCode} onChange={e => setZoneCode(e.target.value)} placeholder={t('bim.zone_ph')} style={{ padding: 6, width: 280 }} />
          <button className="btn" onClick={upload} disabled={busy || !file}>
            <ICON.upload size={12} />{busy ? t('bim.busy_loading') : t('bim.btn_upload')}
          </button>
        </div>
      </div>

      <div className="data-table"><div className="data-table-body"><table>
        <thead><tr><th>{th("Tệp")}</th><th>{th("Khu vực")}</th><th className="num">{th("Dung lượng")}</th><th className="num">{th("Tầng")}</th><th className="num">{th("Không gian")}</th><th>{th("Schema")}</th><th>{th("Tải về")}</th><th>{th("Xem 3D")}</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8}>{t('bim.busy_loading')}</td></tr> :
           models.length === 0 ? <tr><td colSpan={8}>{t('bim.empty')}</td></tr> :
           page.visible.map(m => {
             const meta = typeof m.report_json === 'string' ? JSON.parse(m.report_json || '{}') : (m.report_json || {});
             return (
               <tr key={m.id}>
                 <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.original_filename}</td>
                 <td><code>{m.zone_code || '—'}</code>{' '}
                   <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => showSuggestions(m)}>{t('bim.lbl_suggestion')}</button>
                   {(suggest[m.id] || []).map(s => (
                     <button key={s.zone_id} className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11, marginLeft: 4 }}
                       onClick={() => linkZone(m, s.zone_id)} title={`score ${s.score}`}>{s.zone_code}</button>
                   ))}
                 </td>
                 <td className="num">{fmtMB(m.file_size)}</td>
                 <td className="num" title={(meta.storeys || []).map(s => s.name).join(', ')}>{(meta.storeys || []).length}</td>
                 <td className="num">{meta.space_count ?? '—'}{meta.truncated ? t('bim.suffix_truncated') : ''}</td>
                 <td style={{ fontSize: 11 }}>{meta.schema || '—'}</td>
                 <td><button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => downloadModel(m)} disabled={downloading === m.id}>
                   {downloading === m.id ? t('bim.busy_loading') : t('bim.btn_download_ifc')}
                 </button></td>
                 <td><a href={`/hq/bim/${m.id}`} style={{ fontSize: 12 }}>{t('bim.btn_view3d')}</a></td>
               </tr>
             );
           })}
        </tbody>
      </table>
      {truncated && (
        <div className="meta" style={{ marginTop: 8, color: 'var(--c-pending)' }}>
          Đang hiện {models.length} / {serverTotal} model.
        </div>
      )}
      {!loading && (
        <TablePagination
          page={page.page}
          pageCount={page.pageCount}
          total={page.total}
          pageSize={page.pageSize}
          onPageChange={page.setPage}
          onPageSizeChange={page.changePageSize}
          unitKey="unit.model"
        />
      )}
      </div></div>
    </div>
  );
}
