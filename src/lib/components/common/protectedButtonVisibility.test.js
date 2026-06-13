// src/lib/components/common/protectedButtonVisibility.test.js
//
// TYPE-1 (pure logic) test — the blueprint's default. Runs in the node
// environment (no jsdom, no rendering, no mocks). This is where the real
// branching risk lives, so it gets exhaustive coverage. See CLAUDE.md "Testing".

import { describe, it, expect } from 'vitest';
import { determineVisibility, getTooltipText } from './protectedButtonVisibility.js';

const perms = (over = {}) => ({ loading: false, isAdmin: false, canModify: false, isReadOnly: false, ...over });

describe('determineVisibility', () => {
  it('hides everything while permissions are loading', () => {
    expect(determineVisibility(perms({ loading: true, isAdmin: true }), 'view', false)).toBe(false);
  });
  it('shows everything to an admin', () => {
    expect(determineVisibility(perms({ isAdmin: true }), 'modify', true)).toBe(true);
  });
  it('hides admin-required controls from non-admins', () => {
    expect(determineVisibility(perms(), 'view', true)).toBe(false);
  });
  it('always shows view actions to non-admins', () => {
    expect(determineVisibility(perms(), 'view', false)).toBe(true);
  });
  it('shows modify actions only when the user can modify', () => {
    expect(determineVisibility(perms({ canModify: true }),  'modify', false)).toBe(true);
    expect(determineVisibility(perms({ canModify: false }), 'modify', false)).toBe(false);
  });
  it('fails open for unknown action types', () => {
    expect(determineVisibility(perms(), 'something_new', false)).toBe(true);
  });
});

describe('getTooltipText', () => {
  it('prefers a caller-supplied custom tooltip', () => {
    expect(getTooltipText(perms(), 'modify', false, 'Custom')).toBe('Custom');
  });
  it('is empty when the control is visible', () => {
    expect(getTooltipText(perms(), 'view', false, '')).toBe('');
  });
  it('explains admin-required when hidden for that reason', () => {
    expect(getTooltipText(perms(), 'view', true, '')).toBe('Admin access required');
  });
  it('explains read-only when a modify action is hidden for a read-only user', () => {
    expect(getTooltipText(perms({ isReadOnly: true }), 'modify', false, '')).toBe('You have read-only access');
  });
});
