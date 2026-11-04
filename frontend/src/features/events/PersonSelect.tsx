import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { peopleApi } from '../../api/endpoints';
import { Button } from '../../components/Button';
import { InlineFieldFrame, useInlineSave } from '../../components/inline';
import type { Id, Person } from '../../api/types';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { peopleKeys } from '../people/queries';
import { selectablePeople } from './personOptions';
import { peopleKey } from './queries';

const NEW = '__new__';

function PersonOptions({
  people,
  value,
  partnersOnly,
}: {
  people: Person[] | undefined;
  value: Id | null;
  partnersOnly: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <option value="">{t('costs.noPerson')}</option>
      {selectablePeople(people, value, partnersOnly).map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
      {/* A new person is never a partner, so partner-only lines don't offer it. */}
      {!partnersOnly && <option value={NEW}>{t('costs.newPerson')}</option>}
    </>
  );
}

/** "New person…": name input that creates the person (UC-005 A8) and hands back their id. */
function NewPersonForm({ onCreated, onCancel }: { onCreated: (id: Id) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => peopleApi.create({ name: name.trim() }),
    onSuccess: ({ person }) => {
      queryClient.setQueryData<Person[]>(peopleKey, (prev) =>
        [...(prev ?? []), person].sort((a, b) => a.name.localeCompare(b.name)),
      );
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      onCreated(person.id);
    },
  });
  const nameError = create.isError ? apiFieldErrors(t, create.error).name : undefined;
  return (
    <div className="person-create">
      <input
        type="text"
        aria-label={t('costs.newPersonName')}
        placeholder={t('costs.newPersonName')}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }
        }}
      />
      <div className="inline-actions">
        <Button size="sm" variant="primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
          {t('costs.createPerson')}
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
  id?: string;
  label: string;
  value: Id | null;
  people: Person[] | undefined;
  onChange: (personId: Id | null) => void;
  disabled?: boolean;
  /** SALES / PRODUCTION line: list only people linked to an active partner. */
  partnersOnly?: boolean;
}

/**
 * Person picker for forms (new cost line): active people, plus the current person even if
 * inactive. "New person…" adds a person inline by name (UC-005 A8) and selects them.
 */
export function PersonSelect({ id, label, value, people, onChange, disabled, partnersOnly = false }: Props) {
  const [creating, setCreating] = useState(false);

  if (creating) {
    return (
      <NewPersonForm
        onCreated={(personId) => {
          setCreating(false);
          onChange(personId);
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  return (
    <select
      id={id}
      aria-label={id ? undefined : label}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === NEW) setCreating(true);
        else onChange(e.target.value || null);
      }}
    >
      <PersonOptions people={people} value={value} partnersOnly={partnersOnly} />
    </select>
  );
}

interface InlineProps {
  /** Accessible name (visually hidden: the column header / card label shows it). */
  label: string;
  /** Saved person of the line. */
  value: Id | null;
  people: Person[] | undefined;
  /** Saves the person (PATCH personId); reject = error state on the field. */
  onSave: (personId: Id | null) => Promise<unknown>;
  disabled?: boolean;
  /** SALES / PRODUCTION line: list only people linked to an active partner. */
  partnersOnly?: boolean;
}

/**
 * Inline person picker for an existing cost line (NFR-8): saves on change. Built on
 * `useInlineSave` + `InlineFieldFrame` because `InlineSelect` has no "action" option for
 * "New person…": that one opens the name input and the created person is then saved.
 */
export function InlinePersonSelect({ label, value, people, onSave, disabled, partnersOnly = false }: InlineProps) {
  const [creating, setCreating] = useState(false);
  const state = useInlineSave<Id | null>({ value, save: onSave, field: 'personId', disabled });

  return (
    <>
      <InlineFieldFrame label={label} hideLabel status={state.status} error={state.error} disabled={disabled}>
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
            <PersonOptions people={people} value={state.draft} partnersOnly={partnersOnly} />
          </select>
        )}
      </InlineFieldFrame>
      {creating && (
        <NewPersonForm
          onCreated={(personId) => {
            setCreating(false);
            void state.commit(personId);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </>
  );
}
