// A Cases process's fields, pure: what a link offers, how a value reads, what
// is missing to open a case, and what is saved — a value under a field the
// process no longer has is KEPT, never dropped by an edit.
import { describe, it, expect } from 'vitest';
import { linkOptions, fieldText, missingToOpen, fieldsForSave, LINK_TYPES } from './caseFields.js';

const FIELDS = [
  { key: 'contractor', label: 'Contractor', type: 'text', required_on_create: true, position: 1 },
  { key: 'where', label: 'Where', type: 'space', position: 2 },
  { key: 'cost', label: 'Cost', type: 'number', position: 3 },
  { key: 'start', label: 'Start', type: 'date', position: 0, required_on_create: true },
];

describe('caseFields', () => {
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

  it('saved: blanks dropped, numbers as numbers, text trimmed', () => {
    expect(fieldsForSave(FIELDS, { contractor: ' ACME ', cost: '12.5', where: '' }))
      .toEqual({ contractor: 'ACME', cost: 12.5 });
  });

  it('a value under a field the process no longer has is kept', () => {
    expect(fieldsForSave(FIELDS, { contractor: 'ACME' }, { contractor: 'Old', removed_field: 'kept' }))
      .toEqual({ contractor: 'ACME', removed_field: 'kept' });
  });
});
