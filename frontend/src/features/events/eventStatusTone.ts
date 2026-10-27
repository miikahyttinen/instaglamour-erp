import type { GigDisplayStatus } from '../../api/enums';
import type { StatusTone } from '../../components/StatusTag';

/** Status tag tones (docs/design.md): Sold/Played = info, Cancelled = danger. */
export const GIG_STATUS_TONE: Record<GigDisplayStatus, StatusTone> = {
  SOLD: 'info',
  PLAYED: 'info',
  CANCELLED: 'danger',
};

/** Tone of the "Deleted" tag on a deleted gig. */
export const GIG_DELETED_TONE: StatusTone = 'danger';
