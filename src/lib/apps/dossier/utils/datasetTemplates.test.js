// src/lib/apps/dossier/utils/datasetTemplates.test.js
// Type-1 tests for the built-in dataset templates.

import { describe, it, expect } from 'vitest';
import {
  DATASET_TEMPLATES, TEMPLATE_KEYS, templateFor, fieldsFor,
  coerceField, coerceRecordFields, emptyRecordFields, sortRecords, isBlankRecord,
} from './datasetTemplates.js';

describe('templates', () => {
  it('declares exactly the three the merge doc specified', () => {
    expect(TEMPLATE_KEYS).toEqual(['chronology', 'correspondence', 'document_index']);
  });

  it('matches the keys migration 175 will accept', () => {
    // The CHECK constraint and this object have to agree, or a dataset cannot
    // be created at all.
    for (const key of TEMPLATE_KEYS) expect(DATASET_TEMPLATES[key].key).toBe(key);
  });

  it('returns null for an unknown template rather than a half-built one', () => {
    expect(templateFor('invoices')).toBeNull();
    expect(templateFor(undefined)).toBeNull();
    expect(fieldsFor('invoices')).toEqual([]);
  });

  it('gives chronology the columns spec 2 §7 asked for', () => {
    expect(fieldsFor('chronology').map(f => f.key))
      .toEqual(['date', 'event', 'significance']);
  });
});

describe('coerceField', () => {
  const dateField = { key: 'date', type: 'date' };

  it('keeps a valid ISO date as a STRING', () => {
    // Never a Date object: a chronology entry is a day, not an instant, and a
    // round-trip through Date is how a BST entry lands a day early.
    const value = coerceField(dateField, '2026-02-14');
    expect(value).toBe('2026-02-14');
    expect(typeof value).toBe('string');
  });

  it('rejects anything that is not an ISO date', () => {
    expect(coerceField(dateField, '14/02/2026')).toBe('');
    expect(coerceField(dateField, 'yesterday')).toBe('');
    expect(coerceField(dateField, '2026-2-4')).toBe('');
    expect(coerceField(dateField, '')).toBe('');
  });

  it('accepts only declared options for a select', () => {
    const status = { key: 'status', type: 'select', options: ['Disclosed', 'Missing'] };
    expect(coerceField(status, 'Disclosed')).toBe('Disclosed');
    expect(coerceField(status, 'Shredded')).toBe('');
  });

  it('passes text through, and stringifies whatever it is given', () => {
    expect(coerceField({ type: 'text' }, 'hello')).toBe('hello');
    expect(coerceField({ type: 'text' }, 42)).toBe('42');
    expect(coerceField({ type: 'text' }, null)).toBe('');
    expect(coerceField({ type: 'text' }, undefined)).toBe('');
  });
});

describe('coerceRecordFields', () => {
  it('keeps only the columns the template defines', () => {
    // A stray key from an older template version must not survive a save.
    const out = coerceRecordFields('chronology', {
      date: '2026-02-14', event: 'Contract signed', rogue: 'should go',
    });
    expect(Object.keys(out)).toEqual(['date', 'event', 'significance']);
    expect(out).not.toHaveProperty('rogue');
  });

  it('fills missing columns with empty strings rather than undefined', () => {
    expect(coerceRecordFields('chronology', { event: 'x' }))
      .toEqual({ date: '', event: 'x', significance: '' });
  });

  it('yields an empty object for an unknown template', () => {
    expect(coerceRecordFields('invoices', { a: 1 })).toEqual({});
  });

  it('emptyRecordFields gives a blank row of the right shape', () => {
    expect(emptyRecordFields('chronology'))
      .toEqual({ date: '', event: '', significance: '' });
  });
});

describe('sortRecords', () => {
  const rec = (date, position = 0, event = '') => ({ fields: { date, event }, position });

  it('orders a chronology by date ascending', () => {
    const sorted = sortRecords('chronology', [
      rec('2026-03-01'), rec('2026-01-15'), rec('2026-02-20'),
    ]);
    expect(sorted.map(r => r.fields.date))
      .toEqual(['2026-01-15', '2026-02-20', '2026-03-01']);
  });

  it('breaks a same-date tie with the author-s ordering', () => {
    const sorted = sortRecords('chronology', [
      rec('2026-01-15', 2), rec('2026-01-15', 1),
    ]);
    expect(sorted.map(r => r.position)).toEqual([1, 2]);
  });

  it('sinks undated entries to the bottom, not to the top', () => {
    // A part-built chronology should not have its unfinished rows leap above
    // everything, which is what treating a blank date as 1970 would do.
    const sorted = sortRecords('chronology', [
      rec(''), rec('2026-01-15'), rec(''),
    ]);
    expect(sorted[0].fields.date).toBe('2026-01-15');
    expect(sorted.slice(1).every(r => r.fields.date === '')).toBe(true);
  });

  it('does not mutate the input', () => {
    const input = [rec('2026-03-01'), rec('2026-01-15')];
    sortRecords('chronology', input);
    expect(input[0].fields.date).toBe('2026-03-01');
  });

  it('falls back to position for a template with no sort column', () => {
    expect(sortRecords('unknown', [rec('', 2), rec('', 1)]).map(r => r.position))
      .toEqual([1, 2]);
  });
});

describe('isBlankRecord', () => {
  it('is true for an untouched row', () => {
    expect(isBlankRecord('chronology', emptyRecordFields('chronology'))).toBe(true);
    expect(isBlankRecord('chronology', { date: '  ', event: '' })).toBe(true);
  });

  it('is false as soon as anything is typed', () => {
    expect(isBlankRecord('chronology', { date: '', event: 'x' })).toBe(false);
    expect(isBlankRecord('chronology', { date: '2026-01-01' })).toBe(false);
  });
});
