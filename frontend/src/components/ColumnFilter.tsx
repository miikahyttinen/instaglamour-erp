import { Search } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../lib/useFocusTrap';
import { Button } from './Button';
import { placeColumnFilterPopover, type PopoverPlacement } from './columnFilterPlacement';
import type { FilterOption } from './excelTableState';

/** Search box appears when a column has more values than this (docs/design.md). */
export const FILTER_SEARCH_MIN = 9;

export interface ColumnFilterPanelProps {
  /** Column label (heading / names). */
  columnLabel: string;
  /** Values to offer (from `filterOptions`). */
  options: readonly FilterOption[];
  /** Active selection; undefined = no filter (everything checked). */
  selected: readonly string[] | undefined;
  /** OK: the new selection, or undefined when every value is checked (= remove the filter). */
  onApply: (values: string[] | undefined) => void;
  onCancel: () => void;
}

/**
 * The Excel filter form: search (> 8 values), Select all / Clear (act on the visible values),
 * checkbox list incl. "(blank)", OK / Cancel. OK is disabled while nothing is checked.
 */
export function ColumnFilterPanel({ columnLabel, options, selected, onApply, onCancel }: ColumnFilterPanelProps) {
  const { t } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected ?? options.map((o) => o.value)));
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase();
  const visible = useMemo(
    () => (q ? options.filter((o) => o.label.toLocaleLowerCase().includes(q)) : options),
    [options, q],
  );

  const toggle = (value: string, on: boolean) =>
    setDraft((prev) => {
      const next = new Set(prev);
      if (on) next.add(value);
      else next.delete(value);
      return next;
    });
  const setVisible = (on: boolean) =>
    setDraft((prev) => {
      const next = new Set(prev);
      for (const o of visible) {
        if (on) next.add(o.value);
        else next.delete(o.value);
      }
      return next;
    });

  const apply = () => {
    if (draft.size === 0) return;
    const values = options.map((o) => o.value).filter((v) => draft.has(v));
    onApply(values.length === options.length ? undefined : values);
  };

  return (
    // Not a <form>: tables may sit inside forms. Enter in the search box or on a checkbox = OK.
    <div
      className="column-filter"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          apply();
        }
      }}
    >
      {options.length >= FILTER_SEARCH_MIN && (
        <div className="column-filter-search">
          <Search className="column-filter-search-icon" />
          <input
            type="search"
            aria-label={t('table.searchValues')}
            placeholder={t('table.searchValues')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      <div className="column-filter-bulk">
        <Button size="sm" onClick={() => setVisible(true)}>
          {t('table.selectAll')}
        </Button>
        <Button size="sm" onClick={() => setVisible(false)}>
          {t('table.selectNone')}
        </Button>
      </div>
      <fieldset className="column-filter-values" aria-labelledby={`${id}-values`}>
        <legend id={`${id}-values`} className="visually-hidden">
          {`${t('table.values')}: ${columnLabel}`}
        </legend>
        {visible.length === 0 ? (
          <p className="column-filter-none">{t('table.noValues')}</p>
        ) : (
          visible.map((o) => (
            <label key={o.value} className="check column-filter-value">
              <input type="checkbox" checked={draft.has(o.value)} onChange={(e) => toggle(o.value, e.target.checked)} />
              <span>{o.label}</span>
            </label>
          ))
        )}
      </fieldset>
      <div className="column-filter-actions">
        <Button size="sm" variant="primary" disabled={draft.size === 0} onClick={apply}>
          {t('table.ok')}
        </Button>
        <Button size="sm" onClick={onCancel}>
          {t('table.cancel')}
        </Button>
      </div>
    </div>
  );
}

export interface ColumnFilterPopoverProps extends ColumnFilterPanelProps {
  /** The header filter button: position anchor; focus returns to it on close. */
  anchor: HTMLElement;
}

/**
 * Header popover (≥ 600 px): a non-modal dialog under the filter icon (above it when there is more
 * room there; always within the viewport, see `placeColumnFilterPopover`), named "Suodata: <column>".
 * Focus moves in and is kept inside; Esc, Cancel or a click outside closes it without changes, and
 * focus returns to the filter button. Position: fixed, so the table's scroll box does not clip it.
 */
export function ColumnFilterPopover({ anchor, ...panel }: ColumnFilterPopoverProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PopoverPlacement | null>(null);
  const { onCancel } = panel;

  useLayoutEffect(() => {
    const place = () => {
      setPos(
        placeColumnFilterPopover(anchor.getBoundingClientRect(), {
          width: document.documentElement.clientWidth || window.innerWidth,
          height: document.documentElement.clientHeight || window.innerHeight,
        }),
      );
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  useFocusTrap(ref, true);
  // After the trap's own cleanup (declared later = cleaned up later): focus back on the icon, also
  // where clicking a button does not focus it (Safari).
  useEffect(() => {
    return () => {
      if (anchor.isConnected) anchor.focus();
    };
  }, [anchor]);

  useLayoutEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor.contains(target)) return;
      onCancel();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchor, onCancel]);

  return (
    <div
      ref={ref}
      className="column-filter-popover"
      role="dialog"
      aria-label={t('table.filterColumn', { column: panel.columnLabel })}
      data-placement={pos ? (pos.bottom !== undefined ? 'above' : 'below') : undefined}
      style={pos ? { top: pos.top, bottom: pos.bottom, left: pos.left, maxHeight: pos.maxHeight } : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <ColumnFilterPanel {...panel} />
    </div>
  );
}
