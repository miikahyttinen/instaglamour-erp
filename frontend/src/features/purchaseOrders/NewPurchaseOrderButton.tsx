import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { usePeople } from '../events/queries';
import { CreatePurchaseOrderDialog } from './CreatePurchaseOrderDialog';

/**
 * "+ Uusi ostotilaus" on the Ostotilaukset page: a PO by hand for any active person; on success
 * the new PO page opens (it shows the number).
 */
export function NewPurchaseOrderButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const people = usePeople();
  const candidates = useMemo(
    () =>
      (people.data ?? [])
        .filter((p) => p.active)
        .map((p) => ({ id: p.id, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [people.data],
  );
  return (
    <>
      <Button disabled={people.isPending} onClick={() => setOpen(true)}>
        + {t('purchaseOrders.create.open')}
      </Button>
      {open && (
        <CreatePurchaseOrderDialog
          candidates={candidates}
          searchable
          onClose={() => setOpen(false)}
          onCreated={(po) => navigate(`/purchase-orders/${po.id}`)}
        />
      )}
    </>
  );
}
