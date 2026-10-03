import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { setLanguage } from '../i18n';
import { resetMockDb } from '../mocks/data';
import { server } from '../mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  resetMockDb();
  setLanguage('fi');
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => server.close());

