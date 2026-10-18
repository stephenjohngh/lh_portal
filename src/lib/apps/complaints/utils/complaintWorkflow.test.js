// The Complaints workflow as it ships (migration 252) — held to s.93's machine
// (complaintLifecycle.js, itself held to the database by dbRulesParity), so
// the workflow and the case's own trigger cannot disagree out of the box.
import { describe, it, expect } from 'vitest';
import { DEFAULT_COMPLAINT_WORKFLOW as W } from './complaintWorkflow.js';
import { STATUS, STATUS_ORDER, nextStatuses, isOpen } from './complaintLifecycle.js';
import { workflowProblem, isFinished } from '#lib/workflow/workflowModel.js';

const steps = W.steps.map((s, i) => ({ ...s, position: i + 1 }));
const byKey = new Map(steps.map((s) => [s.key, s]));
const pairs = (list) => list.map(([a, b]) => `${a}>${b}`).sort();

describe('the shipped Complaints workflow', () => {
  it('its steps ARE the complaint statuses — the database sets the status to the step key', () => {
    expect(steps.map((s) => s.key).sort()).toEqual([...STATUS_ORDER].sort());
  });

  it('it allows exactly the moves s.93’s machine allows — no more, no fewer', () => {
    const machine = STATUS_ORDER.flatMap((from) => nextStatuses(from).map((to) => [from, to]));
    expect(pairs(W.moves.map((m) => [m.from_key, m.to_key]))).toEqual(pairs(machine));
  });

  it('it saves: the same checks as workflow_save()', () => {
    expect(workflowProblem({ steps, moves: W.moves, appId: 'complaints' })).toBeNull();
  });

  it('open in the workflow exactly where the Complaints queue counts it open — Responded stays open', () => {
    for (const st of steps) expect(!isFinished(st.kind), st.key).toBe(isOpen(st.key));
    expect(byKey.get(STATUS.RESPONDED)?.kind).toBe('open');
  });

  it('the two clocks: acknowledge within 5 working days of receipt, respond within 20', () => {
    expect(byKey.get(STATUS.RECEIVED)).toMatchObject({ deadline_days: 5, deadline_basis: 'working', deadline_from: 'started' });
    for (const k of [STATUS.ACKNOWLEDGED, STATUS.INVESTIGATING]) {
      expect(byKey.get(k), k).toMatchObject({ deadline_days: 20, deadline_basis: 'working', deadline_from: 'started' });
    }
    expect(byKey.get(STATUS.RESPONDED)?.deadline_days ?? null).toBeNull();
  });

  it('it ships marked as needing a full review before any change, saying why', () => {
    expect(W.reviewRequired).toBe(true);
    expect(W.reviewReason).toMatch(/s\.93/);
  });

  it('closing and escalating stay admin-only, as they were; withdrawing and reopening need a note', () => {
    const m = (from, to) => W.moves.find((x) => x.from_key === from && x.to_key === to);
    expect(m('responded', 'closed')?.admin_only).toBe(true);
    expect(m('responded', 'escalated_to_bsr')?.admin_only).toBe(true);
    expect(m('closed', 'investigating')?.note_required).toBe(true);
    for (const x of W.moves.filter((x) => x.to_key === 'withdrawn')) expect(x.note_required).toBe(true);
  });
});
