/** Up to two initials from the author ("Person 5, Client A" → "P5"); "" when none. */
export function referenceInitials(author: string): string {
  return author
    .split(/[\s,.;:–-]+/)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
