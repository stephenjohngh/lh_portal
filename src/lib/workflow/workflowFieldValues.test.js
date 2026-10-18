// A process's field values, pure: what a link offers, how a value reads, what
// is missing to open a case, and what a save sends — only the changes, a
// cleared field as null, and never a field the process no longer has (so the
// value held under it is kept).
import { describe, it, expect } from 'vitest';
import { linkOptions, fieldText, missingToOpen, fieldChanges, fieldDraft, LINK_TYPES } from './workflowFieldValues.js';

const FIELDS = [
  { key: 'contractor', label: 'Contractor', type: 'text', required_on_create: true, position: 1 },
  { key: 'where', label: 'Where', type: 'space', position: 2 },
  { key: 'cost', label: 'Cost', type: 'number', position: 3 },
  { key: 'start', label: 'Start', type: 'date', position: 0, required_on_create: true },
];

describe('workflowFieldValues', () => {
  it('the link types are component, space and person', () => {
    expect([...LINK_TYPES]).toEqual(['component', 'space', 'person']);
  });

  it('a person is a portal user, by name; sorted', () => {
    const l = linkOptions({ people: [{ id: 'b', full_name: 'Zoe' }, { id: 'a', full_name: null }] });
    expect(l.person).toEqual([{ id: 'a', text: 'A user with no name set' }, { id: 'b', text: 'Zoe' }]);
  });

  it('a value reads as words; a link to something gone says so rather than an id', () => {
    const links = linkOptions({ people: [{ id: 'p1', full_name: 'Sam' }] });
    expect(fieldText({ type: 'person' }, 'p1', links)).toBe('Sam');
    expect(fieldText({ type: 'person' }, 'gone', links)).toBe('No longer in the portal');
    expect(fieldText({ type: 'text' }, '', links)).toBe('—');
    expect(fieldText({ type: 'yes_no' }, 'Yes', links)).toBe('Yes');
  });

  it('missing to open: the first needed field in the process order', () => {
    expect(missingToOpen(FIELDS, {})).toBe('Fill in "Start" to open a case.');
    expect(missingToOpen(FIELDS, { start: '2026-10-20', contractor: '  ' })).toBe('Fill in "Contractor" to open a case.');
    expect(missingToOpen(FIELDS, { start: '2026-10-20', contractor: 'ACME' })).toBeNull();
  });

  it('a save sends only what changed, text trimmed, a cleared field as null', () => {
    expect(fieldChanges(FIELDS, { contractor: ' ACME ', cost: '12.5', where: '', start: '' }, { contractor: 'Old', where: 's1' }))
      .toEqual({ contractor: 'ACME', cost: '12.5', where: null });
  });

  it('nothing changed sends nothing; a value under a removed field is never sent', () => {
    expect(fieldChanges(FIELDS, { contractor: 'ACME', cost: 3 }, { contractor: 'ACME', cost: 3, removed_field: 'kept' })).toEqual({});
  });

  it('the draft has every current field', () => {
    expect(fieldDraft(FIELDS, { contractor: 'ACME', removed_field: 'x' })).toEqual({ contractor: 'ACME', where: '', cost: '', start: '' });
  });
});
