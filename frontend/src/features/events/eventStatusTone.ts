import type { EventDisplayStatus } from '../../api/enums';
import type { StatusTone } from '../../components/StatusTag';

/** Status tag tones (owner decision 2026-10-31): Upcoming = info (blue), Played = ok (green), Cancelled = danger (red). */
export const EVENT_STATUS_TONE: Record<EventDisplayStatus, StatusTone> = {
  SOLD: 'info',
  PLAYED: 'ok',
  CANCELLED: 'danger',
};

/** Tone of the "Deleted" tag on a deleted event. */
export const EVENT_DELETED_TONE: StatusTone = 'danger';
