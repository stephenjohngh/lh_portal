// src/lib/apps/inspection/utils/inspectionHelpers.test.js
//
// statusBeforeSession: reconstructing "the status before this session" from
// inspection history, for the walk card's "was → now" line on resume.

import { describe, it, expect } from 'vitest';
import { statusBeforeSession, sessionStats, worstResult } from './inspectionHelpers.js';

const STARTED = '2026-07-15T10:00:00.000Z';

describe('statusBeforeSession', () => {
  it('takes the latest result recorded BEFORE the session started', () => {
    const history = [
      { component_id: 'c1', inspection_result: 'failed', inspected_at: '2026-01-01T00:00:00.000Z' },
      { component_id: 'c1', inspection_result: 'ok',     inspected_at: '2026-05-01T00:00:00.000Z' },  // latest prior
      { component_id: 'c1', inspection_result: 'problem', inspected_at: '2026-07-15T11:00:00.000Z' }, // this session's
    ];
    expect(statusBeforeSession(history, STARTED)).toEqual({ c1: 'ok' });
  });

  it('ignores rows at or after started_at, so the session cannot be its own "before"', () => {
    const history = [
      { component_id: 'c1', inspection_result: 'failed', inspected_at: STARTED },                     // boundary: this session
      { component_id: 'c1', inspection_result: 'ok',     inspected_at: '2026-07-15T12:00:00.000Z' },
    ];
    expect(statusBeforeSession(history, STARTED)).toEqual({});
  });

  it('omits a component with no earlier inspection rather than guessing a status', () => {
    const history = [
      { component_id: 'c1', inspection_result: 'ok', inspected_at: '2026-07-15T12:00:00.000Z' },
    ];
    // Absent, not 'ok' — the card shows "–" instead of asserting a prior status
    // that predates any inspection and is genuinely unrecoverable.
    expect(statusBeforeSession(history, STARTED)).not.toHaveProperty('c1');
  });

  it('keys each component independently', () => {
    const history = [
      { component_id: 'c1', inspection_result: 'ok',      inspected_at: '2026-05-01T00:00:00.000Z' },
      { component_id: 'c2', inspection_result: 'failed',  inspected_at: '2026-05-02T00:00:00.000Z' },
      { component_id: 'c3', inspection_result: 'problem', inspected_at: '2026-07-15T11:00:00.000Z' },
    ];
    expect(statusBeforeSession(history, STARTED)).toEqual({ c1: 'ok', c2: 'failed' });
  });

  it('skips incomplete rows and tolerates empty input', () => {
    const history = [
      { component_id: 'c1', inspection_result: null,  inspected_at: '2026-05-01T00:00:00.000Z' },
      { component_id: 'c2', inspection_result: 'ok',  inspected_at: null },
      { component_id: null, inspection_result: 'ok',  inspected_at: '2026-05-01T00:00:00.000Z' },
    ];
    expect(statusBeforeSession(history, STARTED)).toEqual({});
    expect(statusBeforeSession([], STARTED)).toEqual({});
    expect(statusBeforeSession(undefined, STARTED)).toEqual({});
  });
});

describe('no_access (G1)', () => {
  const row = (component_id, result) => ({ component_id, result });

  it('sessionStats separates addressed components from those actually observed', () => {
    const st = sessionStats([
      row('c1', 'ok'), row('c2', 'failed'),
      row('c3', 'no_access'), row('c4', 'no_access'),
    ]);
    expect(st.no_access).toBe(2);
    expect(st.components).toBe(4);   // all four addressed → session is complete
    expect(st.observed).toBe(2);     // but only two were assessed
  });

  it('worstResult reports no_access rather than falling through to inactive', () => {
    // A component whose ONLY record is a failed attempt must not read "inactive".
    expect(worstResult([row('c1', 'no_access')])).toBe('no_access');
    // …but it never masks a real defect.
    expect(worstResult([row('c1', 'no_access'), row('c1', 'failed')])).toBe('failed');
    // …and outranks a pass, since an unassessed component needs attention.
    expect(worstResult([row('c1', 'no_access'), row('c1', 'ok')])).toBe('no_access');
  });
});
