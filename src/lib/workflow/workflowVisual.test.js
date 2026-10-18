// The workflow drawn, and how it is being used (2026-10-17).
import { describe, it, expect } from 'vitest';
import { layoutWorkflow } from './workflowLayout.js';
import { workflowStats } from './workflowStats.js';
import { DEFAULT_APPLICATION_WORKFLOW as WF } from '#lib/apps/parking/utils/applicationWorkflow.js';

const steps = WF.steps.map((s, i) => ({ ...s, position: i + 1 }));

describe('layoutWorkflow', () => {
  it('start first, then by distance from it, finished steps together last', () => {
    const { nodes } = layoutWorkflow(steps, WF.moves);
    const col = Object.fromEntries(nodes.map((n) => [n.key, n.col]));
    expect(col).toEqual({ received: 0, checking: 1, waiting_list: 2, declined: 2, withdrawn: 2 });
  });
  it('every move is drawn; a move back to an earlier step is an arc, marked back', () => {
    const moves = [...WF.moves, { from_key: 'checking', to_key: 'received', label: 'Send back' }];
    const { edges, height } = layoutWorkflow(steps, moves);
    expect(edges).toHaveLength(moves.length);
    expect(edges.find((e) => e.label === 'Send back')?.back).toBe(true);
    expect(edges.filter((e) => e.back)).toHaveLength(1);
    expect(height).toBeGreaterThan(layoutWorkflow(steps, WF.moves).height);    // room for the arc
  });
  it('a move that skips a column goes round under the boxes, not through the step between', () => {
    const skip = layoutWorkflow(steps, WF.moves).edges.find((e) => e.from === 'received' && e.to === 'withdrawn');
    expect(skip?.path).toMatch(/^M [\d.]+ [\d.]+ C [\d.]+ [\d.]+,/);
    const straight = layoutWorkflow(steps, WF.moves).edges.find((e) => e.from === 'received' && e.to === 'checking');
    expect(skip?.labelY).toBeGreaterThan(/** @type {number} */ (straight?.labelY));
    expect(skip?.back).toBe(false);
  });
  it('boxes never overlap', () => {
    const { nodes } = layoutWorkflow(steps, WF.moves);
    for (const a of nodes) for (const b of nodes) {
      if (a === b) continue;
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      expect(apart, `${a.key} / ${b.key}`).toBe(true);
    }
  });
});

describe('workflowStats — how it is being used, from its event log', () => {
  const items = [
    { id: 'a', step_key: 'checking', due_on: '2026-10-10' },      // overdue
    { id: 'b', step_key: 'checking', due_on: '2026-10-30' },
    { id: 'c', step_key: 'waiting_list', due_on: null },
  ];
  const ev = (item_id, from_key, to_key, at) => ({ item_id, from_key, to_key, at });
  const events = [
    ev('a', null, 'received', '2026-10-01T09:00:00Z'), ev('a', 'received', 'checking', '2026-10-03T09:00:00Z'),
    ev('b', null, 'received', '2026-10-05T09:00:00Z'), ev('b', 'received', 'checking', '2026-10-09T09:00:00Z'),
    ev('c', null, 'received', '2026-10-01T09:00:00Z'), ev('c', 'received', 'checking', '2026-10-02T09:00:00Z'),
    ev('c', 'checking', 'waiting_list', '2026-10-08T09:00:00Z'),
    ev('c', 'received', 'declined', '2026-09-01T09:00:00Z'),        // a move the workflow does not allow
  ];
  const s = workflowStats({ steps, moves: WF.moves, items, events, today: '2026-10-17' });

  it('how many are in each step now, and how many of those are overdue', () => {
    expect(s.step.checking).toMatchObject({ now: 2, overdue: 1 });
    expect(s.step.waiting_list).toMatchObject({ now: 1, overdue: 0 });
    expect(s).toMatchObject({ total: 3, open: 2, overdue: 1 });
  });
  it('how many have ever been in a step, and the median days spent there', () => {
    expect(s.step.received.ever).toBe(3);
    expect(s.step.received.medianDays).toBe(2);       // spans 2, 4, 1 — and the stray one
    expect(s.step.checking.medianDays).toBe(6);       // c: 2 Oct → 8 Oct
  });
  it('how often each move is made, and the moves made that the workflow does not allow', () => {
    expect(s.moveCount['received>checking']).toBe(3);
    expect(s.offPath).toEqual({ 'received>declined': 1 });
  });

  it('an assignment (migration 250) changes who, not where: it is not a move and does not split a step', () => {
    const withAssign = [...events, { item_id: 'c', kind: 'assign', from_key: 'checking', to_key: 'checking', at: '2026-10-04T09:00:00Z' }];
    const t = workflowStats({ steps, moves: WF.moves, items, events: withAssign, today: '2026-10-17' });
    expect(t.step.checking.medianDays).toBe(6);
    expect(t.offPath).toEqual({ 'received>declined': 1 });
    expect(t.moveCount['checking>checking']).toBeUndefined();
  });
});

