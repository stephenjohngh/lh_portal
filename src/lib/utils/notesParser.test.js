// src/lib/utils/notesParser.test.js
// Notes may be plain text, "key:value", or a JSON object. The parsers extract
// the value (or key+value) for display.

import { describe, it, expect } from 'vitest';
import {
  parseNotesValue, parseNotesKeyValue, formatNotesKeyValue,
  formatNotesForDisplay, isStructuredNotes,
} from './notesParser.js';

describe('parseNotesValue', () => {
  it('extracts the value from a single-key JSON object', () => {
    expect(parseNotesValue('{"issue":"Battery depleted"}')).toBe('Battery depleted');
  });
  it('joins values from a multi-key JSON object', () => {
    expect(parseNotesValue('{"a":"1","b":"2"}')).toBe('1, 2');
  });
  it('extracts the value from key:value text', () => {
    expect(parseNotesValue('issue:Battery depleted')).toBe('Battery depleted');
  });
  it('returns plain text unchanged', () => {
    expect(parseNotesValue('Battery depleted')).toBe('Battery depleted');
  });
  it('returns empty string for null/undefined', () => {
    expect(parseNotesValue(null)).toBe('');
    expect(parseNotesValue(undefined)).toBe('');
  });
  it('falls through to text when JSON is malformed', () => {
    expect(parseNotesValue('{not json}')).toBe('{not json}');
  });
});

describe('parseNotesKeyValue', () => {
  it('returns key + value from JSON', () => {
    expect(parseNotesKeyValue('{"issue":"X"}')).toEqual({ key: 'issue', value: 'X' });
  });
  it('returns key + value from key:value text', () => {
    expect(parseNotesKeyValue('reason:broken')).toEqual({ key: 'reason', value: 'broken' });
  });
  it('returns key null for plain text', () => {
    expect(parseNotesKeyValue('just text')).toEqual({ key: null, value: 'just text' });
  });
  it('flags multi-key JSON with key "multiple"', () => {
    expect(parseNotesKeyValue('{"a":"1","b":"2"}')).toMatchObject({ key: 'multiple' });
  });
});

describe('formatNotesKeyValue', () => {
  it('joins key and value with a colon', () => {
    expect(formatNotesKeyValue('issue', 'broken')).toBe('issue:broken');
  });
  it('returns the value alone when key is missing', () => {
    expect(formatNotesKeyValue('', 'broken')).toBe('broken');
  });
});

describe('formatNotesForDisplay', () => {
  it('truncates with an ellipsis past maxLength', () => {
    expect(formatNotesForDisplay('abcdefghij', 5)).toBe('ab...');
  });
  it('returns the full value when within maxLength', () => {
    expect(formatNotesForDisplay('abc', 5)).toBe('abc');
  });
});

describe('isStructuredNotes', () => {
  it('detects JSON and key:value', () => {
    expect(isStructuredNotes('{"a":"1"}')).toBe(true);
    expect(isStructuredNotes('key:value')).toBe(true);
  });
  it('rejects plain text and edge colons', () => {
    expect(isStructuredNotes('plain')).toBe(false);
    expect(isStructuredNotes(':leading')).toBe(false);
    expect(isStructuredNotes('trailing:')).toBe(false);
    expect(isStructuredNotes(null)).toBe(false);
  });
});
