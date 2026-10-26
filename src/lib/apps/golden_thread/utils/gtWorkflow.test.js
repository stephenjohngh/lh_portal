import { describe, it, expect } from 'vitest';
import { documentMoveConfirmation, DEFAULT_GT_DOCUMENT_WORKFLOW } from './gtWorkflow.js';

const move = (from_key, to_key) => ({ from_key, to_key });

describe('which document moves are asked about first', () => {
  it('accepting is asked, and says when it supersedes another', () => {
    expect(documentMoveConfirmation(move('under_review', 'current'), {}).title).toMatch(/Accept/);
    expect(documentMoveConfirmation(move('under_review', 'current'), { supersedes: 'x' }).message).toMatch(/superseded/);
  });

  it('withdrawing a CURRENT document is asked, as a danger', () => {
    const ask = documentMoveConfirmation(move('current', 'withdrawn'), {});
    expect(ask.danger).toBe(true);
    expect(ask.message).toMatch(/cannot be reversed/);
  });

  it('withdrawing a draft, and every other move, goes straight through', () => {
    expect(documentMoveConfirmation(move('draft', 'withdrawn'), {})).toBeNull();
    expect(documentMoveConfirmation(move('draft', 'under_review'), {})).toBeNull();
    expect(documentMoveConfirmation(move('under_review', 'returned_to_author'), {})).toBeNull();
  });

  it('every shipped move that withdraws a current document is covered', () => {
    const withdraws = DEFAULT_GT_DOCUMENT_WORKFLOW.moves.filter((m) => m.to_key === 'withdrawn' && m.from_key === 'current');
    expect(withdraws.length).toBeGreaterThan(0);
    for (const m of withdraws) expect(documentMoveConfirmation(m, {})).not.toBeNull();
  });
});
