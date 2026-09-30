// Backup — sao lưu dữ liệu hàng ngày (SRS NFR). Admin/CEO (server giữ chuẩn).
// Hiển thị lịch chạy, chính sách giữ bản, danh sách file + nút chạy tay.
import { useEffect, useState } from 'react';
import { request } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { t, th, useLang } from '../i18n/index.js';

const api = request;

const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round((b || 0) / 1024)} KB`);
const fmtTime = (s) => { try { return new Date(s).toLocaleString('vi-VN'); } catch { return s || '—'; } };

export default function Backup() {
  useLang(); // re-render table headers on VI/EN toggle
  const confirm = useConfirm();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setInfo(await api('/admin/backups')); }
    catch (e) { toast.error(t('bk.err_load') + e.message); }
  }
  useEffect(() => { load(); }, []);

  async function runNow() {
    const ok = await confirm({
      title: t('bk.btn_run_now'),
      message: t('bk.confirm_msg'),
      confirmText: t('bk.btn_backup'), confirmStyle: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api('/admin/backups/run', { method: 'POST' });
      toast.success(`Đã sao lưu ${r.file} (${fmtSize(r.size)})`);
      load();
    } catch (e) { toast.error(t('bk.err_run2') + e.message); } finally { setBusy(false); }
  }

  const rows = info?.backups || [];
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('bk.h1b')}</h1>
          <div className="meta">{t('bk.subtitle')}</div>
        </div>
        <div className="page-header-right">
          <button className="btn" onClick={runNow} disabled={busy}>{t('bk.btn_run_now')}</button>
        </div>
      </div>
      <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi-card on-track">
          <div className="label">{t('bk.lbl_last')}</div>
          <div className="value" style={{ fontSize: 18 }}>{info?.last_run ? fmtTime(info.last_run.at) : '—'}</div>
          <div className="sub">{info?.last_run?.error ? `Lỗi: ${info.last_run.error}` : 'pg_dump custom-format'}</div>
        </div>
        <div className="kpi-card">
          <div className="label">{t('bk.lbl_next')}</div>
          <div className="value" style={{ fontSize: 18 }}>{info?.next_run ? fmtTime(info.next_run) : '—'}</div>
          <div className="sub">{t('bk.daily_at', { h: String(info?.hour ?? 2).padStart(2, '0') })}</div>
        </div>
        <div className="kpi-card watch">
          <div className="label">{t('bk.lbl_retention')}</div>
          <div className="value">{rows.length}</div>
          <div className="sub">{t('bk.keep_policy', { n: info?.keep ?? 7 })}</div>
        </div>
        <div className="kpi-card">
          <div className="label">{t('bk.lbl_dir')}</div>
          <div className="value" style={{ fontSize: 13, wordBreak: 'break-all' }}>{info?.dir || '—'}</div>
          <div className="sub">{t('bk.dir_hint')}</div>
        </div>
      </div>
      <div className="section">
        <div className="section-title">{t('bk.sec_copies')}</div>
        <div className="data-table"><div className="data-table-body"><table>
          <thead><tr><th>{th("Tệp")}</th><th className="num">{th("Dung lượng")}</th><th>{th("Thời điểm")}</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.file}>
                <td><code>{b.file}</code></td>
                <td className="num">{fmtSize(b.size)}</td>
                <td>{fmtTime(b.mtime)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={3} style={{ color: 'var(--c-text-3)', fontSize: 12 }}>{t('bk.empty')}</td></tr>}
          </tbody>
        </table></div></div>
      </div>
    </div>
  );
}
