import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Client, ClientListItem, Id } from '../../api/types';
import { Button } from '../../components/Button';
import { InlineFieldFrame, useInlineSave } from '../../components/inline';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { useClientList, useCreateClient } from './queries';
import './clients.css';

const NEW = '__new__';

/**
 * Options: "–" (no client), the active clients by name, and "New client…". A current client
 * that is no longer in the list (e.g. deleted) is kept so the select shows it.
 */
function ClientOptions({
  clients,
  value,
  currentName,
}: {
  clients: ClientListItem[] | undefined;
  value: Id | null;
  currentName?: string | null;
}) {
  const { t } = useTranslation();
  const list = clients ?? [];
  const missing = value !== null && !list.some((c) => c.id === value);
  return (
    <>
      <option value="">{t('clients.select.none')}</option>
      {missing && <option value={value}>{currentName ?? '–'}</option>}
      {list.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value={NEW}>{t('clients.select.newClient')}</option>
    </>
  );
}

/** "New client…": name input that creates the client (UC-027 A2) and hands it back. */
function NewClientForm({
  onCreated,
  onCancel,
}: {
  onCreated: (client: Client) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const create = useCreateClient();
  const submit = () => {
    if (!name.trim() || create.isPending) return;
    create.mutate({ name: name.trim() }, { onSuccess: onCreated });
  };
  const nameError = create.isError ? apiFieldErrors(t, create.error).name : undefined;
  return (
    <div className="client-create">
      <input
        type="text"
        aria-label={t('clients.select.newClientName')}
        placeholder={t('clients.select.newClientName')}
        value={name}
        maxLength={500}
        autoFocus
        aria-invalid={create.isError ? true : undefined}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="inline-actions">
        <Button size="sm" variant="primary" disabled={!name.trim() || create.isPending} onClick={submit}>
          {t('clients.select.create')}
        </Button>
        <Button size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
      {create.isError && (
        <p className="field-error" role="alert">
          {nameError ?? apiErrorMessage(t, create.error)}
        </p>
      )}
    </div>
  );
}

interface Props {
  /** Id of the select (from `Field`'s props) so the visible label points at it. */
  id?: string;
  value: Id | null;
  onChange: (clientId: Id | null) => void;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Client picker for forms (new event): "–", clients, "New client…" (creates and selects it). */
export function ClientSelect({ value, onChange, ...rest }: Props) {
  const { t } = useTranslation();
  const clients = useClientList();
  const [creating, setCreating] = useState(false);
  // Shown until the refetched list contains the new client.
  const [created, setCreated] = useState<Client | null>(null);
  return (
    <>
      <select
        {...rest}
        aria-label={rest.id ? undefined : t('clients.select.label')}
        value={value ?? ''}
        disabled={rest.disabled || creating}
        onChange={(e) => {
          if (e.target.value === NEW) setCreating(true);
          else onChange(e.target.value || null);
        }}
      >
        <ClientOptions
          clients={clients.data}
          value={value}
          currentName={created?.id === value ? created.name : null}
        />
      </select>
      {creating && (
        <NewClientForm
          onCreated={(client) => {
            setCreating(false);
            setCreated(client);
            onChange(client.id);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </>
  );
}

interface InlineProps {
  label: string;
  /** Saved client of the event. */
  value: Id | null;
  /** Name of the saved client (shown even if the client is no longer listed). */
  currentName: string | null;
  /** Saves `{ clientId }`; reject = error state on the field. */
  onSave: (clientId: Id | null) => Promise<unknown>;
  disabled?: boolean;
}

/**
 * Inline client picker for the event page (NFR-8): saves on change. Built on `useInlineSave` +
 * `InlineFieldFrame` because "New client…" opens a name input; the new client is then saved.
 * Inside a `FieldList` the name input lines up with the control column.
 */
export function InlineClientSelect({ label, value, currentName, onSave, disabled }: InlineProps) {
  const clients = useClientList();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Client | null>(null);
  const state = useInlineSave<Id | null>({ value, save: onSave, field: 'clientId', disabled });

  return (
    <>
      <InlineFieldFrame label={label} status={state.status} error={state.error} disabled={disabled}>
        {(control) => (
          <select
            {...control}
            value={state.draft ?? ''}
            disabled={disabled || creating}
            onChange={(e) => {
              if (e.target.value === NEW) setCreating(true);
              else void state.commit(e.target.value || null);
            }}
            onBlur={() => {
              if (state.status === 'error') void state.commit();
            }}
          >
            <ClientOptions
              clients={clients.data}
              value={state.draft}
              currentName={created?.id === state.draft ? created.name : currentName}
            />
          </select>
        )}
      </InlineFieldFrame>
      {creating && (
        <NewClientForm
          onCreated={(client) => {
            setCreating(false);
            setCreated(client);
            void state.commit(client.id);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </>
  );
}
