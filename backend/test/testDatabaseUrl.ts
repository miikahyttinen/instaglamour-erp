import 'dotenv/config';

const DEFAULT_TEST_DATABASE_URL = 'postgresql://instaglamour:instaglamour@localhost:5433/instaglamour_test';

/** The test database (never the dev database: tests empty it freely). */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
  if (process.env.DATABASE_URL && url === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL — tests delete all data.');
  }
  return url;
}
