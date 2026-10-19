import { describe, it, expect } from 'vitest';
import { layoutWorkflow, curveMidpoint } from './workflowLayout.js';
import { SHIPPED_WORKFLOWS } from './shippedWorkflows.js';

/** The curve's own midpoint, read back from the path the diagram draws. */
function pathMidpoint(/** @type {string} */ d) {
  const n = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  expect(n).toHaveLength(8);
  return curveMidpoint([n[0], n[1]], [n[2], n[3]], [n[4], n[5]], [n[6], n[7]]);
}

describe('workflow layout — labels sit on their own move', () => {
  it('B(½) of a cubic is its midpoint', () => {
    expect(curveMidpoint([0, 0], [0, 100], [100, 100], [100, 0])).toEqual([50, 75]);
  });

  // ⚠ 2026-10-19: arc labels were put at the depth each arc is AIMED at, which
  // a cubic reaches only three-quarters of the way — so on the MOR diagram the
  // deepest labels floated a hundred units below their lines.
  for (const wf of SHIPPED_WORKFLOWS) {
    it(`every label of "${wf.name}" is within a line of its curve's midpoint`, () => {
      const steps = wf.steps.map((s, i) => ({ ...s, position: i + 1 }));
      const { edges } = layoutWorkflow(steps, wf.moves);
      expect(edges.length).toBe(wf.moves.length);
      for (const e of edges) {
        const [x, y] = pathMidpoint(e.path);
        // A move between two stacked boxes labels the gap beside its short arrow.
        expect(Math.abs(e.labelX - x), `${e.from} → ${e.to}`).toBeLessThanOrEqual(e.beside ? 10 : 4);
        expect(Math.abs(e.labelY - y), `${e.from} → ${e.to}`).toBeLessThanOrEqual(12);
      }
    });
  }

  it('marks a move to an earlier step as back, and a move onward as not', () => {
    const mor = SHIPPED_WORKFLOWS.find((w) => w.key === 'mor_case');
    expect(mor).toBeTruthy();
    const { edges } = layoutWorkflow(/** @type {any} */ (mor).steps, /** @type {any} */ (mor).moves);
    const edge = (/** @type {string} */ f, /** @type {string} */ t) => edges.find((e) => e.from === f && e.to === t);
    expect(edge('decision_pending', 'in_triage')?.back).toBe(true);
    expect(edge('awaiting_reporter', 'in_remediation')?.back).toBe(true);
    expect(edge('submitted', 'acknowledged')?.back).toBe(false);
    // Two steps in one column: a move onward, drawn beside them, not under.
    const side = edge('in_assessment', 'decision_pending');
    expect(side?.back).toBe(false);
    expect(side?.beside).toBe(true);
  });

  it('a label between two stacked boxes sits in the gap between them', () => {
    const mor = /** @type {any} */ (SHIPPED_WORKFLOWS.find((w) => w.key === 'mor_case'));
    const { edges, nodes } = layoutWorkflow(mor.steps, mor.moves);
    const e = /** @type {any} */ (edges.find((x) => x.from === 'in_assessment' && x.to === 'decision_pending'));
    const up = /** @type {any} */ (nodes.find((n) => n.key === 'in_assessment'));
    const low = /** @type {any} */ (nodes.find((n) => n.key === 'decision_pending'));
    const last = e.labelTop + (e.lines.length - 1) * 11;
    expect(e.labelTop - 8).toBeGreaterThanOrEqual(up.y + up.h);   // a 10px line's top below the upper box
    expect(last).toBeLessThanOrEqual(low.y);                       // its baseline above the lower one
  });

  // ⚠ 2026-10-19: arcs into Closed ran up through Reclassified, below it.
  it('no line runs through a box it does not join', () => {
    for (const wf of SHIPPED_WORKFLOWS) {
      const { edges, nodes } = layoutWorkflow(wf.steps.map((s, i) => ({ ...s, position: i + 1 })), wf.moves);
      for (const e of edges) {
        const n = e.path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
        const [p0, c1, c2, p3] = [[n[0], n[1]], [n[2], n[3]], [n[4], n[5]], [n[6], n[7]]];
        for (let i = 2; i < 99; i += 1) {
          const t = i / 100, u = 1 - t;
          const x = u ** 3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * p3[0];
          const y = u ** 3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * p3[1];
          for (const b of nodes) {
            if (b.key === e.from || b.key === e.to) continue;
            const inside = x > b.x + 2 && x < b.x + b.w - 2 && y > b.y + 2 && y < b.y + b.h - 2;
            expect(inside, `${wf.name}: ${e.from} → ${e.to} runs through ${b.key}`).toBe(false);
          }
        }
      }
    }
  });
});

describe('workflow layout — the diagram holds everything it draws', () => {
  it('no arc or label of a shipped workflow falls below the diagram', () => {
    for (const wf of SHIPPED_WORKFLOWS) {
      const { edges, height } = layoutWorkflow(wf.steps.map((s, i) => ({ ...s, position: i + 1 })), wf.moves);
      for (const e of edges) {
        const n = e.path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
        for (let i = 0; i <= 50; i += 1) {
          const t = i / 50, u = 1 - t;
          const y = u ** 3 * n[1] + 3 * u * u * t * n[3] + 3 * u * t * t * n[5] + t ** 3 * n[7];
          expect(y, `${wf.name}: ${e.from} → ${e.to}`).toBeLessThanOrEqual(height);
        }
        expect(e.labelTop + (e.lines.length - 1) * 11, `${wf.name}: label of ${e.from} → ${e.to}`).toBeLessThanOrEqual(height);
      }
    }
  });
});
