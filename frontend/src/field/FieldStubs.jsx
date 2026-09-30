// Field stubs cho Material, Manpower, Issue, Review, Sync, WBS
// Updated: gọi API thật cho material_submittals, area_hierarchy, issues (mục 43.4/43.8)
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { projects, issues as issuesApi, materials, daily, preferDemoProject, getToken, request } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { ICON } from '../icons.jsx';
import { t, useLang } from '../i18n/index.js';
import { loadOutbox, flush, clearDead, wireAutoFlush } from './outbox.js';
import { formatApiDay } from '../utils/datetime.js';

// ===== Material Usage (mục 43.4) =====
export function FieldMaterial() {
  useLang(); // nhãn đổi theo nút [VI|EN] khi đang mở
  const [projectList, setProjectList] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code: '', name_vi: '', qty: '' });
  const [busy, setBusy] = useState(false);
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
    if (!projectId) { toast.error(t('fld.pick_project')); return; }
    if (!form.code.trim()) { toast.error(t('fld.material_ph')); return; }
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
      toast.success(t('fld.toast_material'));
    } catch (e) { toast.error(t('fld.err_generic') + e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="field-card">
        <h2>{t('fld.material_used')}</h2>
        <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>{t('fld.material_title')}</p>
        <label className="field-label">{t('fld.lbl_project')}</label>
        <select className="field-input" value={projectId || ''} onChange={e => setProjectId(Number(e.target.value))}>
          {projectList.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
        </select>
        <div className="field-stat"><span className="k">{t('fld.mat_db_count')}</span><span className="v">{loading ? '...' : items.length} {t('fld.unit_code')}</span></div>
        <label className="field-label">{t('fld.lbl_material_code')}</label>
        <input className="field-input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="VD: XI-MANG-PCB40" />
        <label className="field-label">{t('fld.lbl_material_name')}</label>
        <input className="field-input" value={form.name_vi} onChange={e => setForm({ ...form, name_vi: e.target.value })} placeholder={t('fld.mat_ph_name')} />
        {/* `materials` has no quantity column, so this lands in the free-text
            `notes` field. Calling it a structured quantity made people expect it
            to be summed and reconciled; it is not. */}
        <label className="field-label">{t('fld.material_qty')}</label>
        <input className="field-input" type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="VD: 50" />
        <button className="field-button" style={{ marginTop: 12 }} onClick={add} disabled={busy}>
          <ICON.plus size={14} />{busy ? t('fld.busy_saving') : t('fld.sec_material')}
        </button>
        {!loading && items.length > 0 && (
          <ul className="field-list" style={{ marginTop: 12 }}>
            {items.slice(0, 3).map(m => (
              <li key={m.id}>
                <div>
                  <div className="label">{m.name_vi || m.material_code}</div>
                  <div className="meta">#{m.material_code}{m.notes ? ` · ${m.notes}` : ''}</div>
                </div>
                <span className="v">{Math.round(Number(m.progress_pct || 0) * 100)}%</span>
              </li>
            ))}
          </ul>
        )}
        <p className="empty" style={{ marginTop: 16, fontSize: 11 }}>{t('fld.material_submittal_note')}</p>
      </div>
    </div>
  );
}

export function FieldManpower() {
  useLang(); // nhãn đổi theo nút [VI|EN] khi đang mở
  const [projectList, setProjectList] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ role_name: '', headcount: '', kind: 'labor' });
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
    if (!projectId) { toast.error(t('fld.pick_project')); return; }
    if (!form.role_name.trim() || !form.headcount) { toast.error(`Nhập tên + số ${form.kind === 'equipment' ? t('fld.unit_machines') : t('fld.unit_people')}`); return; }
    setBusy(true);
    try {
      const rep = await daily.ensureToday(projectId);
      await daily.addManpower(rep.id, { role_name_vi: form.role_name.trim(), headcount: Number(form.headcount), kind: form.kind });
      setForm({ role_name: '', headcount: '', kind: form.kind });
      await reload(projectId);
      toast.success(form.kind === 'equipment' ? t('fld.toast_equip') : t('fld.toast_team'));
    } catch (e) { toast.error(t('fld.err_generic') + e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="field-card">
        <h2>{t('fld.h2_manpower')}</h2>
        <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>{t('fld.sec_workforce')}</p>
        <label className="field-label">{t('fld.lbl_project')}</label>
        <select className="field-input" value={projectId || ''} onChange={e => setProjectId(Number(e.target.value))}>
          {projectList.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
        </select>
        <div className="field-stat"><span className="k">{t('fld.sec_team_today')}</span><span className="v">{loading ? '...' : teams.length}</span></div>
        <div className="field-stat"><span className="k">{t('fld.stat_total')}</span><span className="v">{teams.filter((t) => (t.kind || 'labor') === 'labor').reduce((s, t) => s + (Number(t.headcount) || 0), 0)}</span></div>
        <div className="field-stat"><span className="k">{t('fld.stat_total_equip')}</span><span className="v">{teams.filter((t) => t.kind === 'equipment').reduce((s, t) => s + (Number(t.headcount) || 0), 0)}</span></div>
        <label className="field-label">{t('fld.lbl_type')}</label>
        <select className="field-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          <option value="labor">{t('fld.lbl_labour')}</option>
          <option value="equipment">{t('fld.lbl_equipment')}</option>
        </select>
        <label className="field-label">{form.kind === 'equipment' ? t('fld.lbl_equip') : t('fld.lbl_team')}</label>
        <input className="field-input" value={form.role_name} onChange={e => setForm({ ...form, role_name: e.target.value })} placeholder={form.kind === 'equipment' ? t('fld.lbl_equip_ph') : t('fld.lbl_team_ph')} />
        <label className="field-label">Số {form.kind === 'equipment' ? t('fld.unit_machines') : t('fld.unit_people')} *</label>
        <input className="field-input" type="number" value={form.headcount} onChange={e => setForm({ ...form, headcount: e.target.value })} placeholder="VD: 12" />
        <button className="field-button" style={{ marginTop: 12 }} onClick={add} disabled={busy}>
          <ICON.plus size={14} />{busy ? t('fld.busy_adding') : t('fld.btn_add_team')}
        </button>
        {!loading && teams.length > 0 && (
          <ul className="field-list" style={{ marginTop: 12 }}>
            {/* Tham số callback ĐỪNG đặt tên là `t`: nó che hàm `t()` dịch của
                i18n, và `t('…')` bên trong sẽ gọi lên object của dòng này →
                `TypeError: t is not a function`. Đã mắc lỗi này ở `Materials.jsx`
                và `Ops.jsx`; xem `scripts/check-i18n-shadow.mjs`. */}
            {teams.slice(0, 5).map((team) => (
              <li key={team.id}>
                <div>
                  <div className="label">{team.role_name_vi || team.role_code}</div>
                  <div className="meta">{(team.kind || 'labor') === 'equipment' ? t('fld.lbl_equipment') : t('fld.lbl_labour')} · {team.notes || ''}</div>
                </div>
                <span className="v">{team.headcount} {(team.kind || 'labor') === 'equipment' ? t('fld.unit_machines') : t('fld.unit_people')}</span>
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
  useLang(); // nhãn đổi theo nút [VI|EN] khi đang mở
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
    } catch (err) { toast.error(t('fld.err_generic') + err.message); } finally { setUploading(false); e.target.value = ''; }
  }

  return (
    <div>
      <div className="field-card">
        <h2>{t('fs.issue_photo')}</h2>
        <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>{t('fld.photo_hint')}</p>
        <label className="field-label">{t('fld.lbl_project')}</label>
        <select className="field-input" value={projectId || ''} onChange={e => setProjectId(Number(e.target.value))}>
          {projectList.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
        </select>
        <div className="field-stat"><span className="k">{t('fs.issues_open')}</span><span className="v">{loading ? '...' : items.length}</span></div>
        <div className="field-stat"><span className="k">{t('fld.sec_photo')}</span><span className="v">{photos.length}</span></div>
        <label className="field-button" style={{ marginTop: 12, textAlign: 'center', cursor: 'pointer' }}>
          <ICON.camera size={14} />{uploading ? t('fld.busy_uploading') : t('fld.photo_pick')}
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
  useLang(); // nhãn đổi theo nút [VI|EN] khi đang mở
  const { id } = useParams();
  const nav = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setReport(null);
    if (!/^\d+$/.test(String(id || ''))) {
      setError('Đường dẫn không chứa mã báo cáo hợp lệ.');
      setLoading(false);
      return () => { active = false; };
    }
    daily.get(id)
      .then((data) => { if (active) setReport(data); })
      .catch((err) => {
        if (!active) return;
        setError(err?.status === 404
          ? 'Báo cáo này không tồn tại hoặc đã được xóa.'
          : `Không tải được báo cáo: ${err?.message || 'lỗi không xác định'}`);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, reloadKey]);

  if (loading) return <div className="field-card" aria-live="polite">Đang tải báo cáo...</div>;
  if (!report) {
    const canRetry = Boolean(error && !/không tồn tại|không chứa mã báo cáo hợp lệ/i.test(error));
    return (
      <div className="field-card" role="alert">
        <h2>Không tìm thấy báo cáo</h2>
        <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>
          {error || `Báo cáo #${id} không còn tồn tại.`}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="field-button" onClick={() => nav('/field/daily-report')}>Mở báo cáo hôm nay</button>
          <button className="field-button secondary" onClick={() => nav('/field')}>Về trang công trường</button>
          {canRetry && (
            <button className="field-button secondary" onClick={() => setReloadKey((value) => value + 1)}>Thử lại</button>
          )}
        </div>
      </div>
    );
  }

  const labor = (report.manpower || []).filter((row) => (row.kind || 'labor') === 'labor');
  const equipment = (report.manpower || []).filter((row) => row.kind === 'equipment');
  const statusLabels = { DRAFT: 'Bản nháp', SUBMITTED: 'Đã gửi', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', PAID: 'Đã thanh toán' };
  return (
    <div>
      <div className="field-card">
        <h2>{t('fh.daily_report')} {formatApiDay(report.report_date)}</h2>
        <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>Bản ghi thực tế, không có bước duyệt giả</p>
        <div style={{ padding: 12, background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 6, marginBottom: 12 }}>
          <div className="field-stat"><span className="k">Trạng thái</span><span className="v"><span className="badge workflow-DRAFT">{statusLabels[report.status] || report.status || 'Bản nháp'}</span></span></div>
          <div className="field-stat"><span className="k">{t('fld.lbl_labour')}</span><span className="v">{labor.reduce((s, row) => s + Number(row.headcount || 0), 0)} người</span></div>
          <div className="field-stat"><span className="k">{t('fld.lbl_equipment')}</span><span className="v">{equipment.reduce((s, row) => s + Number(row.headcount || 0), 0)} máy</span></div>
          <div className="field-stat"><span className="k">Ảnh</span><span className="v">{(report.photos || []).length}</span></div>
        </div>
        {report.note && <p style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>{report.notes || report.note}</p>}
        <button className="field-button secondary" onClick={() => nav('/field')}><ICON.back size={14} />{t('fld.btn_back_plain')}</button>
      </div>
    </div>
  );
}

// ===== Sync Queue (mục 43.7) =====
export function FieldSync() {
  useLang(); // nhãn đổi theo nút [VI|EN] khi đang mở
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [outbox, setOutbox] = useState([]);
  // Manual resolve is governance, not field work: foremen only SEE the queue
  // status (Procore syncs transparently). Admin/CEO keep the buttons.
  // Hidden, not deleted — backend POST /api/sync/resolve still enforces owner/admin.
  // Note: CEO is role='pmo' + is_ceo flag (there is no 'ceo' role value).
  const me = (() => { try { return JSON.parse(localStorage.getItem('pmo_user') || '{}'); } catch { return {}; } })();
  const role = (me.role || '').toLowerCase();
  // PMO was never in the route's canResolve — showing it the buttons guaranteed a 403.
  const canResolve = role === 'admin' || !!me.is_ceo;
  const reload = () => {
    request('/sync/queue')
      .then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { reload(); setOutbox(loadOutbox()); wireAutoFlush(getToken); }, []);
  async function flushNow() {
    setBusy('flush');
    try {
      await flush(getToken);
    } finally {
      setOutbox(loadOutbox());
      reload();
      setBusy(null);
    }
  }
  async function resolve(id, winner) {
    const ok = await confirm({
      title: winner === 'CLIENT' ? 'Ghi đè bản server?' : 'Giữ bản server?',
      message: winner === 'CLIENT'
        ? 'Bản offline trên máy này sẽ thay thế bản trên máy chủ. Bản server cũ không giữ lại.'
        : 'Bản trên máy chủ sẽ được giữ, bản offline trên máy này bị bỏ.',
      confirmText: winner === 'CLIENT' ? 'Ghi đè server' : 'Giữ bản server',
      confirmStyle: 'danger',
    });
    if (!ok) return;
    setBusy(id);
    try {
      await request('/sync/resolve', { method: 'POST', body: { queue_id: id, winner } });
      reload();
    } catch (e) { toast.error('Resolve thất bại: ' + e.message); } finally { setBusy(null); }
  }
  // Irreversible: these entries leave the device with no copy on the server, so
  // one mis-tap loses the user's field work. Kept out of the JSX attribute
  // because a multi-line arrow there breaks the JSX parse.
  async function removeDead() {
    const ok = await confirm({
      title: 'Xoá vĩnh viễn?',
      message: 'Các mục đã lỗi sẽ bị xoá khỏi máy này. Không có bản sao trên máy chủ, nên không thể khôi phục.',
      confirmText: 'Xoá vĩnh viễn', confirmStyle: 'danger',
    });
    if (!ok) return;
    clearDead();
    setOutbox(loadOutbox());
  }

  return (
    <div>
      <div className="field-card">
        <h2>{t('fld.h2_queue')}</h2>
        <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>{t('fld.sync_note')}</p>
        <ul className="field-list">
          <li>
            <div>
              <div className="label">{t('fld.sync_lbl_network')}</div>
              <div className="meta">{t('fld.sync_now')}</div>
            </div>
            <span className="badge" style={{ background: navigator.onLine ? 'var(--c-on-track-bg)' : 'var(--c-behind-bg)', color: navigator.onLine ? 'var(--c-on-track)' : 'var(--c-behind)' }}>
              {navigator.onLine ? 'ONLINE' : 'OFFLINE'}
            </span>
          </li>
          <li>
            <div>
              <div className="label">{t('fs.in_queue')}</div>
              <div className="meta">{t('fld.sync_waiting')}</div>
            </div>
            <span className="v">{loading ? '...' : items.length}</span>
          </li>
          <li>
            <div>
              <div className="label">{t('fld.sync_lbl_conflicts')}</div>
              <div className="meta">{t('fs.lww_log')}</div>
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
                    <div className="meta">{it.conflict_resolution || '\u2014'}</div>
                  </div>
                  <span className="badge" style={{ fontSize: 10 }}>{it.status || 'PENDING'}</span>
                </div>
                {canResolve && (
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
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* Local outbox (Wave 2 B2): edits queued on-device, not yet on server. */}
      <div className="field-card" style={{ marginTop: 12 }}>
        <h2>{t('fld.h2_outbox')} {outbox.filter(i => i.status !== 'dead').length})</h2>
        <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>{t('fld.toast_offline')}</p>
        {outbox.length === 0 ? <div className="meta">{t('fld.empty_sync')}</div> : (
          <>
            <ul className="field-list">
              {outbox.slice(0, 10).map(it => (
                <li key={it.client_id}>
                  <div>
                    <div className="label" style={{ fontSize: 11 }}>{it.resource_type} #{it.server_record_id ?? '?'}</div>
                    <div className="meta">{it.status}{it.last_error ? ` — ${it.last_error}` : ''} · thử {it.attempts} lần</div>
                  </div>
                  <span className="badge" style={{ fontSize: 10 }}>{it.status === 'dead' ? t('fld.st_error_caps') : t('fld.st_waiting_caps')}</span>
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="field-button" style={{ fontSize: 11, padding: '6px 8px' }}
                disabled={busy === 'flush'} onClick={flushNow}>{t('fld.btn_resend')}</button>
              {outbox.some(i => i.status === 'dead') && (
                <button className="field-button secondary" style={{ fontSize: 11, padding: '6px 8px' }} onClick={removeDead}>{t('fld.btn_delete_failed')}</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ===== Project / Area hierarchy (mục 43.8) =====
export function ProjectWbsSelection() {
  useLang(); // nhãn đổi theo nút [VI|EN] khi đang mở
  const [step, setStep] = useState(1);
  const [projectList, setProjectList] = useState([]);
  const [hierarchy, setHierarchy] = useState([]);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    projects.list().then(d => setProjectList(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (step === 2 && selected) {
      request(`/projects/${selected}/area-hierarchy`)
        .then(d => setHierarchy(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [step, selected]);
  return (
    <div>
      <div className="field-card">
        <h2>{t('fs.project_area')}</h2>
        {step === 1 ? (
          <>
            <p style={{ color: 'var(--c-text-2)', fontSize: 12, marginBottom: 12 }}>{t('fld.step1_pick_project')}{projectList.length} projects)</p>
            {projectList.map(p => (
              <button key={p.id} className="field-button" onClick={() => { setSelected(p.id); setStep(2); }}>
                {p.code} <span style={{ fontSize: 11, opacity: 0.7 }}>· {p.name_vi || p.name_en}</span>
              </button>
            ))}
            {projectList.length === 0 && <div className="empty">{t('fld.busy_loading')}</div>}
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
            {hierarchy.filter(n => n.level === 'zone').length === 0 && <div className="empty">{t('fld.empty_zone')}</div>}
            <button className="field-button" style={{ marginTop: 12, background: 'var(--c-surface-2)' }} onClick={() => setStep(1)}>{t('fld.back')}</button>
            <p className="empty" style={{ marginTop: 16, fontSize: 11 }}>{t('fld.hierarchy_note')}</p>
          </>
        )}
      </div>
    </div>
  );
}
