import { describe, it, expect } from 'vitest';
import { actionStatusLabel, isActionOverdue } from './complaintActions.js';

describe('complaint actions', () => {
  it('labels every stored status, and an unknown one as itself', () => {
    expect(['open', 'in_progress', 'complete'].map(actionStatusLabel)).toEqual(['Open', 'In progress', 'Done']);
    expect(actionStatusLabel('odd')).toBe('odd');
    expect(actionStatusLabel(null)).toBe('Open');
  });

  it('is overdue only past its date and not done', () => {
    expect(isActionOverdue({ target_date: '2026-10-01', status: 'open' }, '2026-10-26')).toBe(true);
    expect(isActionOverdue({ target_date: '2026-10-01', status: 'complete' }, '2026-10-26')).toBe(false);
    expect(isActionOverdue({ target_date: '2026-10-26', status: 'open' }, '2026-10-26')).toBe(false);
    expect(isActionOverdue({ target_date: null, status: 'open' }, '2026-10-26')).toBe(false);
  });
});
