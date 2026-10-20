import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language } from '../../api/enums';
import type { OfferStats } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { SectionLabel } from '../../components/SectionLabel';
import { apiErrorMessage, offerEventTypeLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatMoneyWhole, formatPercentWhole } from '../../lib/format';
import { useOfferStats } from './queries';
import './offerKpis.css';

const FI_MONTHS = ['tam', 'hel', 'maa', 'huh', 'tou', 'kes', 'hei', 'elo', 'syy', 'lok', 'mar', 'jou'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LOCALES: Record<Language, string> = { fi: 'fi-FI', en: 'en-GB' };

/** `YYYY-MM` → short axis label (`lok` / `Oct`). */
function monthShort(month: string, lang: Language): string {
  const m = Number(month.slice(5, 7));
  return (lang === 'fi' ? FI_MONTHS : EN_MONTHS)[m - 1] ?? month;
}

/** `YYYY-MM` → `lokakuu 2026` / `October 2026`. */
function monthLong(month: string, lang: Language): string {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1));
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat(LOCALES[lang], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/**
 * Offer statistics (BR-122, contract "Offer statistics"): six KPI cards above the offer table.
 * All years; ignores the table filters. `year` is the selected year of the app.
 */
export function OfferKpis({ year }: { year: number }) {
  const { t } = useTranslation();
  const titleId = useId();
  const stats = useOfferStats(year);
  return (
    <section className="offer-kpis" aria-labelledby={titleId}>
      <SectionLabel id={titleId}>{t('offers.kpi.title')}</SectionLabel>
      {stats.isPending && (
        <p role="status" className="meta">
          {t('app.loading')}
        </p>
      )}
      {stats.isError && (
        <Notice tone="danger" role="alert" className="offer-notice">
          <p>
            {t('offers.kpi.loadError')} {apiErrorMessage(t, stats.error)}
          </p>
          <Button size="sm" onClick={() => void stats.refetch()}>
            {t('app.retry')}
          </Button>
        </Notice>
      )}
      {/* key: a new selected year resets the bar selections to their defaults. */}
      {stats.data && <KpiCards key={year} stats={stats.data} year={year} />}
    </section>
  );
}

function KpiCards({ stats, year }: { stats: OfferStats; year: number }) {
  const { t } = useTranslation();
  const lang = useLang();
  const money = (cents: number | null) => formatMoneyWhole(cents, lang);
  const months = stats.createdByMonth;

  const [month, setMonth] = useState(months[months.length - 1]?.month ?? '');
  const [avgYear, setAvgYear] = useState(year);
  const [eventYear, setEventYear] = useState(year);
  const [openYear, setOpenYear] = useState(year);

  const monthItem = months.find((m) => m.month === month);
  const avgItem = stats.averageByCreatedYear.find((y) => y.year === avgYear);
  const eventItem = stats.byEventYear.find((y) => y.year === eventYear);
  const openItem = stats.openValueByEventYear.find((y) => y.year === openYear);
  const maxTypeValue = Math.max(0, ...stats.openByEventType.map((x) => x.valueCents));
  const win = stats.winRate;

  return (
    <div className="offer-kpi-grid">
      <KpiCard
        title={month ? `${t('offers.kpi.created')} · ${monthLong(month, lang)}` : t('offers.kpi.created')}
        className="offer-kpi-created"
      >
        <p className="stat-tile-value">{monthItem ? monthItem.count : '–'}</p>
        <SecondaryFigure value={money(monthItem?.valueCents ?? null)} caption={t('offers.kpi.total')} />
        <KpiBars
          label={t('offers.kpi.createdBars')}
          selected={month}
          onSelect={setMonth}
          bars={months.map((m) => ({
            key: m.month,
            label: monthShort(m.month, lang),
            fullLabel: monthLong(m.month, lang),
            value: m.valueCents,
            valueText: t('offers.kpi.countValue', { count: m.count, value: money(m.valueCents) }),
          }))}
        />
      </KpiCard>

      <KpiCard title={`${t('offers.kpi.average')} · ${avgYear}`} className="offer-kpi-average">
        <p className="stat-tile-value">{money(avgItem?.averageCents ?? null)}</p>
        <p className="meta stat-tile-caption">{t('offers.kpi.count', { count: avgItem?.count ?? 0 })}</p>
        <KpiBars
          label={t('offers.kpi.averageBars')}
          selected={String(avgYear)}
          onSelect={(k) => setAvgYear(Number(k))}
          bars={stats.averageByCreatedYear.map((y) => ({
            key: String(y.year),
            label: String(y.year),
            shortLabel: `'${String(y.year).slice(2)}`,
            value: y.averageCents ?? 0,
            valueText: money(y.averageCents),
          }))}
        />
      </KpiCard>

      <KpiCard title={`${t('offers.kpi.byEventYear')} · ${eventYear}`} className="offer-kpi-event-year">
        <p className="stat-tile-value">{eventItem ? eventItem.count : '–'}</p>
        <SecondaryFigure value={money(eventItem?.valueCents ?? null)} caption={t('offers.kpi.total')} />
        <KpiBars
          label={t('offers.kpi.byEventYearBars')}
          selected={String(eventYear)}
          onSelect={(k) => setEventYear(Number(k))}
          bars={stats.byEventYear.map((y) => ({
            key: String(y.year),
            label: String(y.year),
            shortLabel: `'${String(y.year).slice(2)}`,
            value: y.valueCents,
            valueText: t('offers.kpi.countValue', { count: y.count, value: money(y.valueCents) }),
          }))}
        />
      </KpiCard>

      <KpiCard title={`${t('offers.kpi.openValue')} · ${openYear}`} className="offer-kpi-open">
        <p className="stat-tile-value">{money(openItem?.valueCents ?? null)}</p>
        <p className="meta stat-tile-caption">{t('offers.kpi.count', { count: openItem?.count ?? 0 })}</p>
        <KpiBars
          label={t('offers.kpi.openValueBars')}
          selected={String(openYear)}
          onSelect={(k) => setOpenYear(Number(k))}
          bars={stats.openValueByEventYear.map((y) => ({
            key: String(y.year),
            label: String(y.year),
            shortLabel: `'${String(y.year).slice(2)}`,
            value: y.valueCents,
            valueText: t('offers.kpi.countValue', { count: y.count, value: money(y.valueCents) }),
          }))}
        />
      </KpiCard>

      <KpiCard title={t('offers.kpi.byType')} className="offer-kpi-types">
        <p className="meta stat-tile-caption">{t('offers.kpi.byTypeCaption')}</p>
        {stats.openByEventType.length === 0 ? (
          <p className="offer-kpi-empty">{t('offers.kpi.noOpen')}</p>
        ) : (
          <ul className="offer-kpi-rows">
            {stats.openByEventType.map((row) => (
              <KpiRow
                key={row.eventType ?? 'none'}
                label={row.eventType ? offerEventTypeLabel(t, row.eventType) : t('offers.kpi.noType')}
                figure={`${row.count} / ${money(row.valueCents)}`}
                pct={maxTypeValue > 0 ? (row.valueCents / maxTypeValue) * 100 : 0}
              />
            ))}
          </ul>
        )}
      </KpiCard>

      <KpiCard title={t('offers.kpi.winRate')} className="offer-kpi-win">
        <div className="offer-kpi-ring-row">
          <Ring pct={win.pct} text={formatPercentWhole(win.pct, lang)} />
          <div>
            <p className="stat-tile-value">{t('offers.kpi.winOf', { won: win.won, decided: win.decided })}</p>
            <p className="meta stat-tile-caption">{t('offers.kpi.winRateCaption')}</p>
          </div>
        </div>
        <ul className="offer-kpi-rows">
          {win.byEventType.map((row) => (
            <KpiRow
              key={row.eventType}
              label={offerEventTypeLabel(t, row.eventType)}
              figure={`${formatPercentWhole(row.pct, lang)} · ${t('offers.kpi.winOf', { won: row.won, decided: row.decided })}`}
              pct={row.pct ?? 0}
            />
          ))}
        </ul>
      </KpiCard>
    </div>
  );
}

function KpiCard({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className={['stat-tile offer-kpi', className].filter(Boolean).join(' ')} aria-labelledby={id}>
      <h3 id={id} className="label stat-tile-label offer-kpi-title">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SecondaryFigure({ value, caption }: { value: string; caption: string }) {
  return (
    <p className="stat-tile-secondary">
      <span className="stat-tile-secondary-value">{value}</span>
      <span className="meta">{caption}</span>
    </p>
  );
}

interface KpiBar {
  key: string;
  /** Axis label. */
  label: string;
  /** Axis label for narrow cards (e.g. `'26` for 2026). */
  shortLabel?: string;
  /** Label for screen readers / tooltip (defaults to `label`). */
  fullLabel?: string;
  value: number;
  /** Exact formatted value. */
  valueText: string;
}

/**
 * Selectable mini bar chart: one button per bar (Tab + Enter/Space select, `aria-pressed`),
 * the selected one in --accent. Exact values in the button's accessible name and tooltip.
 */
function KpiBars({
  bars,
  label,
  selected,
  onSelect,
}: {
  bars: KpiBar[];
  label: string;
  selected: string;
  onSelect: (key: string) => void;
}) {
  const { t } = useTranslation();
  const max = Math.max(0, ...bars.map((b) => b.value));
  return (
    <div className="stat-tile-bars offer-kpi-bars">
      <div className="offer-kpi-plot" role="group" aria-label={label}>
        {bars.map((bar) => {
          const name = t('offers.kpi.barLabel', { label: bar.fullLabel ?? bar.label, value: bar.valueText });
          const pct = max > 0 ? (Math.max(0, bar.value) / max) * 100 : 0;
          const isSelected = bar.key === selected;
          return (
            <button
              key={bar.key}
              type="button"
              className={isSelected ? 'offer-kpi-bar is-current' : 'offer-kpi-bar'}
              aria-label={name}
              aria-pressed={isSelected}
              title={name}
              onClick={() => onSelect(bar.key)}
            >
              <span className="offer-kpi-bar-fill" style={{ height: `${pct}%` }} data-testid="kpi-bar" />
            </button>
          );
        })}
      </div>
      <div className="mini-bars-labels offer-kpi-labels" aria-hidden="true">
        {bars.map((bar) => (
          <span key={bar.key} className={bar.key === selected ? 'is-current' : undefined}>
            {bar.shortLabel ? (
              <>
                <span className="offer-kpi-label-full">{bar.label}</span>
                <span className="offer-kpi-label-short">{bar.shortLabel}</span>
              </>
            ) : (
              bar.label
            )}
          </span>
        ))}
      </div>
      <p className="meta">{label}</p>
    </div>
  );
}

function KpiRow({ label, figure, pct }: { label: string; figure: string; pct: number }) {
  return (
    <li className="offer-kpi-row">
      <span className="offer-kpi-row-head">
        <span className="offer-kpi-row-label">{label}</span>
        <span className="offer-kpi-row-figure">{figure}</span>
      </span>
      <span className="offer-kpi-row-track" aria-hidden="true">
        <span className="offer-kpi-row-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </span>
    </li>
  );
}

const RING_C = 2 * Math.PI * 16;

function Ring({ pct, text }: { pct: number | null; text: string }) {
  const filled = ((pct ?? 0) / 100) * RING_C;
  return (
    <div className="offer-kpi-ring">
      <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
        <circle cx="18" cy="18" r="16" className="offer-kpi-ring-track" />
        <circle
          cx="18"
          cy="18"
          r="16"
          className="offer-kpi-ring-fill"
          strokeDasharray={`${filled} ${RING_C}`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span className="offer-kpi-ring-text">{text}</span>
    </div>
  );
}
