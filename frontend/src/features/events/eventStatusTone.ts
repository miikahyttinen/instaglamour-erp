import type { EventDisplayStatus } from '../../api/enums';
import type { StatusTone } from '../../components/StatusTag';

/** Status tag tones (docs/design.md): Sold/Played = info, Cancelled = danger. */
export const EVENT_STATUS_TONE: Record<EventDisplayStatus, StatusTone> = {
  SOLD: 'info',
  PLAYED: 'info',
  CANCELLED: 'danger',
};

/** Tone of the "Deleted" tag on a deleted event. */
export const EVENT_DELETED_TONE: StatusTone = 'danger';
