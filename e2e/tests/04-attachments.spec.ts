import { api, expect, expectNoHorizontalScroll, signIn, tagOf, test } from './helpers';
import { createEventViaApi, suffix } from './events';

/** A tiny, valid, synthetic one-page PDF. */
function syntheticPdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

// Flow 4: upload a small synthetic PDF, download it, remove it (UC-008).
test('upload, download and remove a PDF attachment', async ({ page }, testInfo) => {
  await signIn(page);
  const tag = tagOf(testInfo);
  const venue = `Venue ${tag}-${suffix()}`;
  const event = await createEventViaApi(page, { startDate: tag === 'M' ? '2026-11-14' : '2026-11-21', venue });
  const pdf = syntheticPdf();
  const filename = `synthetic-contract-${tag}.pdf`;

  await page.goto(`/events/${event.id}`);
  await expect(page.getByText('Ei liitteitä.')).toBeVisible();

  await page.getByLabel('Lisää tiedosto', { exact: true }).setInputFiles({
    name: filename,
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  await expect(page.getByRole('status').filter({ hasText: `Liite ${filename} lisätty.` })).toBeVisible();
  const list = page.getByRole('list', { name: 'Liitteet' });
  const link = list.getByRole('link', { name: filename });
  await expect(link).toBeVisible();
  await expect(list).toContainText('Partner A');
  await expectNoHorizontalScroll(page, 'event with attachment');

  // Download through the same URL the link uses (same-origin, session cookie).
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/api\/attachments\/[0-9a-f-]+\/download$/);
  const res = await page.request.get(href ?? '');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/pdf');
  expect(res.headers()['content-disposition']).toMatch(/^inline/);
  expect(Buffer.compare(await res.body(), pdf)).toBe(0);

  // Opening the link in the browser shows the file in a new tab.
  // (Headless Chromium has no PDF viewer, so check the response the new tab received.)
  const [popup, response] = await Promise.all([
    page.context().waitForEvent('page'),
    page.context().waitForEvent('response', (r) => r.url().endsWith(href ?? '')),
    link.click(),
  ]);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  await popup.close();

  // Remove.
  await list.getByRole('button', { name: `Poista: ${filename}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Poista liite' });
  await expect(dialog).toContainText(filename);
  await dialog.getByRole('button', { name: 'Poista', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Ei liitteitä.')).toBeVisible();

  const after = await api(page).get(`/events/${event.id}`);
  expect(after.attachments).toHaveLength(0);
  const history = await api(page).get(`/events/${event.id}/history`);
  expect(history.slice(0, 2).map((e: { type: string }) => e.type)).toEqual(['ATTACHMENT_REMOVED', 'ATTACHMENT_ADDED']);
  // A removed attachment is no longer downloadable.
  expect((await page.request.get(href ?? '')).status()).toBe(404);
});

// The server detects the type from the content (UC-008): a text file named .pdf passes the
// browser's check, the backend answers 415 and the UI shows the translated message.
test('a fake PDF is refused by the server with a translated message', async ({ page }, testInfo) => {
  await signIn(page);
  const venue = `Venue ${tagOf(testInfo)}-${suffix()}`;
  const event = await createEventViaApi(page, { startDate: '2026-11-28', venue });
  await page.goto(`/events/${event.id}`);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`/api/events/${event.id}/attachments`)),
    page.getByLabel('Lisää tiedosto', { exact: true }).setInputFiles({
      name: 'not-really.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('plain synthetic text, not a PDF'),
    }),
  ]);
  expect(response.status()).toBe(415);
  expect((await response.json()).error.code).toBe('UNSUPPORTED_FILE_TYPE');
  await expect(page.getByRole('alert')).toHaveText('Sallitut tiedostotyypit: PDF, DOCX, PNG ja JPG.');
  await expect(page.getByText('Ei liitteitä.')).toBeVisible();
});
