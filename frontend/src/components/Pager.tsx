import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import type { PageSlice } from './pagination';
import './pager.css';

export interface PagerProps {
  /** The current page slice (`pageSlice()`): clamped page, page count and the shown range. */
  slice: Pick<PageSlice<unknown>, 'page' | 'pageCount' | 'from' | 'to' | 'total'>;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Pager under a list table (TASK-193, docs/design.md → "Paging"): "‹ Edellinen", "Sivu 2 / 5",
 * "Seuraava ›" and the shown range "1–100 / 342". Renders nothing when every row fits on one page.
 */
export function Pager({ slice, onPageChange, className }: PagerProps) {
  const { t } = useTranslation();
  const { page, pageCount, from, to, total } = slice;
  if (pageCount <= 1) return null;
  return (
    <nav className={['pager', className].filter(Boolean).join(' ')} aria-label={t('table.pagination')}>
      <Button size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        {t('table.previous')}
      </Button>
      <span className="pager-page">{t('table.page', { page, pages: pageCount })}</span>
      <Button size="sm" className="pager-next" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
        {t('table.next')}
        <ChevronRight className="btn-icon" />
      </Button>
      <span className="pager-range meta">{t('table.range', { from, to, total })}</span>
    </nav>
  );
}
