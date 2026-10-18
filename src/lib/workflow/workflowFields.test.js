// A Cases process's fields and the moves that need them (migration 253). The
// code says no first — a field with no label, a choice with no choices, a move
// needing a field the process has not got — and the database refuses the
// same in workflow_save() and workflow_move().
import { describe, it, expect } from 'vitest';
import { moveRefusal, workflowProblem, definitionOf, workflowDiff, fieldMissing, FIELD_TYPES } from './workflowModel.js';

/** @type {import('./workflowModel.js').Step[]} */
const steps = [
  { key: 'open', name: 'Open', kind: 'start', position: 1 },
  { key: 'approved', name: 'Approved', kind: 'done', position: 2 },
];
const approve = { from_key: 'open', to_key: 'approved', label: 'Approve', required_fields: ['where'] };
const where = { key: 'where', label: 'Where', type: 'space', position: 0 };

describe('fields', () => {
  it('the nine types, links being component, space and person', () => {
    expect(FIELD_TYPES.map((t) => t.value)).toEqual(
      ['text', 'long_text', 'date', 'number', 'yes_no', 'choice', 'component', 'space', 'person']);
  });

  it('missing: blank, spaces, null, undefined; not 0 and not "No"', () => {
    for (const v of ['', '  ', null, undefined]) expect(fieldMissing(v)).toBe(true);
    for (const v of [0, 'No', 'x']) expect(fieldMissing(v)).toBe(false);
  });

  it('a process with good fields saves', () => {
    expect(workflowProblem({ steps, moves: [approve], appId: 'cases', fields: [where] })).toBeNull();
  });

  it('refused: a bad key, two of one key, no label, a type not offered, a choice with no choices', () => {
    const p = (/** @type {any[]} */ fields) => workflowProblem({ steps, moves: [], appId: 'cases', fields });
    expect(p([{ ...where, key: 'Where!' }])).toMatch(/key that cannot be used/);
    expect(p([where, where])).toMatch(/Two fields share the key "where"/);
    expect(p([{ ...where, label: ' ' }])).toMatch(/needs a label/);
    expect(p([{ ...where, type: 'resident' }])).toMatch(/type that is not offered/);
    expect(p([{ ...where, type: 'choice', options: [' '] }])).toMatch(/needs at least one choice/);
  });

  it('a move needing a field the process has not got is refused', () => {
    expect(workflowProblem({ steps, moves: [approve], appId: 'cases', fields: [] }))
      .toMatch(/The move "Approve" needs a field the process does not have/);
  });

  it('a move is held until its fields are filled, naming the field', () => {
    expect(moveRefusal(approve, { fields: [where], values: {} })).toBe('Fill in "Where" first.');
    expect(moveRefusal(approve, { fields: [where], values: { where: 's1' } })).toBeNull();
  });

  it('the kept definition carries the fields and what each move needs, and a change reads in words', () => {
    const before = definitionOf({ name: 'Change control', steps, moves: [{ ...approve, required_fields: [] }], fields: [] });
    const after = definitionOf({ name: 'Change control', steps, moves: [approve], fields: [where] });
    expect(after.fields).toEqual([expect.objectContaining({ key: 'where', label: 'Where', type: 'space' })]);
    expect(after.moves[0].required_fields).toEqual(['where']);
    const words = workflowDiff(before, after).join('\n');
    expect(words).toMatch(/Where/);
    expect(words).toMatch(/needs .*Where.* filled|needs Where filled/i);
  });

  it('a field added as needed to open says so in the change history', () => {
    const before = definitionOf({ name: 'Change control', steps, moves: [], fields: [] });
    const after = definitionOf({ name: 'Change control', steps, moves: [],
      fields: [{ key: 'contractor', label: 'Contractor', type: 'text', required_on_create: true, position: 0 }] });
    expect(workflowDiff(before, after)).toContain('Field added: “Contractor” (Short text, needed to open a case).');
  });
});
