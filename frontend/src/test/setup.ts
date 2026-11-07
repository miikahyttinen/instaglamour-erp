/// <reference types="node" />
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { File as NodeFile } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { setLanguage } from '../i18n';
import { resetMockDb } from '../mocks/data';
import { server } from '../mocks/server';
import { removeMatchMedia } from './matchMedia';

// Uploads: Vitest's jsdom FormData → Node fetch bridge drops file names and bytes, and Node's
// multipart parser (used by the mock handler) needs Node's File. Tests therefore use Node's
// FormData (taken from a Node Response) and File.
const NodeFormData = (await new Response(new URLSearchParams()).formData()).constructor;
Object.assign(globalThis, { FormData: NodeFormData, File: NodeFile });

// jsdom does not implement window.scrollTo (it logs "Not implemented"); the app shell calls it
// on every navigation (scroll to top). Tests spy on it where it matters.
window.scrollTo = (() => {}) as typeof window.scrollTo;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  resetMockDb();
  setLanguage('fi');
  // Theme: no stored choice, nothing applied, no matchMedia (= phone, dark).
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  removeMatchMedia();
});

afterAll(() => server.close());

