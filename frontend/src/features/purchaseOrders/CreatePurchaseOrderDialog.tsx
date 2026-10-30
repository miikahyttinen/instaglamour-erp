import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiError } from '../../api/client';
import { peopleApi, purchaseOrdersApi } from '../../api/endpoints';
import type { Id, PoEligibleLine, PurchaseOrder } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/fields';
import { Notice } from '../../components/Notice';
import { apiErrorMessage, costTypeLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatMoney } from '../../lib/format';
import { purchaseOrderKeys, useApplyPurchaseOrder } from './queries';
import './createPurchaseOrder.css';

export interface PoCandidate {
  id: Id;
  name: string;
}

interface Props {
  /** People to choose from (active people, or this event's crew with open fees). */
  candidates: PoCandidate[];
  /** Limits the fees to one event; its fees are pre-ticked. */
  eventId?: Id;
  /** Shows a search box over the people (the long list of the Ostotilaukset page). */
  searchable?: boolean;
  onClose: () => void;
  onCreated: (po: PurchaseOrder) => void;
}

/**
 * "Uusi ostotilaus" (contract "Purchase orders created by partners"): choose a person, tick
 * their eligible fees, create one PO. 409 COST_LINE_NOT_ELIGIBLE refreshes the fees and drops the
 * offending ones from the selection; the submit is guarded against double clicks.
 */
export function CreatePurchaseOrderDialog({ candidates, eventId, searchable, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const apply = useApplyPurchaseOrder();
  const [search, setSearch] = useState('');
  // With exactly one choice it is chosen already.
  const [personId, setPersonId] = useState<Id | null>(candidates.length === 1 ? candidates[0]!.id : null);
  // null = untouched: the default (all on an event, none otherwise) applies.
  const [picked, setPicked] = useState<Set<Id> | null>(null);
  const [notEligible, setNotEligible] = useState(false);
  const submitting = useRef(false);

  const lines = useQuery({
    queryKey: purchaseOrderKeys.eligible(personId ?? '', eventId),
    queryFn: () => peopleApi.poEligibleLines(personId!, eventId),
    enabled: personId !== null,
  });

  const available = useMemo(() => lines.data ?? [], [lines.data]);
  const selected = useMemo(() => {
    const base = picked ?? new Set(eventId ? available.map((l) => l.costLineId) : []);
    return available.filter((l) => base.has(l.costLineId));
  }, [picked, available, eventId]);
  const selectedIds = new Set(selected.map((l) => l.costLineId));
  const total = selected.reduce((sum, l) => sum + l.amountCents, 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? candidates.filter((c) => c.name.toLowerCase().includes(q)) : candidates;
  }, [candidates, search]);
  // Keep the chosen person in the select even if the search hides them.
  const options =
    personId && !filtered.some((c) => c.id === personId)
      ? [...candidates.filter((c) => c.id === personId), ...filtered]
      : filtered;

  const create = useMutation({
    mutationFn: () => purchaseOrdersApi.create({ personId: personId!, costLineIds: selected.map((l) => l.costLineId) }),
    onSuccess: (po) => {
      apply(po);
      onCreated(po);
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'COST_LINE_NOT_ELIGIBLE') {
        const bad = new Set((error.details.costLineIds as Id[] | undefined) ?? []);
        setPicked(new Set([...selectedIds].filter((id) => !bad.has(id))));
        setNotEligible(true);
        void lines.refetch();
      }
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  const choosePerson = (id: Id | null) => {
    setPersonId(id);
    setPicked(null);
    setNotEligible(false);
    create.reset();
  };

  const toggle = (line: PoEligibleLine) => {
    const next = new Set(selectedIds);
    if (next.has(line.costLineId)) next.delete(line.costLineId);
    else next.add(line.costLineId);
    setPicked(next);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (submitting.current || !personId || selected.length === 0) return;
    submitting.current = true;
    setNotEligible(false);
    create.mutate();
  };

  const showError = create.isError && !(isApiError(create.error) && create.error.code === 'COST_LINE_NOT_ELIGIBLE');

  return (
    <Dialog title={t('purchaseOrders.create.title')} onClose={onClose}>
      <form className="po-create" onSubmit={submit} noValidate>
        {candidates.length === 0 ? (
          <p className="table-empty">{eventId ? t('purchaseOrders.create.noCrew') : t('purchaseOrders.create.empty')}</p>
        ) : (
          <>
            {searchable && (
              <Field label={t('purchaseOrders.create.search')}>
                {(p) => (
                  <input
                    {...p}
                    type="search"
                    autoComplete="off"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                )}
              </Field>
            )}
            <Field label={t('purchaseOrders.create.person')}>
              {(p) => (
                <select {...p} value={personId ?? ''} onChange={(e) => choosePerson(e.target.value || null)}>
                  <option value="">{t('purchaseOrders.create.choosePerson')}</option>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {searchable && options.length === 0 && <p className="meta">{t('purchaseOrders.create.noPeople')}</p>}
          </>
        )}

        {personId && (
          <fieldset className="check-group po-create-fees" aria-busy={lines.isFetching || undefined}>
            <legend>{t('purchaseOrders.create.fees')}</legend>
            {lines.isPending ? (
              <p role="status" className="meta">
                {t('app.loading')}
              </p>
            ) : lines.isError ? (
              <Notice tone="danger" role="alert">
                <p>{apiErrorMessage(t, lines.error)}</p>
                <Button size="sm" onClick={() => void lines.refetch()}>
                  {t('app.retry')}
                </Button>
              </Notice>
            ) : available.length === 0 ? (
              <p className="table-empty">{t('purchaseOrders.create.empty')}</p>
            ) : (
              <ul className="po-create-list">
                {available.map((line) => {
                  const role = costTypeLabel(t, line.type);
                  return (
                    <li key={line.costLineId}>
                      <label className="po-create-line">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(line.costLineId)}
                          onChange={() => toggle(line)}
                        />
                        <span className="po-create-line-text">
                          {[
                            formatDate(line.eventStartDate, lang),
                            line.eventVenue,
                            line.description ? `${role} (${line.description})` : role,
                          ].join(' · ')}
                        </span>{' '}
                        <span className="po-create-line-amount">{formatMoney(line.amountCents, lang)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
        )}

        {personId && available.length > 0 && (
          <p className="po-create-total" aria-live="polite">
            <span>{t('purchaseOrders.create.selectedTotal')}</span>{' '}
            <strong>{formatMoney(total, lang)}</strong>
          </p>
        )}

        {notEligible && (
          <Notice tone="warn" role="alert">
            <p>{t('purchaseOrders.create.notEligible')}</p>
          </Notice>
        )}
        {showError && (
          <Notice tone="danger" role="alert">
            <p>{apiErrorMessage(t, create.error)}</p>
          </Notice>
        )}

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={!personId || selected.length === 0 || create.isPending}>
            {t('purchaseOrders.create.submit')}
          </Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
