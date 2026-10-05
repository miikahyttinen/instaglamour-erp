import { useTranslation } from 'react-i18next';
import type { Logistics, TechnicalSetup } from '../../api/enums';
import { LOGISTICS, TECHNICAL_SETUPS } from '../../api/enums';
import type { ReferenceData } from '../../api/types';
import { logisticsLabel, technicalSetupLabel } from '../../i18n/labels';

/** "None" option label of the technical setup / logistics selects. */
export const NONE_LABEL = '–';

/** Technical setup codes as select options (reference order, falls back to the enum). */
export function useTechnicalSetupOptions(reference: ReferenceData | undefined) {
  const { t } = useTranslation();
  return (reference?.technicalSetups ?? TECHNICAL_SETUPS).map((code: TechnicalSetup) => ({
    value: code,
    label: technicalSetupLabel(t, code),
  }));
}

/** Logistics codes as select options (reference order, falls back to the enum). */
export function useLogisticsOptions(reference: ReferenceData | undefined) {
  const { t } = useTranslation();
  return (reference?.logistics ?? LOGISTICS).map((code: Logistics) => ({
    value: code,
    label: logisticsLabel(t, code),
  }));
}
