import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n';
import { errorResponse } from '../../mocks/util';
import { resetTasksMock, tasksDb } from '../../mocks/tasksHandlers';
import { server } from '../../mocks/server';
import { renderApp, signInMock } from '../../test/renderApp';

const items = () => screen.getAllByTestId('task-item');
const titles = () => items().map((li) => li.querySelector('.task-title')?.textContent);
const itemFor = (title: string) => items().find((li) => li.textContent?.includes(title))!;

async function openPage() {
  signInMock();
  const utils = renderApp('/tasks');
  await screen.findByRole('heading', { name: 'Tehtävät' });
  await screen.findByText('Task 1');
  return utils;
}

beforeEach(() => resetTasksMock());

describe('tasks page', () => {
  it('shows open tasks by default, overdue first and highlighted', async () => {
    await openPage();
    expect(titles()).toEqual(['Task 1', 'Task 2', 'Task 3']);
    const overdue = itemFor('Task 1');
    expect(overdue).toHaveClass('task-overdue');
    expect(within(overdue).getByText('Myöhässä')).toBeInTheDocument();
    expect(within(overdue).getByText('Partner A')).toBeInTheDocument();
    expect(itemFor('Task 2')).not.toHaveClass('task-overdue');
    expect(within(itemFor('Task 2')).getByText('Partner B')).toBeInTheDocument();
    expect(within(itemFor('Task 3')).getByText('Ei eräpäivää')).toBeInTheDocument();
    expect(screen.queryByText('Task 4')).not.toBeInTheDocument();
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
    await waitFor(() => expect(screen.queryByText('Task 2')).not.toBeInTheDocument());
    const stored = tasksDb.tasks.find((t) => t.title === 'Task 2')!;
    expect(stored.status).toBe('DONE');
    expect(stored.completedAt).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Tehdyt' }));
    await user.click(await screen.findByRole('button', { name: 'Avaa uudelleen: Task 2' }));
    await waitFor(() => expect(screen.queryByText('Task 2')).not.toBeInTheDocument());
    expect(stored.status).toBe('OPEN');
    expect(stored.completedAt).toBeNull();
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
    expect(tasksDb.tasks).toHaveLength(4);

    await user.type(within(dialog).getByLabelText('Otsikko'), 'Task 5');
    await user.type(within(dialog).getByLabelText('Eräpäivä'), '2099-01-01');
    await user.type(within(dialog).getByLabelText('Kuvaus'), 'Description 5');
    await user.click(within(dialog).getByRole('button', { name: 'Tallenna' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Task 5')).toBeInTheDocument();
    const created = tasksDb.tasks.find((t) => t.title === 'Task 5')!;
    expect(created).toMatchObject({
      ownerId: '00000000-0000-4000-8000-00000000000a',
      dueDate: '2099-01-01',
      description: 'Description 5',
      status: 'OPEN',
    });
  });

  it('edits a task, including owner', async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole('button', { name: 'Muokkaa: Task 3' }));
    const dialog = screen.getByRole('dialog', { name: 'Muokkaa tehtävää' });
    const title = within(dialog).getByLabelText('Otsikko');
    await user.clear(title);
    await user.type(title, 'Task 3b');
    await user.selectOptions(within(dialog).getByLabelText('Vastuuhenkilö'), 'Partner C');
    await user.click(within(dialog).getByRole('button', { name: 'Tallenna' }));

    expect(await screen.findByText('Task 3b')).toBeInTheDocument();
    expect(within(itemFor('Task 3b')).getByText('Partner C')).toBeInTheDocument();
  });

  it('deletes a task only after confirmation', async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole('button', { name: 'Muokkaa: Task 2' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Poista' }));
    expect(within(dialog).getByText('Poistetaanko tehtävä ”Task 2”?')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Peruuta' }));
    expect(tasksDb.tasks).toHaveLength(4);

    await user.click(within(dialog).getByRole('button', { name: 'Poista' }));
    await user.click(within(dialog).getByRole('button', { name: 'Kyllä, poista' }));
    await waitFor(() => expect(screen.queryByText('Task 2')).not.toBeInTheDocument());
    expect(tasksDb.tasks.some((t) => t.title === 'Task 2')).toBe(false);
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
    expect(screen.getByRole('button', { name: 'Mark done: Task 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument();
  });
});
