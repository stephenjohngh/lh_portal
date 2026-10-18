// src/lib/workflow/itemRecord.js
//
// The record of ONE workflow item, as evidence of how it was handled
// (2026-10-17): what it is, where it stands, and every move it made — when,
// from which step to which, who made it, the note, the action run, and how
// long it sat in the step it left. Any app's item: the app supplies the facts
// about its subject (an application, a case…), this supplies the rest. Pure;
// itemRecordDocx.js turns it into a Word file.
//
// ⛔ Read from the event log (workflow_events), never re-derived: the record
// says what happened, not what the workflow would allow today. Two things the
// log cannot say are said plainly instead of guessed:
//   · step NAMES are today's — a renamed step shows its new name, a removed one
//     shows its key and says so;
//   · a step's deadline AT THE TIME is not stored — only the item's deadline
//     now is shown, never a judgement of whether an earlier step was in time.

import { STEP_KIND_LABEL, isFinished, isMoveEvent } from './workflowModel.js';
import { actionLabel } from './workflowActions.js';
import { describeDeadline, deadlineWords } from './workflowDeadlines.js';
import { calendarDate, daysBetween, fmtDate, fmtDateTime } from '#lib/utils/dates.js';

/** Who made a move, from the profile names given; never an id on paper. */
export function whoMade(/** @type {string|null|undefined} */ by, /** @type {Record<string,string>} */ people = {}) {
  if (!by) return 'Not a signed-in user (e.g. the online form)';
  return people[by] || 'A user no longer listed';
}

/** An assignment in words. @param {string|null|undefined} to @param {Record<string,string>} people */
export function assignWords(to, people = {}) {
  return to ? `Given to ${people[to] || 'a user no longer listed'}` : 'No longer with anyone';
}

/**
 * How long between two moves, in words: minutes, hours, or calendar days
 * (London) once it is a day or more.
 * @param {string} fromIso @param {string} toIso
 */
export function timeBetween(fromIso, toIso) {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!(ms >= 0)) return '';
  const min = Math.round(ms / 60000);
  if (min < 60) return min <= 1 ? 'under a minute' : `${min} minutes`;
  if (min < 24 * 60) { const h = Math.round(min / 60); return h === 1 ? '1 hour' : `${h} hours`; }
  const d = daysBetween(/** @type {string} */ (calendarDate(fromIso)), /** @type {string} */ (calendarDate(toIso)));
  return d === 1 ? '1 day' : `${d} days`;
}

/**
 * @param {{
 *   workflow: { name: string, review_required?: boolean, review_reason?: string|null },
 *   steps: Array<{ key: string, name: string, kind: string, deadline_days?: number|null, deadline_basis?: string, deadline_from?: string }>,
 *   item: { label?: string|null, step_key: string, due_on?: string|null, created_at: string, assigned_to?: string|null },
 *   events: Array<{ id?: number, kind?: string|null, from_key: string|null, to_key: string, assigned_to?: string|null, note: string|null, action: string|null, at: string, by: string|null }>,
 *   subject: { title: string, facts: Array<[string, string|null|undefined]>, sections?: Array<{ heading: string, text: string|null|undefined }> },
 *   people?: Record<string, string>,
 *   todayISO?: string,
 * }} w
 */
export function itemRecordModel({ workflow, steps, item, events, subject, people = {}, todayISO }) {
  const byKey = new Map(steps.map((s) => [s.key, s]));
  const stepName = (/** @type {string} */ key) => byKey.get(key)?.name ?? `${key} (a step no longer in the workflow)`;
  const ordered = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : (a.id ?? 0) - (b.id ?? 0)));

  // How long the item sat in the step a move LEFT: since the move before it —
  // an assignment in between changes who, not where, so it does not count.
  /** @type {string|null} */
  let lastMoveAt = null;
  const moves = ordered.map((e) => {
    const isMove = isMoveEvent(e);
    const row = {
      kind: isMove ? 'move' : 'assign',
      at: fmtDateTime(e.at),
      from: isMove && e.from_key ? stepName(e.from_key) : '',
      to: isMove ? stepName(e.to_key) : '',
      assigned: isMove ? '' : assignWords(e.assigned_to, people),
      by: whoMade(e.by, people),
      note: e.note ?? '',
      action: e.action ? actionLabel(e.action) : '',
      waited: isMove && lastMoveAt ? timeBetween(lastMoveAt, e.at) : '',
    };
    if (isMove) lastMoveAt = e.at;
    return row;
  });

  const step = byKey.get(item.step_key);
  const finished = isFinished(step?.kind ?? '');
  const lastMove = [...ordered].reverse().find(isMoveEvent);
  const entered = lastMove ? lastMove.at : item.created_at;
  const now = {
    step: stepName(item.step_key),
    kind: step ? STEP_KIND_LABEL[step.kind] ?? step.kind : '',
    since: fmtDateTime(entered),
    finished,
    with: item.assigned_to ? (people[item.assigned_to] || 'A user no longer listed') : '',
    due: !finished && item.due_on
      ? `${deadlineWords(item.due_on, todayISO)} — ${fmtDate(item.due_on)} (${describeDeadline(step ?? {})})`
      : '',
  };

  const notes = [
    'Step names are as the workflow names them today; the moves themselves are as recorded when they were made.',
  ];
  if (ordered.filter(isMoveEvent).some((e) => (e.from_key && !byKey.has(e.from_key)) || !byKey.has(e.to_key))) {
    notes.push('A step marked “no longer in the workflow” has since been removed from it.');
  }
  if (!ordered.length) notes.push('No moves are recorded for this item.');

  return {
    title: subject.title,
    workflowName: workflow.name,
    reviewMark: workflow.review_required ? (workflow.review_reason || 'Needs a full review before any change') : '',
    facts: subject.facts.filter(([, v]) => v != null && String(v).trim() !== '').map(([k, v]) => /** @type {[string, string]} */ ([k, String(v)])),
    sections: (subject.sections ?? []).filter((s) => s.text && String(s.text).trim()),
    now,
    moves,
    notes,
  };
}
