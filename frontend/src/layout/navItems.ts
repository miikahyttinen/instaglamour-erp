import {
  CalendarDays,
  Clock,
  Contact,
  FileText,
  ListChecks,
  Music,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  labelKey: `nav.${'offers' | 'year' | 'gigs' | 'clients' | 'people' | 'tasks' | 'hours' | 'budget'}`;
  icon: LucideIcon;
  end?: boolean;
}

/** Offers first (owner decision 2026-10-07); `/` stays the year page. */
export const NAV_ITEMS: NavItem[] = [
  { to: '/offers', labelKey: 'nav.offers', icon: FileText },
  { to: '/', labelKey: 'nav.year', icon: CalendarDays, end: true },
  { to: '/gigs', labelKey: 'nav.gigs', icon: Music },
  { to: '/clients', labelKey: 'nav.clients', icon: Contact },
  { to: '/people', labelKey: 'nav.people', icon: Users },
  { to: '/tasks', labelKey: 'nav.tasks', icon: ListChecks },
  { to: '/hours', labelKey: 'nav.hours', icon: Clock },
  { to: '/budget', labelKey: 'nav.budget', icon: Wallet },
];

/** The nav item whose section contains `pathname` (`/gigs/12` → Gigs), or undefined. */
export function activeNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
}
