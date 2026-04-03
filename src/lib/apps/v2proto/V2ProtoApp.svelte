<!-- src/lib/apps/v2proto/V2ProtoApp.svelte -->
<!-- Thin tab shell: loads the store, renders tab navigation,
     and delegates to the active tab component. -->
<script>
  import { onMount } from 'svelte';
  import { v2protoStore } from './stores/v2protoStore.js';

  import TypeBrowser     from './components/TypeBrowser.svelte';
  import ComponentsTab   from './components/ComponentsTab.svelte';
  import PlanViewTab     from './components/PlanViewTab.svelte';
  import MaintenanceView from './components/MaintenanceView.svelte';
  import AdminTab        from './components/admin/AdminTab.svelte';
  import V2ReportsTab    from './components/V2ReportsTab.svelte';

  let activeTab = 'types';

  $: store      = $v2protoStore;
  $: systems    = store.systems;
  $: types      = store.types;
  $: attrDefs   = store.attrDefs;
  $: attrOptions = store.attrOptions;
  $: regime     = store.regime;
  $: components = store.components;

  onMount(async () => {
    await v2protoStore.load();
    await v2protoStore.loadComponents();
  });

  const TABS = [
    { id: 'types',       label: 'Type Browser',  icon: '🗂' },
    { id: 'components',  label: 'Components',     icon: '🧩' },
    { id: 'plans',       label: 'Plan View',      icon: '🗺' },
    { id: 'maintenance', label: 'Maintenance',    icon: '🔧' },
    { id: 'reports',     label: 'Reports',        icon: '📄' },
    { id: 'admin',       label: 'Admin',          icon: '⚙' }
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
  {:else if activeTab === 'reports'}
    <V2ReportsTab />
  {:else if activeTab === 'admin'}
    <AdminTab />
  {/if}

</div>
