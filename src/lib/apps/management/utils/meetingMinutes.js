// src/lib/apps/management/utils/meetingMinutes.js
//
// Pure grouping of a meeting's tagged items — the data behind a "minutes" view.
// Mirrors the logic in components/meetings/MeetingMinutesView.svelte so the
// desktop minutes and the mobile meeting screen agree. Kept pure (no DOM, no
// store) so it can be unit-tested and shared.
//
// A meeting groups work discussed at a team progress meeting: issues/activities/
// actions carry `meeting_id`. For each issue with any content tagged to the
// meeting we bucket its activities by type and collect its actions.

/** @returns {{issues:number,actions:number,comments:number,decisions:number,notes:number,emails:number,letters:number,documents:number}} */
function emptyTotals() {
  return { issues: 0, actions: 0, comments: 0, decisions: 0, notes: 0, emails: 0, letters: 0, documents: 0 };
}

/**
 * Build the per-issue minutes entries + totals for a meeting.
 * @param {{id:string}|null} meeting
 * @param {Array<object>} issues  issues with activities[] + actions[] (each carrying meeting_id)
 * @returns {{ minutes: Array<object>, totals: object }}
 */
export function buildMeetingMinutes(meeting, issues) {
  if (!meeting) return { minutes: [], totals: emptyTotals() };
  const id  = meeting.id;
  const out = [];

  for (const issue of (issues ?? [])) {
    const allActivities = (issue.activities || []).filter(a => a.meeting_id === id);

    // An action counts if it's directly tagged, OR its source activity is tagged
    // (covers actions created from a meeting-tagged activity without meeting_id).
    const meetingActivityIds = new Set(allActivities.map(a => a.id));
    const actions = (issue.actions || []).filter(
      a => a.meeting_id === id ||
           (a.source_activity_id && meetingActivityIds.has(a.source_activity_id))
    );

    const comments  = allActivities.filter(a => (a.activity_type ?? 'comment') === 'comment');
    const decisions = allActivities.filter(a => a.activity_type === 'decision');
    const notes     = allActivities.filter(a => a.activity_type === 'note');
    const emails    = allActivities.filter(a => a.activity_type === 'email');
    const letters   = allActivities.filter(a => a.activity_type === 'letter');
    const documents = allActivities.filter(a => a.activity_type === 'document');

    const isNew = issue.meeting_id === id;
    if (!isNew && actions.length === 0 && allActivities.length === 0) continue;

    out.push({ issue, isNew, actions, comments, decisions, notes, emails, letters, documents });
  }

  out.sort((a, b) => {
    const pa = a.issue.priority ?? 99;
    const pb = b.issue.priority ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.issue.issue_number ?? 0) - (b.issue.issue_number ?? 0);
  });

  const totals = out.reduce((acc, m) => ({
    issues:    acc.issues    + (m.isNew ? 1 : 0),
    actions:   acc.actions   + m.actions.length,
    comments:  acc.comments  + m.comments.length,
    decisions: acc.decisions + m.decisions.length,
    notes:     acc.notes     + m.notes.length,
    emails:    acc.emails    + m.emails.length,
    letters:   acc.letters   + m.letters.length,
    documents: acc.documents + m.documents.length,
  }), emptyTotals());

  return { minutes: out, totals };
}

/**
 * Resolve a meeting's attendees to display names.
 * participants = { profile_ids: uuid[], extras: string[] }
 * @param {object|null} meeting
 * @param {Record<string,string>} profileNameById  { [profileId]: full_name }
 * @returns {string[]}
 */
export function meetingAttendees(meeting, profileNameById = {}) {
  const p = meeting?.participants;
  if (!p) return [];
  const names = (p.profile_ids ?? []).map(pid => profileNameById[pid]).filter(Boolean);
  return [...names, ...(p.extras ?? [])];
}
