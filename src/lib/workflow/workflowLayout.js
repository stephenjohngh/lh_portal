// src/lib/workflow/workflowLayout.js
//
// Where to draw each step and move of a workflow (2026-10-17). Workflows here
// are small — a handful of steps — so a simple layered layout does, with no
// graph library: each step goes in the column of its shortest distance from
// the start, the finished steps share the last column, and steps in a column
// keep the workflow's own order. A move to the next column is drawn straight
// across; one back (to an earlier or the same column) or one skipping a column
// is drawn as an arc under the boxes, so it never runs through a step it does
// not touch — a back move is marked `back` (drawn dashed, in its own colour).
// ⚠ A label goes at the curve's REAL midpoint (`curveMidpoint`): a cubic only
// reaches three-quarters of the way to its control points, so a label put at
// the depth an arc is aimed at floats below it — further the deeper the arc
// (seen on the MOR diagram, 2026-10-19). Pure.

/** Box size and spacing, in SVG units. */
export const LAYOUT = Object.freeze({ boxW: 150, boxH: 46, colGap: 90, rowGap: 26, pad: 16, backDrop: 34 });

/** A label's line length before it wraps, its line height, and a 10px character's rough width. */
export const LABEL = Object.freeze({ wrapAt: 24, lineH: 11, charW: 5.6 });

/** The marks after a move's name on the diagram (✎ needs a note, 🔒 admin only, …). @param {any} m */
export function moveMarks(m) {
  return `${m.note_required ? ' ✎' : ''}${m.admin_only ? ' 🔒' : ''}${m.who === 'assignee' ? ' 👤' : ''}${m.four_eyes ? ' 👥' : ''}${m.action ? ' ⚙' : ''}${m.timer_days ? ' ⏲' : ''}`;
}

/**
 * A move's label in lines of at most `wrapAt` characters, broken between words
 * (2026-10-19: MOR's long move names ran under the next column's boxes).
 * @param {string} text
 */
export function wrapLabel(text, wrapAt = LABEL.wrapAt) {
  /** @type {string[]} */
  const lines = [];
  for (const word of String(text ?? '').split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last != null && (last + ' ' + word).length <= wrapAt) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.length ? lines : [''];
}

/**
 * The point halfway along a cubic Bézier, B(½) = (p0 + 3c1 + 3c2 + p3) / 8.
 * @param {number[]} p0 @param {number[]} c1 @param {number[]} c2 @param {number[]} p3
 */
export function curveMidpoint(p0, c1, c2, p3) {
  return [(p0[0] + 3 * c1[0] + 3 * c2[0] + p3[0]) / 8, (p0[1] + 3 * c1[1] + 3 * c2[1] + p3[1]) / 8];
}

/**
 * @param {Array<{ key: string, kind: string, position?: number }>} steps
 * @param {Array<{ from_key: string, to_key: string, label?: string }>} moves
 */
