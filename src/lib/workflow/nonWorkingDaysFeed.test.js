import { describe, it, expect, vi } from 'vitest';
vi.mock('#lib/utils/api.js', () => ({ api: {} }));
vi.mock('#lib/utils/currentUser.js', () => ({ requireUserId: async () => 'u' }));
vi.mock('#lib/utils/request.js', () => ({ getJson: async () => ({ events: [] }) }));
import { missingFromFeed } from './nonWorkingDays.js';

describe('missingFromFeed', () => {
  const feed = [
    { date: '2019-01-01', title: 'Old' },
    { date: '2026-12-25', title: 'Christmas Day' },
    { date: '2029-01-01', title: 'New Year’s Day' },
    { date: 'not a date', title: 'Broken' },
    { date: '2029-05-07', title: '' },
  ];
  it('offers only future days the list lacks, in date order, never touching what is there', () => {
    expect(missingFromFeed(feed, [{ day: '2026-12-25' }], '2026-10-26')).toEqual([{ day: '2029-01-01', name: 'New Year’s Day' }]);
  });
  it('is empty when the list is complete, and tolerates nothing at all', () => {
    expect(missingFromFeed(feed.slice(0, 2), [{ day: '2026-12-25' }], '2026-10-26')).toEqual([]);
    expect(missingFromFeed(undefined, undefined, '2026-10-26')).toEqual([]);
  });
});
