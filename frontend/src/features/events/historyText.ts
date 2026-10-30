import type { TFunction } from 'i18next';
import { LEGACY_COST_TYPES, type EventHistoryType, type Language, type LegacyCostType } from '../../api/enums';
import type {
  ClientListItem,
  DateRange,
  FieldChange,
  EventHistoryEntry,
  HistoryCostType,
  Partner,
  Person,
} from '../../api/types';
import { costTypeLabel, eventHistoryTypeLabel } from '../../i18n/labels';
import { formatDateRange, formatMoney } from '../../lib/format';

export interface HistoryContext {
  partners: Partner[] | undefined;
  people: Person[] | undefined;
  /** Active clients (a deleted client shows as –). */
  clients?: ClientListItem[] | undefined;
}

export type HistoryFilter = 'all' | 'status' | 'details' | 'costs' | 'attachments';
export const HISTORY_FILTERS: HistoryFilter[] = ['all', 'status', 'details', 'costs', 'attachments'];

const FILTER_TYPES: Record<Exclude<HistoryFilter, 'all'>, EventHistoryType[]> = {
  status: [
    'CREATED',
    'MOVED',
    'CANCELLED',
    'UNCANCELLED',
    'DELETED',
    'RESTORED',
    'READY_FOR_INVOICE',
    'READY_FOR_INVOICE_CLEARED',
  ],
  details: ['UPDATED'],
  costs: ['COST_ADDED', 'COST_UPDATED', 'COST_REMOVED', 'COST_PAID', 'COST_UNPAID'],
  attachments: ['ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED'],
};

export function matchesFilter(entry: EventHistoryEntry, filter: HistoryFilter): boolean {
  return filter === 'all' || FILTER_TYPES[filter].includes(entry.type);
}

const MONEY_FIELDS = new Set([
  'priceCents',
  'additionalSalesCents',
  'budgetedCents',
  'actualCents',
  'loadInDeductionAppliedCents',
]);
const PARTNER_FIELDS = new Set(['sellerId', 'producerId', 'paidBy']);

/** Label of a changed field; unknown fields fall back to the field name. */
export function fieldLabel(t: TFunction, field: string): string {
  return t(`historyField.${field}`, { defaultValue: field });
}

/** Human-readable value of a changed field. */
export function formatValue(
  t: TFunction,
  lang: Language,
  field: string,
  value: unknown,
  ctx: HistoryContext,
): string {
  if (value === null || value === undefined || value === '') return '–';
  if (MONEY_FIELDS.has(field) && typeof value === 'number') return formatMoney(value, lang);
  if (PARTNER_FIELDS.has(field) && typeof value === 'string') {
    return ctx.partners?.find((p) => p.id === value)?.name ?? '–';
  }
  if (field === 'clientId' && typeof value === 'string') {
    return ctx.clients?.find((c) => c.id === value)?.name ?? '–';
  }
  if (field === 'personId' && typeof value === 'string') {
    return ctx.people?.find((p) => p.id === value)?.name ?? '–';
  }
  if (field === 'technicalSetup' || field === 'logistics') {
    // Older entries may hold a list of codes (multi-choice technicalSetup before 2026-10-05).
    const codes = (Array.isArray(value) ? value : [value]).map(String);
    if (codes.length === 0) return '–';
    const label = (code: string) =>
      field === 'logistics'
        ? t(`logistics.${code}`, { defaultValue: code })
        : t(`technicalSetup.${code}`, {
            defaultValue: t(`legacyTechnicalSetup.${code}`, { defaultValue: code }),
          });
    return codes.map(label).join(', ');
  }
  if (typeof value === 'boolean') return value ? t('history.yes') : t('history.no');
  return String(value);
}

function changeLines(
  t: TFunction,
  lang: Language,
  changes: FieldChange[],
  ctx: HistoryContext,
): string[] {
  return changes.map((c) =>
    t('history.change', {
      field: fieldLabel(t, c.field),
      from: formatValue(t, lang, c.field, c.from, ctx),
      to: formatValue(t, lang, c.field, c.to, ctx),
    }),
  );
}

const isLegacyCostType = (code: string): code is LegacyCostType =>
  (LEGACY_COST_TYPES as readonly string[]).includes(code);

const range = (r: DateRange, lang: Language) => formatDateRange(r.startDate, r.endDate, lang);

/** Title + detail lines for one history entry, in the user's language (UC-013). */
export function describeEntry(
  t: TFunction,
  lang: Language,
  entry: EventHistoryEntry,
  ctx: HistoryContext,
): { title: string; lines: string[] } {
  const title = eventHistoryTypeLabel(t, entry.type);
  const lines: string[] = [];
  // Old entries may hold a removed role code (HORN_1, HORN_2, TECHNICIAN): labelled from legacyCostType.
  const type = (code: HistoryCostType) =>
    isLegacyCostType(code) ? t(`legacyCostType.${code}`) : costTypeLabel(t, code);
  switch (entry.type) {
    case 'UPDATED':
      lines.push(...changeLines(t, lang, entry.details.changes, ctx));
      if (entry.details.movedCostLineIds.length > 0) {
        lines.push(t('history.movedLines', { count: entry.details.movedCostLineIds.length }));
      }
      break;
    case 'MOVED':
      lines.push(
        t('history.moved', { from: range(entry.details.from, lang), to: range(entry.details.to, lang) }),
      );
      break;
    case 'COST_ADDED':
    case 'COST_REMOVED':
      lines.push(
        t('history.costLine', {
          type: type(entry.details.type),
          person: formatValue(t, lang, 'personId', entry.details.personId, ctx),
          amount: formatMoney(entry.details.budgetedCents, lang),
        }),
      );
      break;
    case 'COST_UPDATED':
      lines.push(
        `${type(entry.details.type)}: ${changeLines(t, lang, entry.details.changes, ctx).join('; ')}`,
      );
      break;
    case 'COST_PAID':
      lines.push(
        t('history.paid', {
          type: type(entry.details.type),
          amount: formatMoney(entry.details.actualCents, lang),
        }),
      );
      if (entry.details.purchaseOrderNumber) {
        lines.push(t('purchaseOrders.historyNumber', { number: entry.details.purchaseOrderNumber }));
      }
      break;
    case 'COST_UNPAID':
      lines.push(
        t('history.unpaid', {
          type: type(entry.details.type),
          amount: formatMoney(entry.details.previousActualCents, lang),
        }),
      );
      if (entry.details.purchaseOrderNumber) {
        lines.push(t('purchaseOrders.historyNumber', { number: entry.details.purchaseOrderNumber }));
      }
      break;
    case 'ATTACHMENT_ADDED':
    case 'ATTACHMENT_REMOVED':
      lines.push(entry.details.filename);
      break;
    default:
      break;
  }
  if (entry.reason) lines.push(t('history.reason', { reason: entry.reason }));
  return { title, lines };
}
