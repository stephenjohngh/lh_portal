<!-- src/lib/apps/v2proto/V2ProtoApp.svelte -->
<!-- Prototype demonstrating the v2 data model: component_types, type_attributes,
     type_attribute_options, components, component_attributes, maintenance_regime -->
<script>
  import { onMount } from 'svelte';
  import { v2protoStore } from './stores/v2protoStore.js';

  import TypeBrowser      from './components/TypeBrowser.svelte';
  import ComponentForm    from './components/ComponentForm.svelte';
  import ComponentCard    from './components/ComponentCard.svelte';
  import MaintenanceView  from './components/MaintenanceView.svelte';
  import AdminTab         from './components/admin/AdminTab.svelte';

  let activeTab      = 'types';
  let showForm       = false;
  let saving         = false;
  let filterPlanId   = '';
  let errorMsg       = '';

  $: store         = $v2protoStore;
  $: systems       = store.systems;
  $: types         = store.types;
  $: attrDefs      = store.attrDefs;
  $: attrOptions   = store.attrOptions;
  $: regime        = store.regime;
  $: plans         = store.plans;
  $: components    = store.components;
  $: componentAttrs = store.componentAttrs;

  onMount(async () => {
    await v2protoStore.load();
    // Load all components initially
    await v2protoStore.loadComponents();
  });

  // Reload components when plan filter changes
  async function onPlanFilterChange() {
    await v2protoStore.loadComponents(filterPlanId || null);
  }

  async function handleSubmit(e) {
    const { fields, attrValues } = e.detail;
    saving = true;
    errorMsg = '';
    try {
      await v2protoStore.createComponent(fields, attrValues);
      showForm = false;
      // Refresh component list
      await v2protoStore.loadComponents(filterPlanId || null);
    } catch (err) {
      errorMsg = err.message;
    } finally {
      saving = false;
    }
  }

  async function handleDelete(e) {
    const { id } = e.detail;
    try {
      await v2protoStore.deleteComponent(id);
    } catch (err) {
      errorMsg = err.message;
    }
  }

  const TABS = [
    { id: 'types',       label: 'Type Browser',  icon: '🗂' },
    { id: 'components',  label: 'Components',     icon: '🧩' },
    { id: 'maintenance', label: 'Maintenance',    icon: '🔧' },
    { id: 'admin',       label: 'Admin',          icon: '⚙' }
  ];
</script>

<div class="text-white">

  <!-- Header -->
  <div class="mb-6">
    <div class="flex items-center gap-3 mb-1">
      <span class="text-2xl">🧪</span>
      <h1 class="text-2xl font-bold">V2 Prototype</h1>
      <span class="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-medium">
        PROTOTYPE
      </span>
    </div>
    <p class="text-slate-400 text-sm ml-10">
      Demonstrating the new data model: System → Type → Attribute Definitions → Options,
      with dynamic component attribute forms and maintenance regime filtering.
    </p>
  </div>

  <!-- Status / error -->
  {#if store.loading}
    <div class="text-slate-400 text-sm mb-4">Loading type hierarchy…</div>
  {/if}
  {#if errorMsg}
    <div class="mb-4 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-sm">
      {errorMsg}
      <button class="ml-2 underline" on:click={() => errorMsg = ''}>dismiss</button>
    </div>
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

  <!-- ── Tab: Type Browser ─────────────────────────────────────────── -->
  {#if activeTab === 'types'}
    <TypeBrowser
      {systems}
      {types}
      {attrDefs}
      {attrOptions}
    />

  <!-- ── Tab: Components ──────────────────────────────────────────── -->
  {:else if activeTab === 'components'}

    {#if showForm}
      <!-- Component creation form -->
      <div class="max-w-2xl bg-slate-800 rounded-xl border border-slate-700 p-6">
        <ComponentForm
          {types}
          {systems}
          {attrDefs}
          {attrOptions}
          {plans}
          {saving}
          on:submit={handleSubmit}
          on:cancel={() => { showForm = false; errorMsg = ''; }}
        />
      </div>

    {:else}
      <!-- Toolbar -->
      <div class="flex items-center gap-4 mb-4">
        <div class="flex items-center gap-2">
          <label class="text-sm text-slate-400">Plan:</label>
          <select
            bind:value={filterPlanId}
            on:change={onPlanFilterChange}
            class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                   focus:outline-none focus:border-purple-500"
          >
            <option value="">All plans</option>
            {#each plans as p}
              <option value={p.id}>{p.building} — {p.name}</option>
            {/each}
          </select>
        </div>

        <button
          on:click={() => { showForm = true; errorMsg = ''; }}
          disabled={plans.length === 0 || types.length === 0}
          class="ml-auto px-4 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-500
                 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors
                 flex items-center gap-2"
        >
          <span>+</span> New Component
        </button>
      </div>

      <!-- Component list -->
      {#if store.loadingComponents}
        <p class="text-slate-500 text-sm">Loading components…</p>
      {:else if components.length === 0}
        <div class="text-center py-16 text-slate-500">
          <p class="text-4xl mb-3">🧩</p>
          <p class="text-lg mb-1">No components yet</p>
          <p class="text-sm">
            {plans.length === 0
              ? 'Create a floor plan in the Plans app first, then come back here.'
              : 'Click "New Component" to create one using the new data model.'}
          </p>
        </div>
      {:else}
        <div class="flex flex-col gap-3">
          {#each components as c (c.id)}
            <ComponentCard
              component={c}
              {types}
              {attrDefs}
              attrs={componentAttrs[c.id] ?? []}
              on:delete={handleDelete}
            />
          {/each}
        </div>
      {/if}
    {/if}

  <!-- ── Tab: Maintenance ──────────────────────────────────────────── -->
  {:else if activeTab === 'maintenance'}
    <MaintenanceView
      {systems}
      {types}
      {regime}
    />

  <!-- ── Tab: Admin ────────────────────────────────────────────────── -->
  {:else if activeTab === 'admin'}
    <AdminTab />
  {/if}

</div>
