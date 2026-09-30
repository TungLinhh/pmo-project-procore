// Master Data Edit — một form cho cả **tạo mới** và **sửa**.
//
//   ?r=vendors            → tạo mới
//   ?r=vendors&id=12      → sửa bản ghi 12
//
// Quy ết định 2026-09-27: ẩn là **xoá mềm** (server đặt `status = 'INACTIVE'`),
// bản ghi còn nguyên nên hợp đồng / báo cáo đã tham chiếu vẫn tra cứu được.
// Không có nút xoá cứng ở đây, cũng cố ý.
//
// Cột nào cho sửa phải khớp với `updatableColumns()` ở
// `backend/src/routes/master-data.js` — server chặn cột ngoài allowlist và trả
// 400. Nếu hai danh sách lệch nhau thì người dùng điền xong bấm Lưu rồi mới biết
// bị chặn, nên `EDIT_BLOCKED` ở đây khai báo trước lý do để form không hiện ô
// không lưu được.
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { masterData } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';
import { t, useLang } from '../i18n/index.js';

// [tên cột, nhãn, bắt buộc?]
const FIELDS = {
  vendors: [['code', 'md.f_code', true], ['name', 'md.f_name', true], ['tax_id', 'md.f_tax_id'], ['contact', 'md.f_contact'], ['category', 'md.f_category']],
  subcontractors: [['name', 'md.f_name', true], ['capability_summary', 'md.f_capability']],
  // business_processes requires BOTH code and name server-side; bản cũ chỉ có
  // `name` nên tạo từ màn này luôn 400.
  'business-processes': [['code', 'md.f_code', true], ['name', 'md.f_name', true], ['description', 'md.f_description']],
  suppliers: [['name', 'md.f_name', true], ['system', 'md.f_system'], ['category', 'md.f_category'], ['contact', 'md.f_contact'], ['location', 'md.f_location']],
  workers: [['code', 'md.f_code'], ['full_name', 'md.f_full_name', true], ['phone', 'md.f_phone'], ['role', 'md.f_role']],
  teams: [['code', 'md.f_code'], ['name', 'md.f_name', true]],
  departments: [['code', 'md.f_code', true], ['name_vi', 'md.f_dept_name', true]],
};

// Khớp với `UNIQUE_KEY_COLUMNS` + `RELATION_COLUMNS` ở server. Sửa mã là sửa
// khoá nghiệp vụ (dữ liệu lịch sử không còn khớp); khoá ngoại đã qua kiểm tra ở
// route chuyên biệt nên form chung không được ghi đè.
const EDIT_BLOCKED = new Set(['code', 'lead_worker_id', 'team_id', 'parent_id']);

const STATUSES = ['ACTIVE', 'INACTIVE', 'CLOSED', 'MERGED'];

// Danh mục không có cột `status` → không ẩn/kích hoạt lại được, server trả 409.
const NO_STATUS = new Set(['business-processes']);

