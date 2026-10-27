import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../mocks/data';
import { errorResponse } from '../../mocks/util';
import { server } from '../../mocks/server';
import { testFile } from '../../test/files';
import { addMockEvent, TEST_YEAR } from '../../test/eventFixtures';
import { renderApp, signInMock } from '../../test/renderApp';
import { attachmentProblem } from './attachmentRules';

const historyItems = () =>
  within(screen.getByRole('list', { name: 'Muutoshistoria' })).getAllByRole('listitem');

describe('attachments (UC-008)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('accepts PDF, DOCX, PNG and JPG up to 20 MB', () => {
    expect(attachmentProblem(testFile('a.pdf', 'application/pdf'))).toBeNull();
    expect(
      attachmentProblem(
        testFile('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      ),
    ).toBeNull();
    expect(attachmentProblem(testFile('a.png', 'image/png'))).toBeNull();
    expect(attachmentProblem(testFile('a.jpg', 'image/jpeg'))).toBeNull();
    expect(attachmentProblem(testFile('a.txt', 'text/plain'))).toBe('UNSUPPORTED_FILE_TYPE');
    expect(attachmentProblem(testFile('a.pdf', 'application/pdf', 20 * 1024 * 1024 + 1))).toBe(
      'FILE_TOO_LARGE',
    );
  });

  it('uploads a file, lists it with uploader and logs it; removal asks first', async () => {
    const event = addMockEvent();
    const { user } = renderApp(`/events/${event.id}`);
    expect(await screen.findByText('Ei liitteitä.')).toBeInTheDocument();
    // Phone camera input is offered next to the file picker.
    expect(screen.getByLabelText('Ota kuva', { selector: 'input' })).toHaveAttribute('capture', 'environment');

    await user.upload(
      screen.getByLabelText('Lisää tiedosto', { selector: 'input' }),
      testFile('contract.pdf', 'application/pdf'),
    );
    expect(await screen.findByText('Liite contract.pdf lisätty.')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Liitteet' });
    const link = within(list).getByRole('link', { name: 'contract.pdf' });
    expect(link.getAttribute('href')).toMatch(/^\/api\/attachments\/.+\/download$/);
    expect(within(list).getByRole('listitem')).toHaveTextContent('Partner A');
    await waitFor(() => expect(historyItems()[0]).toHaveTextContent(/Liite lisätty.*contract\.pdf/));

    await user.click(within(list).getByRole('button', { name: 'Poista: contract.pdf' }));
    const dialog = screen.getByRole('dialog', { name: 'Poista liite' });
    expect(dialog).toHaveTextContent('Poistetaanko liite contract.pdf?');
    await user.click(within(dialog).getByRole('button', { name: 'Poista' }));
    expect(await screen.findByText('Ei liitteitä.')).toBeInTheDocument();
    expect(db.events.attachments.find((a) => a.eventId === event.id)?.deletedAt).not.toBeNull();
    await waitFor(() => expect(historyItems()[0]).toHaveTextContent(/Liite poistettu.*contract\.pdf/));
  });

  it('rejects wrong types and too large files before uploading', async () => {
    const event = addMockEvent();
    const { user } = renderApp(`/events/${event.id}`);
    await screen.findByText('Ei liitteitä.');
    const input = screen.getByLabelText('Lisää tiedosto', { selector: 'input' });
    await user.upload(input, testFile('big.pdf', 'application/pdf', 21 * 1024 * 1024));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tiedosto on liian suuri (enintään 20 Mt).');
    expect(db.events.attachments.filter((a) => a.eventId === event.id)).toHaveLength(0);
  });

  it('shows translated server errors (415 / 413)', async () => {
    server.use(
      http.post('/api/events/:id/attachments', () =>
        errorResponse(415, 'UNSUPPORTED_FILE_TYPE', 'English server text'),
      ),
    );
    const event = addMockEvent();
    const { user } = renderApp(`/events/${event.id}`);
    await screen.findByText('Ei liitteitä.');
    await user.upload(
      screen.getByLabelText('Lisää tiedosto', { selector: 'input' }),
      testFile('scan.png', 'image/png'),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sallitut tiedostotyypit: PDF, DOCX, PNG ja JPG.',
    );
    expect(screen.queryByText(/English server text/)).not.toBeInTheDocument();
  });
});
