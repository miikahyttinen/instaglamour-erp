import { useTranslation } from 'react-i18next';
import type { TechnicalSetup } from '../../api/enums';
import { TECHNICAL_SETUPS } from '../../api/enums';
import type { Partner } from '../../api/types';
import { technicalSetupLabel } from '../../i18n/labels';

interface TechnicalSetupPickerProps {
  value: TechnicalSetup[];
  onChange: (value: TechnicalSetup[]) => void;
  options?: readonly TechnicalSetup[];
  legend: string;
  error?: string;
}

/** Multi-select as a group of checkboxes (easy on phones). */
export function TechnicalSetupPicker({
  value,
  onChange,
  options = TECHNICAL_SETUPS,
  legend,
  error,
}: TechnicalSetupPickerProps) {
  const { t } = useTranslation();
  return (
    <fieldset className="field check-group">
      <legend>{legend}</legend>
      <div className="check-grid">
        {options.map((code) => (
          <label key={code} className="check">
            <input
              type="checkbox"
              checked={value.includes(code)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? options.filter((c) => c === code || value.includes(c))
                    : value.filter((c) => c !== code),
                )
              }
            />
            {technicalSetupLabel(t, code)}
          </label>
        ))}
      </div>
      {error && <p className="field-error">{error}</p>}
    </fieldset>
  );
}

interface PartnerOptionsProps {
  partners: Partner[] | undefined;
}

export function PartnerOptions({ partners }: PartnerOptionsProps) {
  return (
    <>
      {partners?.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </>
  );
}
