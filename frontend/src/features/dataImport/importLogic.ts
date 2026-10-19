import { isApiError } from '../../api/client';
import type { Language } from '../../api/enums';
import { IMPORT_DATA_TYPES, IMPORT_MAX_BYTES, type ImportCounts, type ImportSummary } from '../../api/types';

/** A chosen file, read and parsed in the browser. `key` changes with every choice. */
export interface ChosenFile {
  key: number;
  name: string;
  size: number;
  /** Parsed JSON; sent as the request body. */
  document: unknown;
}

export type FileProblem = 'tooLarge' | 'notJsonFile' | 'parseError' | 'readError';

/** `.json` by name or type (drag & drop skips the chooser's `accept`). */
export function isJsonFile(file: File): boolean {
  return /\.json$/i.test(file.name) || file.type === 'application/json';
}

/** Reads and parses the file. > 10 MB is rejected before reading (BR-121). */
export async function readImportFile(
  file: File,
  key: number,
): Promise<{ ok: true; file: ChosenFile } | { ok: false; problem: FileProblem }> {
  if (!isJsonFile(file)) return { ok: false, problem: 'notJsonFile' };
  if (file.size > IMPORT_MAX_BYTES) return { ok: false, problem: 'tooLarge' };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, problem: 'readError' };
  }
  try {
    return { ok: true, file: { key, name: file.name, size: file.size, document: JSON.parse(text) } };
  } catch {
    return { ok: false, problem: 'parseError' };
  }
}

/** Created / updated / skipped summed over every data type. */
export function summaryTotals(summary: ImportSummary): ImportCounts {
  const total: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  for (const type of IMPORT_DATA_TYPES) {
    const counts = summary[type];
    if (!counts) continue;
    total.created += counts.created;
    total.updated += counts.updated;
    total.skipped += counts.skipped;
  }
  return total;
}

/** File size: FI `1,5 Mt` / `512 kt`, EN `1.5 MB` / `512 kB`. */
export function formatFileSize(bytes: number, lang: Language): string {
  const units = lang === 'fi' ? ['t', 'kt', 'Mt'] : ['B', 'kB', 'MB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const number = new Intl.NumberFormat(lang === 'fi' ? 'fi-FI' : 'en-GB', {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
  return `${number} ${units[unit]}`;
}

/** `details.errors` of a VALIDATION_ERROR (every problem in the file), else null. */
export function importErrors(error: unknown): string[] | null {
  if (!isApiError(error) || error.code !== 'VALIDATION_ERROR') return null;
  const errors = error.details.errors;
  return Array.isArray(errors) ? errors.map(String) : null;
}
