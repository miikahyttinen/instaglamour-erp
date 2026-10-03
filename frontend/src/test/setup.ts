/// <reference types="node" />
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { File as NodeFile } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { setLanguage } from '../i18n';
import { resetMockDb } from '../mocks/data';
import { server } from '../mocks/server';

// Uploads: Vitest's jsdom FormData → Node fetch bridge drops file names and bytes, and Node's
// multipart parser (used by the mock handler) needs Node's File. Tests therefore use Node's
// FormData (taken from a Node Response) and File.
const NodeFormData = (await new Response(new URLSearchParams()).formData()).constructor;
Object.assign(globalThis, { FormData: NodeFormData, File: NodeFile });

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

