// Client-side paging of the list tables (TASK-193, docs/design.md → "Paging"). Pure helpers + the
// URL hook; the pager itself is components/Pager.tsx. Kept apart from the components so pages and
// tests can use them without rendering.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Page sizes of the paged list tables (TASK-193). */
export const PURCHASE_ORDER_PAGE_SIZE = 50;
export const EVENT_PAGE_SIZE = 100;
export const OFFER_PAGE_SIZE = 100;
export const CLIENT_PAGE_SIZE = 100;
export const PEOPLE_PAGE_SIZE = 100;

/** URL parameter of the current page (1-based; omitted for page 1). */
export const PAGE_PARAM = 'page';

/** What a table needs to page its rows: give it to `ExcelTable` / `DataTable` as `paging`. */
export interface Paging {
  /** Requested page (1-based). Out of range = clamped by the table. */
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

/** `?page=` value → page number (anything invalid = 1). */
export function parsePage(raw: string | null | undefined): number {
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const n = Number(raw);
  return n >= 1 ? n : 1;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export interface PageSlice<T> {
  /** The rows of the (clamped) page. */
  rows: T[];
  /** Clamped page: 1 … pageCount. */
  page: number;
  pageCount: number;
  /** 1-based index of the first / last row shown (0 / 0 when there are no rows). */
  from: number;
  to: number;
  total: number;
}

/** One page of `rows` (already filtered + sorted). An out-of-range page clamps to the last page. */
export function pageSlice<T>(rows: readonly T[], page: number, pageSize: number): PageSlice<T> {
  const total = rows.length;
  const pages = pageCount(total, pageSize);
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);
  return {
    rows: slice,
    page: current,
    pageCount: pages,
    from: slice.length ? start + 1 : 0,
    to: start + slice.length,
    total,
  };
}

/** After a page change: bring the top of the table into view (`.is-paged` has a scroll margin for
 *  the sticky top bar). */
export function scrollToTable(el: HTMLElement | null): void {
  el?.scrollIntoView?.({ block: 'start' });
}

/**
 * Current page in the URL (`?page=N`, omitted for page 1), so back / refresh keep it. Page changes
 * replace the history entry (like the sort and filters). Any change of the *other* URL parameters
 * (filters, sort, search, view…) or of `resetKey` (state that is not in the URL, e.g. the selected
 * year or a local search) goes back to page 1.
 */
export function useUrlPaging(pageSize: number, resetKey = ''): Paging {
  const [params, setParams] = useSearchParams();
  const page = parsePage(params.get(PAGE_PARAM));
  const others = new URLSearchParams(params);
  others.delete(PAGE_PARAM);
  others.sort();
  const key = `${others.toString()}|${resetKey}`;

  const onPageChange = useCallback(
    (next: number) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next > 1) p.set(PAGE_PARAM, String(next));
          else p.delete(PAGE_PARAM);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    setParams(
      (prev) => {
        if (!prev.has(PAGE_PARAM)) return prev;
        const p = new URLSearchParams(prev);
        p.delete(PAGE_PARAM);
        return p;
      },
      { replace: true },
    );
  }, [key, setParams]);

  return useMemo(() => ({ page, pageSize, onPageChange }), [page, pageSize, onPageChange]);
}
