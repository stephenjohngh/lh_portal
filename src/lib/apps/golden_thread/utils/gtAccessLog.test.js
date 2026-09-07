import { describe, it, expect } from 'vitest';
import { shouldLogView } from './gtAccessLog.js';

describe('shouldLogView', () => {
  it('does not log a routine official, non-PII document', () => {
    expect(shouldLogView({ id: 'd1', security_classification: 'official', contains_pii: false }, null)).toBe(false);
  });

  it('logs an official_sensitive document', () => {
    expect(shouldLogView({ id: 'd1', security_classification: 'official_sensitive', contains_pii: false }, null)).toBe(true);
  });

  it('logs a PII-flagged document even when classified official', () => {
    expect(shouldLogView({ id: 'd1', security_classification: 'official', contains_pii: true }, null)).toBe(true);
  });

  it('does not re-log the same document id', () => {
    expect(shouldLogView({ id: 'd1', security_classification: 'official_sensitive' }, 'd1')).toBe(false);
  });

  it('logs a new sensitive document even if a different one was already logged', () => {
    expect(shouldLogView({ id: 'd2', security_classification: 'official_sensitive' }, 'd1')).toBe(true);
  });

  it('is false with no document', () => {
    expect(shouldLogView(null, null)).toBe(false);
    expect(shouldLogView(undefined, 'd1')).toBe(false);
  });

  it('is false with a document that has no id yet (e.g. still loading)', () => {
    expect(shouldLogView({ security_classification: 'official_sensitive' }, null)).toBe(false);
  });
});
