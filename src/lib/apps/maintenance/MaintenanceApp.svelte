<!-- src/lib/apps/maintenance/MaintenanceApp.svelte -->
<!-- Maintenance App entry point. Tabs: Diary | All Jobs -->
<script>
  import { onMount }          from 'svelte';
  import { auth }             from '$lib/stores/auth';
  import { permissions }      from '$lib/stores/permissions';
  import { maintenanceStore } from './stores/maintenanceStore.js';
  import StatsBar  from './components/StatsBar.svelte';
  import DiaryTab  from './components/DiaryTab.svelte';
  import JobsTab   from './components/JobsTab.svelte';

  $: store = $maintenanceStore;
  $: jobs  = store.jobs;

  let activeTab = 'diary';

  const TABS = [
    { key: 'diary', label: 'Diary' },
    { key: 'jobs',  label: 'All Jobs' },
  ];

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

  <!-- Stats summary -->
  <StatsBar {jobs} />

  <!-- Tab bar -->
  <div class="flex border-b border-slate-700">
    {#each TABS as tab}
      <button
        class="tab-btn"
        class:tab-btn-active={activeTab === tab.key}
        on:click={() => activeTab = tab.key}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Tab content -->
  {#if activeTab === 'diary'}
    <DiaryTab {jobs} />
  {:else}
    <JobsTab {jobs} />
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
  .tab-btn-active { color: #e2e8f0; border-bottom-color: rgb(139 92 246); }
</style>
