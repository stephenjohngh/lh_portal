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
});

describe('compliance obligation → Display register', () => {
  it('the panel dispatches showDisplayRegister from the display duty row', () => {
    expect(read(PANEL)).toMatch(/isDisplayDuty\(entry\.key\)[\s\S]{0,600}dispatch\(\s*['"]showDisplayRegister['"]/);
  });

  it('the register tab forwards it', () => {
    expect(read(REG_TAB)).toMatch(/<StatutoryTemplatePanel[^>]*on:showDisplayRegister/);
  });

  it('the shell switches to the Display register', () => {
    expect(read(SHELL)).toMatch(/on:showDisplayRegister=\{[^}]*'display-register'/);
  });
});
