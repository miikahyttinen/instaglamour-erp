/** Person data derived for the API (docs/api-contract.md "People: roles and gig count", TASK-027). */
import type { Db } from '../db.js';
import { todayIso } from '../domain/dates.js';
import { MUSICIAN_ROLES } from '../domain/enums.js';
import { toPersonDto, type PersonDto, type PersonWithPartner } from '../serializers.js';

/**
 * `gigCount` per person in ONE grouped query: distinct non-deleted SOLD gigs that started before
 * `today` (Helsinki, = played; all years) on which the person has at least one musician-role line.
 * People without such gigs are missing from the map (count 0).
 */
export async function loadGigCounts(db: Db, personIds: readonly string[], today = todayIso()): Promise<Map<string, number>> {
  if (personIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ person_id: string; gig_count: number }[]>`
    SELECT cl."person_id"::text AS "person_id", COUNT(DISTINCT cl."gig_id")::int AS "gig_count"
    FROM "cost_line" AS cl
    JOIN "gig" AS g ON g."id" = cl."gig_id"
    WHERE cl."person_id" = ANY(${[...personIds]}::uuid[])
      AND cl."type"::text = ANY(${[...MUSICIAN_ROLES]}::text[])
      AND g."deleted_at" IS NULL
      AND g."status" = 'SOLD'
      AND g."start_date" < ${today}::date
    GROUP BY cl."person_id"`;
  return new Map(rows.map((r) => [r.person_id, r.gig_count]));
}

/** People → contract `Person` objects (gig counts loaded with one query for the whole list). */
export async function toPersonDtos(db: Db, people: readonly PersonWithPartner[], today?: string): Promise<PersonDto[]> {
  const counts = await loadGigCounts(
    db,
    people.map((p) => p.id),
    today,
  );
  return people.map((p) => toPersonDto(p, counts.get(p.id) ?? 0));
}

export async function toPersonDtoWithCount(db: Db, person: PersonWithPartner, today?: string): Promise<PersonDto> {
  const [dto] = await toPersonDtos(db, [person], today);
  return dto!;
}
