import { useTranslation } from 'react-i18next';
import { yearOptions } from '../lib/years';

interface Props {
  year: number;
  onChange: (year: number) => void;
  disabled?: boolean;
}

/** ‹ 2026 › — prev / next buttons and a native picker (good on phones). */
export function YearSelector({ year, onChange, disabled }: Props) {
  const { t } = useTranslation();
  return (
    <div className="year-selector" role="group" aria-label={t('header.selectedYear')}>
      <button
        type="button"
        className="icon-btn"
        aria-label={t('header.previousYear')}
        onClick={() => onChange(year - 1)}
        disabled={disabled}
      >
        ‹
      </button>
      <select
        className="year-select"
        aria-label={t('header.selectedYear')}
        value={year}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
      >
        {yearOptions(year).map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="icon-btn"
        aria-label={t('header.nextYear')}
        onClick={() => onChange(year + 1)}
        disabled={disabled}
      >
        ›
      </button>
    </div>
  );
}
