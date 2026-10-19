import { IMPORT_DATA_TYPES, type ImportDataType, type ImportRun } from '../api/importTypes';

// Mock state of "Data import" (UC-035), see importHandlers.ts. No other imports, so data.ts can
// reset it without an import cycle.

export interface ImportStore {
  /** Per data type: natural key → JSON of the imported item. */
  items: Record<ImportDataType, Map<string, string>>;
  /** The import log, newest first. */
  runs: ImportRun[];
  nextId: number;
}

function emptyStore(): ImportStore {
  return {
    items: Object.fromEntries(IMPORT_DATA_TYPES.map((type) => [type, new Map()])) as ImportStore['items'],
    runs: [],
    nextId: 1,
  };
}

export const importStore: ImportStore = emptyStore();

/** Resets the import mock (called by resetMockDb). */
export function resetImportStore(): void {
  Object.assign(importStore, emptyStore());
}
