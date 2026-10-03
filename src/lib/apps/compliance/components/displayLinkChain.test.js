// The BSA s.82 link between the compliance obligations register and the
// Display register runs BOTH ways, and each way is a chain of events across
// components. Drop any hop and the button still renders, still clicks, and
// does nothing — which no other test would notice. Same shape as the
// `goto` chain in obligationTabsSplit.test.js.
//
// ⚠ Asserts MECHANISM — event names, props, tab keys — never wording.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');

const SHELL   = 'src/lib/apps/compliance/ComplianceApp.svelte';
const REG_TAB = 'src/lib/apps/compliance/components/ComplianceObligationsTab.svelte';
const PANEL   = 'src/lib/apps/compliance/components/StatutoryTemplatePanel.svelte';
const DISPLAY = 'src/lib/apps/compliance/components/DisplayRegisterTab.svelte';
// One register row, its own component since 2026-10-03. That added a hop in each
// direction: the row's event must be forwarded by the panel, and the panel's
// scroll must find the id the row renders.
const ROW     = 'src/lib/apps/compliance/components/RegisterRow.svelte';

describe('Display register → compliance obligation', () => {
  it('the Display register dispatches showObligation with the duty key', () => {
    expect(read(DISPLAY)).toMatch(/dispatch\(\s*['"]showObligation['"]\s*,\s*DISPLAY_DUTY_KEY\s*\)/);
  });

  it('the shell routes it to the register tab and passes the key on', () => {
    const shell = read(SHELL);
    expect(shell).toMatch(/<DisplayRegisterTab[^>]*on:showObligation=/s);
    expect(shell).toMatch(/function showObligation[\s\S]*?focusKey\s*=\s*key[\s\S]*?activateTab\('compliance-obligations'\)/);
    expect(shell).toMatch(/<ComplianceObligationsTab[\s\S]*?\{focusKey\}[\s\S]*?\/>/);
  });

  it('the register tab hands the key to the panel', () => {
    expect(read(REG_TAB)).toMatch(/export let focusKey/);
    expect(read(REG_TAB)).toMatch(/<StatutoryTemplatePanel[^>]*\{focusKey\}/);
  });

  it('the panel acts on the key', () => {
    const panel = read(PANEL);
    expect(panel).toMatch(/export let focusKey/);
    expect(panel).toMatch(/\$: if \(focusKey[^)]*\)\s*\{[\s\S]*?focusOn\(focusKey\)/);
  });

  it('the panel scrolls to the id the row renders', () => {
    const scrolled = read(PANEL).match(/getElementById\(`([\w-]+)\$\{key\}`\)/)?.[1];
    const rendered = read(ROW).match(/id="([\w-]+)\{entry\.key\}"/)?.[1];
    expect(scrolled, 'the panel no longer scrolls to a row by id').toBeTruthy();
    expect(rendered, 'the row no longer carries an id').toBeTruthy();
    expect(scrolled).toBe(rendered);
  });
});

describe('compliance obligation → Display register', () => {
  it('the row dispatches showDisplayRegister from the display duty', () => {
    expect(read(ROW)).toMatch(/isDisplayDuty\(entry\.key\)[\s\S]{0,600}dispatch\(\s*['"]showDisplayRegister['"]/);
  });

  it('the panel forwards it from every row', () => {
    // The whole tag, to its `/>` — it carries arrow functions, so `[^>]*` stops short.
    const tag = read(PANEL).match(/<RegisterRow\b[\s\S]*?\/>/)?.[0];
    expect(tag, 'the panel no longer renders RegisterRow').toBeTruthy();
    // Bare `on:showDisplayRegister` forwards; one with its own handler must re-dispatch.
    expect(tag).toMatch(/on:showDisplayRegister(?=[\s/>])/);
  });

  it('the register tab forwards it', () => {
    expect(read(REG_TAB)).toMatch(/<StatutoryTemplatePanel[^>]*on:showDisplayRegister/);
  });

  it('the shell switches to the Display register', () => {
    expect(read(SHELL)).toMatch(/on:showDisplayRegister=\{[^}]*'display-register'/);
  });
});
