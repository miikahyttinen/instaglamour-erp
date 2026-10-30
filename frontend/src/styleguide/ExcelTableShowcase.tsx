// Styleguide demo of ExcelTable (docs/design.md → "Excel-style tables"). Synthetic data only.
// Uses local state (not the URL) because the page shows the demo once per theme.
import { Pencil } from 'lucide-react';
import { IconButton } from '../components/Button';
import { ExcelTable } from '../components/ExcelTable';
import { useLocalTableState, type ExcelColumn } from '../components/excelTableState';
import { StatusTag, type StatusTone } from '../components/StatusTag';
import { useLang } from '../i18n/useLang';
import { formatDate, formatMoney } from '../lib/format';

interface DemoRow {
  id: number;
  name: string;
  client: string;
  city: string | null;
  date: string;
  price: number | null; // cents
  status: 'SOLD' | 'PLAYED' | 'CANCELLED';
  seller: string;
  performers: string[];
}

const STATUS: Record<DemoRow['status'], { tone: StatusTone; text: string }> = {
  SOLD: { tone: 'info', text: 'Upcoming' },
  PLAYED: { tone: 'ok', text: 'Played' },
  CANCELLED: { tone: 'danger', text: 'Cancelled' },
};
const STATUS_ORDER = ['SOLD', 'PLAYED', 'CANCELLED'];

const ROWS: DemoRow[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  name: `Event ${i + 1}`,
  client: `Client ${String.fromCharCode(65 + (i % 3))}`,
  city: i % 5 === 4 ? null : `City ${(i % 10) + 1}`,
  date: `2030-${String((i % 12) + 1).padStart(2, '0')}-${String(((i * 7) % 27) + 1).padStart(2, '0')}`,
  price: i % 6 === 5 ? null : 100000 + i * 25000,
  status: i % 7 === 6 ? 'CANCELLED' : i < 5 ? 'PLAYED' : 'SOLD',
  seller: i % 2 ? 'Partner A' : 'Partner B',
  performers: i % 4 === 3 ? [] : [`Person ${(i % 3) + 1}`, `Person ${(i % 3) + 2}`],
}));

export function ExcelTableShowcase() {
  const lang = useLang();
  const state = useLocalTableState({ defaultSort: { key: 'date', dir: 'asc' } });
  const columns: ExcelColumn<DemoRow>[] = [
    { key: 'name', label: 'Event', primary: true, sortValue: (r) => r.name, cell: (r) => <a href="#event">{r.name}</a> },
    { key: 'client', label: 'Client', sortValue: (r) => r.client, filterValue: (r) => r.client, cell: (r) => r.client },
    { key: 'city', label: 'City', sortValue: (r) => r.city, filterValue: (r) => r.city, cell: (r) => r.city ?? '–' },
    { key: 'date', label: 'Date', sortValue: (r) => r.date, cell: (r) => formatDate(r.date, lang) },
    {
      key: 'price',
      label: 'Price',
      numeric: true,
      sortValue: (r) => r.price,
      cell: (r) => (r.price === null ? '–' : formatMoney(r.price, lang)),
    },
    {
      key: 'status',
      label: 'Status',
      sortValue: (r) => STATUS_ORDER.indexOf(r.status),
      filterValue: (r) => r.status,
      filterLabel: (v) => STATUS[v as DemoRow['status']].text,
      filterCompare: (a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b),
      cell: (r) => <StatusTag tone={STATUS[r.status].tone}>{STATUS[r.status].text}</StatusTag>,
    },
    { key: 'seller', label: 'Seller', sortValue: (r) => r.seller, filterValue: (r) => r.seller, cell: (r) => r.seller },
    {
      key: 'performers',
      label: 'Performers',
      filterValue: (r) => r.performers,
      cell: (r) => r.performers.join(', ') || '–',
    },
    {
      key: 'actions',
      label: 'Actions',
      hideOnPhone: true,
      header: <span className="visually-hidden">Actions</span>,
      cell: (r) => <IconButton icon={Pencil} label={`Edit ${r.name}`} />,
    },
  ];
  return (
    <ExcelTable
      {...state}
      caption="Demo Excel table"
      columns={columns}
      rows={ROWS}
      rowKey={(r) => r.id}
      footer={(visible) => (
        <tr>
          <td>Total</td>
          <td colSpan={3} className="hide-phone" />
          <td className="num" data-label="Total">
            {formatMoney(
              visible.reduce((sum, r) => sum + (r.price ?? 0), 0),
              lang,
            )}
          </td>
          <td colSpan={4} className="hide-phone" />
        </tr>
      )}
    />
  );
}
