/** Years offered in the year picker: a window around the current and the selected year. */
export function yearOptions(selected: number, current = new Date().getFullYear()): number[] {
  const from = Math.min(selected, current) - 5;
  const to = Math.max(selected, current) + 3;
  const years: number[] = [];
  for (let y = from; y <= to; y += 1) years.push(y);
  return years;
}
