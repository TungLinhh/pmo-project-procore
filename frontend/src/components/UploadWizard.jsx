// Upload Wizard — Mô hình A: 4 bước
//   1. Upload file (POST /api/upload, returns upload_id)
//   2. Configure: project_id, zone_id, doc_type (POST /api/upload/:id/configure)
//   3. Preview: hiển thị parsed rows (từ response configure)
//   4. Commit: insert vào DB (POST /api/upload/:id/commit)
//
// Props: open, onClose, onDone (callback khi commit xong), defaultProjectId (optional)
import { useState, useEffect, useCallback } from 'react';
import { uploads, projects as apiProjects } from '../api/index.js';
import { toast } from './Toast.jsx';

const STEPS = ['Upload', 'Cấu hình', 'Xem trước', 'Hoàn tất'];

export default function UploadWizard({ open, onClose, onDone, defaultProjectId, startBulk }) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
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
    apiProjects.list().then(setProjects).catch(e => toast.error('Lỗi tải dự án: ' + e.message));
    uploads.wizard.docTypes().then(setDocTypes).catch(e => toast.error('Lỗi tải doc types: ' + e.message));
    // Auto-detect doc type from filename
  }, [open]);

  // Load zones when project changes
  useEffect(() => {
    if (!projectId) { setZones([]); return; }
    apiProjects.zones(projectId).then(setZones).catch(() => setZones([]));
  }, [projectId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(0); setFile(null); setUploadId(null);
        setBulkMode(!!startBulk); setBulkFiles([]); setBulkResult(null); setBulkBusy(false);
        setProjectId(defaultProjectId || ''); setZoneId(''); setDocType('');
        setPreview(null); setResult(null);
        setNewProjectOpen(false); setNewZoneOpen(false);
        setNewProject({ code: '', name_vi: '', package: 'MEP' });
        setNewZone({ code: '', name_vi: '' });
      }, 300);
    }
  }, [open, defaultProjectId]);

  // Auto-suggest doc_type from filename
  useEffect(() => {
    if (!file || docType) return;
    const fn = file.name.toLowerCase();
    // S&P supplier-payment files live among VẬT TƯ names — must win over material_supply.
    if (/s\s*&\s*p|supplier.*pay|cong no.*ncc|thanh toan.*ncc/i.test(file.name)) {
      const sp = docTypes.find(d => d.id === 'supplier_payment');
      if (sp) { setDocType(sp.id); return; }
    }
    const guess = docTypes.find(d => {
      const id = d.id.toLowerCase();
      if (id === 'shop_drawing' && (fn.includes('shop') || fn.includes('bql') || fn.includes('shd-'))) return true;
      if (id === 'construction_schedule' && (fn.includes('tđ') || fn.includes('td') || fn.includes('schedule') || fn.includes('csp-'))) return true;
      if (id === 'material_supply' && (fn.includes('vật tư') || fn.includes('vat tu') || fn.includes('msa'))) return true;
      if (id === 'rfa_log' && (fn.includes('mcr') || fn.includes('rfa') || fn.includes('duyệt khác') || fn.includes('duyet khac'))) return true;
      if (id === 'work_breakdown' && fn.includes('cây')) return true;
      if (id === 'daily_report' && (fn.includes('báo cáo') || fn.includes('bao cao') || fn.includes('daily'))) return true;
      if (id === 'business_process' && fn.includes('quy trình')) return true;
      if (id === 'payment_progress' && (fn.includes('thanh toán') || fn.includes('thanh toan'))) return true;
      if (id === 'payment_ar' && (fn.includes('bãi tràm') || fn.includes('bai tram') || fn.includes('mpm') || fn.includes('hstt') || fn.includes('phải thu') || fn.includes('phai thu') || fn.includes('công nợ'))) return true;
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
      toast.error('Upload lỗi: ' + e.message);
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
    const runOne = async () => {
      while (queue.length) {
        const item = queue.shift();
        setBulkFiles(prev => prev.map(p => p === item ? { ...p, state: 'uploading' } : p));
        try {
          const r = await uploads.upload(item.file, null, { relativePath: item.rel });
          if (r.error || !r.upload_id) throw new Error(r.error || 'No upload_id');
          setBulkFiles(prev => prev.map(p => p === item ? { ...p, state: 'done', upload_id: r.upload_id } : p));
        } catch (e) {
          setBulkFiles(prev => prev.map(p => p === item ? { ...p, state: 'error', error: e.message } : p));
        }
      }
    };
    for (let i = 0; i < 4; i++) workers.push(runOne());
    await Promise.all(workers);
    setBulkBusy(false);
    const done = bulkFiles.filter(f => f.state === 'done').length;
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
      toast.error('Batch lỗi: ' + e.message);
    } finally {
      setBulkBusy(false);
    }
  }, [onDone]);

  const handleCreateProject = useCallback(async () => {
    if (!newProject.code) { toast.error('Nhập project code'); return; }
    try {
      const p = await uploads.createProject(newProject);
      setProjects(prev => [...prev, p]);
      setProjectId(p.id);
      setNewProjectOpen(false);
      setNewProject({ code: '', name_vi: '', package: 'MEP' });
      toast.success('Đã tạo project ' + p.code);
    } catch (e) {
      toast.error('Lỗi tạo project: ' + e.message);
    }
  }, [newProject]);

  const handleCreateZone = useCallback(async () => {
    if (!newZone.code || !projectId) { toast.error('Nhập zone code và chọn project'); return; }
    try {
      const z = await uploads.createZone(projectId, newZone);
      setZones(prev => [...prev, z]);
      setZoneId(z.id);
      setNewZoneOpen(false);
      setNewZone({ code: '', name_vi: '' });
      toast.success('Đã tạo zone ' + z.code);
    } catch (e) {
      toast.error('Lỗi tạo zone: ' + e.message);
    }
  }, [newZone, projectId]);

  const handleConfigure = useCallback(async () => {
    if (!uploadId || !projectId || !docType) { toast.error('Thiếu project hoặc doc_type'); return; }
    setConfiguring(true);
    try {
      const body = { project_id: Number(projectId), doc_type: docType };
      if (zoneId) body.zone_id = Number(zoneId);
      else body.new_zone = { code: 'GEN-' + docType.toUpperCase().slice(0, 6) };
      const r = await uploads.wizard.configure(uploadId, body);
      if (r.error) throw new Error(r.error);
      setPreview(r);
      setStep(2);
    } catch (e) {
      toast.error('Configure lỗi: ' + e.message);
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
      toast.error('Commit lỗi: ' + e.message);
    } finally {
      setCommitting(false);
    }
  }, [uploadId]);

  if (!open) return null;

  return (
    <div className="wizard-overlay" onClick={onClose}>
      <div className="wizard-modal" onClick={e => e.stopPropagation()}>
        <div className="wizard-header">
          <h2>Upload Excel</h2>
          <button className="wizard-close" onClick={onClose}>✕</button>
        </div>

        <div className="wizard-steps">
          {STEPS.map((s, i) => (
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
                <button className={`btn ${bulkMode ? '' : 'btn-secondary'}`} onClick={() => setBulkMode(true)}>Nhiều file / cả folder / .zip</button>
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
                    <button className="btn-text" onClick={e => { e.stopPropagation(); setFile(null); }}>Chọn file khác</button>
                  </div>
                ) : (
                  <div>
                    <div className="wizard-dropzone-icon">📤</div>
                    <div>Drop Excel file here, hoặc click để chọn</div>
                    <div className="wizard-dropzone-hint">.xlsx, .xls</div>
                  </div>
                )}
                <input id="wizard-file-input" type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
              </div>
              ) : (
              <div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                    Chọn nhiều file
                    <input type="file" multiple accept=".xlsx,.xls,.zip" style={{ display: 'none' }} onChange={e => {
                      const list = Array.from(e.target.files || []);
                      const zip = list.find(f => /\.zip$/i.test(f.name));
                      if (zip && list.length === 1) handleZipUpload(zip);
                      else collectFiles(list);
                    }} />
                  </label>
                  <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                    Chọn cả folder
                    <input type="file" webkitdirectory="" directory="" style={{ display: 'none' }} onChange={e => collectFiles(e.target.files)} />
                  </label>
                  {bulkFiles.length > 0 && (
                    <button className="btn" onClick={handleBulkUpload} disabled={bulkBusy}>
                      {bulkBusy ? 'Đang stage...' : `Stage ${bulkFiles.filter(f => f.state === 'queued' || f.state === 'error').length} files`}
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
                          <div className="meta">{f.state === 'done' ? `staged #${f.upload_id}` : f.state === 'error' ? (f.error || 'lỗi') : f.state === 'uploading' ? 'đang upload...' : 'chờ stage'}</div>
                        </div>
                        <span className="badge" style={{ fontSize: 10 }}>{f.state}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {bulkFiles.length === 0 && !bulkResult && (
                  <div className="empty">Chọn nhiều .xlsx, cả folder dự án, hoặc 1 file .zip — mỗi file được stage riêng, phân loại ở review queue.</div>
                )}
              </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="wizard-step-content">
              <div className="wizard-field">
                <label>Dự án *</label>
                {!newProjectOpen ? (
                  <div className="wizard-field-row">
                    <select value={projectId} onChange={e => setProjectId(e.target.value)}>
                      <option value="">-- Chọn dự án --</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name_vi || p.code}</option>)}
                    </select>
                    <button className="btn-text" onClick={() => setNewProjectOpen(true)}>+ Mới</button>
                  </div>
                ) : (
                  <div className="wizard-inline-form">
                    <input placeholder="Code (vd: BTE-WP5-HBC)" value={newProject.code} onChange={e => setNewProject({ ...newProject, code: e.target.value })} />
                    <input placeholder="Tên tiếng Việt" value={newProject.name_vi} onChange={e => setNewProject({ ...newProject, name_vi: e.target.value })} />
                    <button className="btn-primary-sm" onClick={handleCreateProject}>Tạo</button>
                    <button className="btn-text" onClick={() => setNewProjectOpen(false)}>Hủy</button>
                  </div>
                )}
              </div>

              <div className="wizard-field">
                <label>Zone</label>
                {!newZoneOpen ? (
                  <div className="wizard-field-row">
                    <select value={zoneId} onChange={e => setZoneId(e.target.value)} disabled={!projectId}>
                      <option value="">-- Để trống = tự tạo GEN-* --</option>
                      {zones.map(z => <option key={z.id} value={z.id}>{z.code} — {z.name_vi || z.name_en}</option>)}
                    </select>
                    {projectId && <button className="btn-text" onClick={() => setNewZoneOpen(true)}>+ Mới</button>}
                  </div>
                ) : (
                  <div className="wizard-inline-form">
                    <input placeholder="Zone code (vd: BOH)" value={newZone.code} onChange={e => setNewZone({ ...newZone, code: e.target.value })} />
                    <input placeholder="Tên (tùy chọn)" value={newZone.name_vi} onChange={e => setNewZone({ ...newZone, name_vi: e.target.value })} />
                    <button className="btn-primary-sm" onClick={handleCreateZone}>Tạo</button>
                    <button className="btn-text" onClick={() => setNewZoneOpen(false)}>Hủy</button>
                  </div>
                )}
              </div>

              <div className="wizard-field">
                <label>Loại tài liệu *</label>
                <select value={docType} onChange={e => setDocType(e.target.value)}>
                  <option value="">-- Chọn loại --</option>
                  {docTypes.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {step === 2 && preview && (
            <div className="wizard-step-content">
              <div className="wizard-summary">
                <div className="wizard-summary-row"><span>Project:</span><strong>{preview.project?.code}</strong></div>
                {preview.zone && <div className="wizard-summary-row"><span>Zone:</span><strong>{preview.zone.code} {preview.zone_auto_created && '(mới tạo)'}</strong></div>}
                <div className="wizard-summary-row"><span>Loại:</span><strong>{preview.doc_type}</strong></div>
                <div className="wizard-summary-row"><span>Tổng rows:</span><strong>{preview.total_rows}</strong></div>
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
                <h3>{result.status === 'SUCCESS' ? 'Insert thành công!' : 'Hoàn tất với lỗi'}</h3>
                <div className="wizard-result-stats">
                  <div><strong>{result.ok ?? result.total?.ok ?? 0}</strong> rows OK</div>
                  <div><strong>{result.errors ?? result.total?.errors ?? 0}</strong> rows lỗi</div>
                  <div>Zone: <strong>{result.zone || 'N/A'}</strong></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="wizard-footer">
          {step > 0 && step < 3 && <button className="btn-secondary" onClick={() => setStep(s => s - 1)}>← Quay lại</button>}
          <div className="wizard-footer-spacer" />
          {step === 0 && !bulkMode && <button className="btn-primary" onClick={handleUpload} disabled={!file || uploading}>{uploading ? 'Uploading...' : 'Upload →'}</button>}
          {step === 0 && bulkMode && <button className="btn-primary" onClick={onClose}>Xong — sang review queue</button>}
          {step === 1 && <button className="btn-primary" onClick={handleConfigure} disabled={!projectId || !docType || configuring}>{configuring ? 'Đang parse...' : 'Xem trước →'}</button>}
          {step === 2 && <button className="btn-primary" onClick={handleCommit} disabled={committing}>{committing ? 'Đang insert...' : 'Xác nhận Insert'}</button>}
          {step === 3 && <button className="btn-primary" onClick={onClose}>Đóng</button>}
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
