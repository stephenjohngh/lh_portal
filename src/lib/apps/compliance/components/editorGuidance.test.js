// src/lib/apps/compliance/components/editorGuidance.test.js
//
// The catalogue rule must reach the screen where somebody could break it.
//
// ⛔ WHY THIS IS A TEST AND NOT A COMMENT. The build plan's §10 — "what must not
// regress" — says the catalogue rule *"becomes editor guidance, and appliesWhen
// remains the mechanism"*. On 2026-09-19 it had not: the WITHDRAW modal spent
// three paragraphs on "this is not how you say a requirement does not apply",
// and the ADD/EDIT editor said nothing at all — which is the screen where a new
// requirement gets written, and therefore the screen where the rule gets broken.
//
// ⚠ THE RULE HAS BEEN BROKEN TWICE, BOTH TIMES BY US, both times in exactly the
// way the editor now warns about:
//   · a stair ventilation row was made UNCONDITIONAL because an AOV had been
//     recorded as installed. There is none, and four rows of the statement told
//     an external reviewer there was one for a full round;
//   · a handling note justified a row *"because a lift replacement is in
//     prospect"* — a project, which can be cancelled, written as a reason.
//
// ⚠ This asserts the guidance is PRESENT, not its wording. A test pinned to a
// sentence fires when the sentence improves — seven of those here so far.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const MODAL = 'src/lib/apps/compliance/components/RegisterEntryModal.svelte';
const source = readFileSync(MODAL, 'utf8');

/** The `helpText` a field carries, by the label above it. */
function helpFor(label) {
  const at = source.indexOf(`label="${label}"`);
  if (at < 0) return null;
  // Up to the end of that component's tag.
  const end = source.indexOf('/>', at);
  const block = source.slice(at, end < 0 ? at + 1200 : end);
  const m = block.match(/helpText="([^"]*)"/);
  return m ? m[1] : null;
}

describe('the requirement editor carries the catalogue rule', () => {
  // ⛔ Round 14's dead claim: a scan that can match nothing passes for ever.
  it('finds the fields it exists to check', () => {
    expect(source).toContain('label="Applies when"');
    expect(source).toContain('label="Description"');
    expect(source).toContain('label="Reference"');
  });

  it('tells the author to write the CONDITION, not today’s answer to it', () => {
    const help = helpFor('Applies when');
    expect(help, '"Applies when" has no helpText at all').toBeTruthy();

    // ⚠ NOT a match on the word "condition" — the R2 invariant that was already
    // in this box says *"a row with no stated condition claims it always
    // applies"*, so that word was there before the catalogue rule was, and
    // asserting it passed with the rule deleted. Found by injection, which is
    // the only reason it is known. The catalogue rule's distinguishing claim is
    // the SECOND half: that today's answer does not belong in the box, because
    // it changes without anyone editing the row.
    expect(help).toMatch(/not today|rather than today|recorded decision|changes without/i);
  });

  it('warns that a description must not name what the building has today', () => {
    const help = helpFor('Description');
    expect(help, '"Description" has no helpText at all').toBeTruthy();
    expect(help.toLowerCase()).toMatch(/today|current|defect|project/);
  });

  // The R2 invariant that was already there, kept under the same guard so it
  // cannot be lost while the catalogue rule is being edited.
  it('still says a requirement must be able to say what requires it', () => {
    expect(helpFor('Reference')).toBeTruthy();
    expect(helpFor('Applies when')).toMatch(/Always/);
  });
});

describe('withdrawing carries the other limb of the rule', () => {
  const PANEL = 'src/lib/apps/compliance/components/StatutoryTemplatePanel.svelte';
  const panel = readFileSync(PANEL, 'utf8');

  // ⛔ "Delete only for NEVER." A compliance obligation that exists in law and
  // does not apply HERE gets a recorded, attributed applicability decision — a
  // deleted row answers a reviewer nothing at all.
  //
  // ⚠ ASSERT THE RULE, NOT THE SENTENCE. This was pinned to the exact words
  // "NOT how you say a REQUIREMENT does not apply" and fired the moment V1 of
  // the compliance vocabulary renamed that noun — the ninth time here a claim
  // has tested the wording rather than what must be TRUE. Both limbs below are
  // deliberately blind to what the object is called.
  it('says plainly that it is not how you record "does not apply"', () => {
    // It disclaims the use it most looks like it is for...
    expect(panel).toMatch(/NOT how you say a[^.]{0,40}does not apply/i);
    // ...and names what to do instead, or the refusal leaves nowhere to go.
    expect(panel).toMatch(/<em>Not applicable<\/em>\s+instead/i);
  });
});
