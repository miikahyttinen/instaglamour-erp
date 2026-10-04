import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { peopleApi } from '../../api/endpoints';
import { Button } from '../../components/Button';
import type { Id, Person } from '../../api/types';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { peopleKeys } from '../people/queries';
import { peopleKey } from './queries';

const NEW = '__new__';

interface Props {
  id?: string;
  label: string;
  value: Id | null;
  people: Person[] | undefined;
  onChange: (personId: Id | null) => void;
  disabled?: boolean;
}

/**
 * Person picker: active people, plus the current person even if inactive. "New person…" adds a
 * person inline by name (UC-005 A8) and selects them.
 */
export function PersonSelect({ id, label, value, people, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const options = (people ?? []).filter((p) => p.active || p.id === value);

  const create = useMutation({
    mutationFn: () => peopleApi.create({ name: name.trim() }),
    onSuccess: ({ person }) => {
      queryClient.setQueryData<Person[]>(peopleKey, (prev) =>
        [...(prev ?? []), person].sort((a, b) => a.name.localeCompare(b.name)),
      );
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      setCreating(false);
      setName('');
      onChange(person.id);
    },
  });

  if (creating) {
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
          <Button
            size="sm"
            variant="primary"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {t('costs.createPerson')}
          </Button>
          <Button size="sm" onClick={() => setCreating(false)}>
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
      <option value="">{t('costs.noPerson')}</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
      <option value={NEW}>{t('costs.newPerson')}</option>
    </select>
  );
}
