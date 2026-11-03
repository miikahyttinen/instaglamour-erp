/** Data import endpoints (docs/api-contract.md "Data import"; UC-035, BR-120, BR-121). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadSeed, SeedValidationError } from '../../seed/load.js';
import { validateSeed } from '../../seed/schema.js';
import type { AppDeps } from '../app.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError, parseInput } from '../http/errors.js';
import { IMPORT_RUNS_LIMIT, importOnlyErrors, MAX_IMPORT_BYTES, toImportRunDto } from '../import/store.js';

const importQuery = z.object({
  dryRun: z.enum(['true', 'false'], { message: 'INVALID_VALUE' }).default('false'),
  filename: z.string().max(200).optional(),
});

const invalidImport = (errors: string[]) =>
  new AppError('VALIDATION_ERROR', 'The import file is invalid; nothing was imported', undefined, { errors });

/** The body as text (BOM tolerated) parsed as JSON, or a contract 400. */
function parseDocument(body: unknown): unknown {
  const raw = typeof body === 'string' ? body : '';
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  try {
    return JSON.parse(text);
  } catch {
    throw invalidImport(['not valid JSON']);
  }
}

export function importRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config } = deps;

  // Own scope: this route alone takes up to 10 MB, and the raw text is parsed here so a parse error
  // gets the contract's `details.errors` (the global JSON parser has a 1 MB limit and no details).
  void app.register((scope, _options, done) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'string', bodyLimit: MAX_IMPORT_BYTES }, (_request, body, done) => {
      done(null, body);
    });

    scope.post('/api/import', { bodyLimit: MAX_IMPORT_BYTES }, async (request) => {
      const me = request.requirePartner();
      const query = parseInput(importQuery, request.query);
      const dryRun = query.dryRun === 'true';
      const filename = query.filename?.trim() || null;

      const document = parseDocument(request.body);
      const validation = validateSeed(document);
      const errors = [...(validation.ok ? [] : validation.errors), ...importOnlyErrors(document, config)];
      if (errors.length > 0) throw invalidImport(errors);

      try {
        // No seedDir / uploadDir: photos are rejected above, so the loader never reads or writes files.
        const summary = await loadSeed(db, document, {
          dryRun,
          afterLoad: async (tx, summary) => {
            await tx.importRun.create({
              data: { partnerId: me.id, filename, summary: summary as unknown as Prisma.InputJsonValue },
            });
          },
        });
        return { dryRun, summary };
      } catch (err) {
        if (err instanceof SeedValidationError) throw invalidImport(err.errors);
        throw err;
      }
    });

    scope.get('/api/import/runs', async () => {
      const runs = await db.importRun.findMany({ orderBy: [{ at: 'desc' }, { id: 'desc' }], take: IMPORT_RUNS_LIMIT });
      return runs.map(toImportRunDto);
    });

    done();
  });
}
