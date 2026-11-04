import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { FreelancerLine, FreelancerSettings, Id, PublicPurchaseOrderCreate } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatMoney } from '../../lib/format';
import { formatVatRate, poLineAmounts } from '../../lib/poAmounts';
import { feeRoleLabel } from './freelancerLabels';

interface Props {
  /** The selected, still selectable fees. */
  lines: FreelancerLine[];
  settings: FreelancerSettings;
  pending: boolean;
  onConfirm: (body: PublicPurchaseOrderCreate) => void;
  onClose: () => void;
}

/**
 * Confirmation modal of "Luo ostotilausnumero" (contract "Freelancer PO: VAT and sound check"):
 * the VAT question (required), a sound check switch per fee (default on) and a live preview of
 * each amount and the total. Amounts use the deduction and VAT rate from `FreelancerView.settings`.
 */
export function CreatePoDialog({ lines, settings, pending, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const errorId = useId();
  const [vatLiable, setVatLiable] = useState<boolean | null>(null);
  const [missed, setMissed] = useState<ReadonlySet<Id>>(new Set());
  const [showRequired, setShowRequired] = useState(false);
  const money = (cents: number) => formatMoney(cents, lang);
  const rate = formatVatRate(settings.vatRateBp, lang);

  const rows = lines.map((line) => {
    const soundcheck = !missed.has(line.costLineId);
    return { line, soundcheck, amounts: poLineAmounts(line.amountCents, soundcheck, vatLiable === true, settings) };
  });
  const sum = (pick: (a: (typeof rows)[number]['amounts']) => number) => rows.reduce((s, r) => s + pick(r.amounts), 0);
  const totals = {
    base: sum((a) => a.baseCents),
    deduction: sum((a) => a.deductionCents),
    vat: sum((a) => a.vatCents),
    amount: sum((a) => a.amountCents),
  };

  const toggleSoundcheck = (id: Id) =>
    setMissed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (vatLiable === null) {
      setShowRequired(true);
      return;
    }
    onConfirm({ vatLiable, lines: rows.map((r) => ({ costLineId: r.line.costLineId, soundcheck: r.soundcheck })) });
  };

  return (
    <Dialog title={t('freelancer.dialog.title')} onClose={onClose}>
      <form className="fl-po" onSubmit={submit} noValidate>
        <p className="muted fl-po-intro">{t('freelancer.dialog.intro')}</p>

        <fieldset
          className="check-group fl-po-vat"
          aria-invalid={showRequired && vatLiable === null ? true : undefined}
          aria-describedby={showRequired && vatLiable === null ? errorId : undefined}
        >
          <legend>{t('freelancer.dialog.vatQuestion')}</legend>
          <div className="fl-po-radios">
            {([true, false] as const).map((value) => (
              <label key={String(value)} className="check">
                <input
                  type="radio"
                  name="vatLiable"
                  required
                  checked={vatLiable === value}
                  onChange={() => {
                    setVatLiable(value);
                    setShowRequired(false);
                  }}
                />
                {value ? t('freelancer.dialog.yes') : t('freelancer.dialog.no')}
              </label>
            ))}
          </div>
          {showRequired && vatLiable === null && (
            <p id={errorId} className="field-error" role="alert">
              {t('freelancer.dialog.vatRequired')}
            </p>
          )}
        </fieldset>

        <fieldset className="check-group">
          <legend>{t('freelancer.dialog.linesTitle')}</legend>
          <ul className="fl-po-lines">
            {rows.map(({ line, soundcheck, amounts }) => {
              const date = formatDate(line.eventStartDate, lang);
              const role = feeRoleLabel(t, line);
              return (
                <li key={line.costLineId} className="fl-po-line" data-testid="po-preview-line">
                  <p className="fl-po-line-title">{[date, line.venue, role].join(' · ')}</p>
                  <label className="switch inline-switch fl-po-switch">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={t('freelancer.dialog.soundcheckOf', { date, venue: line.venue, role })}
                      checked={soundcheck}
                      onChange={() => toggleSoundcheck(line.costLineId)}
                    />
                    <span aria-hidden="true">{t('freelancer.dialog.soundcheck')}</span>
                  </label>
                  <Breakdown
                    rate={rate}
                    base={amounts.baseCents}
                    deduction={amounts.deductionCents}
                    vat={vatLiable ? amounts.vatCents : null}
                    total={amounts.amountCents}
                    totalLabel={t('freelancer.dialog.lineTotal')}
                    money={money}
                  />
                </li>
              );
            })}
          </ul>
        </fieldset>

        <section className="fl-po-total" aria-label={t('freelancer.dialog.total')} aria-live="polite">
          <Breakdown
            rate={rate}
            base={totals.base}
            deduction={totals.deduction}
            vat={vatLiable ? totals.vat : null}
            total={totals.amount}
            totalLabel={t('freelancer.dialog.total')}
            money={money}
            strong
          />
        </section>

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={pending || lines.length === 0}>
            {pending ? t('freelancer.dialog.creating') : t('freelancer.dialog.confirm')}
          </Button>
          <Button onClick={onClose} disabled={pending}>
            {t('freelancer.dialog.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Fee alv 0 % → − deduction (when any) → + VAT (when VAT-liable) → amount. */
function Breakdown({
  rate,
  base,
  deduction,
  vat,
  total,
  totalLabel,
  money,
  strong,
}: {
  rate: string;
  base: number;
  deduction: number;
  vat: number | null;
  total: number;
  totalLabel: string;
  money: (cents: number) => string;
  strong?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <dl className="fl-po-breakdown">
      <div>
        <dt>{t('freelancer.dialog.fee')}</dt>
        <dd className="num">{money(base)}</dd>
      </div>
      {deduction > 0 && (
        <div>
          <dt>{t('freelancer.dialog.deduction')}</dt>
          <dd className="num">−{money(deduction)}</dd>
        </div>
      )}
      {vat !== null && (
        <div>
          <dt>{t('freelancer.dialog.vat', { rate })}</dt>
          <dd className="num">+{money(vat)}</dd>
        </div>
      )}
      <div className="fl-po-breakdown-total">
        <dt>{totalLabel}</dt>
        <dd className="num">{strong ? <strong>{money(total)}</strong> : money(total)}</dd>
      </div>
    </dl>
  );
}
