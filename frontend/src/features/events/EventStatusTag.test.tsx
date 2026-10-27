import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GIG_DISPLAY_STATUSES } from '../../api/enums';
import { GigDeletedTag, GigStatusTag } from './GigStatusTag';
import { GIG_STATUS_TONE } from './gigStatusTone';

describe('GigStatusTag', () => {
  it.each([
    ['SOLD', 'Myyty', 'tag-info'],
    ['PLAYED', 'Soitettu', 'tag-info'],
    ['CANCELLED', 'Peruttu', 'tag-danger'],
  ] as const)('%s is a %s status tag (%s)', (status, label, toneClass) => {
    render(<GigStatusTag status={status} />);
    expect(screen.getByText(label)).toHaveClass('tag', toneClass);
  });

  it('has a tone for every display status', () => {
    for (const status of GIG_DISPLAY_STATUSES) expect(GIG_STATUS_TONE[status]).toBeDefined();
  });

  it('shows Deleted as a danger tag', () => {
    render(<GigDeletedTag />);
    expect(screen.getByText('Poistetut')).toHaveClass('tag', 'tag-danger');
  });
});
