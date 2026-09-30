//   1. Upload file (POST /api/upload, returns upload_id)
//   2. Configure: project_id, zone_id, doc_type (POST /api/upload/:id/configure)
//   3. Preview: hiển thị parsed rows (từ response configure)
//   4. Commit: insert vào DB (POST /api/upload/:id/commit)
//
// Props: open, onClose, onDone (callback khi commit xong), defaultProjectId (optional)
import { useState, useEffect, useCallback, useRef } from 'react';
import { uploads, projects as apiProjects } from '../api/index.js';
import { toast } from './Toast.jsx';
import { t, useLang } from '../i18n/index.js';

function steps() {
  return ['Upload', t('up.step_configure'), t('up.preview'), t('up.done')];
}

export default function UploadWizard({ open, onClose, onDone, defaultProjectId, startBulk }) {
  useLang(); // nhãn trong wizard phải đổi theo nút [VI|EN] khi đang mở
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadId, setUploadId] = useState(null);

  // Bulk intake: multi-file / folder / zip (each staged individually server-side)
  const [bulkMode, setBulkMode] = useState(!!startBulk);
  const [bulkFiles, setBulkFiles] = useState([]); // [{ file, rel, state: 'queued'|'uploading'|'done'|'error', upload_id, error }]
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null); // zip batch summary

  // Step 2 state
  const [projects, setProjects] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [zoneId, setZoneId] = useState('');
  const [docType, setDocType] = useState('');
  const [zones, setZones] = useState([]);

  // New project / new zone inline forms
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newZoneOpen, setNewZoneOpen] = useState(false);
  const [newProject, setNewProject] = useState({ code: '', name_vi: '', package: 'MEP' });
  const [newZone, setNewZone] = useState({ code: '', name_vi: '' });

  // Step 3 state
  const [preview, setPreview] = useState(null);
  const [configuring, setConfiguring] = useState(false);

  // Step 4 state
  const [result, setResult] = useState(null);
  const [committing, setCommitting] = useState(false);

  // Load projects + doc types on mount
  useEffect(() => {
    if (!open) return;
    apiProjects.list().then(setProjects).catch(e => toast.error(t('up.err_projects') + e.message));
    uploads.wizard.docTypes().then(setDocTypes).catch(e => toast.error(t('up.err_doctypes') + e.message));
    // Auto-detect doc type from filename
  }, [open]);

  // Load zones when project changes
  useEffect(() => {
    if (!projectId) { setZones([]); return; }
    apiProjects.zones(projectId).then(setZones).catch(() => setZones([]));
  }, [projectId]);

  // Reset on close.
  // P2-11: the 300ms reset was fire-and-forget — a rapid close→reopen inside
  // the window wiped the fresh session's state (stale reset). The timer is
  // now cancelled on reopen/unmount.
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStep(0); setFile(null); setUploadId(null);
        setBulkMode(!!startBulk); setBulkFiles([]); setBulkResult(null); setBulkBusy(false);
        setProjectId(defaultProjectId || ''); setZoneId(''); setDocType('');
        setPreview(null); setResult(null);
        setNewProjectOpen(false); setNewZoneOpen(false);
        setNewProject({ code: '', name_vi: '', package: 'MEP' });
        setNewZone({ code: '', name_vi: '' });
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open, defaultProjectId]);

  // Auto-suggest doc_type from filename.
  // Token ngắn (td/msa/mpm/hstt/mcr/rfa/bql) phải đứng riêng (ngăn cách bởi
  // ký tự không phải chữ) — includes() trần bắt nhầm ("outdoor" → td...).
  useEffect(() => {
    if (!file || docType) return;
    const fn = file.name.toLowerCase();
    const tok = (t) => new RegExp(`(^|[^a-zà-ỹ])${t}($|[^a-zà-ỹ])`).test(fn);
    // S&P supplier-payment files live among VẬT TƯ names — must win over material_supply.
    if (/s\s*&\s*p|supplier.*pay|cong no.*ncc|thanh toan.*ncc/i.test(file.name)) {
      const sp = docTypes.find(d => d.id === 'supplier_payment');
      if (sp) { setDocType(sp.id); return; }
    }
    const guess = docTypes.find(d => {
      const id = d.id.toLowerCase();
      if (id === 'shop_drawing' && (fn.includes('shop') || tok('bql') || fn.includes('shd-'))) return true;
      if (id === 'construction_schedule' && (fn.includes('tđ') || tok('td') || fn.includes('schedule') || fn.includes('csp-'))) return true;
      if (id === 'material_supply' && (fn.includes('vật tư') || fn.includes('vat tu') || tok('msa'))) return true;
      if (id === 'rfa_log' && (tok('mcr') || tok('rfa') || fn.includes('duyệt khác') || fn.includes('duyet khac'))) return true;
      if (id === 'work_breakdown' && fn.includes('cây')) return true;
      if (id === 'daily_report' && (fn.includes('báo cáo') || fn.includes('bao cao') || fn.includes('daily'))) return true;
      if (id === 'business_process' && fn.includes('quy trình')) return true;
      if (id === 'payment_progress' && (fn.includes('thanh toán') || fn.includes('thanh toan'))) return true;
      if (id === 'payment_ar' && (fn.includes('bãi tràm') || fn.includes('bai tram') || tok('mpm') || tok('hstt') || fn.includes('phải thu') || fn.includes('phai thu') || fn.includes('công nợ'))) return true;
      if (id === 'subcontractor_directory' && fn.includes('thầu phụ')) return true;
      if (id === 'resource_directory' && fn.includes('nguồn lực')) return true;
      return false;
    });
    if (guess) setDocType(guess.id);
  }, [file, docTypes, docType]);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    try {
      const r = await uploads.upload(file);
      if (r.error) throw new Error(r.error);
      setUploadId(r.upload_id);
      setStep(1);
    } catch (e) {
      toast.error(t('up.err_upload') + e.message);
    } finally {
      setUploading(false);
    }
  }, [file]);

  const collectFiles = useCallback((fileList) => {
    const arr = Array.from(fileList || []).map(f => ({
      file: f, rel: f.webkitRelativePath || f.name, state: 'queued', upload_id: null, error: null,
    }));
    setBulkFiles(arr);
    setBulkResult(null);
  }, []);

  const handleBulkUpload = useCallback(async () => {
    const queued = bulkFiles.filter(f => f.state === 'queued' || f.state === 'error');
    if (!queued.length) return;
    setBulkBusy(true);
    // bounded parallelism: 4 at a time
    const workers = [];
    const queue = [...queued];
    let done = 0; // đếm trực tiếp — bulkFiles trong closure là snapshot trước upload.
    const runOne = async () => {
      while (queue.length) {
        const item = queue.shift();
        setBulkFiles(prev => prev.map(p => p === item ? { ...p, state: 'uploading' } : p));
        try {
          const r = await uploads.upload(item.file, null, { relativePath: item.rel });
          if (r.error || !r.upload_id) throw new Error(r.error || 'No upload_id');
          done++;
          setBulkFiles(prev => prev.map(p => p === item ? { ...p, state: 'done', upload_id: r.upload_id } : p));
        } catch (e) {
          setBulkFiles(prev => prev.map(p => p === item ? { ...p, state: 'error', error: e.message } : p));
        }
      }
    };
    for (let i = 0; i < 4; i++) workers.push(runOne());
    await Promise.all(workers);
    setBulkBusy(false);
    toast.success(`Staged ${done} files — tiếp tục ở review queue`);
    if (onDone) onDone({ bulk: true });
  }, [bulkFiles, onDone]);

  const handleZipUpload = useCallback(async (zipFile) => {
    if (!zipFile) return;
    setBulkBusy(true);
    try {
      const r = await uploads.batchZip(zipFile);
      if (r.error) throw new Error(r.error);
      setBulkResult(r);
      setBulkFiles((r.files || []).map(f => ({
        file: null, rel: f.relative_path, state: f.status === 'STAGED' ? 'done' : 'error',
        upload_id: f.upload_id, error: f.skip_reason,
      })));
      toast.success(`Batch: ${r.staged} staged, ${r.skipped} skipped`);
      if (onDone) onDone({ bulk: true, batch: r });
    } catch (e) {
      toast.error(t('up.err_batch') + e.message);
    } finally {
      setBulkBusy(false);
    }
  }, [onDone]);

  const handleCreateProject = useCallback(async () => {
    if (!newProject.code) { toast.error(t('up.project_code_ph')); return; }
    try {
      const p = await uploads.createProject(newProject);
      setProjects(prev => [...prev, p]);
      setProjectId(p.id);
      setNewProjectOpen(false);
      setNewProject({ code: '', name_vi: '', package: 'MEP' });
      toast.success(t('up.project_created') + p.code);
    } catch (e) {
      toast.error(t('up.err_project') + e.message);
    }
  }, [newProject]);

  const handleCreateZone = useCallback(async () => {
    if (!newZone.code || !projectId) { toast.error(t('up.zone_hint')); return; }
    try {
      const z = await uploads.createZone(projectId, newZone);
      setZones(prev => [...prev, z]);
      setZoneId(z.id);
      setNewZoneOpen(false);
      setNewZone({ code: '', name_vi: '' });
      toast.success(t('up.zone_created') + z.code);
    } catch (e) {
      toast.error(t('up.err_zone') + e.message);
    }
  }, [newZone, projectId]);

  const handleConfigure = useCallback(async () => {
    if (!uploadId || !projectId || !docType) { toast.error(t('up.need_project_doctype')); return; }
    setConfiguring(true);
    try {
      const body = { project_id: Number(projectId), doc_type: docType };
      if (zoneId) body.zone_id = Number(zoneId);
      // Leaving Zone blank must NOT invent a zone code here. The wizard used to
      // send 'GEN-' + docType.slice(0,6), producing GEN-CONSTR / GEN-SHOP_D /
      // GEN-RFA_L, while the ingestors' own default is GEN-TD / GEN-SHOP /
      // GEN-MAT — so the same file landed in a different zone depending on
      // whether it came through this wizard or the review queue. Omitting the
      // field lets the ingestor apply its single default.
      const r = await uploads.wizard.configure(uploadId, body);
      if (r.error) throw new Error(r.error);
      setPreview(r);
      setStep(2);
    } catch (e) {
      toast.error(t('up.err_configure') + e.message);
    } finally {
      setConfiguring(false);
    }
  }, [uploadId, projectId, zoneId, docType]);

  const handleCommit = useCallback(async () => {
    if (!uploadId) return;
    setCommitting(true);
    try {
      const r = await uploads.wizard.commit(uploadId);
      if (r.error) throw new Error(r.error);
      setResult(r);
      setStep(3);
      toast.success(`Insert thành công ${r.ok || r.total?.ok || 0} rows`);
      // Don't auto-navigate — let user click "Đóng" to stay in control
    } catch (e) {
      toast.error(t('up.err_commit') + e.message);
    } finally {
      setCommitting(false);
    }
  }, [uploadId]);

  if (!open) return null;

  return (
    <div className="wizard-overlay" onClick={onClose}>
      <div className="wizard-modal" onClick={e => e.stopPropagation()}>
        <div className="wizard-header">
          <h2>{t('up.btn_excel')}</h2>
          <button className="wizard-close" onClick={onClose}>✕</button>
        </div>

        <div className="wizard-steps">
          {steps().map((s, i) => (
            <div key={s} className={`wizard-step ${i === step ? 'active' : i < step ? 'done' : ''}`}>
              <div className="wizard-step-num">{i < step ? '✓' : i + 1}</div>
              <div className="wizard-step-label">{s}</div>
            </div>
          ))}
        </div>

        <div className="wizard-body">
          {step === 0 && (
            <div className="wizard-step-content">
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button className={`btn ${!bulkMode ? '' : 'btn-secondary'}`} onClick={() => setBulkMode(false)}>1 file</button>
                <button className={`btn ${bulkMode ? '' : 'btn-secondary'}`} onClick={() => setBulkMode(true)}>{t('up.multi_label')}</button>
              </div>
              {!bulkMode ? (
              <div
                className={`wizard-dropzone ${file ? 'has-file' : ''}`}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                onDrop={e => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('drag-over');
                  const f = e.dataTransfer.files[0];
                  if (f) setFile(f);
                }}
                onClick={() => document.getElementById('wizard-file-input').click()}
              >
                {file ? (
                  <div>
                    <div className="wizard-file-name">{file.name}</div>
                    <div className="wizard-file-size">{(file.size / 1024).toFixed(1)} KB</div>
                    <button className="btn-text" onClick={e => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>{t('up.pick_other')}</button>
                  </div>
                ) : (
                  <div>
                    <div className="wizard-dropzone-icon">📤</div>
                    <div>{t('up.drag_drop')}</div>
                    <div className="wizard-dropzone-hint">.xlsx, .xls</div>
                  </div>
                )}
                <input id="wizard-file-input" type="file" ref={fileInputRef} accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
              </div>
              ) : (
              <div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>{t('up.btn_pick_multi')}<input type="file" multiple accept=".xlsx,.xls,.zip" style={{ display: 'none' }} onChange={e => {
                      const list = Array.from(e.target.files || []);
                      const zip = list.find(f => /\.zip$/i.test(f.name));
                      if (zip && list.length === 1) handleZipUpload(zip);
                      else collectFiles(list);
                    }} />
                  </label>
                  <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>{t('up.pick_folder')}<input type="file" webkitdirectory="" directory="" style={{ display: 'none' }} onChange={e => collectFiles(e.target.files)} />
                  </label>
                  {bulkFiles.length > 0 && (
                    <button className="btn" onClick={handleBulkUpload} disabled={bulkBusy}>
                      {bulkBusy ? t('up.busy_staging') : `Stage ${bulkFiles.filter(f => f.state === 'queued' || f.state === 'error').length} files`}
                    </button>
                  )}
                </div>
                {bulkResult && (
                  <div className="meta" style={{ marginBottom: 8 }}>
                    Zip batch: {bulkResult.staged} staged, {bulkResult.skipped} skipped / {bulkResult.total} entries
                  </div>
                )}
                {bulkFiles.length > 0 && (
                  <ul className="field-list" style={{ maxHeight: 220, overflow: 'auto' }}>
                    {bulkFiles.map((f, i) => (
                      <li key={i}>
                        <div>
                          <div className="label" style={{ fontSize: 11 }}>{f.rel}</div>
                          <div className="meta">{f.state === 'done' ? `staged #${f.upload_id}` : f.state === 'error' ? (f.error || t('up.st_error')) : f.state === 'uploading' ? t('up.busy_uploading') : t('up.st_waiting_stage')}</div>
                        </div>
                        <span className="badge" style={{ fontSize: 10 }}>{f.state}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {bulkFiles.length === 0 && !bulkResult && (
                  <div className="empty">{t('up.multi_help')}</div>
                )}
              </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="wizard-step-content">
              <div className="wizard-field">
                <label>{t('up.project_req')}</label>
                {!newProjectOpen ? (
                  <div className="wizard-field-row">
                    <select value={projectId} onChange={e => setProjectId(e.target.value)}>
                      <option value="">{t('up.project_ph')}</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name_vi || p.code}</option>)}
                    </select>
                    <button className="btn-text" onClick={() => setNewProjectOpen(true)}>{t('up.btn_new')}</button>
                  </div>
                ) : (
                  <div className="wizard-inline-form">
                    <input placeholder="Code (vd: BTE-WP5-HBC)" value={newProject.code} onChange={e => setNewProject({ ...newProject, code: e.target.value })} />
                    <input placeholder={t('up.zone_new_name')} value={newProject.name_vi} onChange={e => setNewProject({ ...newProject, name_vi: e.target.value })} />
                    <button className="btn-primary-sm" onClick={handleCreateProject}>{t('up.create')}</button>
                    <button className="btn-text" onClick={() => setNewProjectOpen(false)}>{t('up.btn_cancel')}</button>
                  </div>
                )}
              </div>

              <div className="wizard-field">
                <label>{t('g.zone')}</label>
                {!newZoneOpen ? (
                  <div className="wizard-field-row">
                    <select value={zoneId} onChange={e => setZoneId(e.target.value)} disabled={!projectId}>
                      <option value="">{t('up.zone_ph')}</option>
                      {zones.map(z => <option key={z.id} value={z.id}>{z.code} — {z.name_vi || z.name_en}</option>)}
                    </select>
                    {projectId && <button className="btn-text" onClick={() => setNewZoneOpen(true)}>{t('up.btn_new')}</button>}
                  </div>
                ) : (
                  <div className="wizard-inline-form">
                    <input placeholder="Zone code (vd: BOH)" value={newZone.code} onChange={e => setNewZone({ ...newZone, code: e.target.value })} />
                    <input placeholder={t('up.name_optional')} value={newZone.name_vi} onChange={e => setNewZone({ ...newZone, name_vi: e.target.value })} />
                    <button className="btn-primary-sm" onClick={handleCreateZone}>{t('up.create')}</button>
                    <button className="btn-text" onClick={() => setNewZoneOpen(false)}>{t('up.btn_cancel')}</button>
                  </div>
                )}
              </div>

              <div className="wizard-field">
                <label>{t('up.doctype_req')}</label>
                <select data-testid="doc-type-select" value={docType} onChange={e => setDocType(e.target.value)}>
                  <option value="">{t('up.doctype_ph')}</option>
                  {docTypes.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {step === 2 && preview && (
            <div className="wizard-step-content">
              <div className="wizard-summary">
                <div className="wizard-summary-row"><span>Project:</span><strong>{preview.project?.code}</strong></div>
                {preview.zone && <div className="wizard-summary-row"><span>Zone:</span><strong>{preview.zone.code} {preview.zone_auto_created && t('up.zone_new')}</strong></div>}
                <div className="wizard-summary-row"><span>{t('up.type_label')}</span><strong>{preview.doc_type}</strong></div>
                <div className="wizard-summary-row"><span>{t('up.lbl_total_rows')}</span><strong>{preview.total_rows}</strong></div>
              </div>

              {preview.sheets?.map((s, i) => (
                <div key={i} className="wizard-preview-sheet">
                  <div className="wizard-preview-sheet-name">{s.sheet} <span className="badge">{s.row_count} rows</span></div>
                  {s.sample?.length > 0 && (
                    <table className="wizard-preview-table">
                      <thead>
                        <tr>{Object.keys(s.sample[0]).filter(k => k !== 'rowIndex').map(k => <th key={k}>{k}</th>)}</tr>
                      </thead>
                      <tbody>
                        {s.sample.map((r, ri) => (
                          <tr key={ri}>
                            {Object.keys(s.sample[0]).filter(k => k !== 'rowIndex').map(k => <td key={k}>{formatCell(r[k])}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 3 && result && (
            <div className="wizard-step-content">
              <div className="wizard-result">
                <div className={`wizard-result-icon ${result.status === 'SUCCESS' ? 'ok' : 'partial'}`}>
                  {result.status === 'SUCCESS' ? '✓' : '!'}
                </div>
                <h3>{result.status === 'SUCCESS' ? t('up.insert_ok') : t('up.done_with_errors')}</h3>
                <div className="wizard-result-stats">
                  <div><strong>{result.ok ?? result.total?.ok ?? 0}</strong> rows OK</div>
                  <div><strong>{result.errors ?? result.total?.errors ?? 0}</strong>{t('up.lbl_bad_rows')}</div>
                  <div>Zone: <strong>{result.zone || 'N/A'}</strong></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="wizard-footer">
          {step > 0 && step < 3 && <button className="btn-secondary" onClick={() => setStep(s => s - 1)}>{t('up.back')}</button>}
          <div className="wizard-footer-spacer" />
          {step === 0 && !bulkMode && <button className="btn-primary" onClick={handleUpload} disabled={!file || uploading}>{uploading ? t('g.uploading') : 'Upload →'}</button>}
          {step === 0 && bulkMode && <button className="btn-primary" onClick={onClose}>Xong — sang review queue</button>}
          {step === 1 && <button data-testid="wizard-configure" className="btn-primary" onClick={handleConfigure} disabled={!projectId || !docType || configuring}>{configuring ? t('up.busy_parsing') : t('up.preview_next')}</button>}
          {step === 2 && <button className="btn-primary" onClick={handleCommit} disabled={committing}>{committing ? t('up.busy_inserting') : t('up.confirm_insert')}</button>}
          {step === 3 && <button className="btn-primary" onClick={onClose}>{t('up.close')}</button>}
        </div>
      </div>
    </div>
  );
}

function formatCell(v) {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 30);
  const s = String(v);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}
