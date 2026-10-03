/**
 * Error format from docs/api-contract.md:
 * { "error": { "code": "...", "message": "...", "fields": { "venue": "REQUIRED" } } }
 */
import type { FastifyError, FastifyInstance } from 'fastify';
import type { z } from 'zod';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_STATUS_TRANSITION'
  | 'GIG_DELETED'
  | 'COST_NOT_PAYABLE'
  | 'BUDGET_NOT_EMPTY'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'INTERNAL_ERROR';

export const FIELD_CODES = [
  'REQUIRED',
  'INVALID_DATE',
  'END_BEFORE_START',
  'NEGATIVE_AMOUNT',
  'INVALID_VALUE',
  'DESCRIPTION_REQUIRED',
  'INVALID_HOURS',
  'TOO_LONG',
  'UNKNOWN_REFERENCE',
  'NOT_EDITABLE',
] as const;
export type FieldCode = (typeof FIELD_CODES)[number];
const fieldCodeSet: ReadonlySet<string> = new Set(FIELD_CODES);

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_STATUS_TRANSITION: 409,
  GIG_DELETED: 409,
  COST_NOT_PAYABLE: 409,
  BUDGET_NOT_EMPTY: 409,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FILE_TYPE: 415,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, FieldCode>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = STATUS_BY_CODE[code];
  }
}

export const unauthenticated = () => new AppError('UNAUTHENTICATED', 'Sign-in required');
export const forbidden = (message = 'Not allowed') => new AppError('FORBIDDEN', message);
export const notFound = (message = 'Not found') => new AppError('NOT_FOUND', message);
export const validationError = (fields: Record<string, FieldCode>, message = 'Invalid input') =>
  new AppError('VALIDATION_ERROR', message, fields);

export function errorBody(code: ErrorCode, message: string, fields?: Record<string, FieldCode>) {
  return { error: fields ? { code, message, fields } : { code, message } };
}

/** Map a single zod issue to a contract field code. Schemas may set `message` to a field code directly. */
function fieldCodeForIssue(issue: z.core.$ZodIssue): FieldCode {
  if (fieldCodeSet.has(issue.message)) return issue.message as FieldCode;
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined || issue.input === null ? 'REQUIRED' : 'INVALID_VALUE';
    case 'too_big':
      return issue.origin === 'string' ? 'TOO_LONG' : 'INVALID_VALUE';
    case 'too_small':
      if (issue.origin === 'string') return 'REQUIRED';
      if (issue.origin === 'number' && Number(issue.minimum) === 0) return 'NEGATIVE_AMOUNT';
      return 'INVALID_VALUE';
    default:
      return 'INVALID_VALUE';
  }
}

export function zodErrorToFields(error: z.ZodError): Record<string, FieldCode> {
  const fields: Record<string, FieldCode> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '_';
    fields[key] ??= fieldCodeForIssue(issue);
  }
  return fields;
}

/** Parse request input with a zod schema; throws a contract-shaped 400 on failure. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  // reportInput: issues carry the input, so a missing value (REQUIRED) differs from a wrong one (INVALID_VALUE).
  const result = schema.safeParse(input ?? {}, { reportInput: true });
  if (!result.success) throw validationError(zodErrorToFields(result.error));
  return result.data;
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | AppError, request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(errorBody(err.code, err.message, err.fields));
    }
    const status = err.statusCode ?? 500;
    if (status === 413) return reply.status(413).send(errorBody('FILE_TOO_LARGE', err.message));
    if (status === 415) return reply.status(415).send(errorBody('UNSUPPORTED_FILE_TYPE', err.message));
    if (status === 404) return reply.status(404).send(errorBody('NOT_FOUND', err.message));
    if (status >= 400 && status < 500) {
      // Malformed JSON, wrong content type, etc.
      return reply.status(400).send(errorBody('VALIDATION_ERROR', err.message));
    }
    request.log.error({ err }, 'Unhandled error');
    return reply.status(500).send(errorBody('INTERNAL_ERROR', 'Internal server error'));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(errorBody('NOT_FOUND', `Route ${request.method} ${request.url} not found`));
  });
}
