<!-- src/lib/apps/compliance/ComplianceApp.svelte -->
<!-- Compliance — the building's obligations and what it does about them.
     Design: docs/design/compliance_app_design.md. Vocabulary, which decides
     every noun on these screens: docs/design/compliance_vocabulary.md.

     ⭐ WHY THIS APP EXISTS. The register and the planned obligations had no
     owning app: they lived under Admin because they grew out of
     `inspection_definitions` CRUD, and Admin is portal administration — users,
     permissions, audit logs, component types. A building's compliance register
     is not portal administration. The evidence surface had the same problem
     one app over: Building Assets → Inspections rendered the INSPECTION app's
     data with the Inspection app's helpers, so it was homeless rather than
     misnamed. PROJECT_STATUS §6ll.

     ⛔ THIS IS NOT EXT-8, THE ASSURANCE HUB, and the distinction is the most
     important line in the design doc. EXT-8 is oversight — the PAP review
     chain, recurrence detection, governance versus administration — it reads
     half the portal, it is scoped "Large, and it may be hub 3", and a third
     cross-app hub needs explicit approval. This app OWNS two tables that
     already existed and reads evidence through `public.js`, exactly as
     Maintenance's compliance report already does. It is not a hub and needs no
     hub approval. Do not merge the two pieces of work.

     ⛔ WHAT IT OWNS: `statutory_register`, `statutory_obligations`,
     `statutory_exclusions`.
     ⛔ WHAT IT MUST NEVER OWN: walk sessions, maintenance jobs, components,
     complaints. It LINKS to them through the owning app's `public.js`.
     *Aggregate, do not centralise* — the rule that killed the polymorphic
     action tracker and that declined G4. A compliance record may point at an
     app's record; it may never replace one. -->
<script>
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { buildingAssetsStore } from '$lib/apps/building_assets/stores/buildingAssetsStore.js';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import ComplianceObligationsTab from './components/ComplianceObligationsTab.svelte';
  import PlannedObligationsTab from './components/PlannedObligationsTab.svelte';
  import CompliancePositionTab from './components/CompliancePositionTab.svelte';
  import DisplayRegisterTab from './components/DisplayRegisterTab.svelte';
  import InspectionWalksTab from './components/InspectionWalksTab.svelte';

  // ⭐ ACCESS, decided by the user 2026-09-23 — the Building Assets pattern:
  // *"define compliance access from normal user access screen but hide the
  // compliance registers behind admin only gates. then the caretaker doing
  // walk can see his own records."*
  //   · The APP is granted per user on Admin → Users, like any other.
  //   · Every tab is admin-only EXCEPT Inspection walks.
  //   · "His own records" is enforced by the DATABASE, not here: walk_sessions
  //     SELECT is `created_by = auth.uid() OR is_admin`, so a non-admin's list
  //     holds only the walks they did. Delete stays admin-only (ProtectedButton).
  // This replaces the 2026-09-21 "everything admin only", which C4 had quietly
  // extended to the walk record that four Building Assets users used to see.
  // Still no new user type and no RLS change.
  $: isAdmin = $permissions.isAdmin;
  $: hasAccess = isAdmin || !!$permissions.appPermissions?.compliance?.hasAccess;

  /** @type {'compliance-obligations'|'planned-obligations'|'compliance-position'|'inspection-walks'|'display-register'} */
  let activeTab = 'compliance-obligations';
  const NON_ADMIN_TAB = 'inspection-walks';
  let assetsStoreLoaded = false;   // lazy — types/attrs, for the scope editor
  let componentsLoaded  = false;   // lazy — the 1,092-component set

  const TABS = [
    { key: 'compliance-obligations', icon: '🔎', label: 'Compliance obligations', adminOnly: true },
    { key: 'planned-obligations',    icon: '🗓', label: 'Planned obligations',    adminOnly: true },
    // ⭐ Third, and the order is the argument the app makes: what must be done,
    // what this building plans to do about it, then whether it happened. The
    // position tab moved here from Maintenance (C3) — it was a compliance
    // report living where ONE of its three evidence sources lives.
    { key: 'compliance-position',    icon: '📊', label: 'Compliance position',    adminOnly: true },
    // ⭐ The in-house half of the evidence, one row per WALK. ⚠ Not the same
    // object as the position tab's *Evidence history*, which is a dated list
    // across BOTH routes per planned obligation — hence naming this after the
    // walk rather than after the word "evidence". It moved out of Building
    // Assets in C4: it renders the Inspection app's data with the Inspection
    // app's helpers, so it was homeless there rather than misnamed.
    { key: 'inspection-walks',       icon: '🔍', label: 'Inspection walks' },
    // ⚠ LAST, AND UNLIKE THE OTHER THREE. BSA s.82 is a duty discharged on a
    // notice board rather than by a cycle, so it has no plan, no evidence
    // stream and no cadence — the user's own read was *"compliance although
    // not much like anything else."* It is here because it is a statutory
    // duty of this building and was never portal administration, and it is
    // last because nothing flows into or out of it.
    { key: 'display-register',       icon: '📌', label: 'Display register',       adminOnly: true },
  ];

  $: visibleTabs = isAdmin ? TABS : TABS.filter((t) => !t.adminOnly);
  // ⛔ Enforced on the ACTIVE tab, not only on the buttons: an admin-only tab
  // reached any other way (a link, a stale value) falls back to the walks.
  $: if (permissionsChecked && !isAdmin && TABS.find((t) => t.key === activeTab)?.adminOnly) {
    activateTab(NON_ADMIN_TAB);
  }

  // ⭐ THE COMPONENT SET LOADS ONLY WHERE IT IS NEEDED. The register reads no
  // component data at all — coverage comes from `statutory_obligations.template_key`
  // — so opening this app does not drag in 1,092 components, their attributes
  // and their latest inspections. Only the planned obligations tab does, for
  // the per-row match count and the scope editor. Discovered when the two were
  // split apart: the cost had been attributed to a deliberate trade and in
  // fact belonged to the layout. PROJECT_STATUS §6gg.
  async function activateTab(key) {
    activeTab = key;
    // ⚠ TWO tabs need Building Assets reference data (floors, types,
    // attribute definitions) and only ONE needs the 1,092-component set. The
    // split is deliberate: the walks tab renders component names that already
    // arrive joined on its own query, so dragging in every component to show
    // a list of five walks would be the cost §6gg removed from the register.
    if (key === 'planned-obligations' || key === 'inspection-walks') {
      if (!assetsStoreLoaded) { assetsStoreLoaded = true; await buildingAssetsStore.load(); }
    }
    if (key === 'planned-obligations' && !componentsLoaded) {
      componentsLoaded = true;
      await buildingAssetsStore.loadComponents();
    }
  }

  // ⚠ `isAdmin` reads false until permissions.init resolves, so without this
  // the "restricted" notice flashed on every open, even for the admin — and a
  // first-time tester reads that as a permission fault. Admin never showed it
  // only because its Users tab is visible to everyone. Nothing is decided
  // until the check has actually run.
  let permissionsChecked = false;

  // The s.82 link runs both ways between the register and the Display register
  // (utils/displayRegisterLink.js). `focusKey` is the register row to open on
  // arrival; a plain tab click clears it, so returning to the tab later does
  // not re-open a row nobody asked for.
  let focusKey = null;
  function openTab(key) {
    focusKey = null;
    activateTab(key);
  }
  function showObligation(key) {
    focusKey = key;
    activateTab('compliance-obligations');
  }

  onMount(async () => {
    try {
      if ($auth.user) await permissions.init($auth.user.id, 'compliance');
    } finally {
      permissionsChecked = true;
    }
  });
