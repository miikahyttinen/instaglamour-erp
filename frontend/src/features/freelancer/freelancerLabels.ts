import type { TFunction } from 'i18next';
import type { CostType, Language } from '../../api/enums';
import type { PurchaseOrderStatus } from '../../api/types';
import { costTypeLabel } from '../../i18n/labels';
import { formatDate } from '../../lib/format';

/** Role text of a fee: the type label; "Other" types show their description instead. */
export function feeRoleLabel(t: TFunction, line: { type: CostType; description: string | null }): string {
  const description = line.description?.trim();
  if ((line.type === 'OTHER' || line.type === 'OTHER_ROLE') && description) return description;
  return costTypeLabel(t, line.type);
}

/** Local clock time: FI `14.32`, EN `14:32`. */
function formatTime(value: string, lang: Language): string {
  const date = new Date(value);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}${lang === 'fi' ? '.' : ':'}${mm}`;
}

/** "Avoin" / "Maksettu 16.10.2026 klo 14.32" (EN "Paid 16 Oct 2026 14:32") / "Peruttu". */
export function purchaseOrderStatusLabel(
  t: TFunction,
  po: { status: PurchaseOrderStatus; paidAt: string | null },
  lang: Language,
): string {
  if (po.status === 'PAID' && po.paidAt) {
    return t('freelancer.orderStatus.PAID', { date: formatDate(po.paidAt, lang), time: formatTime(po.paidAt, lang) });
  }
  if (po.status === 'PAID') return t('freelancer.state.PAID');
  return t(`freelancer.orderStatus.${po.status}`);
}
