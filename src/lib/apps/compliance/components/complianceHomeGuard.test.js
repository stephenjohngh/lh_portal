// src/lib/apps/compliance/components/complianceHomeGuard.test.js
//
// ⭐ C3 — docs/design/compliance_app_design.md §6.1 and §7, guarded.
//
// The compliance domain now has one home. Three separate things had to be true
// for that to mean anything, and each of them fails SILENTLY:
//
//  1. ⛔ THE NAME COLLISION IS GONE. While the position report sat in
//     Maintenance, the portal had a Compliance app AND a Maintenance →
//     Compliance tab meaning different things — which is the exact
//     two-things-one-word fault the vocabulary work exists to end. Nothing
//     errors if somebody adds it back; the portal just quietly becomes
//     ambiguous again.
//
//  2. ⛔ THE COMPLIANCE APP DOES NOT WRITE ANOTHER APP'S DATA, and does not
//     read one behind its owner's back. It reads walk sessions, jobs and
//     components through each owning app's `public.js`. *Aggregate, do not
//     centralise* — the rule that killed the polymorphic action tracker and
//     declined G4. A direct `api.` call here would work perfectly and be
//     invisible.
//
//  3. ⛔ CORRECTIVE WORK IS NEVER SUMMED WITH THE OBLIGATION FIGURES. A
//     building with every cycle on schedule and nine failed components is not
//     compliant-and-tidy. Adding them would produce a number that looks better
//     and says less — "reads plausibly while saying something untrue".
//
// ⚠ These assert MECHANISM — imports, tab keys, which variable feeds which —
// never wording. The words are V1's and are expected to keep moving.
// [[feedback_assert-the-rule-not-the-sentence]]
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');

const SHELL    = 'src/lib/apps/compliance/ComplianceApp.svelte';
const POSITION = 'src/lib/apps/compliance/components/CompliancePositionTab.svelte';
const MAINT    = 'src/lib/apps/maintenance/MaintenanceApp.svelte';
const WALKS    = 'src/lib/apps/compliance/components/InspectionWalksTab.svelte';
const BA       = 'src/lib/apps/building_assets/BuildingAssetsApp.svelte';
const ADMIN    = 'src/lib/apps/admin/AdminApp.svelte';

describe('one thing is called Compliance', () => {
  it('Maintenance has no Compliance tab', () => {
    const maint = read(MAINT);
    // The tab list, not the prose: the file's header explains at length why
    // there is no such tab, and a bare substring search would match that.
    const tabs = maint.match(/\$: TABS = \[[\s\S]*?\];/);
    expect(tabs, 'the Maintenance tab list has moved or been renamed').toBeTruthy();
    expect(tabs[0]).not.toMatch(/compliance/i);
    expect(maint).not.toContain('<ComplianceTab');
  });

  it('the position report is rendered by the Compliance app', () => {
    const shell = read(SHELL);
    expect(shell).toContain('<CompliancePositionTab');
    expect(shell).toContain("'compliance-position'");
    expect(shell).toMatch(/activeTab === 'compliance-position'/);
  });

  // The BSA s.82 display duty came here in the same change — a statutory duty
  // discharged on a notice board is not portal administration either.
  it('the display register is in Compliance and not in Admin', () => {
    expect(read(SHELL)).toContain('<DisplayRegisterTab');
    expect(read(ADMIN)).not.toContain('DisplayRegisterTab');
    expect(read(ADMIN)).not.toContain("'display-register'");
  });
});

describe('every evidence source is read through its owner', () => {
  const src = read(POSITION);

  it('walk sessions come from the Inspection app', () => {
    expect(src).toMatch(/listWalkSessions[\s\S]*?from '\$lib\/apps\/inspection\/public\.js'/);
  });

  it('maintenance jobs come from the Maintenance app', () => {
    expect(src).toMatch(/listJobEvidence[\s\S]*?from '\$lib\/apps\/maintenance\/public\.js'/);
  });

  it('components and works lines come from Building Assets', () => {
    expect(src).toMatch(
      /listComponentsByStatus[\s\S]*?listWorksLinesFor[\s\S]*?from '\$lib\/apps\/building_assets\/public\.js'/);
  });

  // ⛔ And nothing reaches round the back. A direct table read would work and
  // would tell nobody; the point of a public.js is that reading it lists every
  // cross-app consumer.
  it('does not touch another app’s store or the api wrapper directly', () => {
    expect(src).not.toMatch(/from '\$lib\/utils\/api'/);
    expect(src).not.toMatch(/maintenanceStore/);
    expect(src).not.toMatch(/buildingAssetsStore/);
    expect(src).not.toMatch(/inspectionStore/);
  });

  // ⚠ Each source fails ALONE (Cross_App_Aggregation_Spec.md). Losing one
  // degrades the report and says so in a note that also reaches the Word
  // document; it must never empty it or throw.
  it('each cross-app read is gated on the reader’s permission for the owning app', () => {
    for (const app of ['inspection', 'maintenance', 'building_assets']) {
      expect(src, `no permission gate for ${app}`)
        .toMatch(new RegExp(`appPermissions\\?\\.${app}\\?\\.hasAccess`));
    }
  });

  it('a missing evidence stream produces a note the document also prints', () => {
    expect(src).toMatch(/walkEvidenceNote/);
    expect(src).toMatch(/jobEvidenceNote/);
    // Both reach the export, not just the screen — a document silently missing
    // an evidence stream is worse than a screen missing one, because it
    // outlives the person who generated it.
    expect(src).toMatch(/evidenceNotes:\s*\[walkEvidenceNote,\s*jobEvidenceNote\]/);
  });
});

