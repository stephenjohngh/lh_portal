// src/lib/utils/proseDiff.js
//
// What a re-import of the shipped prose would do to the statement's written
// sections held here.
//
// R5, completing the half R3 did for the register.
// Pure, Type-1 testable, no I/O — and it imports nothing, so the checks can use
// it under plain node.
//
// ── THE SAME FAULT, ONE LEVEL UP ─────────────────────────────────────────────
// R5's import only ADDED, exactly as R1's did, and it is the same fault R3 was
// written to fix: *"a corrected citation shipped in a later release would be
// silently declined. Overwriting would be worse."* Substitute "a corrected §3"
// and the sentence holds without changing a word. It was found on 2026-09-19 by
// reviewing the tutorial rather than by anything failing.
//
// ⚠ It matters more here than the wording suggests. §1–§5 and §7–§8 carry the
// scope statement, the catalogue rule, the two governing principles and the
// numbered actions — and several sentences quote COUNTS taken from the
// register. A correction shipped to one of those and silently declined leaves
// this building's statement making a claim a later release already knew was
// wrong.
//
// ⚠ WHAT CAN AND CANNOT BE KNOWN — unchanged from `registerDiff.js`, because the
// question is identical. We hold the CURRENT seed and the CURRENT row, not the
// seed as it was at import time, so a difference cannot be attributed by
// comparison alone. One thing distinguishes them:
//
//   `seedModifiedAt` null → nobody edited this section here, so the difference
//                           IS the seed moving. Safe to take.
//   `seedModifiedAt` set  → it may be theirs, the seed's, or both. ⛔ Report.
//
// That is why the editor stamps it on every save.

/** Line endings must not read as a change. See `statementProseParse.js`. */
const body = s => String(s ?? '').split('\r\n').join('\n').split('\r').join('\n');

/**
 * Which parts of a section differ between the shipped version and the held one.
 *
 * ⚠ THREE THINGS CAN DIFFER, not one. The markdown is the obvious one, but a
 * later release may also move a section (`position`) or change which section
 * holds the register's place (`generated`) — and a position change reorders the
 * document while every word in it stays identical.
 *
 * @returns {{field: string, seed: any, here: any}[]}
 */
export function sectionChanges(seedSection, heldSection) {
  const out = [];
  if (body(seedSection?.markdown) !== body(heldSection?.markdown)) {
    out.push({ field: 'markdown', seed: seedSection?.markdown, here: heldSection?.markdown });
  }
  if (Number(seedSection?.position) !== Number(heldSection?.position)) {
    out.push({ field: 'position', seed: seedSection?.position, here: heldSection?.position });
  }
  if (Boolean(seedSection?.generated) !== Boolean(heldSection?.generated)) {
    out.push({ field: 'generated', seed: Boolean(seedSection?.generated), here: Boolean(heldSection?.generated) });
  }
  return out;
}

/**
 * How many lines differ, for a report that must not print two 5,000-character
 * blocks side by side.
 *
 * ⚠ Deliberately crude — a count of lines present in one and not the other, not
 * a real diff. It exists to say "three lines changed" rather than "this section
 * differs", because those lead to very different decisions. A reader who needs
 * the detail opens the editor.
 *
 * @param {string} a
 * @param {string} b
 * @returns {{added: number, removed: number}}
 */
export function lineDelta(a, b) {
  const A = body(a).split('\n');
  const B = body(b).split('\n');
  const countOf = (lines) => {
    const m = new Map();
    for (const l of lines) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  const ca = countOf(A);
  const cb = countOf(B);
  let added = 0;
  let removed = 0;
  for (const [line, n] of cb) added += Math.max(0, n - (ca.get(line) ?? 0));
  for (const [line, n] of ca) removed += Math.max(0, n - (cb.get(line) ?? 0));
  return { added, removed };
}

/**
 * @typedef {{key: string, position: number, generated: boolean, markdown: string}} Section
 * @typedef {{section: Section, provenance?: {origin?: string, seedModifiedAt?: string|null}}} HeldSection
 */

/**
 * Compare the shipped prose against what is held here.
 *
 * @param {Section[]} seed
 * @param {HeldSection[]} held
 * @returns {{
 *   added: Section[],
 *   unchanged: string[],
 *   updatable: {key: string, title: string, changes: any[], delta: {added: number, removed: number}}[],
 *   divergent: {key: string, title: string, changes: any[], delta: {added: number, removed: number}, seedModifiedAt: string|null}[],
 *   localOnly: {key: string, title: string}[],
 *   withdrawn: {key: string, title: string}[],
 *   hasAnything: boolean
 * }}
 */
export function diffProse(seed, held) {
  const bySeed = new Map((seed ?? []).map(s => [s.key, s]));
  const byHeld = new Map((held ?? []).map(h => [h.section.key, h]));

  const added = [];
  const unchanged = [];
  const updatable = [];
  const divergent = [];
  const localOnly = [];
  const withdrawn = [];

  for (const [key, seedSection] of bySeed) {
    const row = byHeld.get(key);
    if (!row) { added.push(seedSection); continue; }

    const changes = sectionChanges(seedSection, row.section);
    if (changes.length === 0) { unchanged.push(key); continue; }

    const delta = lineDelta(row.section.markdown, seedSection.markdown);
    const entry = { key, title: titleOf(row.section), changes, delta };

    if (row.provenance?.seedModifiedAt) {
      divergent.push({ ...entry, seedModifiedAt: row.provenance.seedModifiedAt ?? null });
    } else {
      // Nobody has touched this section, so the difference IS the seed moving.
      updatable.push(entry);
    }
  }

  for (const [key, row] of byHeld) {
    if (bySeed.has(key)) continue;
    if (row.provenance?.origin === 'local') {
      localOnly.push({ key, title: titleOf(row.section) });
    } else {
      // ⚠ A seeded section whose key has gone from the shipped prose. Surfaced,
      // never acted on: removing a section of the statement is a decision about
      // a reviewed document, not a side effect of pressing import.
      withdrawn.push({ key, title: titleOf(row.section) });
    }
  }

  return {
    added, unchanged, updatable, divergent, localOnly, withdrawn,
    hasAnything: added.length > 0 || updatable.length > 0
      || divergent.length > 0 || withdrawn.length > 0,
  };
}

/**
 * A section's own first heading.
 * ⚠ Derived, never stored — a stored title is a second copy of a fact that is
 * already in the markdown, and it goes stale the moment somebody edits it.
 */
export function titleOf(section) {
  if (section?.generated) return '6. The register';
  const m = String(section?.markdown ?? '').match(/^#{1,3} (.+)$/m);
  return m ? m[1].trim() : String(section?.key ?? '');
}

/** A one-line summary for a report header. */
export function describeProseDiff(d) {
  const bits = [];
  if (d.added.length)     bits.push(`${d.added.length} new`);
  if (d.updatable.length) bits.push(`${d.updatable.length} updated in the shipped text`);
  if (d.divergent.length) bits.push(`${d.divergent.length} differing and edited here`);
  if (d.withdrawn.length) bits.push(`${d.withdrawn.length} no longer shipped`);
  return bits.length ? bits.join(' · ') : 'The written sections match the shipped text.';
}
