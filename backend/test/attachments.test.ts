/** Attachment endpoints (UC-008, BR-040). Files go to a temporary UPLOAD_DIR outside the repository. */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanFilename, detectContentType, MAX_ATTACHMENT_BYTES } from '../src/routes/attachments.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';
import { call, createEvent, history, startSession, UNKNOWN_ID, type Session } from './eventFixtures.js';

const PDF = Buffer.from('%PDF-1.4\n% synthetic test file\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('synthetic')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('synthetic')]);
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('synthetic')]);
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

let s: Session;
let uploadDir: string;

beforeEach(async () => {
  await resetDb();
  uploadDir = await mkdtemp(path.join(os.tmpdir(), 'instaglamour-test-uploads-'));
  s = await startSession({ config: { uploadDir } });
});
afterEach(async () => {
  await s.app.close();
  await rm(uploadDir, { recursive: true, force: true });
});
afterAll(closeTestDb);

function multipart(filename: string, content: Buffer, contentType = 'application/octet-stream', field = 'file') {
  const boundary = '----instaglamourTestBoundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

function upload(eventId: string, filename: string, content: Buffer, contentType?: string, field?: string, cookie = s.cookie) {
  const { payload, headers } = multipart(filename, content, contentType, field);
  return s.app.inject({
    method: 'POST',
    url: `/api/events/${eventId}/attachments`,
    headers: { ...headers, ...(cookie ? { cookie } : {}) },
    payload,
  });
}

describe('POST /api/events/{id}/attachments', () => {
  it('stores a PDF in UPLOAD_DIR, returns 201 Attachment, lists it and logs ATTACHMENT_ADDED', async () => {
    const event = await createEvent(s);
    const res = await upload(event.id, 'contract.pdf', PDF, 'application/pdf');
    expect(res.statusCode).toBe(201);
    const attachment = res.json();
    expect(attachment).toEqual({
      id: expect.any(String),
      eventId: event.id,
      filename: 'contract.pdf',
      contentType: 'application/pdf',
      sizeBytes: PDF.length,
      uploadedBy: s.world.a.id,
      uploadedAt: expect.any(String),
    });

    const files = await readdir(uploadDir);
    expect(files).toHaveLength(1);
    expect(await readFile(path.join(uploadDir, files[0]!))).toEqual(PDF);

    const detail = (await call(s, 'GET', `/api/events/${event.id}`)).json();
    expect(detail.attachments).toEqual([attachment]);

    const [entry] = await history(s, event.id);
    expect(entry).toMatchObject({ type: 'ATTACHMENT_ADDED', details: { attachmentId: attachment.id, filename: 'contract.pdf' } });
  });

  it.each([
    ['photo.png', PNG, 'image/png'],
    ['photo.JPG', JPG, 'image/jpeg'],
    ['photo.jpeg', JPG, 'image/jpeg'],
    ['rider.docx', ZIP, DOCX_TYPE],
  ])('accepts %s', async (filename, content, expectedType) => {
    const event = await createEvent(s);
    const res = await upload(event.id, filename, content);
    expect(res.statusCode).toBe(201);
    expect(res.json().contentType).toBe(expectedType);
  });

  it('lists attachments newest first', async () => {
    const event = await createEvent(s);
    await upload(event.id, 'first.pdf', PDF);
    await new Promise((r) => setTimeout(r, 5));
    await upload(event.id, 'second.png', PNG);
    const detail = (await call(s, 'GET', `/api/events/${event.id}`)).json();
    expect(detail.attachments.map((a: { filename: string }) => a.filename)).toEqual(['second.png', 'first.pdf']);
  });

  it.each([
    ['notes.txt', Buffer.from('plain text'), 'text/plain'],
    ['fake.pdf', Buffer.from('not really a pdf'), 'application/pdf'],
    ['archive.zip', ZIP, 'application/zip'],
    ['empty.pdf', Buffer.alloc(0), 'application/pdf'],
  ])('rejects %s with 415 and stores nothing', async (filename, content, type) => {
    const event = await createEvent(s);
    const res = await upload(event.id, filename, content, type);
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(await readdir(uploadDir)).toEqual([]);
    expect(await testDb().attachment.count()).toBe(0);
  });

  it('rejects files over 20 MB with 413 and stores nothing', async () => {
    const event = await createEvent(s);
    const big = Buffer.concat([PDF, Buffer.alloc(MAX_ATTACHMENT_BYTES)]);
    const res = await upload(event.id, 'big.pdf', big, 'application/pdf');
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('FILE_TOO_LARGE');
    expect(await readdir(uploadDir)).toEqual([]);
    expect(await testDb().attachment.count()).toBe(0);
  });

  it('accepts exactly 20 MB', async () => {
    const event = await createEvent(s);
    const max = Buffer.concat([PDF, Buffer.alloc(MAX_ATTACHMENT_BYTES - PDF.length)]);
    const res = await upload(event.id, 'max.pdf', max, 'application/pdf');
    expect(res.statusCode).toBe(201);
    expect(res.json().sizeBytes).toBe(MAX_ATTACHMENT_BYTES);
  });

  it('400 without a file part or without multipart', async () => {
    const event = await createEvent(s);
    const wrongField = await upload(event.id, 'contract.pdf', PDF, 'application/pdf', 'document');
    expect(wrongField.statusCode).toBe(400);
    expect(wrongField.json().error.fields).toEqual({ file: 'REQUIRED' });
    const json = await call(s, 'POST', `/api/events/${event.id}/attachments`, {});
    expect(json.statusCode).toBe(400);
    expect(json.json().error.fields).toEqual({ file: 'REQUIRED' });
  });

  it('404 unknown event; 409 deleted event; 401 without a session', async () => {
    expect((await upload(UNKNOWN_ID, 'contract.pdf', PDF)).statusCode).toBe(404);
    const event = await createEvent(s);
    expect((await upload(event.id, 'contract.pdf', PDF, undefined, undefined, '')).statusCode).toBe(401);
    await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Duplicate' });
    const res = await upload(event.id, 'contract.pdf', PDF);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('EVENT_DELETED');
    expect(await readdir(uploadDir)).toEqual([]);
  });

  it('strips directories from the file name', async () => {
    const event = await createEvent(s);
    const res = await upload(event.id, '../../etc/contract.pdf', PDF);
    expect(res.json().filename).toBe('contract.pdf');
  });
});

describe('GET /api/attachments/{id}/download', () => {
  it('serves the file inline for PDF/images and as attachment for DOCX', async () => {
    const event = await createEvent(s);
    const pdf = (await upload(event.id, 'sopimus ä.pdf', PDF)).json();
    const res = await call(s, 'GET', `/api/attachments/${pdf.id}/download`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(`inline; filename="sopimus _.pdf"; filename*=UTF-8''sopimus%20%C3%A4.pdf`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.rawPayload).toEqual(PDF);

    const docx = (await upload(event.id, 'rider.docx', ZIP)).json();
    const d = await call(s, 'GET', `/api/attachments/${docx.id}/download`);
    expect(d.headers['content-type']).toBe(DOCX_TYPE);
    expect(d.headers['content-disposition']).toMatch(/^attachment; filename="rider.docx"/);
  });

  it('requires a session', async () => {
    const event = await createEvent(s);
    const pdf = (await upload(event.id, 'contract.pdf', PDF)).json();
    const res = await s.app.inject({ method: 'GET', url: `/api/attachments/${pdf.id}/download` });
    expect(res.statusCode).toBe(401);
    expect(res.rawPayload).not.toEqual(PDF);
  });

  it('404 for unknown and removed attachments', async () => {
    expect((await call(s, 'GET', `/api/attachments/${UNKNOWN_ID}/download`)).statusCode).toBe(404);
    const event = await createEvent(s);
    const pdf = (await upload(event.id, 'contract.pdf', PDF)).json();
    await call(s, 'DELETE', `/api/attachments/${pdf.id}`);
    expect((await call(s, 'GET', `/api/attachments/${pdf.id}/download`)).statusCode).toBe(404);
  });
});

describe('DELETE /api/attachments/{id}', () => {
  it('soft-deletes (row and file kept), hides it from the event and logs ATTACHMENT_REMOVED', async () => {
    const event = await createEvent(s);
    const pdf = (await upload(event.id, 'contract.pdf', PDF)).json();
    const res = await call(s, 'DELETE', `/api/attachments/${pdf.id}`);
    expect(res.statusCode).toBe(204);
    expect((await call(s, 'GET', `/api/events/${event.id}`)).json().attachments).toEqual([]);
    const row = await testDb().attachment.findUniqueOrThrow({ where: { id: pdf.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(await readdir(uploadDir)).toHaveLength(1);
    const [entry] = await history(s, event.id);
    expect(entry).toMatchObject({ type: 'ATTACHMENT_REMOVED', details: { attachmentId: pdf.id, filename: 'contract.pdf' } });

    expect((await call(s, 'DELETE', `/api/attachments/${pdf.id}`)).statusCode).toBe(404);
  });

  it('404 unknown; 409 on a deleted event; 401 without a session', async () => {
    expect((await call(s, 'DELETE', `/api/attachments/${UNKNOWN_ID}`)).statusCode).toBe(404);
    const event = await createEvent(s);
    const pdf = (await upload(event.id, 'contract.pdf', PDF)).json();
    expect((await s.app.inject({ method: 'DELETE', url: `/api/attachments/${pdf.id}` })).statusCode).toBe(401);
    await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Duplicate' });
    const res = await call(s, 'DELETE', `/api/attachments/${pdf.id}`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('EVENT_DELETED');
    // Restore brings the attachment back with the event.
    await call(s, 'POST', `/api/events/${event.id}/restore`);
    expect((await call(s, 'GET', `/api/events/${event.id}`)).json().attachments).toEqual([pdf]);
  });
});

describe('helpers', () => {
  it('detectContentType uses the file content, not the declared type', () => {
    expect(detectContentType(PDF, 'x.bin')).toBe('application/pdf');
    expect(detectContentType(ZIP, 'x.zip')).toBeNull();
    expect(detectContentType(ZIP, 'x.DOCX')).toBe(DOCX_TYPE);
    expect(detectContentType(Buffer.from('GIF89a'), 'x.gif')).toBeNull();
  });

  it('cleanFilename removes paths and control characters', () => {
    expect(cleanFilename('C:\\Users\\x\\contract.pdf')).toBe('contract.pdf');
    expect(cleanFilename('a\u0000b.pdf')).toBe('ab.pdf');
    expect(cleanFilename('')).toBe('file');
    expect(cleanFilename('x'.repeat(300))).toHaveLength(255);
  });
});
