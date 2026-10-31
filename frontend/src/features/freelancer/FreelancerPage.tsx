import { Copy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { isApiError } from '../../api/client';
import type { Language } from '../../api/enums';
import type { FreelancerLine, FreelancerView, Id, PublicPurchaseOrder } from '../../api/types';
import { Button } from '../../components/Button';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { Logo } from '../../components/Logo';
import { Notice } from '../../components/Notice';
import { SectionLabel } from '../../components/SectionLabel';
import { StatusTag, type StatusTone } from '../../components/StatusTag';
import { setLanguage } from '../../i18n';
import { useLang } from '../../i18n/useLang';
import { LanguageButtons } from '../../layout/LanguageButtons';
import { formatDate, formatDateRange, formatMoney } from '../../lib/format';
import { copyToClipboard } from '../offers/offerOptions';
import { feeRoleLabel, purchaseOrderStatusLabel } from './freelancerLabels';
import { readFreelancerLanguage, storeFreelancerLanguage } from './freelancerLanguage';
import { useCreatePurchaseOrder, useFreelancerView } from './queries';
import './freelancer.css';

/** Sets the tab title while mounted and restores the previous one afterwards. */
function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

type CreateNotice =
  | { kind: 'created'; number: string }
  | { kind: 'notEligible' }
  | { kind: 'rateLimited' }
  | { kind: 'failed' };

/**
 * Public freelancer page `/f/:token` (UC-033, BR-113…BR-116). Rendered outside the auth
 * provider and the app shell; its only requests are `GET /api/public/freelancers/{token}` and
 * the create-PO POST. Language: Finnish unless the visitor picked English (remembered in
 * localStorage); theme: the OS preference. Not indexed.
 */
export function FreelancerPage() {
  const { token = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const query = useFreelancerView(token);

  useEffect(() => {
    setLanguage(readFreelancerLanguage());
  }, []);
  const changeLanguage = (next: Language) => {
    storeFreelancerLanguage(next);
    setLanguage(next);
  };

  const notFound = isApiError(query.error) && query.error.status === 404;
  const brand = t('freelancer.brand');
  let title = brand;
  if (query.data) title = `${query.data.name} – ${brand}`;
  else if (notFound) title = `${t('freelancer.notFoundTitle')} – ${brand}`;
  useDocumentTitle(title);

  let content;
  if (query.data) {
    content = <FreelancerContent token={token} view={query.data} refetch={() => void query.refetch()} />;
  } else if (query.isPending) {
    content = (
      <p className="muted" role="status">
        {t('freelancer.loading')}
      </p>
    );
  } else {
    content = (
      <div className="freelancer-state">
        <h1 className="freelancer-title">{notFound ? t('freelancer.notFoundTitle') : t('freelancer.errorTitle')}</h1>
        {notFound ? (
          <p className="muted">{t('freelancer.notFoundText')}</p>
        ) : (
          <>
            <p className="muted" role="alert">
              {t('freelancer.errorText')}
            </p>
            <div>
              <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
                {t('app.retry')}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <main className="freelancer-page">
      {/* React hoists this into <head> (React 19 document metadata). */}
      <meta name="robots" content="noindex, nofollow" />
      <div className="freelancer-top">
        <Logo size="header" alt={brand} className="freelancer-logo" />
        <LanguageButtons value={lang} onChange={changeLanguage} />
      </div>
      {content}
    </main>
  );
}

function FreelancerContent({ token, view, refetch }: { token: string; view: FreelancerView; refetch: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const create = useCreatePurchaseOrder(token);
  const [selected, setSelected] = useState<ReadonlySet<Id>>(new Set());
  const [notice, setNotice] = useState<CreateNotice | null>(null);
  const [newNumber, setNewNumber] = useState<string | null>(null);
  // Set synchronously on click: React Query's isPending shows only after a render, so a fast
  // double click would otherwise send two requests.
  const submitting = useRef(false);

  const selectable = useMemo(() => view.lines.filter((l) => l.state === 'SELECTABLE'), [view.lines]);
  // Only ids that are still selectable count (the list may have been refetched meanwhile).
  const chosen = selectable.filter((l) => selected.has(l.costLineId));
  const totalCents = chosen.reduce((sum, l) => sum + l.amountCents, 0);
  const allChosen = selectable.length > 0 && chosen.length === selectable.length;
  const money = (cents: number) => formatMoney(cents, lang);

  const toggle = (id: Id) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(selectable.map((l) => l.costLineId)));

  const submit = () => {
    if (submitting.current || chosen.length === 0) return;
    submitting.current = true;
    setNotice(null);
    const ids = chosen.map((l) => l.costLineId);
    create.mutate(ids, {
      onSuccess: (po) => {
        setSelected(new Set());
        setNewNumber(po.number);
        setNotice({ kind: 'created', number: po.number });
      },
      onError: (error) => {
        if (isApiError(error) && error.code === 'COST_LINE_NOT_ELIGIBLE') {
          const bad = new Set(Array.isArray(error.details.costLineIds) ? (error.details.costLineIds as Id[]) : []);
          setSelected((current) => new Set([...current].filter((id) => !bad.has(id))));
          setNotice({ kind: 'notEligible' });
        } else if (isApiError(error) && error.status === 429) {
          setNotice({ kind: 'rateLimited' });
        } else {
          setNotice({ kind: 'failed' });
        }
        // 404 (link regenerated meanwhile) turns the page into "Link not found".
        refetch();
      },
      onSettled: () => {
        submitting.current = false;
      },
    });
  };

  const columns: DataTableColumn<FreelancerLine>[] = [
    {
      key: 'select',
      label: t('freelancer.columns.select'),
      phoneBare: true,
      header: (
        <input
          type="checkbox"
          aria-label={t('freelancer.selectAll')}
          title={t('freelancer.selectAll')}
          checked={allChosen}
          disabled={selectable.length === 0}
          onChange={toggleAll}
        />
      ),
      className: 'freelancer-select',
      cell: (line) =>
        line.state === 'SELECTABLE' ? (
          <input
            type="checkbox"
            aria-label={t('freelancer.selectLine', {
              date: formatDate(line.eventStartDate, lang),
              venue: line.venue,
              role: feeRoleLabel(t, line),
            })}
            checked={selected.has(line.costLineId)}
            onChange={() => toggle(line.costLineId)}
          />
        ) : null,
    },
    {
      key: 'date',
      label: t('freelancer.columns.date'),
      primary: true,
      className: 'nowrap',
      cell: (line) => formatDateRange(line.eventStartDate, line.eventEndDate, lang),
    },
    { key: 'venue', phoneBare: true, label: t('freelancer.columns.venue'), cell: (line) => line.venue },
    { key: 'role', phoneBare: true, label: t('freelancer.columns.role'), cell: (line) => feeRoleLabel(t, line) },
    { key: 'amount', label: t('freelancer.columns.amount'), numeric: true, phoneMain: true, cell: (line) => money(line.amountCents) },
    { key: 'state', label: t('freelancer.columns.state'), phoneBare: true, className: 'freelancer-state-cell', cell: (line) => <LineState line={line} /> },
  ];

  return (
    <>
      <header className="freelancer-head">
        <p className="label">{t('freelancer.eyebrow')}</p>
        <h1 className="freelancer-title">{view.name}</h1>
        <p className="muted freelancer-intro">{t('freelancer.intro')}</p>
      </header>

      <section className="freelancer-section" aria-labelledby="freelancer-fees-title">
        <SectionLabel id="freelancer-fees-title">{t('freelancer.fees.title')}</SectionLabel>
        <DataTable
          className="freelancer-fees"
          caption={t('freelancer.fees.title')}
          columns={columns}
          rows={view.lines}
          rowKey={(line) => line.costLineId}
          rowClassName={(line) => (selected.has(line.costLineId) && line.state === 'SELECTABLE' ? 'is-selected' : undefined)}
          empty={<p className="empty">{t('freelancer.fees.empty')}</p>}
        />
        <div className="freelancer-actions">
          {selectable.length === 0 ? (
            <p className="muted">{t('freelancer.fees.noneSelectable')}</p>
          ) : (
            <p className="freelancer-summary" aria-live="polite">
              <span>{t('freelancer.selectedCount', { count: chosen.length })}</span>
              <strong className="num">{t('freelancer.selectedTotal', { amount: money(totalCents) })}</strong>
            </p>
          )}
          <Button variant="primary" disabled={chosen.length === 0 || create.isPending} onClick={submit}>
            {create.isPending ? t('freelancer.creating') : t('freelancer.create')}
          </Button>
        </div>
        {notice && <CreateNoticeBox notice={notice} />}
      </section>

      <section className="freelancer-section" aria-labelledby="freelancer-orders-title">
        <SectionLabel id="freelancer-orders-title">{t('freelancer.orders.title')}</SectionLabel>
        {view.purchaseOrders.length === 0 ? (
          <p className="empty">{t('freelancer.orders.empty')}</p>
        ) : (
          <ul className="freelancer-orders">
            {view.purchaseOrders.map((po) => (
              <PurchaseOrderItem key={po.number} po={po} isNew={po.number === newNumber} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function LineState({ line }: { line: FreelancerLine }) {
  const { t } = useTranslation();
  switch (line.state) {
    case 'SELECTABLE':
      return <span>{t('freelancer.state.SELECTABLE')}</span>;
    case 'UPCOMING':
      return <span className="muted">{t('freelancer.state.UPCOMING')}</span>;
    case 'ON_PO':
      return <StatusTag tone="info">{t('freelancer.state.ON_PO', { number: line.purchaseOrderNumber ?? '' })}</StatusTag>;
    case 'PAID':
      return (
        <span className="freelancer-paid">
          <StatusTag tone="ok">{t('freelancer.state.PAID')}</StatusTag>
          {line.purchaseOrderNumber && <span className="muted mono small">{line.purchaseOrderNumber}</span>}
        </span>
      );
  }
}

function CreateNoticeBox({ notice }: { notice: CreateNotice }) {
  const { t } = useTranslation();
  if (notice.kind === 'created') {
    return (
      <Notice tone="ok" role="status">
        <p>{t('freelancer.created', { number: notice.number })}</p>
      </Notice>
    );
  }
  const text =
    notice.kind === 'notEligible'
      ? t('freelancer.notEligible')
      : notice.kind === 'rateLimited'
        ? t('freelancer.rateLimited')
        : t('freelancer.createFailed');
  return (
    <Notice tone={notice.kind === 'notEligible' ? 'warn' : 'danger'} role="alert">
      <p>{text}</p>
    </Notice>
  );
}

type IndexedLine = PublicPurchaseOrder['lines'][number] & { index: number };

const STATUS_TONE: Record<PublicPurchaseOrder['status'], StatusTone> = {
  OPEN: 'info',
  PAID: 'ok',
  CANCELLED: 'muted',
};

function PurchaseOrderItem({ po, isNew }: { po: PublicPurchaseOrder; isNew: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const ref = useRef<HTMLLIElement>(null);
  const [copy, setCopy] = useState<'copied' | 'failed' | null>(null);

  useEffect(() => {
    if (isNew) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [isNew]);

  const lineColumns: DataTableColumn<IndexedLine>[] = [
    {
      key: 'date',
      label: t('freelancer.columns.date'),
      primary: true,
      className: 'nowrap',
      cell: (line) => formatDate(line.eventStartDate, lang),
    },
    { key: 'venue', phoneBare: true, label: t('freelancer.columns.venue'), cell: (line) => line.venue },
    { key: 'role', phoneBare: true, label: t('freelancer.columns.role'), cell: (line) => feeRoleLabel(t, line) },
    { key: 'amount', label: t('freelancer.columns.amount'), numeric: true, phoneMain: true, cell: (line) => formatMoney(line.amountCents, lang) },
  ];

  return (
    <li ref={ref} className={['card', 'freelancer-order', isNew && 'is-new', po.status === 'CANCELLED' && 'is-cancelled'].filter(Boolean).join(' ')}>
      <div className="freelancer-order-head">
        <h3 className="freelancer-order-number mono">{po.number}</h3>
        {isNew && <StatusTag tone="ok">{t('freelancer.orders.isNew')}</StatusTag>}
        <Button
          size="sm"
          icon={Copy}
          aria-label={t('freelancer.orders.copyOf', { number: po.number })}
          onClick={() => void copyToClipboard(po.number).then((r) => setCopy(r.kind))}
        >
          {copy === 'copied' ? t('freelancer.orders.copied') : t('freelancer.orders.copy')}
        </Button>
      </div>
      {copy === 'failed' && (
        <p className="small muted" role="alert">
          {t('freelancer.orders.copyFailed')}
        </p>
      )}
      <dl className="freelancer-order-facts">
        <div>
          <dt className="label">{t('freelancer.orders.created')}</dt>
          <dd>{formatDate(po.createdAt, lang)}</dd>
        </div>
        <div>
          <dt className="label">{t('freelancer.orders.total')}</dt>
          <dd className="num">{formatMoney(po.totalCents, lang)}</dd>
        </div>
        <div>
          <dt className="label">{t('freelancer.orders.status')}</dt>
          <dd>
            <StatusTag tone={STATUS_TONE[po.status]}>{purchaseOrderStatusLabel(t, po, lang)}</StatusTag>
          </dd>
        </div>
      </dl>
      <DataTable
        className="freelancer-order-lines"
        caption={t('freelancer.orders.linesCaption', { number: po.number })}
        columns={lineColumns}
        rows={po.lines.map((line, index) => ({ ...line, index }))}
        rowKey={(line) => line.index}
      />
    </li>
  );
}
