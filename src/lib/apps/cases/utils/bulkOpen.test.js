import { describe, it, expect } from 'vitest';
import { bulkField, bulkTitle, bulkCandidates, BULK_TITLE_DEFAULT } from './bulkOpen.js';

const door = { key: 'door', type: 'component', required_on_create: true, options: ['door_apartment_door'] };
const steps = [{ key: 'open', kind: 'start' }, { key: 'closed', kind: 'done' }, { key: 'no', kind: 'declined' }];
const c = (/** @type {string} */ id, over = {}) => ({ id, label: id, asset_id: '01', type_code: 'door_apartment_door', status: 'failed', ...over });

describe('bulkField', () => {
  it('is the component field needed to open a case', () => {
    expect(bulkField([door, { key: 'x', type: 'text' }])).toBe(door);
  });
  it('is nothing when something else is needed too, because nothing here can fill it in', () => {
    expect(bulkField([door, { key: 'x', type: 'text', required_on_create: true }])).toBeNull();
  });
  it('is nothing when the needed field is not a component', () => {
    expect(bulkField([{ key: 'x', type: 'text', required_on_create: true }])).toBeNull();
  });
  it('is nothing when a component field is only optional', () => {
    expect(bulkField([{ key: 'door', type: 'component' }])).toBeNull();
  });
});

describe('bulkTitle', () => {
  it('puts the label in, wherever it is', () => {
    expect(bulkTitle('Flat {label} owner: failed check', '12a')).toBe('Flat 12a owner: failed check');
    expect(bulkTitle(BULK_TITLE_DEFAULT, '12a')).toBe('12a: failed check');
  });
  it('says so where there is no label', () => {
    expect(bulkTitle('{label}: failed', null)).toBe('No label: failed');
  });
});

describe('bulkCandidates', () => {
  it('leaves out a component that is Problem only because nobody got in', () => {
    const rows = bulkCandidates({ field: { key: 'door' }, components: [c('a', { status: 'problem', last_result: 'no_access' }), c('b', { last_result: 'failed' }), c('d')] });
    expect(rows.map((r) => r.id)).toEqual(['b', 'd']);
  });
  it('still offers a Failed door whose latest visit was no access: the Fail was seen', () => {
    const rows = bulkCandidates({ field: { key: 'door' }, components: [c('a', { status: 'failed', last_result: 'no_access' })] });
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });
  it('offers only the types the field allows', () => {
    const rows = bulkCandidates({ field: door, components: [c('a'), c('b', { type_code: 'door_fire_door' })] });
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });
  it('offers every type where the field allows any', () => {
    const rows = bulkCandidates({ field: { key: 'door' }, components: [c('a'), c('b', { type_code: 'x' })] });
    expect(rows).toHaveLength(2);
  });
  it('names the open case a door already has', () => {
    const rows = bulkCandidates({ field: door, steps, components: [c('a')], cases: [{ id: 's1', reference: 'CAS-1' }],
      items: [{ subject_id: 's1', step_key: 'open', fields: { door: 'a' } }] });
    expect(rows[0].openCase).toBe('CAS-1');
  });
  it('a finished case does not stop a new one: the door has failed again', () => {
    for (const step_key of ['closed', 'no']) {
      const rows = bulkCandidates({ field: door, steps, components: [c('a')], items: [{ subject_id: 's1', step_key, fields: { door: 'a' } }] });
      expect(rows[0].openCase).toBeNull();
    }
  });
  it('sorts by the reference a person reads, numbers in order', () => {
    const rows = bulkCandidates({ field: door, components: [c('a'), c('b')],
      links: [{ id: 'a', text: '1/A/10 — 18' }, { id: 'b', text: '1/A/2 — 10' }] });
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });
});
