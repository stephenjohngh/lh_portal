<!-- src/lib/apps/v2proto/V2ProtoApp.svelte -->
<!-- Thin tab shell: loads the store, renders tab navigation,
     and delegates to the active tab component. -->
<script>
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { v2protoStore } from './stores/v2protoStore.js';

  import TypeBrowser     from './components/TypeBrowser.svelte';
  import ComponentsTab   from './components/ComponentsTab.svelte';
  import PlanViewTab     from './components/PlanViewTab.svelte';
  import MaintenanceView from './components/MaintenanceView.svelte';
  import V2ReportsTab       from './components/V2ReportsTab.svelte';
  import V2InspectionsTab   from './components/V2InspectionsTab.svelte';

  let activeTab = 'types';

  $: store      = $v2protoStore;
  $: systems    = store.systems;
  $: types      = store.types;
  $: attrDefs   = store.attrDefs;
  $: attrOptions = store.attrOptions;
  $: regime     = store.regime;
  $: components = store.components;

  onMount(async () => {
    if ($auth.user) {
      await permissions.init($auth.user.id, 'v2proto');
    }
    await v2protoStore.load();
    await v2protoStore.loadComponents();
  });

  const TABS = [
    { id: 'types',       label: 'Type Browser',  icon: '🗂',  adminOnly: false },
    { id: 'components',  label: 'Components',     icon: '🧩',  adminOnly: false },
    { id: 'plans',       label: 'Plan View',      icon: '🗺',  adminOnly: false },
    { id: 'maintenance', label: 'Maintenance',    icon: '🔧',  adminOnly: false },
    { id: 'inspections', label: 'Inspections',    icon: '🔍',  adminOnly: false },
    { id: 'reports',     label: 'Reports',        icon: '📄',  adminOnly: false },
  ];
</script>

<div class="text-white">

  <!-- Status -->
  {#if store.loading}
    <div class="text-slate-400 text-sm mb-4">Loading type hierarchy…</div>
  {/if}

  <!-- Data model banner — shown when tables are empty -->
  {#if !store.loading && systems.length === 0}
    <div class="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300">
      <p class="font-semibold mb-1">⚠ No data found</p>
      <p>Run the Phase 1 SQL migrations (001–009) in Supabase to populate the type hierarchy.
         The seed file (009_seed_data.sql) creates 5 systems, 22 types, 19 attribute definitions,
         and 26 options.</p>
    </div>
  {/if}

  <!-- Tabs -->
  <div class="flex space-x-1 border-b border-slate-600 mb-6">
    {#each TABS as tab}
      {#if !tab.adminOnly || $permissions.isAdmin}
        <button
          class="px-4 py-2 text-sm transition-colors flex items-center gap-1.5
                 {activeTab === tab.id
                   ? 'border-b-2 border-purple-500 text-white font-semibold'
                   : 'text-slate-400 hover:text-white'}"
          on:click={() => activeTab = tab.id}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
          {#if tab.id === 'types' && types.length > 0}
            <span class="text-xs text-slate-500">({types.length})</span>
          {/if}
          {#if tab.id === 'components' && components.length > 0}
            <span class="text-xs text-slate-500">({components.length})</span>
          {/if}
        </button>
      {/if}
    {/each}
  </div>

  <!-- Tab content -->
  {#if activeTab === 'types'}
    <TypeBrowser {systems} {types} {attrDefs} {attrOptions} />
  {:else if activeTab === 'components'}
    <ComponentsTab />
  {:else if activeTab === 'plans'}
    <PlanViewTab />
  {:else if activeTab === 'maintenance'}
    <MaintenanceView {systems} {types} {regime} />
  {:else if activeTab === 'inspections'}
    <V2InspectionsTab />
  {:else if activeTab === 'reports'}
    <V2ReportsTab />
  {/if}

</div>
