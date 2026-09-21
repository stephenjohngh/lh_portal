// src/lib/apps/admin/components/obligationTabsSplit.test.js
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

const ADMIN   = 'src/lib/apps/admin/AdminApp.svelte';
const REG_TAB = 'src/lib/apps/admin/components/ComplianceObligationsTab.svelte';
const PLAN_TAB = 'src/lib/apps/admin/components/InspectionDefinitionsTab.svelte';
const PANEL   = 'src/lib/apps/admin/components/StatutoryTemplatePanel.svelte';

const PLANNED_KEY = 'planned-obligations';
const REGISTER_KEY = 'compliance-obligations';

describe('the two objects stay on two tabs', () => {
  it('gives each its own tab, and the shell renders each one', () => {
    const admin = read(ADMIN);
    for (const key of [REGISTER_KEY, PLANNED_KEY]) {
      expect(admin, `no tab keyed ${key}`).toContain(`activateTab('${key}')`);
      expect(admin, `nothing renders for ${key}`).toContain(`activeTab === '${key}'`);
    }
    expect(admin).toContain('<ComplianceObligationsTab');
    expect(admin).toContain('<InspectionDefinitionsTab');
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
    expect(read(ADMIN)).toMatch(
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
    const admin = read(ADMIN);
    const call = admin.match(/if \(id === '([^']+)' && !componentsLoaded\)/);
    expect(call, 'the lazy component load has moved or been renamed').toBeTruthy();
    expect(call[1]).toBe(PLANNED_KEY);
  });
});
