// src/lib/apps/inspection/utils/inspectionHelpers.test.js
//
// statusBeforeSession: reconstructing "the status before this session" from
// inspection history, for the walk card's "was → now" line on resume.

import { describe, it, expect } from 'vitest';
import {
  statusBeforeSession, sessionStats, worstResult,
  resolveAwaitingAccess, awaitingAccessByDefinition, sessionKindLabel,
  mapSyncByInspection, syncGlyph,
} from './inspectionHelpers.js';

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

describe('resolveAwaitingAccess (G13)', () => {
  const na = (component_id, inspected_at, extra = {}) =>
    ({ component_id, inspected_at, inspection_result: 'no_access', ...extra });
  const ok = (component_id, inspected_at) =>
    ({ component_id, inspected_at, inspection_result: 'ok' });

  it('flags a component nobody has got into since the attempt', () => {
    const noAcc = [na('c1', '2026-07-19T00:00:00Z', { no_access_reason: 'locked', definition_id: 'd1' })];
    const out = resolveAwaitingAccess(noAcc, [...noAcc, ok('c1', '2026-01-01T00:00:00Z')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ component_id: 'c1', reason: 'locked', definition_id: 'd1' });
    expect(out[0].lastObserved).toBe('2026-01-01T00:00:00Z');   // stale, not never
  });

  it('clears automatically once someone actually gets in — no state to tick off', () => {
    const noAcc = [na('c1', '2026-07-19T00:00:00Z')];
    const all   = [...noAcc, ok('c1', '2026-07-20T00:00:00Z')];   // got in the next day
    expect(resolveAwaitingAccess(noAcc, all)).toEqual([]);
  });

  it('a component never observed at all reports lastObserved null', () => {
    const noAcc = [na('c1', '2026-07-19T00:00:00Z')];
    const [row] = resolveAwaitingAccess(noAcc, noAcc);
    expect(row.lastObserved).toBeNull();
  });

  it('uses only the newest attempt per component, newest first overall', () => {
    const noAcc = [
      na('c1', '2026-05-01T00:00:00Z', { no_access_reason: 'locked' }),
      na('c1', '2026-07-19T00:00:00Z', { no_access_reason: 'refused' }),   // newer
      na('c2', '2026-07-20T00:00:00Z'),
    ];
    const out = resolveAwaitingAccess(noAcc, noAcc);
    expect(out.map(r => r.component_id)).toEqual(['c2', 'c1']);   // newest first
    expect(out.find(r => r.component_id === 'c1').reason).toBe('refused');
  });

  it('groups by definition and ignores rows with no definition', () => {
    const rows = [
      { component_id: 'c1', since: 'x', reason: null, definition_id: 'd1', lastObserved: null },
      { component_id: 'c2', since: 'y', reason: null, definition_id: 'd1', lastObserved: null },
      { component_id: 'c3', since: 'z', reason: null, definition_id: null, lastObserved: null },
    ];
    const byDef = awaitingAccessByDefinition(rows);
    expect(byDef.d1).toHaveLength(2);
    expect(Object.keys(byDef)).toEqual(['d1']);
  });

  it('tolerates empty/omitted input', () => {
    expect(resolveAwaitingAccess([], [])).toEqual([]);
    expect(resolveAwaitingAccess(undefined, undefined)).toEqual([]);
    expect(awaitingAccessByDefinition(undefined)).toEqual({});
  });
});

describe('sessionKindLabel', () => {
  const DEFS = [{ id: 'def1', name: 'Fire Doors' }];

  it('names the definition rather than the legacy preset', () => {
    // The bug this fixes: definition-driven sessions stamp session_preset
    // 'custom', so a Fire Doors run used to render as "Custom".
    const session = { definition_id: 'def1', session_preset: 'custom' };
    expect(sessionKindLabel(session, DEFS)).toBe('Fire Doors');
  });

  it('prefers the session\'s own resolved definition over the list', () => {
    // _walk is resolved at start/resume with a DB fetch fallback, so it works
    // even when the definitions list failed to load (it loads non-fatally).
    const session = {
      definition_id: 'def1', session_preset: 'custom',
      _walk: { definition: { id: 'def1', name: 'Fire Doors (revised)' } },
    };
    expect(sessionKindLabel(session, [])).toBe('Fire Doors (revised)');
  });

  it('falls back to a neutral word — never "Custom" — for a deleted definition', () => {
    // definition_id points somewhere real-but-gone. Saying "Custom" would
    // assert something false about the session.
    const session = { definition_id: 'gone', session_preset: 'custom' };
    expect(sessionKindLabel(session, DEFS)).toBe('Inspection');
  });

  it('still labels genuinely ad-hoc and historic sessions from the preset', () => {
    expect(sessionKindLabel({ session_preset: 'custom' }, DEFS)).toBe('Custom');
    // Pre-migration-153 sessions kept their real preset value.
    expect(sessionKindLabel({ session_preset: 'fire_doors' }, DEFS)).toBe('Fire Doors');
  });

  it('tolerates a null session and an omitted definitions list', () => {
    expect(sessionKindLabel(null)).toBe('');
    expect(sessionKindLabel({ definition_id: 'def1' })).toBe('Inspection');
  });
});

describe('offline sync state (G5)', () => {
  it('mapSyncByInspection keys inspection_save items by inspectionId → status', () => {
    const items = [
      { type: 'inspection_save', status: 'pending',  inspectionId: 'i1' },
      { type: 'inspection_save', status: 'error',    inspectionId: 'i2' },
      { type: 'session_create',  status: 'pending',  inspectionId: null },  // ignored
      { type: 'session_complete',status: 'pending',  inspectionId: null },  // ignored
    ];
    expect(mapSyncByInspection(items)).toEqual({ i1: 'pending', i2: 'error' });
  });

  it('mapSyncByInspection tolerates an empty/missing list', () => {
    expect(mapSyncByInspection([])).toEqual({});
    expect(mapSyncByInspection(undefined)).toEqual({});
  });

  it('syncGlyph maps each status, and nothing for synced/unknown', () => {
    expect(syncGlyph('pending')).toBe('⇡');
    expect(syncGlyph('syncing')).toBe('⟳');
    expect(syncGlyph('error')).toBe('⚠');
    expect(syncGlyph(null)).toBe('');
    expect(syncGlyph('done')).toBe('');
  });
});
