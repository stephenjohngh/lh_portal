import { describe, it, expect } from 'vitest';
import { shortNameProblem, normaliseShortName, SHORT_NAME_PATTERN } from './shortName.js';

const people = [
  { id: 'a', full_name: 'Jane Smith', short_name: 'JS' },
  { id: 'b', full_name: 'Chloe K', short_name: 'CK' },
  { id: 'c', full_name: 'No Initials', short_name: null },
];

describe('short name rule', () => {
  it('blank means none', () => {
    expect(normaliseShortName('  ')).toBeNull();
    expect(shortNameProblem('', people, 'a')).toBe('');
  });
  it('refuses spaces and anything over ten characters', () => {
    expect(shortNameProblem('J S', people, 'c')).toMatch(/no spaces/);
    expect(shortNameProblem('ABCDEFGHIJK', people, 'c')).toMatch(/up to 10/);
    expect(shortNameProblem('J.F-2', people, 'c')).toBe('');
  });
  it('refuses another person’s short name, ignoring case, but not your own', () => {
    expect(shortNameProblem('js', people, 'c')).toMatch(/Jane Smith already has/);
    expect(shortNameProblem('JS', people, 'a')).toBe('');
  });
  it('matches the database CHECK in migration 279', () => {
    expect(SHORT_NAME_PATTERN.source).toBe('^[A-Za-z0-9.-]{1,10}$');
  });
});
