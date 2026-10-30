import { FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { EventDetail, Person, PurchaseOrder } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { CreatePurchaseOrderDialog } from '../purchaseOrders/CreatePurchaseOrderDialog';
import { poCandidates } from './poCandidates';

/**
 * "Luo ostotilaus" in the cost list of an event: a PO by hand for one crew member, their open fees
 * on this event pre-ticked. Success → notice with a link to the PO; the cost lines refetch and
 * show the "PO <number>" tag. Hidden when nobody on the event has an open fee.
 */
export function EventPurchaseOrder({ event, people }: { event: EventDetail; people: Person[] | undefined }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<PurchaseOrder | null>(null);
  const candidates = useMemo(() => poCandidates(event, people), [event, people]);

  return (
    <>
      {created && (
        <Notice tone="ok" role="status" className="cost-po-notice">
          <p>
            {t('purchaseOrders.create.created', { number: created.number })}{' '}
            <Link to={`/purchase-orders/${created.id}`}>
              {t('purchaseOrders.create.openPo', { number: created.number })}
            </Link>
          </p>
          <Button size="sm" onClick={() => setCreated(null)}>
            {t('common.dismiss')}
          </Button>
        </Notice>
      )}
      {candidates.length > 0 && (
        <div className="cost-list-actions">
          <Button size="sm" icon={FileText} onClick={() => setOpen(true)}>
            {t('purchaseOrders.create.openFromEvent')}
          </Button>
        </div>
      )}
      {open && (
        <CreatePurchaseOrderDialog
          candidates={candidates}
          eventId={event.id}
          onClose={() => setOpen(false)}
          onCreated={(po) => {
            setOpen(false);
            setCreated(po);
          }}
        />
      )}
    </>
  );
}
