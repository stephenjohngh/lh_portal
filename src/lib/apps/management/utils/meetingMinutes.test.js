// src/lib/apps/management/utils/meetingMinutes.test.js
import { describe, it, expect } from 'vitest';
import { buildMeetingMinutes, meetingAttendees } from './meetingMinutes.js';

const M = { id: 'm1' };

function issue(over = {}) {
  return { id: 'i1', issue_number: 1, name: 'Lift fault', priority: 2, meeting_id: null, activities: [], actions: [], ...over };
}
const act = (o) => ({ id: 'a' + Math.random(), activity_type: 'comment', meeting_id: 'm1', ...o });
const action = (o) => ({ id: 'x' + Math.random(), status: 'pending', meeting_id: 'm1', ...o });

describe('buildMeetingMinutes', () => {
  it('returns empty for no meeting', () => {
    expect(buildMeetingMinutes(null, [issue()])).toEqual({
      minutes: [], totals: { issues: 0, actions: 0, comments: 0, decisions: 0, notes: 0, emails: 0, letters: 0, documents: 0 },
    });
  });

  it('buckets tagged activities by type and collects tagged actions', () => {
    const i = issue({
      activities: [
        act({ activity_type: 'comment' }),
        act({ activity_type: 'decision' }),
        act({ activity_type: 'note' }),
        act({ activity_type: 'email' }),
        act({ activity_type: 'letter' }),
        act({ activity_type: 'document' }),
        act({ activity_type: 'comment', meeting_id: 'other' }),  // different meeting — excluded
      ],
      actions: [action(), action({ meeting_id: 'other' })],
    });
    const { minutes, totals } = buildMeetingMinutes(M, [i]);
    expect(minutes).toHaveLength(1);
    const m = minutes[0];
    expect(m.comments).toHaveLength(1);
    expect(m.decisions).toHaveLength(1);
    expect(m.notes).toHaveLength(1);
    expect(m.emails).toHaveLength(1);
    expect(m.letters).toHaveLength(1);
    expect(m.documents).toHaveLength(1);
    expect(m.actions).toHaveLength(1);      // the 'other' action excluded
    expect(m.isNew).toBe(false);
    expect(totals).toMatchObject({ actions: 1, comments: 1, decisions: 1, notes: 1, emails: 1, letters: 1, documents: 1, issues: 0 });
  });

  it("defaults a missing activity_type to 'comment'", () => {
    const i = issue({ activities: [act({ activity_type: undefined })] });
    expect(buildMeetingMinutes(M, [i]).minutes[0].comments).toHaveLength(1);
  });

  it('marks an issue new when the issue itself is tagged, and counts it', () => {
    const i = issue({ meeting_id: 'm1' });   // new issue, no activities
    const { minutes, totals } = buildMeetingMinutes(M, [i]);
    expect(minutes).toHaveLength(1);
    expect(minutes[0].isNew).toBe(true);
    expect(totals.issues).toBe(1);
  });

  it('includes an action whose SOURCE activity is meeting-tagged even if the action is not', () => {
    const a = act({ id: 'src', activity_type: 'comment' });
    const i = issue({
      activities: [a],
      actions: [action({ meeting_id: null, source_activity_id: 'src' })],
    });
    expect(buildMeetingMinutes(M, [i]).minutes[0].actions).toHaveLength(1);
  });

  it('skips an issue with nothing tagged to the meeting', () => {
    const i = issue({ activities: [act({ meeting_id: 'other' })], actions: [action({ meeting_id: 'other' })] });
    expect(buildMeetingMinutes(M, [i]).minutes).toEqual([]);
  });

  it('sorts by priority then issue_number', () => {
    const a = issue({ id: 'a', issue_number: 5, priority: 3, meeting_id: 'm1' });
    const b = issue({ id: 'b', issue_number: 2, priority: 1, meeting_id: 'm1' });
    const c = issue({ id: 'c', issue_number: 9, priority: 3, meeting_id: 'm1' });
    const ids = buildMeetingMinutes(M, [a, b, c]).minutes.map(m => m.issue.id);
    expect(ids).toEqual(['b', 'a', 'c']);   // p1 first, then p3 by number 5,9
  });
});

describe('meetingAttendees', () => {
  it('resolves profile ids to names and appends extras', () => {
    const meeting = { participants: { profile_ids: ['p1', 'p2', 'gone'], extras: ['Guest'] } };
    expect(meetingAttendees(meeting, { p1: 'Alice', p2: 'Bob' })).toEqual(['Alice', 'Bob', 'Guest']);
  });
  it('tolerates no participants', () => {
    expect(meetingAttendees({}, {})).toEqual([]);
    expect(meetingAttendees(null, {})).toEqual([]);
  });
});
