// AI provider config (v0.7.0 §1): switch chat/embed routing anytime, no restart.
// Admin/CEO only (backend enforces). Keys stay in env — this screen shows only
// presence booleans and the env var NAME. Includes usage + test-connection.
import { useEffect, useState } from 'react';
import { getToken } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';

const authH = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });
const PROVIDERS = ['openai', 'anthropic', 'google'];
const DEFAULT_ENVS = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', google: 'GOOGLE_API_KEY' };

export default function AiConfig() {
  const [configs, setConfigs] = useState([]);
  const [cap, setCap] = useState(20);
  const [mock, setMock] = useState(false);
  const [usage, setUsage] = useState({ rows: [], spent_usd: 0, cap_usd: 20 });
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ purpose: 'chat', provider: 'openai', model: '', priority: 0, enabled: true });

  async function load() {
    try {
      const c = await fetch('/api/ai/config', { headers: authH() }).then(r => r.json());
      if (c.error) throw new Error(c.error);
      setConfigs(c.configs || []);
      setCap(c.monthly_cap_usd ?? 20);
      setMock(!!c.mock);
      const u = await fetch('/api/ai/usage', { headers: authH() }).then(r => r.json());
      if (!u.error) setUsage(u);
    } catch (e) { toast.error('Lỗi tải cấu hình AI: ' + e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save(next) {
    setBusy(true);
    try {
      const r = await fetch('/api/ai/config', { method: 'PUT', headers: authH(), body: JSON.stringify({ configs: next, monthly_cap_usd: Number(cap) }) }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      toast.success('Đã lưu routing AI (hiệu lực ngay)');
      load();
    } catch (e) { toast.error('Lưu thất bại: ' + e.message); } finally { setBusy(false); }
  }

  function addRow() {
    if (!form.model.trim()) { toast.error('Nhập model (vd: gpt-4o-mini)'); return; }
    save([...configs.map(({ id, ...rest }) => rest), {
      purpose: form.purpose, provider: form.provider, model: form.model.trim(),
      api_key_env: DEFAULT_ENVS[form.provider], priority: Number(form.priority) || 0, enabled: form.enabled,
    }]);
  }

  async function testConn(purpose) {
    setBusy(true);
    try {
      const r = await fetch('/api/ai/test', { method: 'POST', headers: authH(), body: JSON.stringify({ purpose }) }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      toast.success(`OK: ${r.provider}/${r.model}`);
    } catch (e) { toast.error('Test thất bại: ' + e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Cấu hình AI</h1>
          <div className="meta">Đổi provider/model bất cứ lúc nào · key nằm trong env, không lưu DB{mock ? ' · MOCK MODE (không tốn tiền)' : ''}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-title"><span>Routing hiện tại</span>
          <span>
            <button className="btn btn-secondary" onClick={() => testConn('chat')} disabled={busy}>Test chat</button>{' '}
            <button className="btn btn-secondary" onClick={() => testConn('embed')} disabled={busy}>Test embed</button>
          </span>
        </div>
        <div className="data-table"><div className="data-table-body"><table>
          <thead><tr><th>Mục đích</th><th>Provider</th><th>Model</th><th>Key env</th><th>Có key</th><th>Ưu tiên</th><th>Bật</th><th></th></tr></thead>
          <tbody>
            {configs.length === 0 && <tr><td colSpan={8}>Chưa cấu hình — thêm dòng bên dưới.</td></tr>}
            {configs.map((c, i) => (
              <tr key={c.id ?? i}>
                <td><code>{c.purpose}</code></td>
                <td>{c.provider}</td>
                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.model}</td>
                <td><code style={{ fontSize: 11 }}>{c.api_key_env}</code></td>
                <td>{c.key_present ? '✓' : <span style={{ color: 'var(--c-critical)' }}>✗ thiếu</span>}</td>
                <td className="num">{c.priority}</td>
                <td>{c.enabled ? '✓' : '—'}</td>
                <td><button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => save(configs.filter((_, j) => j !== i).map(({ id, ...rest }) => rest))} disabled={busy}>Xóa</button></td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      </div>

      <div className="section">
        <div className="section-title"><span>Thêm routing</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })}>
            <option value="chat">chat</option>
            <option value="embed">embed</option>
          </select>
          <select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}>
            {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}
            placeholder="model (vd: gpt-4o-mini, claude-3-5-haiku-latest, gemini-2.0-flash)" style={{ flex: 1, minWidth: 220, padding: 6 }} />
          <label style={{ fontSize: 12 }}>Ưu tiên <input type="number" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={{ width: 50, padding: 6 }} /></label>
          <button className="btn" onClick={addRow} disabled={busy}><ICON.plus size={12} />Thêm &amp; lưu</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <label style={{ fontSize: 12 }}>Trần chi/tháng (USD) <input type="number" value={cap} onChange={e => setCap(e.target.value)} style={{ width: 70, padding: 6 }} /></label>
          <button className="btn btn-secondary" onClick={() => save(configs.map(({ id, ...rest }) => rest))} disabled={busy}>Lưu trần</button>
        </div>
      </div>

      <div className="section">
        <div className="section-title"><span>Chi tiêu tháng này</span>
          <span style={{ fontSize: 12 }}>${Number(usage.spent_usd || 0).toFixed(4)} / ${usage.cap_usd}</span></div>
        <div className="data-table"><div className="data-table-body"><table>
          <thead><tr><th>Provider</th><th>Model</th><th>Mục đích</th><th className="num">Calls</th><th className="num">Tokens in/out</th><th className="num">USD (ước)</th></tr></thead>
          <tbody>
            {(usage.rows || []).length === 0 && <tr><td colSpan={6}>Chưa có cuộc gọi nào.</td></tr>}
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
