// src/lib/apps/golden_thread/utils/gtSafetyCaseNotification.test.js
import { describe, it, expect } from 'vitest';
import { pendingNotifications, daysPending } from './gtSafetyCaseNotification.js';

describe('pendingNotifications', () => {
  it('keeps only unnotified rows, oldest first', () => {
    const rows = [
      { id: 'c', created_at: '2026-09-05T00:00:00Z', notified_at: null },
      { id: 'a', created_at: '2026-09-01T00:00:00Z', notified_at: null },
      { id: 'b', created_at: '2026-09-03T00:00:00Z', notified_at: '2026-09-04T00:00:00Z' },
    ];
    expect(pendingNotifications(rows).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('is empty when everything has been notified', () => {
    const rows = [{ id: 'a', created_at: '2026-09-01T00:00:00Z', notified_at: '2026-09-02T00:00:00Z' }];
    expect(pendingNotifications(rows)).toEqual([]);
  });
});

describe('daysPending', () => {
  it('counts whole days since the notification was logged', () => {
    const n = { created_at: '2026-09-01T00:00:00Z' };
    expect(daysPending(n, '2026-09-10')).toBe(9);
  });

  it('is zero the same day', () => {
    const n = { created_at: '2026-09-10T08:00:00Z' };
    expect(daysPending(n, '2026-09-10')).toBe(0);
  });
});
