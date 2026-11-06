import { PERSON_ROLES, type MusicianRole } from '../api/enums';
import { useReference } from './useReference';

/**
 * Roles a person can have (`reference.costTypes.personRoles`: musician roles without OTHER_ROLE).
 * Falls back to the built-in list while the reference data is loading.
 */
export function usePersonRoles(): readonly MusicianRole[] {
  const { data } = useReference();
  return data?.costTypes.personRoles ?? PERSON_ROLES;
}
