<!-- src/lib/apps/admin/components/AuditLogsView.svelte -->
<!-- Main audit logs view with filtering, search, and statistics.
     Layout strategy: dashboard and full filter panel are collapsed by default
     so results are visible immediately. The most-used controls (search, app,
     flagged) live in an always-visible toolbar; advanced filters expand on demand. -->
<script>
  import { onMount } from 'svelte';
  import { auditLogsStore } from '../stores/auditLogsStore';
  import AuditLogFilters from './AuditLogFilters.svelte';
  import AuditLogCard from './AuditLogCard.svelte';
  import AuditDashboard from './AuditDashboard.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  let filters = {
    appId:         null,
    userId:        null,
    eventType:     null,
    eventCategory: null,
    severity:      null,
    startDate:     null,
    endDate:       null,
    search:        '',
    flaggedOnly:   false,
    limit:         50,
    offset:        0
  };

  // Both panels collapsed by default — results-first layout
  let showDashboard   = false;
  let showFilters     = false;
  let selectedLogs    = new Set();
  let showBulkActions = false;
  let localError      = '';

  // Quick app dropdown — kept in sync with AuditLogFilters' canonical list
  const quickApps = [
    { value: null,              label: 'All apps' },
    { value: 'admin',           label: '👥 Admin / Users' },
    { value: 'issues',          label: '📋 Issues' },
    { value: 'building_assets', label: '🏢 Building Assets' },
    { value: 'inspection',      label: '🚶 Inspection' },
    { value: 'maintenance',     label: '🔧 Maintenance' },
    { value: 'mobileplan',      label: '📱 Mobile Plan' },
    { value: 'users',           label: '👥 Users (legacy)' },
    { value: 'plans',           label: '🗺 Floor Plans (legacy)' }
  ];

  $: ({ logs, loading, error, totalCount, hasMore } = $auditLogsStore);
  $: showBulkActions = selectedLogs.size > 0;

  // Count of active advanced filters (excludes the toolbar trio: search/appId/flaggedOnly)
  $: advancedFilterCount = [
    filters.eventType, filters.eventCategory, filters.severity,
    filters.startDate, filters.endDate
  ].filter(v => v != null && v !== '').length;

  $: hasAnyFilter = !!(
    filters.search || filters.appId || filters.eventType ||
    filters.eventCategory || filters.severity ||
    filters.startDate || filters.endDate || filters.flaggedOnly
  );

  onMount(() => {
    auditLogsStore.fetchLogs(filters);
  });

  function handleFilterChange() {
    filters.offset = 0;
    selectedLogs.clear();
    selectedLogs = selectedLogs;
    auditLogsStore.reset();
    auditLogsStore.fetchLogs(filters);
  }

  function handleLoadMore() {
    auditLogsStore.loadMore();
  }

  async function handleExport() {
    try {
      await auditLogsStore.exportToCSV(filters);
    } catch (err) {
      localError = err.message;
    }
  }

  function clearAllFilters() {
    filters = {
      ...filters,
      appId: null, userId: null, eventType: null, eventCategory: null,
      severity: null, startDate: null, endDate: null, search: '', flaggedOnly: false,
      offset: 0
    };
    handleFilterChange();
  }

  function toggleSelectAll() {
    if (selectedLogs.size === logs.length) {
      selectedLogs.clear();
    } else {
      logs.forEach(log => selectedLogs.add(log.id));
    }
    selectedLogs = selectedLogs;
  }

  function toggleSelect(logId) {
    if (selectedLogs.has(logId)) { selectedLogs.delete(logId); }
    else                          { selectedLogs.add(logId);    }
    selectedLogs = selectedLogs;
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selectedLogs.size} audit logs? This cannot be undone.`)) return;
    try {
      await auditLogsStore.deleteLogs(Array.from(selectedLogs));
      selectedLogs.clear();
      selectedLogs = selectedLogs;
    } catch (err) {
      localError = err.message;
    }
  }

  async function handleDeleteLog(logId) {
    if (!confirm('Delete this audit log? This cannot be undone.')) return;
    try {
      await auditLogsStore.deleteLog(logId);
    } catch (err) {
      localError = err.message;
    }
  }

  async function handleFlagLog(logId, reason) {
    try { await auditLogsStore.flagLog(logId, reason); }
    catch (err) { localError = err.message; }
  }

  async function handleUnflagLog(logId) {
    try { await auditLogsStore.unflagLog(logId); }
    catch (err) { localError = err.message; }
  }
</script>

<div class="app-container">
  <!-- Compact header -->
  <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
    <h2 class="heading-page mb-0">Audit Logs</h2>
    <div class="flex items-center gap-2 flex-wrap">
      <Button
        variant="secondary"
        size="small"
        icon="chart"
        on:click={() => showDashboard = !showDashboard}
      >
        {showDashboard ? 'Hide stats' : 'Stats'}
      </Button>
      <Button
        variant="secondary"
        size="small"
        icon="settings"
        on:click={() => showFilters = !showFilters}
      >
        {showFilters ? 'Hide filters' : 'Filters'}{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ''}
      </Button>
      <Button variant="primary" size="small" icon="download" on:click={handleExport}>
        Export CSV
      </Button>
    </div>
  </div>

  <!-- Inline toolbar — search + app + flagged, always visible -->
  <div class="bg-slate-700/40 border border-slate-600 rounded-lg px-3 py-2 mb-3 flex items-center gap-2 flex-wrap">
    <input
      type="text"
      bind:value={filters.search}
      on:input={handleFilterChange}
      placeholder="Search by user email or target name…"
      class="flex-1 min-w-[200px] px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
    />
    <select
      bind:value={filters.appId}
      on:change={handleFilterChange}
      class="text-sm bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
    >
      {#each quickApps as app}
        <option value={app.value}>{app.label}</option>
      {/each}
    </select>
    <label class="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer select-none px-2">
      <input
        type="checkbox"
        bind:checked={filters.flaggedOnly}
        on:change={handleFilterChange}
        class="checkbox"
      />
      🚩 Flagged
    </label>
    {#if hasAnyFilter}
      <button
        on:click={clearAllFilters}
        class="text-xs text-gray-400 hover:text-white underline px-1"
        title="Clear all filters"
      >Clear</button>
    {/if}
  </div>

  <!-- Dashboard (collapsible) -->
  {#if showDashboard}
    <AuditDashboard {logs} />
  {/if}

  <!-- Advanced filter panel (collapsible) -->
  {#if showFilters}
    <AuditLogFilters bind:filters on:change={handleFilterChange} />
  {/if}

  <!-- Bulk Actions Bar -->
  {#if showBulkActions}
    <div class="bg-purple-500/10 border border-purple-500/50 rounded-lg p-3 mb-3">
      <div class="flex-between">
        <div class="flex items-center space-x-4">
          <span class="font-semibold text-purple-400 text-sm">
            {selectedLogs.size} log{selectedLogs.size !== 1 ? 's' : ''} selected
          </span>
          <Button variant="secondary" size="small" on:click={() => { selectedLogs.clear(); selectedLogs = selectedLogs; }}>
            Clear Selection
          </Button>
        </div>
        <Button variant="danger" size="small" icon="delete" on:click={handleBulkDelete}>
          Delete Selected
        </Button>
      </div>
    </div>
  {/if}

  <!-- Results Summary -->
  <div class="flex-between mb-3">
    <div class="text-muted-sm">
      Showing {logs.length} of {totalCount} log{totalCount !== 1 ? 's' : ''}
    </div>
    {#if logs.length > 0}
      <Button variant="secondary" size="small" on:click={toggleSelectAll}>
        {selectedLogs.size === logs.length ? 'Deselect All' : 'Select All'}
      </Button>
    {/if}
  </div>

  <ErrorDisplay message={error} onDismiss={() => auditLogsStore.clearError()} />
  <ErrorDisplay message={localError} onDismiss={() => localError = ''} />

  {#if loading && logs.length === 0}
    <LoadingSpinner />
  {:else if logs.length === 0}
    <div class="empty-state">
      {#if hasAnyFilter}
        No audit logs found matching your filters. Try adjusting your search criteria.
      {:else}
        No audit logs found. Events will appear here once users start taking actions.
      {/if}
    </div>
  {:else}
    <div class="section-spacing">
      {#each logs as log (log.id)}
        <AuditLogCard
          {log}
          selected={selectedLogs.has(log.id)}
          on:select={() => toggleSelect(log.id)}
          on:delete={() => handleDeleteLog(log.id)}
          on:flag={(e) => handleFlagLog(log.id, e.detail)}
          on:unflag={() => handleUnflagLog(log.id)}
        />
      {/each}
    </div>

    {#if hasMore}
      <div class="text-center mt-6">
        <Button variant="secondary" size="large" loading={loading} on:click={handleLoadMore}>
          {loading ? 'Loading...' : `Load More (${totalCount - logs.length} remaining)`}
        </Button>
      </div>
    {/if}
  {/if}
</div>
