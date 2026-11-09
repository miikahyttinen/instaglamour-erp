// Mock state of Settings → Parameters: who changed a parameter and when (the values live where
// the other mocks read them, e.g. db.reference.settings). No other imports, so data.ts can reset
// it without an import cycle.

export interface ParameterChange {
  updatedAt: string;
  updatedBy: string;
}

/** Parameter key → last change through the parameters API (none = seeded value). */
export const parameterChanges = new Map<string, ParameterChange>();

/** Resets the parameter mock (called by resetMockDb). */
export function resetParameterStore(): void {
  parameterChanges.clear();
}
