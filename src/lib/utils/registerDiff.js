// src/lib/utils/registerDiff.js
//
// What a re-import of the shipped seed would do to the register held here.
//
// R3 of docs/requirements/build_plans/Register_In_The_App_Build_Plan.md.
// Pure, Type-1 testable, no I/O.
//
// ── The import is a DIFF, not a merge ────────────────────────────────────────
// R1's import only ADDS, which is safe and insufficient: a corrected citation
// shipped in a later release would be silently declined. And the opposite —
// overwriting — would discard a correction somebody made here, in a register
// where "the citations have been wrong more often than the cadences" and about
// half the errors found in September were ours.
//
// So neither. It reports, and a person decides.
//
// ⚠ WHAT CAN AND CANNOT BE KNOWN. We hold the CURRENT seed and the CURRENT row.
// We do not hold the seed as it was when the row was imported, so a field that
// differs cannot be attributed to "the seed changed" or "somebody edited it"
// by comparison alone. One thing does distinguish them:
//
//   `seed_modified_at` is null  → nobody has edited this row here, so any
//                                 difference IS the seed moving. Safe to take.
//   `seed_modified_at` is set   → somebody edited it. A difference may be
//                                 theirs, the seed's, or both. ⛔ Report it.
//
// That is the whole basis of the categories below, and it is why R2 stamps
// `seed_modified_at` on every edit of a seeded row.

/** Fields the diff ignores: provenance is about how a row arrived, not what it says. */
const NOT_CONTENT = new Set([
  'citationVerifiedOn', 'citationVerifiedAgainst',
]);

/** Deep-ish equality, enough for the register's scalars, arrays and small objects. */
function same(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Which fields differ between the shipped entry and the one held here.
 * @returns {{field: string, seed: any, here: any}[]}
 */
export function fieldChanges(seedEntry, hereEntry) {
  const fields = new Set([
    ...Object.keys(seedEntry ?? {}),
    ...Object.keys(hereEntry ?? {}),
  ]);
  const out = [];
  for (const field of fields) {
    if (NOT_CONTENT.has(field)) continue;
    if (!same(seedEntry?.[field], hereEntry?.[field])) {
      out.push({ field, seed: seedEntry?.[field], here: hereEntry?.[field] });
    }
  }
  return out.sort((a, b) => a.field.localeCompare(b.field));
}

/**
 * @typedef {{entry: Object, provenance?: {origin?: string, seedModifiedAt?: string|null}}} HeldRow
 */

/**
 * Compare the shipped seed against what the register holds.
 *
 * @param {Object[]} seed     the standard register, as shipped
 * @param {HeldRow[]} held    what is in the database
 * @returns {{
 *   added: Object[],
 *   unchanged: string[],
 *   updatable: {key: string, name: string, changes: any[]}[],
 *   divergent: {key: string, name: string, changes: any[], seedModifiedAt: string|null}[],
 *   localOnly: {key: string, name: string}[],
 *   withdrawn: {key: string, name: string}[],
 *   hasAnything: boolean
 * }}
 */
export function diffRegister(seed, held) {
  const bySeed = new Map((seed ?? []).map(e => [e.key, e]));
  const byHeld = new Map((held ?? []).map(h => [h.entry.key, h]));

  const added = [];
  const unchanged = [];
  const updatable = [];
  const divergent = [];
  const localOnly = [];
  const withdrawn = [];

  for (const [key, seedEntry] of bySeed) {
    const row = byHeld.get(key);
    if (!row) { added.push(seedEntry); continue; }

    const changes = fieldChanges(seedEntry, row.entry);
    if (changes.length === 0) { unchanged.push(key); continue; }

    const editedHere = Boolean(row.provenance?.seedModifiedAt);
    if (editedHere) {
      divergent.push({
        key, name: row.entry.name, changes,
        seedModifiedAt: row.provenance?.seedModifiedAt ?? null,
      });
    } else {
      // Nobody has touched this row, so the difference IS the seed moving —
      // a correction from a later release, which is the reason to import at all.
      updatable.push({ key, name: row.entry.name, changes });
    }
  }

  for (const [key, row] of byHeld) {
    if (bySeed.has(key)) continue;
    if (row.provenance?.origin === 'local') {
      // Added in this building. Correct, and not the import's business.
      localOnly.push({ key, name: row.entry.name });
    } else {
      // ⚠ A seeded row whose key has gone from the standard register. The
      // register's rule is delete only for NEVER, so this is worth surfacing
      // rather than acting on: obligations and decisions may still link to it.
      withdrawn.push({ key, name: row.entry.name });
    }
  }

  return {
    added, unchanged, updatable, divergent, localOnly, withdrawn,
    hasAnything: added.length > 0 || updatable.length > 0
      || divergent.length > 0 || withdrawn.length > 0,
  };
}

/** A one-line summary for a report header. */
export function describeDiff(d) {
  const bits = [];
  if (d.added.length)     bits.push(`${d.added.length} new`);
  if (d.updatable.length) bits.push(`${d.updatable.length} updated in the standard register`);
  if (d.divergent.length) bits.push(`${d.divergent.length} differing and edited here`);
  if (d.withdrawn.length) bits.push(`${d.withdrawn.length} no longer in the standard register`);
  return bits.length ? bits.join(' · ') : 'The register matches the standard register.';
}