describe('corrective work stays beside the position, never inside it', () => {
  const src = read(POSITION);

  // ⚠ Asserts what must be ABSENT from each derivation, not what each one
  // says. Pinning the exact expression would fail the next time somebody
  // renames a variable, while the rule stayed perfectly satisfied — the
  // mistake this project has now made nine times.
  it('no obligation figure is derived from the fault data', () => {
    for (const [what, re] of [
      ['summary', /\$: summary = .*/],
      ['events',  /\$: events = .*/],
      ['allRows', /\$: allRows = .*/],
      ['rows',    /\$: rows = [\s\S]*?\), sort\);/],
    ]) {
      const line = src.match(re)?.[0];
      expect(line, `the ${what} derivation has moved or been renamed`).toBeTruthy();
      expect(line, `${what} must not read the fault data`)
        .not.toMatch(/corrective|faults|worksLines/);
    }
    // And the fault band is derived from the fault data ALONE — if this ever
    // reads an obligation row the two have started to mix in the other
    // direction.
    const band = src.match(/\$: corrective = .*/)?.[0];
    expect(band, 'the corrective band has moved').toBeTruthy();
    expect(band).not.toMatch(/allRows|obligations|summary/);
  });

  it('the exported document carries the obligation rows only', () => {
    const body = src.match(/body: JSON\.stringify\(\{[\s\S]*?\}\),/)?.[0];
    expect(body, 'the export payload has moved').toBeTruthy();
    expect(body).not.toMatch(/corrective|faults\b/);
  });
});


// ⭐ C4 — the walk-evidence history, out of Building Assets (design doc §1.1).
describe('the walk evidence lives with the compliance domain', () => {
  it('Building Assets has no inspections tab', () => {
    const ba = read(BA);
    const tabs = ba.match(/const TABS = \[[\s\S]*?\];/);
    expect(tabs, 'the Building Assets tab list has moved or been renamed').toBeTruthy();
    // ⚠ The tab LIST, not the file: its header now explains at length why
    // there is no such tab, and a bare substring search would match that.
    expect(tabs[0]).not.toMatch(/inspection/i);
    expect(ba).not.toContain('<InspectionsTab');
  });

  it('the Compliance app renders it', () => {
    const shell = read(SHELL);
    expect(shell).toContain('<InspectionWalksTab');
    expect(shell).toMatch(/activeTab === 'inspection-walks'/);
  });

  // ⛔ The reason it moved. It renders another app's records, so it must keep
  // reaching them through that app's door — a direct `api.from('walk_sessions')`
  // here would work perfectly and tell nobody.
  it('reaches walk sessions only through the Inspection app', () => {
    const src = read(WALKS);
    expect(src).toMatch(/from '\$lib\/apps\/inspection\/public\.js'/);
    // ⚠ Asserts the two things you would NEED to query a table, not the
    // table's name: the header legitimately says "backed by `walk_sessions`",
    // and banning the word would be asserting the prose rather than the rule.
    expect(src, 'a direct api import is a way round the owning app').not.toMatch(/from '\$lib\/utils\/api'/);
    expect(src, 'a direct supabase client is the same thing').not.toMatch(/from '\$lib\/supabaseClient'/);
  });

  // ⚠ What it MAY read directly, stated so the rule above cannot be read as
  // wider than it is: floors and component types are shared reference data,
  // `lookups.js` is a pure helper that imports nothing, and the chips are
  // presentational. The line is between REFERENCE DATA and another app's
  // RECORDS, not between apps.
  it('lookups stays a pure helper, so importing it crosses nothing', () => {
    const lookups = read('src/lib/apps/building_assets/lookups.js');
    expect(lookups, 'lookups.js has acquired an import — it can no longer be shared freely')
      .not.toMatch(/^\s*import\s/m);
  });

  // ⚠ The component-shaped question stays in the app that owns components.
  it('leaves the per-component history in Building Assets', () => {
    const panel = read('src/lib/apps/building_assets/components/ComponentDetailPanel.svelte');
    expect(panel).toContain('ComponentInspectionHistory');
  });
});
