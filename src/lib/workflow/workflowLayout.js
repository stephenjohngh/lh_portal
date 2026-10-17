// src/lib/workflow/workflowLayout.js
//
// Where to draw each step and move of a workflow (2026-10-17). Workflows here
// are small — a handful of steps — so a simple layered layout does, with no
// graph library: each step goes in the column of its shortest distance from
// the start, the finished steps share the last column, and steps in a column
// keep the workflow's own order. A move to the next column is drawn straight
// across; one back (to an earlier or the same column) or one skipping a column
// is drawn as an arc under the boxes, so it never runs through a step it does
// not touch — a back move is marked `back` (drawn dashed). Pure.

/** Box size and spacing, in SVG units. */
export const LAYOUT = Object.freeze({ boxW: 150, boxH: 46, colGap: 90, rowGap: 26, pad: 16, backDrop: 34 });

/**
 * @param {Array<{ key: string, kind: string, position?: number }>} steps
 * @param {Array<{ from_key: string, to_key: string, label?: string }>} moves
 */
export function layoutWorkflow(steps, moves) {
  const { boxW, boxH, colGap, rowGap, pad, backDrop } = LAYOUT;
  const finished = (/** @type {string} */ k) => k === 'done' || k === 'declined';
  const ordered = [...steps].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const start = ordered.find((s) => s.kind === 'start');

  // Shortest distance from the start (breadth first over the moves).
  /** @type {Map<string, number>} */
  const dist = new Map();
  if (start) {
    dist.set(start.key, 0);
    const queue = [start.key];
    while (queue.length) {
      const k = /** @type {string} */ (queue.shift());
      for (const m of moves) {
        if (m.from_key === k && !dist.has(m.to_key)) { dist.set(m.to_key, /** @type {number} */ (dist.get(k)) + 1); queue.push(m.to_key); }
      }
    }
  }
  const openCols = ordered.filter((s) => !finished(s.kind)).map((s) => dist.get(s.key) ?? 0);
  const lastCol = Math.max(0, ...openCols) + 1;
  /** @type {Map<string, number>} */
  const col = new Map(ordered.map((s) => [s.key, finished(s.kind) ? lastCol : (dist.get(s.key) ?? 0)]));

  // Rows within each column, in the workflow's order.
  /** @type {Map<number, string[]>} */
  const byCol = new Map();
  for (const s of ordered) {
    const c = /** @type {number} */ (col.get(s.key));
    if (!byCol.has(c)) byCol.set(c, []);
    /** @type {string[]} */ (byCol.get(c)).push(s.key);
  }
  const rows = Math.max(1, ...[...byCol.values()].map((v) => v.length));
  const usedCols = [...byCol.keys()].sort((a, b) => a - b);
  const colIndex = new Map(usedCols.map((c, i) => [c, i]));     // close up any empty column
  const bodyH = rows * boxH + (rows - 1) * rowGap;

  /** @type {Map<string, { key: string, x: number, y: number, w: number, h: number, col: number }>} */
  const nodes = new Map();
  for (const [c, keys] of byCol) {
    const colH = keys.length * boxH + (keys.length - 1) * rowGap;
    keys.forEach((k, i) => {
      const ci = /** @type {number} */ (colIndex.get(c));
      nodes.set(k, { key: k, col: ci, w: boxW, h: boxH,
        x: pad + ci * (boxW + colGap), y: pad + (bodyH - colH) / 2 + i * (boxH + rowGap) });
    });
  }

  let backs = 0;
  const edges = moves.filter((m) => nodes.has(m.from_key) && nodes.has(m.to_key)).map((m) => {
    const a = /** @type {any} */ (nodes.get(m.from_key));
    const b = /** @type {any} */ (nodes.get(m.to_key));
    if (b.col === a.col + 1) {
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
      return { from: m.from_key, to: m.to_key, label: m.label ?? '', back: false,
        path: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, labelX: mx, labelY: (y1 + y2) / 2 - 6 };
    }
    // A move back (or within a column), or one that skips a column: an arc
    // under the boxes, so it never runs through a step it does not touch.
    backs += 1;
    const drop = pad + bodyH + backDrop * backs;
    const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y + b.h;
    return { from: m.from_key, to: m.to_key, label: m.label ?? '', back: b.col <= a.col,
      path: `M ${x1} ${y1} C ${x1} ${drop}, ${x2} ${drop}, ${x2} ${y2}`, labelX: (x1 + x2) / 2, labelY: drop - backDrop / 2 + 4 };
  });

  const width = pad * 2 + usedCols.length * boxW + Math.max(0, usedCols.length - 1) * colGap;
  const height = pad * 2 + bodyH + (backs ? backDrop * backs + 8 : 0);
  return { nodes: [...nodes.values()], edges, width, height };
}
