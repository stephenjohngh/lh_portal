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

  // ⛔ ADMIN ONLY, decided by the user 2026-09-21: "im happy for everything to
  // be admin only. dont want another user type." The app is registered with
  // `requiresPermission`, and admins bypass grants — but that is a convention
  // rather than a guarantee, so the shell enforces it too. No new permission
  // tier, no RLS redesign.
  $: isAdmin = $permissions.isAdmin;

  /** @type {'compliance-obligations'|'planned-obligations'} */
  let activeTab = 'compliance-obligations';
  let assetsStoreLoaded = false;   // lazy — types/attrs, for the scope editor
  let componentsLoaded  = false;   // lazy — the 1,092-component set

  const TABS = [
    { key: 'compliance-obligations', icon: '🔎', label: 'Compliance obligations' },
    { key: 'planned-obligations',    icon: '🗓', label: 'Planned obligations' },
  ];

  // ⭐ THE COMPONENT SET LOADS ONLY WHERE IT IS NEEDED. The register reads no
  // component data at all — coverage comes from `statutory_obligations.template_key`
  // — so opening this app does not drag in 1,092 components, their attributes
  // and their latest inspections. Only the planned obligations tab does, for
  // the per-row match count and the scope editor. Discovered when the two were
  // split apart: the cost had been attributed to a deliberate trade and in
  // fact belonged to the layout. PROJECT_STATUS §6gg.
  async function activateTab(key) {
    activeTab = key;
    if (key === 'planned-obligations') {
      if (!assetsStoreLoaded) { assetsStoreLoaded = true; await buildingAssetsStore.load(); }
      if (!componentsLoaded)  { componentsLoaded  = true; await buildingAssetsStore.loadComponents(); }
    }
  }

  onMount(async () => {
    if ($auth.user) await permissions.init($auth.user.id, 'compliance');
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

  {#if !isAdmin}
    <!-- ⚠ Not an error state. There is ONE admin account today, so this is the
         position every other account is in, and it must read as a permission
         rather than as a fault. -->
    <p class="empty">Compliance is restricted to administrators.</p>
  {:else}
    <div class="flex space-x-2 border-b border-slate-600">
      {#each TABS as t (t.key)}
        <button
          class="px-4 py-2 transition-colors {activeTab === t.key
            ? 'border-b-2 border-purple-500 text-white font-semibold'
            : 'text-gray-400 hover:text-white'}"
          on:click={() => activateTab(t.key)}
        >
          <span class="flex items-center space-x-2">
            <span>{t.icon}</span><span>{t.label}</span>
          </span>
        </button>
      {/each}
    </div>

    {#if activeTab === 'compliance-obligations'}
      <!-- ⚠ No buildingAssetsStore gate: the register reads no component data,
           so waiting on a load it never uses would be a spinner in front of a
           screen that was already ready. -->
      <ComplianceObligationsTab on:goto={() => activateTab('planned-obligations')} />
    {:else if activeTab === 'planned-obligations'}
      {#if $buildingAssetsStore.loading}
        <LoadingSpinner />
      {:else}
        <PlannedObligationsTab />
      {/if}
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
