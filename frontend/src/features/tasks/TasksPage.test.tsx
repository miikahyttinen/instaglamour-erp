import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n';
import { errorResponse } from '../../mocks/util';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { renderApp, signInMock } from '../../test/renderApp';

const items = () => screen.getAllByTestId('task-item');
const titleInput = (li: HTMLElement) => within(li).getByLabelText<HTMLInputElement>('Otsikko');
const titles = () => items().map((li) => titleInput(li).value);
const itemFor = (title: string) => items().find((li) => titleInput(li).value === title)!;
const stored = (title: string) => db.tasks.tasks.find((t) => t.title === title)!;

/** Records PATCH /api/tasks/:id bodies sent during a test. */
function recordPatches() {
  const bodies: unknown[] = [];
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'PATCH' && new URL(request.url).pathname.startsWith('/api/tasks/')) {
      bodies.push(await request.clone().json());
    }
  });
  return bodies;
}

afterEach(() => server.events.removeAllListeners());

async function openPage() {
  signInMock();
  const utils = renderApp('/tasks');
  await screen.findByRole('heading', { name: 'Tehtävät' });
  await screen.findByDisplayValue('Task 1');
  return utils;
}

describe('tasks page', () => {
  it('shows open tasks by default, overdue first and highlighted', async () => {
    await openPage();
    expect(titles()).toEqual(['Task 1', 'Task 2', 'Task 3']);
    const overdue = itemFor('Task 1');
    expect(overdue).toHaveClass('task-overdue');
    expect(within(overdue).getByText('Myöhässä')).toBeInTheDocument();
    expect(within(overdue).getByLabelText('Vastuuhenkilö')).toHaveDisplayValue('Partner A');
    expect(within(overdue).getByLabelText('Kuvaus')).toHaveValue('Description 1');
    expect(itemFor('Task 2')).not.toHaveClass('task-overdue');
    expect(within(itemFor('Task 2')).getByLabelText('Vastuuhenkilö')).toHaveDisplayValue(
      'Partner B',
    );
    expect(within(itemFor('Task 3')).getByLabelText('Eräpäivä')).toHaveValue('');
    expect(titles()).not.toContain('Task 4');
  });

  it('keeps the column header row decorative: each field is still named by its own label', async () => {
    await openPage();
    const head = document.querySelector('.tasks-head')!;
    expect(head).toHaveAttribute('aria-hidden', 'true');
    expect(head).toHaveTextContent('OtsikkoVastuuhenkilöEräpäivä');
    // Exactly one control per name per row: the header adds no labels.
    for (const li of items()) {
      for (const name of ['Otsikko', 'Vastuuhenkilö', 'Eräpäivä']) {
        expect(within(li).getAllByLabelText(name, { exact: true })).toHaveLength(1);
      }
    }
    expect(screen.getAllByLabelText('Vastuuhenkilö', { exact: true })).toHaveLength(items().length);
  });

  it('has no Edit buttons or edit dialog for existing tasks', async () => {
    await openPage();
    expect(screen.queryByRole('button', { name: /Muokkaa/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tallenna' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('filters: my tasks, done, all', async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole('checkbox', { name: 'Vain omat tehtävät' }));
    await waitFor(() => expect(titles()).toEqual(['Task 1', 'Task 3']));
    await user.click(screen.getByRole('checkbox', { name: 'Vain omat tehtävät' }));

    await user.click(screen.getByRole('button', { name: 'Tehdyt' }));
    await waitFor(() => expect(titles()).toEqual(['Task 4']));
    expect(screen.getByRole('button', { name: 'Tehdyt' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Kaikki' }));
    await waitFor(() => expect(titles()).toHaveLength(4));
  });

  it('marks a task done with one tap and reopens it', async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole('button', { name: 'Merkitse tehdyksi: Task 2' }));
    await waitFor(() => expect(titles()).not.toContain('Task 2'));
    const task = stored('Task 2');
    expect(task.status).toBe('DONE');
    expect(task.completedAt).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Tehdyt' }));
    await user.click(await screen.findByRole('button', { name: 'Avaa uudelleen: Task 2' }));
    await waitFor(() => expect(titles()).not.toContain('Task 2'));
    expect(task.status).toBe('OPEN');
    expect(task.completedAt).toBeNull();
  });

  it('adds a task with owner defaulting to me', async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole('button', { name: 'Lisää tehtävä' }));
    const dialog = screen.getByRole('dialog', { name: 'Uusi tehtävä' });
    expect(within(dialog).getByLabelText('Vastuuhenkilö')).toHaveValue(
      '00000000-0000-4000-8000-00000000000a',
    );

    // Missing title → translated error, nothing sent.
    await user.click(within(dialog).getByRole('button', { name: 'Tallenna' }));
    expect(within(dialog).getByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(db.tasks.tasks).toHaveLength(4);

    await user.type(within(dialog).getByLabelText('Otsikko'), 'Task 5');
    await user.type(within(dialog).getByLabelText('Eräpäivä'), '2099-01-01');
    await user.type(within(dialog).getByLabelText('Kuvaus'), 'Description 5');
    await user.click(within(dialog).getByRole('button', { name: 'Tallenna' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(titles()).toContain('Task 5'));
    const created = db.tasks.tasks.find((t) => t.title === 'Task 5')!;
    expect(created).toMatchObject({
      ownerId: '00000000-0000-4000-8000-00000000000a',
      dueDate: '2099-01-01',
      description: 'Description 5',
      status: 'OPEN',
    });
  });

  it('edits the title in place: Enter saves one PATCH, unchanged blur sends nothing', async () => {
    const patches = recordPatches();
    const { user } = await openPage();
    const title = titleInput(itemFor('Task 3'));
    await user.click(title);
    await user.tab();
    expect(patches).toHaveLength(0);

    await user.clear(title);
    await user.type(title, '  Task 3b {Enter}');
    await waitFor(() => expect(stored('Task 3b')).toBeDefined());
    expect(patches).toEqual([{ title: 'Task 3b' }]);
    await user.tab();
    expect(patches).toHaveLength(1);
    await waitFor(() => expect(titles()).toContain('Task 3b'));
  });

  it('Esc restores the saved title; an empty title is not sent', async () => {
    const patches = recordPatches();
    const { user } = await openPage();
    const title = titleInput(itemFor('Task 2'));
    await user.clear(title);
    await user.type(title, 'Something else{Escape}');
    expect(title).toHaveValue('Task 2');

    await user.clear(title);
    await user.tab();
    expect(await screen.findByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(patches).toHaveLength(0);
    expect(stored('Task 2')).toBeDefined();
  });

  it('changing the owner saves immediately', async () => {
    const patches = recordPatches();
    const { user } = await openPage();
    await user.selectOptions(within(itemFor('Task 3')).getByLabelText('Vastuuhenkilö'), 'Partner C');
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ ownerId: '00000000-0000-4000-8000-00000000000c' });
    expect(stored('Task 3').ownerId).toBe('00000000-0000-4000-8000-00000000000c');
    expect(within(itemFor('Task 3')).getByLabelText('Vastuuhenkilö')).toHaveDisplayValue(
      'Partner C',
    );
  });

  it('due date and description save on blur; clearing them sends null', async () => {
    const patches = recordPatches();
    const { user } = await openPage();
    const row = itemFor('Task 3');
    const due = within(row).getByLabelText('Eräpäivä');
    await user.type(due, '2099-01-01');
    await user.tab();
    await waitFor(() => expect(stored('Task 3').dueDate).toBe('2099-01-01'));

    const desc = within(itemFor('Task 3')).getByLabelText('Kuvaus');
    await user.type(desc, 'Line 1{Enter}Line 2');
    expect(patches).toHaveLength(1);
    await user.tab();
    await waitFor(() => expect(stored('Task 3').description).toBe('Line 1\nLine 2'));

    await user.clear(within(itemFor('Task 1')).getByLabelText('Kuvaus'));
    await user.tab();
    await waitFor(() => expect(stored('Task 1').description).toBeNull());
    expect(patches).toEqual([
      { dueDate: '2099-01-01' },
      { description: 'Line 1\nLine 2' },
      { description: null },
    ]);
  });

  it('an inline save error shows the translated field code and keeps the typed value', async () => {
    server.use(
      http.patch('/api/tasks/:id', () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Server English text', { title: 'TOO_LONG' }),
      ),
    );
    const { user } = await openPage();
    const title = titleInput(itemFor('Task 2'));
    await user.type(title, ' x');
    await user.tab();
    expect(await screen.findByText('Teksti on liian pitkä.')).toBeInTheDocument();
    expect(title).toHaveValue('Task 2 x');
    expect(screen.queryByText('Server English text')).not.toBeInTheDocument();
    expect(stored('Task 2')).toBeDefined();
  });

  it('deletes a task only after confirmation', async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole('button', { name: 'Poista: Task 2' }));
    const dialog = screen.getByRole('dialog', { name: 'Poista tehtävä' });
    expect(within(dialog).getByText('Poistetaanko tehtävä ”Task 2”?')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Peruuta' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(db.tasks.tasks).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Poista: Task 2' }));
    await user.click(screen.getByRole('button', { name: 'Kyllä, poista' }));
    await waitFor(() => expect(titles()).not.toContain('Task 2'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(db.tasks.tasks.some((t) => t.title === 'Task 2')).toBe(false);
  });

  it('shows translated field errors from the server, never its message', async () => {
    server.use(
      http.post('/api/tasks', () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Server English text', { title: 'TOO_LONG' }),
      ),
    );
    const { user } = await openPage();
    await user.click(screen.getByRole('button', { name: 'Lisää tehtävä' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Otsikko'), 'Task 6');
    await user.click(within(dialog).getByRole('button', { name: 'Tallenna' }));
    expect(await within(dialog).findByText('Teksti on liian pitkä.')).toBeInTheDocument();
    expect(screen.queryByText('Server English text')).not.toBeInTheDocument();
  });

  it('works in English', async () => {
    signInMock('partner.b@example.com');
    setLanguage('en');
    renderApp('/tasks');
    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
    expect(await screen.findByText('Overdue')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Owner')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Mark done: Task 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument();
  });
});
