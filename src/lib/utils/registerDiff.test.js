// src/lib/utils/registerDiff.test.js
//
// TYPE-1. The categorisation is the whole difficulty, and it rests on one fact:
// `seed_modified_at` is the ONLY thing that distinguishes "the seed moved" from
// "somebody edited this here", because we do not hold the seed as it was at
// import time.

import { describe, it, expect } from 'vitest';
import { STATUTORY_TEMPLATE } from './statutoryTemplate.js';
import { diffRegister, fieldChanges, describeDiff } from './registerDiff.js';

/** The register as it stands right after an import: identical, untouched. */
const heldFromSeed = (entries = STATUTORY_TEMPLATE, over = {}) =>
  entries.map(e => ({
    entry: { ...e },
    provenance: { origin: 'seed', seedModifiedAt: null, ...over },
  }));

describe('the state the register is actually in today', () => {
  it('reports nothing to do when the table was seeded from this seed', () => {
    const d = diffRegister(STATUTORY_TEMPLATE, heldFromSeed());
    expect(d.added).toEqual([]);
    expect(d.updatable).toEqual([]);
    expect(d.divergent).toEqual([]);
    expect(d.withdrawn).toEqual([]);
    expect(d.unchanged).toHaveLength(STATUTORY_TEMPLATE.length);
    expect(d.hasAnything).toBe(false);
    expect(describeDiff(d)).toMatch(/matches the standard register/i);
  });
});

describe('added', () => {
  it('offers an entry a later release introduced', () => {
    const held = heldFromSeed(STATUTORY_TEMPLATE.slice(1));
    const d = diffRegister(STATUTORY_TEMPLATE, held);
    expect(d.added.map(e => e.key)).toEqual([STATUTORY_TEMPLATE[0].key]);
    expect(d.hasAnything).toBe(true);
  });
});

describe('⭐ updatable vs divergent — the distinction the whole module rests on', () => {
  const corrected = (over) => [
    { ...STATUTORY_TEMPLATE[0], statutoryRef: 'Corrected Act 2027, s.9' },
    ...STATUTORY_TEMPLATE.slice(1),
  ];

  it('UNTOUCHED + differs → the seed moved, and it is safe to take', () => {
    const d = diffRegister(corrected(), heldFromSeed());
    expect(d.updatable).toHaveLength(1);
    expect(d.divergent).toEqual([]);
    expect(d.updatable[0].changes.map(c => c.field)).toEqual(['statutoryRef']);
    expect(d.updatable[0].changes[0].seed).toMatch(/Corrected Act/);
  });

  it('⛔ EDITED HERE + differs → divergent, and never silently taken', () => {
    // Overwriting would discard a correction somebody made here, in a register
    // where about half the citation errors found in September were ours.
    const held = heldFromSeed();
    held[0].provenance.seedModifiedAt = '2026-09-17T10:00:00Z';
    const d = diffRegister(corrected(), held);

    expect(d.updatable).toEqual([]);
    expect(d.divergent).toHaveLength(1);
    expect(d.divergent[0].key).toBe(STATUTORY_TEMPLATE[0].key);
    expect(d.divergent[0].seedModifiedAt).toBeTruthy();
    expect(d.divergent[0].changes[0].here).toBe(STATUTORY_TEMPLATE[0].statutoryRef);
  });

  it('a row edited here that still MATCHES is not divergent', () => {
    // Somebody edited it and then edited it back, or edited a field the seed
    // does not carry. There is nothing to decide.
    const held = heldFromSeed();
    held[0].provenance.seedModifiedAt = '2026-09-17T10:00:00Z';
    const d = diffRegister(STATUTORY_TEMPLATE, held);
    expect(d.divergent).toEqual([]);
    expect(d.unchanged).toContain(STATUTORY_TEMPLATE[0].key);
  });
});

describe('rows the seed does not carry', () => {
  it('leaves a locally-added requirement alone', () => {
    const held = [...heldFromSeed(), {
      entry: { key: 'our_own_thing', name: 'Something we identified' },
      provenance: { origin: 'local', seedModifiedAt: null },
    }];
    const d = diffRegister(STATUTORY_TEMPLATE, held);
    expect(d.localOnly.map(r => r.key)).toEqual(['our_own_thing']);
    expect(d.withdrawn).toEqual([]);
    // ⚠ A local entry is not "something to do" — it is the register working.
    expect(d.hasAnything).toBe(false);
  });

  it('⚠ SURFACES a seeded row the standard register has dropped', () => {
    // The register's own rule is "delete only for NEVER", and obligations and
    // applicability decisions may still link to it. Reported, never acted on.
    const d = diffRegister(STATUTORY_TEMPLATE.slice(1), heldFromSeed());
    expect(d.withdrawn.map(r => r.key)).toEqual([STATUTORY_TEMPLATE[0].key]);
    expect(d.added).toEqual([]);
    expect(d.hasAnything).toBe(true);
  });
});

describe('fieldChanges', () => {
  it('ignores provenance — it is how a row arrived, not what it says', () => {
    const a = { key: 'k', name: 'N', citationVerifiedOn: '2026-09-11' };
    const b = { key: 'k', name: 'N' };
    expect(fieldChanges(a, b)).toEqual([]);
  });

  it('sees a structured field change, not just strings', () => {
    const a = { key: 'k', suggestedScope: { typeCodes: ['a'] } };
    const b = { key: 'k', suggestedScope: { typeCodes: ['a', 'b'] } };
    expect(fieldChanges(a, b).map(c => c.field)).toEqual(['suggestedScope']);
  });

  it('treats null and absent alike, so a default is not a false difference', () => {
    expect(fieldChanges({ key: 'k', trigger: null }, { key: 'k' })).toEqual([]);
  });

  it('sees a field one side has and the other does not', () => {
    expect(fieldChanges({ key: 'k', scopeNote: 'x' }, { key: 'k' }).map(c => c.field))
      .toEqual(['scopeNote']);
  });
});

describe('describeDiff', () => {
  it('says what is waiting without making a local entry sound like work', () => {
    const held = [...heldFromSeed(STATUTORY_TEMPLATE.slice(1)), {
      entry: { key: 'ours', name: 'Ours' }, provenance: { origin: 'local' },
    }];
    const text = describeDiff(diffRegister(STATUTORY_TEMPLATE, held));
    expect(text).toMatch(/1 new/);
    expect(text).not.toMatch(/ours/i);
  });
});
