import {
  CalendarDays,
  Clock,
  ListChecks,
  Music,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  labelKey: `nav.${'year' | 'gigs' | 'people' | 'tasks' | 'hours' | 'budget'}`;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.year', icon: CalendarDays, end: true },
  { to: '/gigs', labelKey: 'nav.gigs', icon: Music },
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
