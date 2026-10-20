// The review mark and the change history (migration 249): the definition in
// the database's shape, whether a save changes it, and what changed in words.
import { describe, it, expect } from 'vitest';
import { definitionOf, definitionChanged, workflowDiff } from './workflowModel.js';

const base = {
  name: 'Parking application', description: null, reviewRequired: false, reviewReason: '',
  steps: [{ key: 'received', name: 'Received', kind: 'start', deadline_days: '' },
          { key: 'checking', name: 'Being checked', kind: 'open', deadline_days: 10, deadline_basis: 'working', deadline_from: 'entered' },
          { key: 'done', name: 'Done', kind: 'done' }],
  moves: [{ from_key: 'received', to_key: 'checking', label: 'Start checking' },
          { from_key: 'checking', to_key: 'done', label: 'Accept', action: 'parking_add_to_waiting_list' }],
};
const def = (over = {}) => definitionOf({ ...base, ...over });

describe('definitionOf — the shape the database keeps', () => {
  it('blanks are nothing, numbers are numbers, and the reason only counts when marked', () => {
    const d = def({ reviewReason: 'left over' });
    expect(d.steps[0]).toMatchObject({ deadline_days: null, deadline_basis: 'calendar', deadline_from: 'entered', public_name: null });
    expect(d.steps[1].deadline_days).toBe(10);
    expect(d.review_reason).toBeNull();
    expect(d.moves[0]).toEqual({ from_key: 'received', to_key: 'checking', label: 'Start checking', note_required: false, admin_only: false, action: null,
      who: 'anyone', four_eyes: false,      // migration 251: the database's definition carries both
      required_fields: [],                  // migration 253
      timer_days: null, timer_basis: 'calendar' });   // migration 259
    expect(d.fields).toEqual([]);
  });
  it('a re-save with nothing different is not a change; an edit is', () => {
    expect(definitionChanged(def(), def())).toBe(false);
    expect(definitionChanged(def(), def({ steps: [{ ...base.steps[0], name: 'In' }, ...base.steps.slice(1)] }))).toBe(true);
    expect(definitionChanged(def(), def({ reviewRequired: true, reviewReason: 'Statutory' }))).toBe(true);
  });
});

describe('workflowDiff — what changed, in words', () => {
  it('a new workflow is "set up"; nothing different says so', () => {
    expect(workflowDiff(null, def())).toEqual(['Set up.']);
    expect(workflowDiff(def(), def())).toEqual(['Nothing that is kept changed.']);
  });
  it('steps renamed, re-kinded, given a deadline, added and removed', () => {
    const after = def({ steps: [
      { key: 'received', name: 'Arrived', kind: 'start', deadline_days: 5, deadline_basis: 'working', deadline_from: 'entered' },
      { key: 'checking', name: 'Being checked', kind: 'open', deadline_days: 20, deadline_basis: 'working', deadline_from: 'started' },
      { key: 'extra', name: 'Second look', kind: 'open' },
    ], moves: [{ from_key: 'received', to_key: 'checking', label: 'Start checking' }, { from_key: 'checking', to_key: 'extra', label: 'Look again' }] });
    const lines = workflowDiff(def(), after);
    expect(lines).toContain('Step “Received” renamed “Arrived”.');
    expect(lines).toContain('Step “Arrived” deadline: none → 5 working days from reaching it.');
    expect(lines).toContain('Step “Being checked” deadline: 10 working days from reaching it → 20 working days from the start.');
    expect(lines).toContain('Step added: “Second look” (In progress).');
    expect(lines).toContain('Step removed: “Done”.');
    expect(lines).toContain('Move added: “Look again” (Being checked → Second look).');
    expect(lines).toContain('Move removed: “Accept” (Being checked → Done).');
  });
  it('a step added WITH a deadline says what the deadline is', () => {
    const after = def({ steps: [...def().steps, { key: 'extra', name: 'Second look', kind: 'open', deadline_days: 2, deadline_basis: 'working', deadline_from: 'entered' }] });
    expect(workflowDiff(def(), after)).toContain('Step added: “Second look” (In progress) — deadline 2 working days from reaching it.');
  });
  it('the mark put on and taken off, and a move made to need a note', () => {
    expect(workflowDiff(def(), def({ reviewRequired: true, reviewReason: 'Statutory — BSA s.93' })))
      .toEqual(['Marked as needing a full review: Statutory — BSA s.93.']);
    expect(workflowDiff(def({ reviewRequired: true, reviewReason: 'x' }), def())).toEqual(['Review mark removed.']);
    expect(workflowDiff(def(), def({ moves: [{ ...base.moves[0], note_required: true }, base.moves[1]] })))
      .toEqual(['Move “Start checking”: now needs a note.']);
  });
});
