export interface NavItem {
  to: string;
  labelKey: `nav.${'year' | 'gigs' | 'people' | 'tasks' | 'hours' | 'budget'}`;
  icon: string;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.year', icon: '◎', end: true },
  { to: '/gigs', labelKey: 'nav.gigs', icon: '♪' },
  { to: '/people', labelKey: 'nav.people', icon: '☺' },
  { to: '/tasks', labelKey: 'nav.tasks', icon: '✓' },
  { to: '/hours', labelKey: 'nav.hours', icon: '◷' },
  { to: '/budget', labelKey: 'nav.budget', icon: '€' },
];
