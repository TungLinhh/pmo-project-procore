// SSO & Du lieu (admin/ceo — server requireRole giu chuan).
// 3 nhom tac vu gon trong 1 trang: cau hinh IdP ngoai, trang thai ma hoa,
// hang doi DSR + so dong y PDPL. Role thuong khong thay nav (HqShell ROLE_HIDE).
import { useEffect, useState } from 'react';
import { trustAdmin, getUser } from '../api/index.js';
import { t, useLang } from '../i18n/index.js';
import { toast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';

export default function DataSecurity() {
  useLang();
  const confirm = useConfirm();
  const user = getUser() || {};
  const [status, setStatus] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [issuer, setIssuer] = useState('');
  const [clientId, setClientId] = useState('');
  const [secretEnv, setSecretEnv] = useState('SSO_CLIENT_SECRET');
  const [inlineSecret, setInlineSecret] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [autoProv, setAutoProv] = useState(false);
  const [defRole, setDefRole] = useState('site');
  const [busy, setBusy] = useState(false);
  const [dsr, setDsr] = useState(null);
  const [note, setNote] = useState('');

  async function load() {
    try {
      const s = await trustAdmin.securityStatus();
      setStatus(s);
    } catch (e) { toast.error(t('ds.load_fail') + e.message); return; }
    try {
      const c = await trustAdmin.ssoGet();
      setCfg(c.config);
      if (c.config) {
        setIssuer(c.config.issuer || '');
        setClientId(c.config.client_id || '');
        setSecretEnv(c.config.secret_env || 'SSO_CLIENT_SECRET');
        setEnabled(!!c.config.enabled);
        setAutoProv(!!c.config.auto_provision);
        setDefRole(c.config.default_role || 'site');
      }
    } catch (e) { toast.error(t('ds.sso_load_fail') + e.message); }
    try {
      setDsr(await trustAdmin.dsr());
    } catch (e) { toast.error(t('ds.dsr_load_fail') + e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!issuer.trim() || !clientId.trim()) { toast.error(t('ds.sso_save_fail') + 'issuer + client_id'); return; }
    setBusy(true);
    try {
      await trustAdmin.ssoSave({
        issuer: issuer.trim(), client_id: clientId.trim(), secret_env: secretEnv.trim() || 'SSO_CLIENT_SECRET',
        enabled, auto_provision: autoProv, default_role: defRole,
        ...(inlineSecret ? { client_secret: inlineSecret } : {}),
      });
      toast.success(t('ds.sso_saved'));
      setInlineSecret('');
      load();
    } catch (e) { toast.error(t('ds.sso_save_fail') + e.message); } finally { setBusy(false); }
  }

  async function remove() {
    const ok = await confirm({
      title: t('ds.sso_delete') + '?',
      message: t('ds.sso_removal_note'),
      confirmText: t('ds.sso_delete'), confirmStyle: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await trustAdmin.ssoDelete();
      toast.success(t('ds.sso_deleted'));
      setCfg(null);
      load();
    } catch (e) { toast.error(t('ds.sso_save_fail') + e.message); } finally { setBusy(false); }
  }

  async function testConn() {
    setBusy(true);
    try {
      await trustAdmin.ssoTest(issuer.trim() || undefined);
      toast.success(t('ds.sso_test_ok'));
    } catch (e) { toast.error(t('ds.sso_test_fail') + e.message); } finally { setBusy(false); }
  }

  async function resolve(id, decision) {
    setBusy(true);
    try {
      await trustAdmin.dsrResolve(id, decision, note.trim() || undefined);
      toast.success(t('ds.dsr_done_ok'));
      setNote('');
      const [s, q] = await Promise.all([trustAdmin.securityStatus(), trustAdmin.dsr()]);
      setStatus(s); setDsr(q);
    } catch (e) { toast.error(t('ds.dsr_fail') + e.message); } finally { setBusy(false); }
  }

  const enc = status?.encryption;
  const encOn = !!enc?.configured;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('ds.title')}</h1>
          <div className="meta">{user.email || ''} — {t('ds.sub')}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">{t('ds.sso_title')}</div>
        <div className="pillar-card" style={{ cursor: 'default', display: 'grid', gap: 8, fontSize: 12.5 }}>
          <div style={{ color: 'var(--c-text-2)' }}>{t('ds.sso_hint')}</div>
          <label>{t('ds.sso_issuer')}
            <input value={issuer} onChange={(e) => setIssuer(e.target.value)} style={{ marginLeft: 6, width: 320 }} placeholder="https://idp.congty.vn" />
          </label>
          <label>{t('ds.sso_client')}
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ marginLeft: 6, width: 240 }} />
          </label>
          <label>{t('ds.sso_secret_env')}
            <input value={secretEnv} onChange={(e) => setSecretEnv(e.target.value)} style={{ marginLeft: 6, width: 240 }} />
          </label>
          <label>{t('ds.sso_inline')}
            <input type="password" value={inlineSecret} onChange={(e) => setInlineSecret(e.target.value)} style={{ marginLeft: 6, width: 240 }} autoComplete="off" />
          </label>
          <div style={{ color: 'var(--c-text-2)', fontSize: 12 }}>{t('ds.sso_inline_hint')}</div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {t('ds.sso_enabled')}
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={autoProv} onChange={(e) => setAutoProv(e.target.checked)} /> {t('ds.sso_autoprov')}
          </label>
          <div style={{ color: 'var(--c-text-2)', fontSize: 12 }}>{t('ds.sso_autoprov_hint')}</div>
          <label>{t('ds.sso_role')}
            <select value={defRole} onChange={(e) => setDefRole(e.target.value)} style={{ marginLeft: 6 }}>
              {['site', 'pm', 'pmo', 'procurement', 'accounting'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={save} disabled={busy}>{t('ds.sso_save')}</button>
            <button className="btn btn-sm" onClick={testConn} disabled={busy}>{t('ds.sso_test')}</button>
            {cfg && <button className="btn btn-sm" onClick={remove} disabled={busy}>{t('ds.sso_delete')}</button>}
          </div>
          {!cfg && <div style={{ color: 'var(--c-text-2)' }}>{t('ds.sso_not_configured')}</div>}
        </div>
      </div>

      <div className="section">
        <div className="section-title">{t('ds.enc_title')}</div>
        <div className="pillar-card" style={{ cursor: 'default' }}>
          <div className="head">
            <h3>AES-256-GCM</h3>
            <span className={`badge ${encOn ? 'workflow-APPROVED' : 'workflow-PENDING'}`}>
              {enc == null ? '…' : encOn ? t('ds.enc_configured') : t('ds.enc_not_configured')}
            </span>
          </div>
          <div style={{ fontSize: 12.5, display: 'grid', gap: 6 }}>
            <div><strong>{t('ds.enc_cols')}:</strong> <code>{(enc?.columns || []).join(', ')}</code></div>
            <div style={{ color: 'var(--c-text-2)' }}>{t('ds.enc_tax_note')}</div>
            <div><strong>{t('ds.enc_tls')}:</strong> {status?.tls?.hsts_active ? t('ds.enc_hsts_on') : t('ds.enc_hsts_off')}</div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">{t('ds.dsr_title')} {dsr ? `(${dsr.pending} ${t('ds.dsr_pending')})` : ''}</div>
        <div className="pillar-card" style={{ cursor: 'default', display: 'grid', gap: 8, fontSize: 12.5 }}>
          <div style={{ color: 'var(--c-text-2)' }}>{t('ds.dsr_erase_warn')}</div>
          <label>{t('ds.dsr_note_ph')}
            <input value={note} onChange={(e) => setNote(e.target.value)} style={{ marginLeft: 6, width: 280 }} maxLength={500} />
          </label>
          {(!dsr?.requests || !dsr.requests.length) ? (
            <div style={{ color: 'var(--c-text-2)' }}>{t('ds.dsr_empty')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {dsr.requests.map((r) => (
                <div key={r.id} className="field-stat" style={{ alignItems: 'center' }}>
                  <span className="k">#{r.id} {r.type} · {r.email}</span>
                  <span className="v" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {r.status}{r.detail ? ` — ${String(r.detail).slice(0, 80)}` : ''}
                    {r.status === 'PENDING' && (
                      <>
                        <button className="btn btn-sm" onClick={() => resolve(r.id, 'DONE')} disabled={busy}>{t('ds.dsr_approve')}</button>
                        <button className="btn btn-sm" onClick={() => resolve(r.id, 'REJECTED')} disabled={busy}>{t('ds.dsr_reject')}</button>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-title">{t('ds.consents_title')} (v{status?.pdpl?.policy_version || '…'})</div>
        <div className="pillar-card" style={{ cursor: 'default', fontSize: 12.5 }}>
          <div className="field-stat"><span className="k">{t('ds.consents_purpose')}</span><span className="v">{t('ds.consents_granted')} / {t('ds.consents_total')}</span></div>
          {(status?.pdpl?.consents || []).map((c) => (
            <div key={c.purpose} className="field-stat">
              <span className="k">{c.purpose}</span>
              <span className="v">{c.granted} / {c.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