export default function MasterDataEdit() {
  useLang(); // nhãn trong form đổi theo nút [VI|EN] khi đang mở
  const [params] = useSearchParams();
  const nav = useNavigate();
  const resource = params.get('r') || 'subcontractors';
  const id = params.get('id');
  const isEdit = Boolean(id);
  const allFields = FIELDS[resource] || [['name', 'md.f_name', true]];
  // Chế độ sửa: bỏ cột bị chặn, và hiện thêm ô trạng thái để sửa được luôn.
  const fields = isEdit ? allFields.filter(([k]) => !EDIT_BLOCKED.has(k)) : allFields;
  const hasStatus = !NO_STATUS.has(resource);

  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [row, setRow] = useState(null);

  // Sửa: nạp bản ghi để điền sẵn. Không có bước này thì bấm "Sửa" ra form rỗng
  // rồi Lưu sẽ xoá sạch dữ liệu — nên lỗi tải phải hiện ra, không nuốt.
  useEffect(() => {
    if (!isEdit) { setForm({}); setRow(null); setLoading(false); return; }
    let live = true;
    setLoading(true);
    setLoadError('');
    masterData.list(resource)
      .then((rows) => {
        if (!live) return;
        const found = (Array.isArray(rows) ? rows : []).find((r) => String(r.id) === String(id));
        if (!found) { setLoadError(t('md.not_found')); setRow(null); return; }
        setRow(found);
        setForm(Object.fromEntries(fields.map(([k]) => [k, found[k] ?? ''])));
      })
      .catch((e) => { if (live) setLoadError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // `fields` suy ra từ `resource`+`isEdit`, không cần trong deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, id]);

  async function save() {
    const body = {};
    for (const [k] of fields) {
      // Phải phân biệt "trường không có trong form" với "người dùng **xoá hết**
      // nội dung". Trước đây `(form[k] || '').trim()` là falsy với `''` nên khoá bị
      // bỏ khỏi `body` hoàn toàn ⇒ `PATCH` không chạm vào cột đó ⇒ xoá xong bấm Lưu
      // vẫn báo `md.saved` và mở lại thì chữ cũ vẫn còn. Tệ hơn báo sai: người dùng
      // tin là đã xoá.
      // `master-data.js:269` đã hiểu `null` là "xoá ô" (`if (v === null) patch[k] = null`).
      const v = form[k];
      if (v == null) continue;
      const trimmed = String(v).trim();
      body[k] = trimmed === '' ? null : trimmed;
    }
    if (hasStatus && form.status) body.status = form.status;
    if (!isEdit && !body.name && !body.full_name && !body.code) {   // null = rỗng, vẫn bị bắt
      toast.error(t('md.need_name')); return;
    }
    setBusy(true);
    try {
      if (isEdit) {
        await masterData.update(resource, id, body);
        toast.success(t('md.saved'));
      } else {
        const r = await masterData.create(resource, body);
        toast.success(t('md.created', { id: r.id }));
      }
      nav(-1);
    } catch (e) {
      // Server kèm `allowed_status` khi trạng thái sai — hiện luôn giá trị hợp
      // lệ thay vì chỉ báo "giá trị không hợp lệ" khiến người dùng không biết
      // phải chọn cái gì.
      const allowed = e.response?.allowed_status;
      toast.error(allowed
        ? `${e.message} — ${allowed.join(' · ')}`
        : `${t('md.save_failed')}: ${e.message}`);
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{isEdit ? t('md.title_edit', { id }) : t('md.title_create', { r: resource })}</h1>
          <div className="meta">
            {isEdit ? t('md.meta_edit', { id }) : t('md.meta_create')}
          </div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={() => nav(-1)}>{t('md.cancel')}</button>
          <button className="btn" onClick={save} disabled={busy || loading || Boolean(loadError)}>
            <ICON.check size={13} />{busy ? t('md.saving') : t('md.save')}
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="card" style={{ padding: 20, maxWidth: 560 }}>
          <div className="empty">{t('md.load_failed', { reason: loadError })}</div>
          <button className="btn btn-secondary" onClick={() => nav(-1)}>{t('md.back')}</button>
        </div>
      ) : (
        <div className="card" style={{ padding: 20, maxWidth: 560, display: 'grid', gap: 10 }}>
          {loading ? <div className="empty">{t('md.loading')}</div> : (
            <>
              {fields.map(([k, label, required]) => (
                <label key={k}>
                  <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t(label)}{required ? ' *' : ''}</div>
                  <input
                    value={form[k] || ''}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    style={{ width: '100%', padding: 6 }}
                  />
                </label>
              ))}
              {hasStatus && (
                <label>
                  <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('md.f_status')}</div>
                  <select
                    value={form.status || (row?.status ?? 'ACTIVE')}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    style={{ width: '100%', padding: 6 }}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{t(`md.status_${s.toLowerCase()}`)}</option>)}
                  </select>
                </label>
              )}
              {isEdit && (
                <p style={{ fontSize: 11, color: 'var(--c-text-2)', margin: 0 }}>
                  {t('md.code_locked')}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
