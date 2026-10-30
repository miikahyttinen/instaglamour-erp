/** Years offered in the year picker: a window around the current and the selected year. */
export function yearOptions(selected: number, current = new Date().getFullYear()): number[] {
  const from = Math.min(selected, current) - 5;
  const to = Math.max(selected, current) + 3;
  const years: number[] = [];
  for (let y = from; y <= to; y += 1) years.push(y);
  return years;
}

/** The current year in the organisation time zone (Europe/Helsinki, like the API's "today"). */
export function currentYear(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', year: 'numeric' }).format(now));
}