</script>

<div class="space-y-4">
  <div>
    <h2 class="heading-page">Compliance</h2>
    <p class="text-muted">
      What a building of this kind must do, what this building does about it,
      and the evidence that it happened.
    </p>
  </div>

  {#if !hasAccess && !permissionsChecked}
    <LoadingSpinner />
  {:else if !hasAccess}
    <!-- ⚠ Not an error state: the app has not been granted to this account.
         It must read as a permission rather than as a fault. -->
    <p class="empty">You do not have access to Compliance. An administrator can grant it under Admin → Users.</p>
  {:else}
    <div class="flex space-x-2 border-b border-slate-600">
      {#each visibleTabs as t (t.key)}
        <button
          class="px-4 py-2 transition-colors {activeTab === t.key
            ? 'border-b-2 border-purple-500 text-white font-semibold'
            : 'text-gray-400 hover:text-white'}"
          on:click={() => openTab(t.key)}
        >
          <span class="flex items-center space-x-2">
            <span>{t.icon}</span><span>{t.label}</span>
          </span>
        </button>
      {/each}
    </div>

    {#if isAdmin && activeTab === 'compliance-obligations'}
      <!-- ⚠ No buildingAssetsStore gate: the register reads no component data,
           so waiting on a load it never uses would be a spinner in front of a
           screen that was already ready. -->
      <ComplianceObligationsTab
        on:goto={() => activateTab('planned-obligations')}
        on:showDisplayRegister={() => openTab('display-register')}
        {focusKey}
      />
    {:else if isAdmin && activeTab === 'planned-obligations'}
      {#if $buildingAssetsStore.loading}
        <LoadingSpinner />
      {:else}
        <PlannedObligationsTab />
      {/if}
    {:else if activeTab === 'inspection-walks'}
      <!-- ⚠ It reads floors and component types off buildingAssetsStore as
           shared reference data, so it waits on the same load the planned tab
           does — but NOT on the 1,092-component set, which it never touches. -->
      {#if $buildingAssetsStore.loading}
        <LoadingSpinner />
      {:else}
        <InspectionWalksTab />
      {/if}
    {:else if isAdmin && activeTab === 'display-register'}
      <DisplayRegisterTab on:showObligation={(e) => showObligation(e.detail)} />
    {:else if isAdmin && activeTab === 'compliance-position'}
      <!-- ⚠ Also no store gate. It loads its own three evidence streams and its
           own fault list through each owning app's public.js, each failing
           alone — so a spinner here would be waiting on a store it never
           reads. -->
      <CompliancePositionTab />
    {/if}
  {/if}
</div>

<style>
  .empty {
    padding: 1.5rem; text-align: center; color: rgb(148 163 184);
    background: rgb(30 41 59 / 0.3); border: 1px solid rgb(71 85 105 / 0.5);
    border-radius: 10px;
  }
</style>
