// src/lib/apps/compliance/components/obligationTabsSplit.test.js
//
// ⭐ V2 OF docs/design/compliance_vocabulary.md, guarded.
//
// The compliance register and this building's planned obligations are two
// different objects. They used to share one Admin tab, stacked, and the user's
// instruction was to separate them: *"I think UI would be better with separate
// tabs rather than sequential. For new user it is easier to differentiate."*
//
// ⛔ THE FAILURE THIS EXISTS TO CATCH IS SILENT IN BOTH DIRECTIONS.
//
//  1. Re-rendering StatutoryTemplatePanel inside the planned obligations tab
//     puts both objects back on one screen. Nothing errors; the screen just
//     quietly becomes the thing the split undid.
//
//  2. The register → plan SEQUENCE used to be carried by the scroll: you
//     applied entries and the new rows were underneath. With two tabs the only
//     thing carrying it is the apply report's "Set them up →" button, and that
//     is a THREE-HOP CHAIN — the panel dispatches `goto`, ComplianceObligationsTab
//     forwards it, AdminApp switches tab. Drop any hop and the button still
//     renders and still clicks and does nothing at all. ⚠ That is the same
//     family as the facets with no matching row display (PROJECT_STATUS §6n)
//     and the store action with no affordance (§6l): one half of a pair built,
//     nothing erroring, no guard able to see it.
//
// ⚠ These assert MECHANISM — event names, component names, tab keys — never
// wording. The words on these screens are V1's and are expected to keep moving;
// see [[feedback_assert-the-rule-not-the-sentence]].
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');

// ⚠ The shell is the COMPLIANCE app now, not Admin. These two tabs were
// never portal administration; they lived there because they grew out of
// `inspection_definitions` CRUD. docs/design/compliance_app_design.md.
const SHELL   = 'src/lib/apps/compliance/ComplianceApp.svelte';
const REG_TAB = 'src/lib/apps/compliance/components/ComplianceObligationsTab.svelte';
const PLAN_TAB = 'src/lib/apps/compliance/components/PlannedObligationsTab.svelte';
const PANEL   = 'src/lib/apps/compliance/components/StatutoryTemplatePanel.svelte';

const PLANNED_KEY = 'planned-obligations';
const REGISTER_KEY = 'compliance-obligations';

describe('the two objects stay on two tabs', () => {
  it('gives each its own tab, and the shell renders each one', () => {
    const shell = read(SHELL);
    for (const key of [REGISTER_KEY, PLANNED_KEY]) {
      expect(shell, `no tab keyed ${key}`).toContain(`'${key}'`);
      expect(shell, `nothing renders for ${key}`).toContain(`activeTab === '${key}'`);
    }
    expect(shell).toContain('<ComplianceObligationsTab');
    expect(shell).toContain('<PlannedObligationsTab');
  });

  // ⛔ AND NEITHER MAY COME BACK TO ADMIN. Admin is portal administration —
  // users, permissions, audit logs, component types. A building's compliance
  // register is not that, and it sat there only by accident of growth.
  it('leaves nothing compliance-shaped in Admin', () => {
    const admin = read('src/lib/apps/admin/AdminApp.svelte');
    expect(admin).not.toContain('<ComplianceObligationsTab');
    expect(admin).not.toContain('<PlannedObligationsTab');
    expect(admin).not.toContain('<InspectionDefinitionsTab');
  });

  // ⛔ The register belongs to ONE tab. Rendering it inside the planned
  // obligations list is how the stacked screen comes back.
  it('does not render the register inside the planned obligations tab', () => {
    expect(read(PLAN_TAB)).not.toMatch(/<StatutoryTemplatePanel/);
    expect(read(REG_TAB), 'the register tab must be the one that renders it')
      .toMatch(/<StatutoryTemplatePanel/);
  });
});

describe('the register → plan sequence survives the split', () => {
  // Hop 1: the apply report offers the onward step at all.
  it('the panel dispatches goto from the apply report', () => {
    expect(read(PANEL)).toMatch(/dispatch\(\s*['"]goto['"]/);
  });

  // Hop 2: the register tab forwards it rather than swallowing it. `on:goto`
  // with no handler is Svelte's event forwarding, which is what we want here.
  it('the register tab forwards goto to its parent', () => {
    expect(read(REG_TAB)).toMatch(/<StatutoryTemplatePanel[^>]*on:goto/s);
  });

  // Hop 3: the shell acts on it, and lands on the PLANNED tab specifically —
  // a handler that switched to the wrong tab would be just as silent.
  it('the shell handles goto by switching to the planned obligations tab', () => {
    expect(read(SHELL)).toMatch(
      new RegExp(`<ComplianceObligationsTab[^>]*on:goto=\\{[^}]*activateTab\\('${PLANNED_KEY}'\\)`, 's'),
    );
  });
});

describe('the component set loads where it is actually needed', () => {
  // ⭐ The split made the register tab cheap: StatutoryTemplatePanel reads no
  // component data, so opening it should not drag in 1,092 components, their
  // attributes and their latest inspections. If this ever fails, check whether
  // the panel genuinely started needing them before relaxing it — the point is
  // that the cost follows the need, not that the call is forbidden.
  it('the register panel reads no component data', () => {
    const panel = read(PANEL);
    expect(panel).not.toMatch(/buildingAssetsStore/);
  });

  it('only the planned obligations tab triggers the component load', () => {
    const shell = read(SHELL);
    const guarded = shell.match(/key === '([^']+)'\) \{[\s\S]*?loadComponents\(\)/);
    expect(guarded, 'the lazy component load has moved or been renamed').toBeTruthy();
    expect(guarded[1]).toBe(PLANNED_KEY);
    // ⚠ And Admin must not have kept a copy — it has no scope editor now.
    expect(read('src/lib/apps/admin/AdminApp.svelte')).not.toContain('loadComponents()');
  });
});
