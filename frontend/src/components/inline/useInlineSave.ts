import type { TFunction } from 'i18next';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FieldCode } from '../../api/enums';
import { apiErrorMessage, apiFieldErrors, fieldErrorLabel } from '../../i18n/labels';

// Save-on-blur state for one inline field (NFR-8, docs/design.md → Inline editing).
// The inline components use it; use it directly only for a control they don't cover.

export type InlineStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Client-side check: return a field code (same codes as the API) to block the save. */
export type InlineValidate<T> = (value: T) => FieldCode | null | undefined;

export type InlineParseResult<T> = { ok: true; value: T } | { ok: false; error: FieldCode };

/** How long the "saved" check stays visible. */
export const INLINE_SAVED_MS = 1500;

export interface UseInlineSaveOptions<T, D = T> {
  /** Last saved value (from the server). When it changes, an unedited field follows it. */
  value: T;
  /** Sends the value (one PATCH field / one PUT row). Reject with an `ApiError` on failure. */
  save: (next: T) => Promise<unknown>;
  /** Runs after `parse`, before sending. A returned code shows its message and blocks the save. */
  validate?: InlineValidate<T>;
  /** Value → what the control edits (e.g. cents → `"1234,50"`). Default: identity. */
  toDraft?: (value: T) => D;
  /** What the control edits → value, or a field code. Default: identity. */
  parse?: (draft: D) => InlineParseResult<T>;
  /** Unchanged check. Default: `Object.is`. */
  equals?: (a: T, b: T) => boolean;
  /** API field name: picks this field's code from a VALIDATION_ERROR (default: the first one). */
  field?: string;
  /** No saving while true. */
  disabled?: boolean;
  /** When this changes (e.g. the language), an unedited draft is re-formatted from the value. */
  formatKey?: unknown;
}

export interface InlineSaveState<D> {
  /** Current control value (what the user typed / picked). */
  draft: D;
  setDraft: (draft: D) => void;
  /**
   * Validates and saves the draft (or the given draft, e.g. a new select value) when it differs
   * from the saved value. Resolves `true` when saved or unchanged.
   */
  commit: (draft?: D) => Promise<boolean>;
  /** Esc: back to the last saved value, clears the error. */
  revert: () => void;
  status: InlineStatus;
  /** Translated error message (status `error`). */
  error: string | null;
  /** The draft differs from the saved value (or is invalid). */
  dirty: boolean;
}

/** Translated message for a failed save: the field's code, else the error code. */
export function inlineErrorMessage(t: TFunction, error: unknown, field?: string): string {
  const fields = apiFieldErrors(t, error);
  const message = (field ? fields[field] : undefined) ?? Object.values(fields)[0];
  return message ?? apiErrorMessage(t, error);
}

function identity<A, B>(value: A): B {
  return value as unknown as B;
}

export function useInlineSave<T, D = T>(options: UseInlineSaveOptions<T, D>): InlineSaveState<D> {
  const { t } = useTranslation();
  const { value, formatKey } = options;
  const toDraft = options.toDraft ?? identity<T, D>;
  const parse = options.parse ?? ((d: D): InlineParseResult<T> => ({ ok: true, value: identity(d) }));
  const equals = options.equals ?? Object.is;

  const [saved, setSaved] = useState<T>(value);
  const [draft, setDraftState] = useState<D>(() => toDraft(value));
  const [status, setStatus] = useState<InlineStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [prev, setPrev] = useState({ value, formatKey });

  const representsSaved = (d: D) => {
    const parsed = parse(d);
    return parsed.ok && equals(parsed.value, saved);
  };

  // Follow the server value / format while the user is not editing (derived state).
  if (!equals(prev.value, value) || !Object.is(prev.formatKey, formatKey)) {
    const formatChanged = !Object.is(prev.formatKey, formatKey);
    setPrev({ value, formatKey });
    const editing = status === 'error' || (!formatChanged && !representsSaved(draft));
    if (!equals(saved, value)) setSaved(value);
    if (!editing) setDraftState(toDraft(value));
  }

  const savedRef = useRef(saved);
  const draftRef = useRef(draft);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commitRef = useRef<() => Promise<boolean>>(async () => false);

  useLayoutEffect(() => {
    savedRef.current = saved;
    draftRef.current = draft;
  });
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
    };
  }, []);

  const setDraft = (next: D) => {
    draftRef.current = next;
    setDraftState(next);
  };
  const fail = (message: string) => {
    clearTimeout(timerRef.current);
    setStatus('error');
    setError(message);
  };

  const commit = async (...args: [D?]): Promise<boolean> => {
    const d = args.length > 0 ? (args[0] as D) : draftRef.current;
    if (args.length > 0) setDraft(d);
    if (options.disabled) return false;
    if (savingRef.current) {
      pendingRef.current = true;
      return false;
    }
    const parsed = parse(d);
    if (!parsed.ok) {
      fail(fieldErrorLabel(t, parsed.error));
      return false;
    }
    const next = parsed.value;
    const invalid = options.validate?.(next);
    if (invalid) {
      fail(fieldErrorLabel(t, invalid));
      return false;
    }
    if (equals(next, savedRef.current)) {
      // Unchanged: nothing is sent; normalise the text (e.g. "1000" → "1000,00").
      if (draftRef.current === d) setDraft(toDraft(next));
      setError(null);
      setStatus((s) => (s === 'error' ? 'idle' : s));
      return true;
    }

    clearTimeout(timerRef.current);
    savingRef.current = true;
    setStatus('saving');
    setError(null);
    let ok = false;
    try {
      await options.save(next);
      ok = true;
    } catch (e) {
      if (mountedRef.current) fail(inlineErrorMessage(t, e, options.field));
    } finally {
      savingRef.current = false;
    }
    if (!mountedRef.current) return ok;
    if (ok) {
      savedRef.current = next;
      setSaved(next);
      if (draftRef.current === d) setDraft(toDraft(next));
      setStatus('saved');
      timerRef.current = setTimeout(
        () => setStatus((s) => (s === 'saved' ? 'idle' : s)),
        INLINE_SAVED_MS,
      );
    }
    if (pendingRef.current) {
      pendingRef.current = false;
      // The user changed the value again while it was saving: save the newest one too.
      if (draftRef.current !== d) return commitRef.current();
    }
    return ok;
  };

  useLayoutEffect(() => {
    commitRef.current = () => commit();
  });

  const revert = () => {
    pendingRef.current = false;
    clearTimeout(timerRef.current);
    setDraft(toDraft(savedRef.current));
    setStatus((s) => (s === 'saving' ? s : 'idle'));
    setError(null);
  };

  return {
    draft,
    setDraft,
    commit,
    revert,
    status,
    error,
    dirty: !representsSaved(draft),
  };
}