export function layoutWorkflow(steps, moves) {
  const { boxW, boxH, pad, backDrop } = LAYOUT;
  // Each move's label, wrapped; the gap between columns is wide enough for the
  // longest line, so a label between two columns never runs under a box.
  const linesOf = new Map(moves.map((m) => [`${m.from_key}>${m.to_key}`, wrapLabel(`${m.label ?? ''}${moveMarks(m)}`)]));
  const longest = Math.max(0, ...[...linesOf.values()].flat().map((l) => l.length));
  const colGap = Math.max(LAYOUT.colGap, Math.ceil(longest * LABEL.charW) + 24);
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
  // A move between two steps of one column draws its label in the gap between
  // them, so the gap is tall enough for the longest such label.
  const besideLines = moves.filter((m) => col.has(m.from_key) && col.get(m.from_key) === col.get(m.to_key) && m.from_key !== m.to_key)
    .map((m) => (linesOf.get(`${m.from_key}>${m.to_key}`) ?? ['']).length);
  const rowGap = Math.max(LAYOUT.rowGap, ...besideLines.map((n) => 14 + n * LABEL.lineH));
  const usedCols = [...byCol.keys()].sort((a, b) => a - b);
  const colIndex = new Map(usedCols.map((c, i) => [c, i]));     // close up any empty column
  const bodyH = rows * boxH + (rows - 1) * rowGap;

  /** @type {Map<string, { key: string, x: number, y: number, w: number, h: number, col: number, row: number }>} */
  const nodes = new Map();
  for (const [c, keys] of byCol) {
    const colH = keys.length * boxH + (keys.length - 1) * rowGap;
    keys.forEach((k, i) => {
      const ci = /** @type {number} */ (colIndex.get(c));
      nodes.set(k, { key: k, col: ci, row: i, w: boxW, h: boxH,
        x: pad + ci * (boxW + colGap), y: pad + (bodyH - colH) / 2 + i * (boxH + rowGap) });
    });
  }

  /** The last row in each column. @type {Map<number, number>} */
  const lastRow = new Map();
  for (const n of nodes.values()) lastRow.set(n.col, Math.max(lastRow.get(n.col) ?? 0, n.row));

  let backs = 0;
  const edges = moves.filter((m) => nodes.has(m.from_key) && nodes.has(m.to_key)).map((m) => {
    const a = /** @type {any} */ (nodes.get(m.from_key));
    const b = /** @type {any} */ (nodes.get(m.to_key));
    const lines = linesOf.get(`${m.from_key}>${m.to_key}`) ?? [''];
    if (b.col === a.col + 1) {
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
      // Above the line: the last line sits just over it, earlier lines stack upwards.
      const labelY = (y1 + y2) / 2 - 6;
      return { from: m.from_key, to: m.to_key, label: m.label ?? '', back: false, lines,
        path: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, labelX: mx, labelY, labelTop: labelY - (lines.length - 1) * LABEL.lineH };
    }
    if (b.col === a.col && Math.abs(b.row - a.row) === 1) {
      // Two steps one above the other in a column (In assessment → Decision
      // pending): a short straight arrow down the left of the boxes, its label
      // in the gap between them — an arc underneath would run through the
      // lower box, and one out to the side through the next column's labels.
      // Not a move back: neither step is earlier in the flow.
      const x = a.x + 14, down = b.row > a.row;
      const y1 = down ? a.y + a.h : a.y, y2 = down ? b.y : b.y + b.h, mid = (y1 + y2) / 2;
      return { from: m.from_key, to: m.to_key, label: m.label ?? '', back: false, anchor: 'start', beside: true, lines,
        path: `M ${x} ${y1} C ${x} ${y1}, ${x} ${y2}, ${x} ${y2}`, labelX: x + 10, labelY: mid + 4,
        labelTop: mid + 4 - ((lines.length - 1) * LABEL.lineH) / 2 };
    }
    if (b.col === a.col) {
      // Further apart in one column: out to the right and back.
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x + b.w, y2 = b.y + b.h / 2, bulge = x1 + colGap / 2;
      const [mx, my] = curveMidpoint([x1, y1], [bulge, y1], [bulge, y2], [x2, y2]);
      return { from: m.from_key, to: m.to_key, label: m.label ?? '', back: false, anchor: 'start', lines,
        path: `M ${x1} ${y1} C ${bulge} ${y1}, ${bulge} ${y2}, ${x2} ${y2}`, labelX: mx + 4, labelY: my + 4, labelTop: my + 4 };
    }
    // A move back, or one that skips a column: an arc
    // under the boxes, so it never runs through a step it does not touch.
    backs += 1;
    const drop = pad + bodyH + backDrop * backs + (backs - 1) * LABEL.lineH;
    // ⚠ A box with another below it in its column is joined at its SIDE (the
    // side facing the other end): joined at its bottom, the arc would run up
    // through the box below — Closed above Reclassified, BSR report above three.
    const end = (/** @type {any} */ n, /** @type {number} */ otherX) => {
      if (n.row === lastRow.get(n.col)) return { x: n.x + n.w / 2, y: n.y + n.h, cx: n.x + n.w / 2 };
      const left = otherX <= n.x + n.w / 2;
      const x = left ? n.x : n.x + n.w;
      return { x, y: n.y + n.h / 2, cx: x + (left ? -1 : 1) * colGap / 2 };
    };
    const p = end(a, b.x + b.w / 2), q = end(b, a.x + a.w / 2);
    const x1 = p.x, y1 = p.y, x2 = q.x, y2 = q.y;
    const [mx, my] = curveMidpoint([x1, y1], [p.cx, drop], [q.cx, drop], [x2, y2]);
    // Below the arc's lowest point, so the line stays visible above the label;
    // a wrapped label's later lines go downwards.
    return { from: m.from_key, to: m.to_key, label: m.label ?? '', back: b.col < a.col, lines,
      path: `M ${x1} ${y1} C ${p.cx} ${drop}, ${q.cx} ${drop}, ${x2} ${y2}`, labelX: mx, labelY: my + 11, labelTop: my + 11 };
  });

  const width = pad * 2 + usedCols.length * boxW + Math.max(0, usedCols.length - 1) * colGap;
  const height = pad * 2 + bodyH + (backs ? backDrop * backs + backs * LABEL.lineH + 8 : 0);
  return { nodes: [...nodes.values()], edges, width, height };
}
