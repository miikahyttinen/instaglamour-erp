import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EVENT_DISPLAY_STATUSES } from '../../api/enums';
import { EventDeletedTag, EventStatusTag } from './EventStatusTag';
import { EVENT_STATUS_TONE } from './eventStatusTone';

describe('EventStatusTag', () => {
  it.each([
    ['SOLD', 'Tuleva', 'tag-info'],
    ['PLAYED', 'Soitettu', 'tag-ok'],
    ['CANCELLED', 'Peruttu', 'tag-danger'],
  ] as const)('%s is a %s status tag (%s)', (status, label, toneClass) => {
    render(<EventStatusTag status={status} />);
    expect(screen.getByText(label)).toHaveClass('tag', toneClass);
  });

  it('has a tone for every display status', () => {
    for (const status of EVENT_DISPLAY_STATUSES) expect(EVENT_STATUS_TONE[status]).toBeDefined();
  });

  it('shows Deleted as a danger tag', () => {
    render(<EventDeletedTag />);
    expect(screen.getByText('Poistetut')).toHaveClass('tag', 'tag-danger');
  });
});
