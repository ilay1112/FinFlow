import { useTranslation } from 'react-i18next';
import { Button } from './Button';

interface TablePaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  /** Total number of rows across all pages (after filtering). */
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

/**
 * Footer controls for a paginated table: a page-size selector (default 20/50/100), a
 * "showing X–Y of Z" summary, and prev/next navigation. Presentational — the parent owns
 * `page`/`pageSize` state and does the slicing. RTL-safe (logical utilities, text buttons).
 */
export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 50, 100],
}: TablePaginationProps) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 md:px-6 py-3 border-t text-sm">
      <div className="flex items-center gap-2 text-slate-500">
        <span>{t('common.rows_per_page')}</span>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {pageSizeOptions.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-slate-500 whitespace-nowrap">{t('common.showing', { from, to, total })}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            {t('common.prev')}
          </Button>
          <span className="text-slate-500 px-1 whitespace-nowrap">
            {t('common.page_of', { page, pages: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            {t('common.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
