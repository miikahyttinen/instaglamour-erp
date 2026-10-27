import {
  CalendarDays,
  Clock,
  Contact,
  FileText,
  ListChecks,
  Music,
  Receipt,
  Upload,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  labelKey: `nav.${'offers' | 'year' | 'events' | 'purchaseOrders' | 'clients' | 'people' | 'tasks' | 'hours' | 'budget' | 'dataImport'}`;
  icon: LucideIcon;
  end?: boolean;
}

/** Year first, then Offers (owner decision TASK-142). */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.year', icon: CalendarDays, end: true },
  { to: '/offers', labelKey: 'nav.offers', icon: FileText },
  { to: '/events', labelKey: 'nav.events', icon: Music },
  { to: '/purchase-orders', labelKey: 'nav.purchaseOrders', icon: Receipt },
  { to: '/clients', labelKey: 'nav.clients', icon: Contact },
  { to: '/people', labelKey: 'nav.people', icon: Users },
  { to: '/tasks', labelKey: 'nav.tasks', icon: ListChecks },
  { to: '/hours', labelKey: 'nav.hours', icon: Clock },
  { to: '/budget', labelKey: 'nav.budget', icon: Wallet },
  // Last item (UC-035).
  { to: '/import', labelKey: 'nav.dataImport', icon: Upload },
];

/** The nav item whose section contains `pathname` (`/events/12` → Events), or undefined. */
export function activeNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
}
