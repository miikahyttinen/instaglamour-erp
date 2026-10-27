// Data import shapes (UC-035, BR-120/121), exactly per docs/api-contract.md "Data import".
// Re-exported from types.ts.

type Id = string;
type IsoTimestamp = string;

/** Data types of an import summary, in contract order (also the table order on the page). */
export const IMPORT_DATA_TYPES = [
  'partners',
  'people',
  'lineupTemplates',
  'settings',
  'budgetCategories',
  'clients',
  'events',
  'offers',
  'references',
  'tasks',
  'hours',
  'budget',
] as const;
export type ImportDataType = (typeof IMPORT_DATA_TYPES)[number];

export interface ImportCounts {
  created: number;
  updated: number;
  skipped: number;
}

export type ImportSummary = Record<ImportDataType, ImportCounts>;

/** 200 of `POST /api/import`. */
export interface ImportResponse {
  dryRun: boolean;
  summary: ImportSummary;
}

/** One real import (dry runs are not logged). */
export interface ImportRun {
  id: Id;
  partnerId: Id;
  at: IsoTimestamp;
  filename: string | null;
  summary: ImportSummary;
}

/** Query of `POST /api/import`. */
export interface ImportOptions {
  dryRun: boolean;
  /** ≤ 200 characters (for the log). */
  filename?: string;
}

/** Max file size (BR-121): larger files are rejected before sending; the server answers 413. */
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
/** Max `filename` query length. */
export const IMPORT_FILENAME_MAX = 200;
