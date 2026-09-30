// Security — bao mat ca nhan: doi mat khau + MFA TOTP (SRS: ca nhan + MFA
// truoc production) + SSO lien ket + Quyen rieng tu PDPL (task 10).
// Moi role deu dung duoc (server tu kiem tra).
import { useEffect, useState } from 'react';
import { mfa, sso, privacy, getUser } from '../api/index.js';
import { t, useLang } from '../i18n/index.js';
import { toast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';

export default function Security() {
  useLang();
  const confirm = useConfirm();
  const user = getUser() || {};
  const [mfaOn, setMfaOn] = useState(null);
  const [secret, setSecret] = useState(null);
  const [otpUrl, setOtpUrl] = useState('');
  const [code, setCode] = useState('');
  const [disPw, setDisPw] = useState('');
  const [oldPw, setOldPw] = useState('');
  const [newPw1, setNewPw1] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [busy, setBusy] = useState(false);
  // SSO lien ket
  const [ssoLinked, setSsoLinked] = useState(null);
  const [ssoIssuer, setSsoIssuer] = useState('');
  const [ssoEmail, setSsoEmail] = useState(user.email || '');
  // PDPL
  const [pdpl, setPdpl] = useState(null);
  const [eraseReason, setEraseReason] = useState('');
  const [myName, setMyName] = useState(user.full_name || user.name || '');

  async function load() {
    try {
      const s = await mfa.status();
      setMfaOn(!!s.mfa_enabled);
    } catch (e) { toast.error(t('sec.mfa_load_fail') + e.message); }
    try {
      const g = await sso.mine();
      setSsoLinked(!!g.linked);
      setSsoIssuer(g.issuer || '');
    } catch { setSsoLinked(false); }
    try {
      const p = await privacy.get();
      setPdpl(p);
    } catch (e) { toast.error(t('sec.pdpl_load_fail') + e.message); }
  }
  useEffect(() => { load(); }, []);

  async function setup() {
    setBusy(true);
    try {
      const r = await mfa.setup();
      setSecret(r.secret); setOtpUrl(r.otpauth_url); setCode('');
      toast.info(t('sec.mfa_setup_hint'));
    } catch (e) { toast.error(t('sec.mfa_setup_fail') + e.message); } finally { setBusy(false); }
  }

  async function enable() {
    if (!/^\d{6}$/.test(code.trim())) { toast.error(t('sec.mfa_bad')); return; }
    setBusy(true);
    try {
      await mfa.enable(code.trim());
      toast.success(t('sec.mfa_enabled_ok'));
      setSecret(null); setCode('');
      load();
    } catch (e) { toast.error(t('sec.mfa_enable_fail') + e.message); } finally { setBusy(false); }
  }

  async function disable() {
    if (!disPw) { toast.error(t('sec.mfa_need_pass')); return; }
    setBusy(true);
    try {
      await mfa.disable(disPw);
      toast.success(t('sec.mfa_disabled_ok'));
      setDisPw('');
      load();
    } catch (e) { toast.error(t('sec.mfa_disable_fail') + e.message); } finally { setBusy(false); }
  }

  async function changePw() {
    if (newPw1 !== newPw2) { toast.error(t('sec.pw_mismatch')); return; }
    if (newPw1.length < 10) { toast.error(t('sec.pw_short')); return; }
    setBusy(true);
    try {
      await mfa.changePassword(oldPw, newPw1);
      toast.success(t('sec.pw_ok'));
      setOldPw(''); setNewPw1(''); setNewPw2('');
    } catch (e) { toast.error(t('sec.pw_fail') + e.message); } finally { setBusy(false); }
  }

  async function linkSso() {
    if (!ssoEmail || !/^\S+@\S+\.\S+$/.test(ssoEmail.trim())) { toast.error(t('login.email')); return; }
    setBusy(true);
    try {
      const r = await sso.start(ssoEmail.trim().toLowerCase());
      if (!r?.auth_url) throw new Error(t('login.failed'));
      window.location.href = r.auth_url;
    } catch (e) { toast.error(t('sec.sso_fail') + e.message); } finally { setBusy(false); }
  }

  async function unlinkSso() {
    setBusy(true);
    try {
      await sso.unlink();
      toast.success(t('sec.sso_unlinked_ok'));
      load();
    } catch (e) { toast.error(t('sec.sso_fail') + e.message); } finally { setBusy(false); }
  }

  async function setConsent(purpose, granted) {
    setBusy(true);
    try {
      await privacy.consent(purpose, granted);
      toast.success(t('sec.pdpl_updated'));
      const p = await privacy.get();
      setPdpl(p);
    } catch (e) { toast.error(t('sec.pdpl_update_fail') + e.message); } finally { setBusy(false); }
  }

  async function downloadExport() {
    setBusy(true);
    try {
      const j = await privacy.exportData();
      const blob = new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `my-data-${user.email || 'user'}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast.error(t('sec.pdpl_export_fail') + e.message); } finally { setBusy(false); }
  }

  async function saveName() {
    if (!myName.trim()) { toast.error(t('sec.pdpl_rectify_fail') + 'empty'); return; }
    setBusy(true);
    try {
      await privacy.rename(myName.trim());
      toast.success(t('sec.pdpl_rectify_ok'));
    } catch (e) { toast.error(t('sec.pdpl_rectify_fail') + e.message); } finally { setBusy(false); }
  }

  async function requestErase() {
    const ok = await confirm({
      title: t('sec.pdpl_erase_confirm'),
      message: t('sec.erase_note'),
      confirmText: t('sec.pdpl_erase_confirm'), confirmStyle: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await privacy.requestDsr('ERASE', eraseReason.trim() || undefined);
      toast.success(t('sec.pdpl_erase_sent'));
      setEraseReason('');
      const p = await privacy.get();
      setPdpl(p);
    } catch (e) { toast.error(t('sec.pdpl_erase_fail') + e.message); } finally { setBusy(false); }
  }

  const statusBadge = (st) => st === 'PENDING' ? t('sec.status_pending') : st === 'DONE' ? t('sec.status_done') : t('sec.status_rejected');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('sec.title')}</h1>
          <div className="meta">{user.email || ''} — {t('sec.sub')}</div>
        </div>
      </div>
      <div className="section">
        <div className="section-title">{t('sec.mfa_title')}</div>
        <div className="pillar-card" style={{ cursor: 'default' }}>
          <div className="head">
            <h3>{t('sec.mfa_status')}</h3>
            <span className={`badge ${mfaOn ? 'workflow-APPROVED' : 'workflow-PENDING'}`}>
              {mfaOn == null ? '…' : mfaOn ? t('sec.mfa_on') : t('sec.mfa_off')}
            </span>
          </div>
          {!mfaOn && !secret && (
            <button className="btn btn-sm" onClick={setup} disabled={busy}>{t('sec.mfa_setup_btn')}</button>
          )}
          {!mfaOn && secret && (
            <div style={{ fontSize: 12.5, display: 'grid', gap: 8 }}>
              <div>{t('sec.mfa_secret_label')} <code style={{ userSelect: 'all' }}>{secret}</code></div>
              <div style={{ wordBreak: 'break-all', color: 'var(--c-text-2)' }}>{otpUrl}</div>
              <label>{t('sec.mfa_code_label')}
                <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} style={{ marginLeft: 6, width: 110 }} />
              </label>
              <div><button className="btn btn-sm" onClick={enable} disabled={busy}>{t('sec.mfa_enable_btn')}</button></div>
            </div>
          )}
          {mfaOn && (
            <div style={{ fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{t('sec.mfa_every_login')}</span>
              <label>{t('sec.mfa_cur_pass')}
                <input type="password" value={disPw} onChange={(e) => setDisPw(e.target.value)} style={{ marginLeft: 6, width: 150 }} autoComplete="current-password" />
              </label>
              <button className="btn btn-sm" onClick={disable} disabled={busy}>{t('sec.mfa_disable_btn')}</button>
            </div>
          )}
        </div>
      </div>
      <div className="section">
        <div className="section-title">{t('sec.pw_title')}</div>
        <div className="pillar-card" style={{ cursor: 'default', display: 'grid', gap: 8, fontSize: 12.5 }}>
          <label>{t('sec.pw_cur')}
            <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} style={{ marginLeft: 6, width: 180 }} autoComplete="current-password" />
          </label>
          <label>{t('sec.pw_new')}
            <input type="password" value={newPw1} onChange={(e) => setNewPw1(e.target.value)} style={{ marginLeft: 6, width: 180 }} autoComplete="new-password" />
          </label>
          <label>{t('sec.pw_new2')}
            <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} style={{ marginLeft: 6, width: 180 }} autoComplete="new-password" />
          </label>
          <div><button className="btn btn-sm" onClick={changePw} disabled={busy}>{t('sec.pw_btn')}</button></div>
        </div>
      </div>
      <div className="section">
        <div className="section-title">{t('sec.sso_title')}</div>
        <div className="pillar-card" style={{ cursor: 'default' }}>
          <div className="head">
            <h3>SSO</h3>
            <span className={`badge ${ssoLinked ? 'workflow-APPROVED' : 'workflow-PENDING'}`}>
              {ssoLinked == null ? '…' : ssoLinked ? t('sec.sso_linked') : t('sec.sso_not_linked')}
            </span>
          </div>
          {ssoLinked ? (
            <div style={{ fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ wordBreak: 'break-all' }}>{ssoIssuer}</code>
              <button className="btn btn-sm" onClick={unlinkSso} disabled={busy}>{t('sec.sso_unlink_btn')}</button>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, display: 'grid', gap: 8 }}>
              <div style={{ color: 'var(--c-text-2)' }}>{t('sec.sso_link_hint')}</div>
              <label>{t('sec.sso_email_ph')}
                <input value={ssoEmail} onChange={(e) => setSsoEmail(e.target.value)} style={{ marginLeft: 6, width: 220 }} autoComplete="email" />
              </label>
              <div><button className="btn btn-sm" onClick={linkSso} disabled={busy}>{t('sec.sso_link_btn')}</button></div>
            </div>
          )}
        </div>
      </div>
      <div className="section">
        <div className="section-title">{t('sec.pdpl_title')}</div>
        <div className="pillar-card" style={{ cursor: 'default', display: 'grid', gap: 10, fontSize: 12.5 }}>
          <div style={{ color: 'var(--c-text-2)' }}>{t('sec.pdpl_sub')} (v{pdpl?.policy_version || '…'})</div>
          {(pdpl?.purposes || []).map((p) => (
            <div key={p.purpose} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ minWidth: 150 }}>{p.title_vi}</strong>
              <span style={{ color: 'var(--c-text-2)', flex: 1, minWidth: 200 }}>{p.desc_vi}</span>
              {p.required ? (
                <span className="badge workflow-APPROVED">{t('sec.pdpl_required')}</span>
              ) : (
                <button className="btn btn-sm" onClick={() => setConsent(p.purpose, !p.granted)} disabled={busy}>
                  {p.granted ? t('sec.pdpl_on') : t('sec.pdpl_off')}
                </button>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={downloadExport} disabled={busy}>{t('sec.pdpl_export_btn')}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label>{t('sec.pdpl_name_label')}
              <input value={myName} onChange={(e) => setMyName(e.target.value)} style={{ marginLeft: 6, width: 200 }} maxLength={200} />
            </label>
            <button className="btn btn-sm" onClick={saveName} disabled={busy}>{t('sec.pdpl_rectify_btn')}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={eraseReason} onChange={(e) => setEraseReason(e.target.value)} placeholder={t('sec.pdpl_erase_reason_ph')} style={{ width: 240 }} maxLength={500} />
            <button className="btn btn-sm" onClick={requestErase} disabled={busy}>{t('sec.pdpl_erase_btn')}</button>
          </div>
          <div>
            <strong>{t('sec.pdpl_reqs_title')}</strong>
            {(!pdpl?.requests || !pdpl.requests.length) ? (
              <div style={{ color: 'var(--c-text-2)' }}>{t('sec.pdpl_reqs_empty')}</div>
            ) : (
              <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
                {pdpl.requests.map((r) => (
                  <div key={r.id} className="field-stat">
                    <span className="k">#{r.id} {r.type}</span>
                    <span className="v">{statusBadge(r.status)}{r.resolve_note ? ` — ${r.resolve_note}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
