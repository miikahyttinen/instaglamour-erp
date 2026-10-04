import { Pencil, UserCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Person, PersonWithWarnings } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { apiErrorMessage, warningMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { NameForm } from './NameForm';
import type { Notice } from './Notices';
import { useUpdatePerson } from './queries';

interface Props {
  person: Person;
  onNotice: (notice: Notice) => void;
}

/** Rename (dialog) and activate / deactivate buttons for one person. */
export function PersonControls({ person, onNotice }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const [renaming, setRenaming] = useState(false);
  const rename = useUpdatePerson();
  const toggle = useUpdatePerson();

  const warningsOf = (result: PersonWithWarnings) =>
    result.warnings.map((w) => warningMessage(t, w, lang));

  const closeRename = () => {
    setRenaming(false);
    rename.reset();
  };

  const saveName = async (name: string) => {
    const result = await rename.mutateAsync({ id: person.id, body: { name } });
    setRenaming(false);
    onNotice({ text: t('people.saved'), warnings: warningsOf(result) });
  };

  const setActive = () => {
    const active = !person.active;
    toggle.mutate(
      { id: person.id, body: { active } },
      {
        onSuccess: (result) =>
          onNotice({
            text: t(active ? 'people.activated' : 'people.deactivated', { name: result.person.name }),
            warnings: [],
          }),
        onError: (error) => onNotice({ text: apiErrorMessage(t, error), warnings: [], error: true }),
      },
    );
  };

  return (
    <div className="people-controls">
      <Button
        size="sm"
        icon={Pencil}
        aria-label={`${t('people.rename')}: ${person.name}`}
        onClick={() => setRenaming(true)}
      >
        {t('people.rename')}
      </Button>
      <Button
        size="sm"
        icon={person.active ? UserX : UserCheck}
        aria-label={`${t(person.active ? 'people.deactivate' : 'people.activate')}: ${person.name}`}
        disabled={toggle.isPending}
        onClick={setActive}
      >
        {t(person.active ? 'people.deactivate' : 'people.activate')}
      </Button>
      {renaming && (
        <Dialog title={t('people.renameTitle', { name: person.name })} onClose={closeRename}>
          <NameForm
            label={t('people.newName')}
            submitLabel={t('common.save')}
            initialName={person.name}
            pending={rename.isPending}
            error={rename.error}
            onSubmit={saveName}
            onCancel={closeRename}
          />
        </Dialog>
      )}
    </div>
  );
}
