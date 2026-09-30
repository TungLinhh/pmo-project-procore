import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { projects, attention, preferDemoProject } from '../api/index.js';
import { ICON } from '../icons.jsx';
import { t, useLang } from '../i18n/index.js';
import ProjectPicker from '../components/ProjectPicker.jsx';

// Hàm chứ không phải hằng ở cấp module: `t()` ở cấp module được tính MỌT LẦN
// lúc nạp nên bấm [VI|EN] sau đó nhãn vẫn giữ ngôn ngữ cũ. `HIGH` còn tệ hơn — nó
// viết thẳng chuỗi tiếng Việt nên không bao giờ được dịch. Đã mắc đúng lỗi này ở
// `LIFECYCLE_LABELS` (Materials) và `PRIORITY` (chính file này).
const PRIORITY_CLS = { HIGH: 'health-CRITICAL', MED: 'health-WATCH', LOW: 'health-ON_TRACK' };
const PRIORITY_KEY = { HIGH: 'att.sev_high', MED: 'att.sev_medium', LOW: 'att.sev_low' };
const priority = (level) => ({
  cls: PRIORITY_CLS[level] || PRIORITY_CLS.LOW,
  label: t(PRIORITY_KEY[level] || PRIORITY_KEY.LOW),
});

// `label` của nhóm payment do máy chủ ghép sẵn bằng tiếng Việt (bản tin email
// dùng chuỗi đó). Khi có `amount`/`due` thì ghép lại ở đây theo ngôn ngữ đang xem.
const itemLabel = (item) => (item.amount != null
  ? t('att.payment_item', { amount: Number(item.amount).toLocaleString('en-US'), due: item.due })
  : item.label);

// Tiêu đề nhóm do máy chủ gửi kèm (`title` tiếng Việt), nhưng API **đã gửi sẵn
// `key`** — nên dịch theo `key` thay vì hiện tiếng Việt trong chế độ EN. `title` làm
// dự phòng cho nhóm mới mà `key` chưa có khoá dịch: hiện tiếng Việt còn hơn mất
// nhãn.
const groupLabel = (group) => t(`att.group.${group.key}`) === `att.group.${group.key}`
  ? group.title
  : t(`att.group.${group.key}`);

export default function Attention() {
  useLang(); // đổi [VI|EN] phải thấy ngay
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [projectId, setProjectId] = useState(params.get('project'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    projects.list().then((list) => setProjectId((current) => current || preferDemoProject(list)))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!projectId) return;
    let live = true;
    setLoading(true);
    setError('');
    attention.get(projectId)
      .then((body) => { if (live) setData(body); })
      .catch((e) => { if (live) { setData(null); setError(e.message); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [projectId, reloadTick]);

  return <div>
    <div className="page-header">
      <div><h1>{t('att.h1')}</h1><div className="meta">{t('att.subtitle')}</div></div>
      <div className="page-header-right"><button className="btn btn-secondary" onClick={() => setReloadTick((n) => n + 1)}><ICON.sync size={13} />{t('att.btn_refresh')}</button></div>
    </div>
    <div className="filter-bar"><label>{t('att.lbl_project')}</label><ProjectPicker value={projectId} onChange={setProjectId} placeholder={t('att.pick_project_ph')} /></div>
    {error && <div className="empty gate-error"><strong>{t('att.err_load')}</strong><div>{error}</div></div>}
    {loading && <div className="empty">{t('att.busy_scanning')}</div>}
    {!loading && !error && data && <>
      <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {data.groups.map((group) => <div className={`kpi-card ${group.count ? 'critical' : 'on-track'}`} key={group.key}>
          <div className="label">{groupLabel(group)}</div><div className="value">{group.count}</div>
        </div>)}
      </div>
      <div className="pillar-grid">
        {data.groups.map((group) => <section className="pillar-card" key={group.key} style={{ cursor: 'default' }}>
          <div className="head"><h3>{groupLabel(group)}</h3><span className={`badge ${group.count ? 'health-CRITICAL' : 'workflow-APPROVED'}`}>{group.count}</span></div>
          {group.items.length ? <div className="breakdown">{group.items.map((item) => {
            const p = priority(item.priority);
            return <button className="row" key={`${group.key}-${item.id}`} onClick={() => nav(item.href)} style={{ border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
              <span className="k"><span className={`badge ${p.cls}`}>{p.label}</span> {item.code}</span>
              <span className="v">{itemLabel(item)} · {t('att.days_late', { n: item.days_late })} <ICON.arrow size={11} /></span>
            </button>;
          })}</div> : <div className="meta">{t('att.empty')}</div>}
          {group.count > group.items.length && <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => nav(group.href)}>{t('att.view_all')}{group.count}</button>}
        </section>)}
      </div>
    </>}
  </div>;
}
