import { useTranslation } from 'react-i18next';
import type { Person } from '../../api/types';
import { InlineSwitch, InlineText } from '../../components/inline';
import { warningMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import type { Notice } from './Notices';
import { useUpdatePerson } from './queries';

interface FieldProps {
  person: Person;
  /** Accessible name (unique per row in tables). */
  label: string;
  hideLabel?: boolean;
  className?: string;
  onNotice: (notice: Notice) => void;
}

/**
 * Person name, edited in place (NFR-8): blur or Enter saves one PATCH `{ name }`.
 * Empty → REQUIRED (UC-014 E1); a duplicate name saves and shows the DUPLICATE_NAME warning.
 */
export function PersonNameField({ person, label, hideLabel, className, onNotice }: FieldProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const update = useUpdatePerson();
  return (
    <InlineText
      label={label}
      hideLabel={hideLabel}
      className={className}
      required
      maxLength={500}
      field="name"
      value={person.name}
      onSave={async (name) => {
        const result = await update.mutateAsync({ id: person.id, body: { name } });
        if (result.warnings.length > 0) {
          onNotice({
            text: t('people.renamed', { name: result.person.name }),
            warnings: result.warnings.map((w) => warningMessage(t, w, lang)),
          });
        }
      }}
    />
  );
}

/** Active switch: saves `{ active }` on change and tells which person was (de)activated. */
export function PersonActiveSwitch({ person, label, hideLabel, className, onNotice }: FieldProps) {
  const { t } = useTranslation();
  const update = useUpdatePerson();
  return (
    <InlineSwitch
      label={label}
      hideLabel={hideLabel}
      className={className}
      field="active"
      value={person.active}
      onSave={async (active) => {
        const result = await update.mutateAsync({ id: person.id, body: { active } });
        onNotice({
          text: t(active ? 'people.activated' : 'people.deactivated', { name: result.person.name }),
          warnings: [],
        });
      }}
    />
  );
}
