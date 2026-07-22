<!-- src/lib/apps/maintenance/MaintenanceApp.svelte -->
<!-- Maintenance App entry point. Tabs: Diary | All Jobs | Documents | Schedule -->
<script>
  import { onMount }          from 'svelte';
  import { auth }             from '$lib/stores/auth';
  import { permissions }      from '$lib/stores/permissions';
  import { maintenanceStore } from './stores/maintenanceStore.js';
  import { maintenanceGroupsStore } from './stores/maintenanceGroupsStore.js';
  import { buildingAssetsStore }    from '$lib/apps/building_assets/stores/buildingAssetsStore.js';
  import StatsBar       from './components/StatsBar.svelte';
  import DiaryTab       from './components/DiaryTab.svelte';
  import JobsTab        from './components/JobsTab.svelte';
  import DocumentsTab   from './components/DocumentsTab.svelte';
  import SchedulerPanel from './components/SchedulerPanel.svelte';
  import MaintenanceGroupsTab from './components/MaintenanceGroupsTab.svelte';
  import TenYearPlanTab       from './components/TenYearPlanTab.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';

  $: store   = $maintenanceStore;
  $: jobs    = store.jobs;
  $: allDocs = store.allDocs;
  $: canEdit = $permissions.isAdmin;

  let activeTab = 'diary';

  // Operational horizon (day-to-day servicing) first, then the capital-planning
  // horizon (long-term asset renewal). The capital tabs are admin-only.
  $: TABS = [
    { key: 'diary',    label: 'Diary' },
    { key: 'jobs',     label: 'All Jobs' },
    { key: 'documents', label: 'Documents' },
    ...(canEdit ? [
      { key: 'schedule', label: 'Schedule' },
      { key: 'groups',   label: 'Asset Groups' },
      { key: 'capital',  label: 'Capital Plan' },
    ] : []),
  ];
  const CAPITAL_TABS = ['groups', 'capital'];

  // The capital-planning tabs need building-assets reference data (systems, types,
  // spaces, plans + components for the condition roll-up) and the group register.
  // Lazy-load it the first time either capital tab is opened.
  let capitalDataLoaded = false;
  async function activate(key) {
    activeTab = key;
    if (CAPITAL_TABS.includes(key) && !capitalDataLoaded) {
      capitalDataLoaded = true;
      await buildingAssetsStore.load();
      await buildingAssetsStore.loadComponents();
      await maintenanceGroupsStore.load();
    }
  }

  onMount(async () => {
    if ($auth.user) {
      await permissions.init($auth.user.id, 'maintenance');
      await maintenanceStore.load();
    }
  });
</script>

<div class="space-y-6">

  <!-- App header -->
  <div class="flex items-center justify-between">
    <h2 class="text-2xl font-bold text-slate-100">Maintenance</h2>
    {#if store.loading}
      <span class="text-xs text-slate-500 animate-pulse">Loading…</span>
    {/if}
  </div>

  <!-- Error banner -->
  {#if store.error}
    <div class="rounded-lg bg-red-900/20 border border-red-800/40 px-4 py-3 text-sm text-red-300">
      ⚠ {store.error}
    </div>
  {/if}

  <!-- Stats summary (hidden on documents/schedule tabs) -->
  {#if activeTab === 'diary' || activeTab === 'jobs'}
    <StatsBar {jobs} />
  {/if}

  <!-- Tab bar -->
  <div class="flex border-b border-slate-700">
    {#each TABS as tab}
      <button
        class="tab-btn"
        class:tab-btn-active={activeTab === tab.key}
        on:click={() => activate(tab.key)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Tab content -->
  {#if activeTab === 'diary'}
    <DiaryTab {jobs} />
  {:else if activeTab === 'jobs'}
    <JobsTab {jobs} />
  {:else if activeTab === 'documents'}
    <DocumentsTab docs={allDocs} />
  {:else if activeTab === 'schedule'}
    <SchedulerPanel {jobs} />
  {:else if activeTab === 'groups'}
    {#if $buildingAssetsStore.loading}
      <LoadingSpinner />
    {:else}
      <MaintenanceGroupsTab
        systems={$buildingAssetsStore.systems}
        types={$buildingAssetsStore.types}
        spaces={$buildingAssetsStore.spaces}
        floors={$buildingAssetsStore.floors}
      />
    {/if}
  {:else if activeTab === 'capital'}
    {#if $buildingAssetsStore.loading}
      <LoadingSpinner />
    {:else}
      <TenYearPlanTab
        components={$buildingAssetsStore.components}
        types={$buildingAssetsStore.types}
        spaces={$buildingAssetsStore.spaces}
        spaceOverrides={$buildingAssetsStore.spaceOverrides}
        plans={$buildingAssetsStore.plans}
      />
    {/if}
  {/if}

</div>

<style>
  .tab-btn {
    padding: 0.5rem 1.25rem; font-size: 0.875rem; font-weight: 500;
    color: #94a3b8; border-bottom: 2px solid transparent;
    background: transparent; cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
    margin-bottom: -1px;
  }
  .tab-btn:hover  { color: #cbd5e1; }
  .tab-btn-active { color: #e2e8f0; border-bottom-color: var(--lh-accent); }
</style>
