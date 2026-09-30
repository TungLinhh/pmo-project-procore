import { t, useLang } from '../i18n/index.js';

export default function TablePagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  unitKey = 'unit.item',
}) {
  // Component dùng chung nên phải re-render khi bấm [VI|EN]; nếu không,
  // thanh phân trang là thứ duy nhất còn tiếng Việt trên trang khi bật EN.
  useLang();
  if (!total) return null;
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  return (
    <div className="table-pagination" aria-label={t('pag.aria')}>
      <span className="table-pagination-count">
        {t('pag.showing', { start, end, total, unit: t(unitKey) })}
      </span>
      <div className="table-pagination-controls">
        {onPageSizeChange && (
          <label className="table-page-size">
            {t('pag.show')}
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              aria-label={t('pag.per_page')}
            >
              {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          aria-label={t('pag.prev')}
        >
          ‹
        </button>
        <span className="table-page-count">{t('pag.page_of', { page: safePage, pages: pageCount })}</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= pageCount}
          aria-label={t('pag.next')}
        >
          ›
        </button>
      </div>
    </div>
  );
}
