import { Route, Routes } from 'react-router-dom';
import { PurchaseOrderListPage } from './PurchaseOrderListPage';
import { PurchaseOrderPage } from './PurchaseOrderPage';

/** /purchase-orders and /purchase-orders/:id (UC-034). */
export function PurchaseOrdersRoutes() {
  return (
    <Routes>
      <Route index element={<PurchaseOrderListPage />} />
      <Route path=":id" element={<PurchaseOrderPage />} />
    </Routes>
  );
}
