import {
  CalendarDays,
  Clock,
  Contact,
  FileText,
  ListChecks,
  Music,
  Receipt,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  labelKey: `nav.${'offers' | 'myEvents' | 'events' | 'purchaseOrders' | 'clients' | 'people' | 'tasks' | 'hours' | 'budget' | 'settings'}`;
  icon: LucideIcon;
  end?: boolean;
}

/** My gigs first (replaced Year, 2026-11-08), then Offers (owner decision TASK-142). */
export const NAV_ITEMS: NavItem[] = [
  { to: '/my-gigs', labelKey: 'nav.myEvents', icon: CalendarDays },
  { to: '/offers', labelKey: 'nav.offers', icon: FileText },
  { to: '/gigs', labelKey: 'nav.events', icon: Music },
  { to: '/purchase-orders', labelKey: 'nav.purchaseOrders', icon: Receipt },
  { to: '/clients', labelKey: 'nav.clients', icon: Contact },
  { to: '/people', labelKey: 'nav.people', icon: Users },
  { to: '/tasks', labelKey: 'nav.tasks', icon: ListChecks },
  { to: '/hours', labelKey: 'nav.hours', icon: Clock },
  { to: '/budget', labelKey: 'nav.budget', icon: Wallet },
  // Last item: lineups + data import (UC-035) tabs.
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];

/** The nav item whose section contains `pathname` (`/gigs/12` → Events), or undefined. */
export function activeNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
}
