// AI provider config (v0.7.0 §1): switch chat/embed routing anytime, no restart.
// Admin/CEO only (backend enforces). Keys stay in env — this screen shows only
// presence booleans and the env var NAME. Includes usage + test-connection.
import { useEffect, useState } from 'react';
import { request } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';
import { t, th, useLang } from '../i18n/index.js';
const PROVIDERS = ['openai', 'anthropic', 'google', 'openrouter'];
const DEFAULT_ENVS = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', google: 'GOOGLE_API_KEY', openrouter: 'OPENROUTER_API_KEY' };

export default function AiConfig() {
  useLang(); // re-render table headers on VI/EN toggle
  const [configs, setConfigs] = useState([]);
  const [cap, setCap] = useState(20);
  const [mock, setMock] = useState(false);
  const [usage, setUsage] = useState({ rows: [], spent_usd: 0, cap_usd: 20 });
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ purpose: 'chat', provider: 'openai', model: '', priority: 0, enabled: true });

  async function load() {
    try {
      const c = await request('/ai/config');
      setConfigs(c.configs || []);
      setCap(c.monthly_cap_usd ?? 20);
      setMock(!!c.mock);
      const u = await request('/ai/usage');
      setUsage(u);
    } catch (e) { toast.error(t('aic.err_load') + e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save(next) {
    const capValue = Number(cap);
    if (!Number.isFinite(capValue) || capValue <= 0) { toast.error(t('aic.err_cap_zero')); return; }
    setBusy(true);
    try {
      await request('/ai/config', { method: 'PUT', body: { configs: next, monthly_cap_usd: capValue } });
      toast.success(t('aic.toast_routing'));
      load();
    } catch (e) { toast.error(t('aic.err_save') + e.message); } finally { setBusy(false); }
  }

  function addRow() {
    if (!form.model.trim()) { toast.error(t('aic.model_ph')); return; }
    save([...configs.map(({ id: _id, ...rest }) => rest), {
      purpose: form.purpose, provider: form.provider, model: form.model.trim(),
      api_key_env: DEFAULT_ENVS[form.provider], priority: Number(form.priority) || 0, enabled: form.enabled,
    }]);
  }

  async function testConn(purpose) {
    setBusy(true);
    try {
      const r = await request('/ai/test', { method: 'POST', body: { purpose } });
      toast.success(`OK: ${r.provider}/${r.model}`);
    } catch (e) { toast.error(t('aic.err_test') + e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('aic.h1')}</h1>
          <div className="meta">{t('aic.key_note')}{mock ? t('aic.suffix_mock') : ''}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-title"><span>{t('aic.sec_routing')}</span>
          <span>
            <button className="btn btn-secondary" onClick={() => testConn('chat')} disabled={busy}>{t('aic.test_chat')}</button>{' '}
            <button className="btn btn-secondary" onClick={() => testConn('embed')} disabled={busy}>{t('aic.test_embed')}</button>
          </span>
        </div>
        <div className="data-table"><div className="data-table-body"><table>
          <thead><tr><th>{th("Mục đích")}</th><th>{th("Nhà cung cấp")}</th><th>{th("Mô hình")}</th><th>{th("Biến môi trường chứa key")}</th><th>{th("Đã có key")}</th><th>{th("Ưu tiên")}</th><th>{th("Bật")}</th><th></th></tr></thead>
          <tbody>
            {configs.length === 0 && <tr><td colSpan={8}>{t('aic.empty')}</td></tr>}
            {configs.map((c, i) => (
              <tr key={c.id ?? i}>
                <td><code>{c.purpose}</code></td>
                <td>{c.provider}</td>
                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.model}</td>
                <td><code style={{ fontSize: 11 }}>{c.api_key_env}</code></td>
                <td>{c.key_present ? '✓' : <span style={{ color: 'var(--c-critical)' }}>{t('aic.missing')}</span>}</td>
                <td className="num">{c.priority}</td>
                <td>{c.enabled ? '✓' : '—'}</td>
                <td><button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => save(configs.filter((_, j) => j !== i).map(({ id: _id, ...rest }) => rest))} disabled={busy}>{t('aic.btn_delete')}</button></td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      </div>

      <div className="section">
        <div className="section-title"><span>{t('aic.btn_add_routing')}</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })}>
            <option value="chat">chat</option>
            <option value="embed">embed</option>
          </select>
          <select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}>
            {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}
            placeholder="model (vd: nvidia/nemotron-3-ultra-550b-a55b:free, stealth/space-bunny-alpha, nvidia/nemotron-3-embed-1b:free)" style={{ flex: 1, minWidth: 220, padding: 6 }} />
          <label style={{ fontSize: 12 }}>{t('aic.lbl_priority')}<input type="number" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={{ width: 50, padding: 6 }} /></label>
          <button className="btn" onClick={addRow} disabled={busy}><ICON.plus size={12} />{t('aic.btn_add_save')}</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <label style={{ fontSize: 12 }}>{t('aic.lbl_month_cap')}<input type="number" min="0.01" step="0.01" value={cap} onChange={e => setCap(e.target.value)} style={{ width: 70, padding: 6 }} /></label>
          <button className="btn btn-secondary" onClick={() => save(configs.map(({ id: _id, ...rest }) => rest))} disabled={busy}>{t('aic.btn_save_cap')}</button>
        </div>
      </div>

      <div className="section">
        <div className="section-title"><span>{t('aic.lbl_spend_month')}</span>
          <span style={{ fontSize: 12 }}>${Number(usage.spent_usd || 0).toFixed(4)} / ${usage.cap_usd}</span></div>
        <div className="data-table"><div className="data-table-body"><table>
          <thead><tr><th>{th("Nhà cung cấp")}</th><th>{th("Mô hình")}</th><th>{th("Mục đích")}</th><th className="num">{th("Số lần gọi")}</th><th className="num">{th("Token vào/ra")}</th><th className="num">{th("USD (ước)")}</th></tr></thead>
          <tbody>
            {(usage.rows || []).length === 0 && <tr><td colSpan={6}>{t('aic.empty_calls')}</td></tr>}
            {(usage.rows || []).map((r, i) => (
              <tr key={i}><td>{r.provider}</td><td style={{ fontSize: 11 }}>{r.model}</td><td>{r.purpose}</td>
                <td className="num">{r.calls}</td><td className="num">{r.tokens_in}/{r.tokens_out}</td>
                <td className="num">${Number(r.est_cost_usd || 0).toFixed(4)}</td></tr>
            ))}
          </tbody>
        </table></div></div>
      </div>
    </div>
  );
}
