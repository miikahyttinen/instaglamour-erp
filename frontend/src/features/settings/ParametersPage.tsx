import { useTranslation } from 'react-i18next';
import type { Parameter } from '../../api/types';
import { Button } from '../../components/Button';
import { FieldList } from '../../components/FieldList';
import { InlineMoney } from '../../components/inline';
import { Notice } from '../../components/Notice';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDateTime } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { parameterTexts, validateMoneyParameter } from './parameters';
import { useParameters, useUpdateParameter } from './queries';

/** Settings → Parameters: one inline field per parameter (registry order from the API). */
export function ParametersPage() {
  const { t } = useTranslation();
  const list = useParameters();

  if (list.isPending) {
    return (
      <p role="status" className="meta">
        {t('app.loading')}
      </p>
    );
  }
  if (list.isError) {
    return (
      <Notice tone="danger" role="alert" className="settings-load-error">
        <p>{apiErrorMessage(t, list.error)}</p>
        <Button size="sm" onClick={() => void list.refetch()}>
          {t('app.retry')}
        </Button>
      </Notice>
    );
  }
  return (
    <div className="parameters-page">
      <p className="settings-intro">{t('settings.parameters.intro')}</p>
      {list.data.length === 0 ? (
        <p className="meta">{t('settings.parameters.empty')}</p>
      ) : (
        <ul className="parameter-list" aria-label={t('settings.parameters.caption')}>
          {list.data.map((parameter) => (
            <ParameterItem key={parameter.key} parameter={parameter} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ParameterItem({ parameter }: { parameter: Parameter }) {
  const { t, i18n } = useTranslation();
  const lang = useLang();
  const { data: reference } = useReference();
  const update = useUpdateParameter();
  const { label, help } = parameterTexts(t, i18n, parameter.key);

  const partner = parameter.updatedBy
    ? (reference?.partners.find((p) => p.id === parameter.updatedBy)?.name ?? '–')
    : null;

  return (
    <li className="parameter-item">
      <FieldList labelWidth="lg">
        {parameter.type === 'MONEY' && (
          <InlineMoney
            label={label}
            hint={help}
            value={parameter.value}
            field="value"
            validate={validateMoneyParameter}
            onSave={(value) => update.mutateAsync({ key: parameter.key, value: value ?? 0 })}
          />
        )}
      </FieldList>
      {parameter.updatedAt && (
        <p className="meta parameter-changed">
          {t('settings.parameters.changed', {
            time: formatDateTime(parameter.updatedAt, lang),
            partner: partner ?? '–',
          })}
        </p>
      )}
    </li>
  );
}
