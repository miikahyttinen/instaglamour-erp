import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { peopleApi } from '../../api/endpoints';
import { Button } from '../../components/Button';
import { InlineFieldFrame, useInlineSave } from '../../components/inline';
import { isPartnerOnlyType, type CostType, type MusicianRole } from '../../api/enums';
import type { Id, Person } from '../../api/types';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { peopleKeys } from '../people/queries';
import { roleFilterOf, selectablePeople } from './personOptions';
import { peopleKey } from './queries';

const NEW = '__new__';

function PersonOptions({
  people,
  value,
  type,
}: {
  people: Person[] | undefined;
  value: Id | null;
  type: CostType | '';
}) {
  const { t } = useTranslation();
  const partnersOnly = type !== '' && isPartnerOnlyType(type);
  return (
    <>
      <option value="">{t('costs.noPerson')}</option>
      {selectablePeople(people, value, type).map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
      {/* A new person is never a partner, so partner-only lines don't offer it. */}
      {!partnersOnly && <option value={NEW}>{t('costs.newPerson')}</option>}
    </>
  );
}

/**
 * "New person…": name input that creates the person (UC-005 A8) and hands back their id. On a
 * line with a role filter (TASK-185) the new person gets `roles: [role]` first, so they match the
 * picker; if that PATCH fails the person is still handed back, with the translated error.
 */
function NewPersonForm({
  role,
  onCreated,
  onCancel,
}: {
  role: MusicianRole | null;
  onCreated: (id: Id, roleError: string | null) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: async () => {
      const { person } = await peopleApi.create({ name: name.trim() });
      if (role === null) return { person, roleError: null };
      try {
        const updated = await peopleApi.update(person.id, { roles: [role] });
        return { person: updated.person, roleError: null };
      } catch (error) {
        return { person, roleError: t('costs.newPersonRoleFailed', { error: apiErrorMessage(t, error) }) };
      }
    },
    onSuccess: ({ person, roleError }) => {
      queryClient.setQueryData<Person[]>(peopleKey, (prev) =>
        [...(prev ?? []), person].sort((a, b) => a.name.localeCompare(b.name)),
      );
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      onCreated(person.id, roleError);
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

/** The new person was assigned, but giving them the line's role failed (TASK-185). */
function RoleError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="field-error" role="alert">
      {message}
    </p>
  );
}

interface Props {
  /** Accessible name (visually hidden: the column header / card label shows it). */
  label: string;
  value: Id | null;
  people: Person[] | undefined;
  onChange: (personId: Id | null) => void;
  /** Translated error shown under the field. */
  error?: string;
  /** Line type ('' = not chosen yet): narrows the people offered (see `selectablePeople`). */
  type: CostType | '';
}

/**
 * Person picker for the draft cost row (not saved yet): same look as the inline picker, but it
 * only reports the choice. "New person…" adds a person inline by name (UC-005 A8) and selects them.
 */
export function PersonSelect({ label, value, people, onChange, error, type }: Props) {
  const [creating, setCreating] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  // The name input is removed when it is done: keep the focus in the row (on the picker), so the
  // draft row does not think the user left it.
  const refocus = useRef(false);
  useLayoutEffect(() => {
    if (!creating && refocus.current) {
      refocus.current = false;
      selectRef.current?.focus();
    }
  }, [creating]);
  const stopCreating = () => {
    refocus.current = true;
    setCreating(false);
  };

  return (
    <>
      <InlineFieldFrame label={label} hideLabel status={error ? 'error' : 'idle'} error={error ?? null}>
        {(control) => (
          <select
            {...control}
            ref={selectRef}
            value={value ?? ''}
            disabled={creating}
            onChange={(e) => {
              setRoleError(null);
              if (e.target.value === NEW) setCreating(true);
              else onChange(e.target.value || null);
            }}
          >
            <PersonOptions people={people} value={value} type={type} />
          </select>
        )}
      </InlineFieldFrame>
      {creating && (
        <NewPersonForm
          role={roleFilterOf(type)}
          onCreated={(personId, failed) => {
            stopCreating();
            setRoleError(failed);
            onChange(personId);
          }}
          onCancel={stopCreating}
        />
      )}
      <RoleError message={roleError} />
    </>
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
  /** Line type: narrows the people offered (see `selectablePeople`). */
  type: CostType;
}

/**
 * Inline person picker for an existing cost line (NFR-8): saves on change. Built on
 * `useInlineSave` + `InlineFieldFrame` because `InlineSelect` has no "action" option for
 * "New person…": that one opens the name input and the created person is then saved.
 */
export function InlinePersonSelect({ label, value, people, onSave, disabled, type }: InlineProps) {
  const [creating, setCreating] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
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
              setRoleError(null);
              if (e.target.value === NEW) setCreating(true);
              else void state.commit(e.target.value || null);
            }}
            onBlur={() => {
              if (state.status === 'error') void state.commit();
            }}
          >
            <PersonOptions people={people} value={state.draft} type={type} />
          </select>
        )}
      </InlineFieldFrame>
      {creating && (
        <NewPersonForm
          role={roleFilterOf(type)}
          onCreated={(personId, failed) => {
            setCreating(false);
            setRoleError(failed);
            void state.commit(personId);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
      <RoleError message={roleError} />
    </>
  );
}
