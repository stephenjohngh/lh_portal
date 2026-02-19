<!-- src/lib/apps/users/components/AuditLogsView.svelte -->
<!-- Main audit logs view with filtering, search, and statistics -->
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
    appId:         null,   // ← new: filter by originating app
    userId:        null,
    eventType:     null,
    eventCategory: null,
    severity:      null,
    startDate:     null,
    endDate:       null,
    search:        '',
    flaggedOnly:   false,
    limit:         100,
    offset:        0
  };

  let showDashboard   = true;
  let selectedLogs    = new Set();
  let showBulkActions = false;

  $: ({ logs, loading, error, totalCount, hasMore } = $auditLogsStore);
  $: showBulkActions = selectedLogs.size > 0;

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
      alert(err.message);
    }
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
      alert(err.message);
    }
  }

  async function handleDeleteLog(logId) {
    if (!confirm('Delete this audit log? This cannot be undone.')) return;
    try {
      await auditLogsStore.deleteLog(logId);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleFlagLog(logId, reason) {
    try { await auditLogsStore.flagLog(logId, reason); }
    catch (err) { alert(err.message); }
  }

  async function handleUnflagLog(logId) {
    try { await auditLogsStore.unflagLog(logId); }
    catch (err) { alert(err.message); }
  }
</script>

<div class="app-container">
  <!-- Header -->
  <div class="flex-start mb-6">
    <div>
      <h2 class="heading-page">Audit Logs</h2>
      <p class="text-muted">Complete activity history and security monitoring</p>
    </div>
    <div class="flex space-x-2">
      <Button
        variant="secondary"
        size="large"
        icon={showDashboard ? 'eye-off' : 'eye'}
        on:click={() => showDashboard = !showDashboard}
      >
        {showDashboard ? 'Hide' : 'Show'} Dashboard
      </Button>
      <Button variant="primary" size="large" icon="download" on:click={handleExport}>
        Export CSV
      </Button>
    </div>
  </div>

  {#if showDashboard}
    <AuditDashboard {logs} />
  {/if}

  <AuditLogFilters bind:filters on:change={handleFilterChange} />

  <!-- Bulk Actions Bar -->
  {#if showBulkActions}
    <div class="bg-purple-500/10 border border-purple-500/50 rounded-lg p-4 mb-6">
      <div class="flex-between">
        <div class="flex items-center space-x-4">
          <span class="font-semibold text-purple-400">
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
  <div class="flex-between mb-4">
    <div class="text-muted">
      Showing {logs.length} of {totalCount} log{totalCount !== 1 ? 's' : ''}
    </div>
    {#if logs.length > 0}
      <Button variant="secondary" size="small" on:click={toggleSelectAll}>
        {selectedLogs.size === logs.length ? 'Deselect All' : 'Select All'}
      </Button>
    {/if}
  </div>

  <ErrorDisplay message={error} onDismiss={() => auditLogsStore.clearError()} />

  {#if loading && logs.length === 0}
    <LoadingSpinner />
  {:else if logs.length === 0}
    <div class="empty-state">
      {#if filters.search || filters.appId || filters.eventType || filters.eventCategory}
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
