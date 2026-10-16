import type { TFunction } from 'i18next';
import type { CostType, GigEventType, Language } from '../../api/enums';
import type { ClientListItem, DateRange, FieldChange, GigEvent, Partner, Person } from '../../api/types';
import { costTypeLabel, gigEventTypeLabel } from '../../i18n/labels';
import { formatDateRange, formatMoney } from '../../lib/format';

export interface HistoryContext {
  partners: Partner[] | undefined;
  people: Person[] | undefined;
  /** Active clients (a deleted client shows as –). */
  clients?: ClientListItem[] | undefined;
}

export type HistoryFilter = 'all' | 'status' | 'details' | 'costs' | 'attachments';
export const HISTORY_FILTERS: HistoryFilter[] = ['all', 'status', 'details', 'costs', 'attachments'];

const FILTER_TYPES: Record<Exclude<HistoryFilter, 'all'>, GigEventType[]> = {
  status: ['CREATED', 'MOVED', 'CANCELLED', 'UNCANCELLED', 'DELETED', 'RESTORED'],
  details: ['UPDATED'],
  costs: ['COST_ADDED', 'COST_UPDATED', 'COST_REMOVED', 'COST_PAID', 'COST_UNPAID'],
  attachments: ['ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED'],
};

export function matchesFilter(event: GigEvent, filter: HistoryFilter): boolean {
  return filter === 'all' || FILTER_TYPES[filter].includes(event.type);
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
    // Older events may hold a list of codes (multi-choice technicalSetup before 2026-10-05).
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

const range = (r: DateRange, lang: Language) => formatDateRange(r.startDate, r.endDate, lang);

/** Title + detail lines for one history event, in the user's language (UC-013). */
export function describeEvent(
  t: TFunction,
  lang: Language,
  event: GigEvent,
  ctx: HistoryContext,
): { title: string; lines: string[] } {
  const title = gigEventTypeLabel(t, event.type);
  const lines: string[] = [];
  const type = (code: CostType) => costTypeLabel(t, code);
  switch (event.type) {
    case 'UPDATED':
      lines.push(...changeLines(t, lang, event.details.changes, ctx));
      if (event.details.movedCostLineIds.length > 0) {
        lines.push(t('history.movedLines', { count: event.details.movedCostLineIds.length }));
      }
      break;
    case 'MOVED':
      lines.push(
        t('history.moved', { from: range(event.details.from, lang), to: range(event.details.to, lang) }),
      );
      break;
    case 'COST_ADDED':
    case 'COST_REMOVED':
      lines.push(
        t('history.costLine', {
          type: type(event.details.type),
          person: formatValue(t, lang, 'personId', event.details.personId, ctx),
          amount: formatMoney(event.details.budgetedCents, lang),
        }),
      );
      break;
    case 'COST_UPDATED':
      lines.push(
        `${type(event.details.type)}: ${changeLines(t, lang, event.details.changes, ctx).join('; ')}`,
      );
      break;
    case 'COST_PAID':
      lines.push(
        t('history.paid', {
          type: type(event.details.type),
          amount: formatMoney(event.details.actualCents, lang),
        }),
      );
      if (event.details.purchaseOrderNumber) {
        lines.push(t('purchaseOrders.historyNumber', { number: event.details.purchaseOrderNumber }));
      }
      break;
    case 'COST_UNPAID':
      lines.push(
        t('history.unpaid', {
          type: type(event.details.type),
          amount: formatMoney(event.details.previousActualCents, lang),
        }),
      );
      if (event.details.purchaseOrderNumber) {
        lines.push(t('purchaseOrders.historyNumber', { number: event.details.purchaseOrderNumber }));
      }
      break;
    case 'ATTACHMENT_ADDED':
    case 'ATTACHMENT_REMOVED':
      lines.push(event.details.filename);
      break;
    default:
      break;
  }
  if (event.reason) lines.push(t('history.reason', { reason: event.reason }));
  return { title, lines };
}
