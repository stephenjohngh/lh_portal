// Step deadlines (migration 248): the same arithmetic as the database's
// workflow_due_on(), checked against the dates the dev rehearsal returned.
import { describe, it, expect, vi } from 'vitest';
vi.mock('#lib/utils/api.js', () => ({ api: {} }));
vi.mock('#lib/utils/currentUser.js', () => ({ requireUserId: async () => 'u1' }));
import { addDeadlineDays, describeDeadline, deadlineWords, deadlineBand } from './workflowDeadlines.js';
import { SHIPPED_NON_WORKING_DAYS } from './nonWorkingDays.js';
import { workflowProblem } from './workflowModel.js';

describe('counting a deadline — as workflow_due_on() does', () => {
  it('calendar days are plain days', () => {
    expect(addDeadlineDays('2026-12-24', 2, 'calendar')).toBe('2026-12-26');
  });
  it('working days skip weekends (the database gave 2026-12-28)', () => {
    expect(addDeadlineDays('2026-12-24', 2, 'working')).toBe('2026-12-28');
    expect(addDeadlineDays('2026-10-17', 2, 'working')).toBe('2026-10-20');   // from a Saturday
  });
  it('and the non-working days (the database gave 2026-12-30)', () => {
    expect(addDeadlineDays('2026-12-24', 2, 'working', ['2026-12-25', '2026-12-28'])).toBe('2026-12-30');
  });
});

describe('the bank holidays that ship', () => {
  it('eight a year for England and Wales, 2026 to 2028, each a weekday, in order and once', () => {
    const days = SHIPPED_NON_WORKING_DAYS.map((d) => d.day);
    for (const y of ['2026', '2027', '2028']) expect(days.filter((d) => d.startsWith(y))).toHaveLength(8);
    expect([...days].sort()).toEqual(days);
    expect(new Set(days).size).toBe(days.length);
    for (const d of days) expect([1, 2, 3, 4, 5]).toContain(new Date(`${d}T12:00:00Z`).getUTCDay());
  });
});

describe('the words', () => {
  it('describes a deadline, and says nothing for none', () => {
    expect(describeDeadline({ deadline_days: 5, deadline_basis: 'working', deadline_from: 'entered' })).toBe('Within 5 working days of reaching this step');
    expect(describeDeadline({ deadline_days: 1, deadline_basis: 'calendar', deadline_from: 'started' })).toBe('Within 1 calendar day of the start');
    expect(describeDeadline({ deadline_days: null })).toBe('');
  });
  it('says how it stands today', () => {
    expect(deadlineWords('2026-10-17', '2026-10-17')).toBe('Due today');
    expect(deadlineWords('2026-10-15', '2026-10-17')).toBe('2 days overdue');
    expect(deadlineWords('2026-10-18', '2026-10-17')).toBe('Due in 1 day');
    expect(deadlineBand('2026-10-15', '2026-10-17')).toBe('overdue');
    expect(deadlineBand('2026-10-18', '2026-10-17')).toBe('due_soon');      // the default window is 2 days
    expect(deadlineBand('2026-11-30', '2026-10-17')).toBe('ok');
    expect(deadlineBand(null, '2026-10-17')).toBeNull();
  });
});

describe('what workflow_save() refuses about deadlines, said first', () => {
  const steps = (extra) => [{ key: 'a', name: 'A', kind: 'start', ...extra }, { key: 'b', name: 'B', kind: 'done' }];
  const moves = [{ from_key: 'a', to_key: 'b', label: 'Go' }];
  it('1 to 365 days', () => {
    expect(workflowProblem({ steps: steps({ deadline_days: 0 }), moves, appId: 'parking' })).toMatch(/1 to 365/);
    expect(workflowProblem({ steps: steps({ deadline_days: 400 }), moves, appId: 'parking' })).toMatch(/1 to 365/);
    expect(workflowProblem({ steps: steps({ deadline_days: 5, deadline_basis: 'working' }), moves, appId: 'parking' })).toBeNull();
  });
  it('not on a finished step', () => {
    expect(workflowProblem({ steps: [{ key: 'a', name: 'A', kind: 'start' }, { key: 'b', name: 'B', kind: 'done', deadline_days: 3 }],
      moves, appId: 'parking' })).toMatch(/finished, so it has no deadline/);
  });
  it('counted only in calendar or working days, from the step or the start', () => {
    expect(workflowProblem({ steps: steps({ deadline_days: 3, deadline_basis: 'hours' }), moves, appId: 'parking' })).toMatch(/calendar or working/);
  });
});
