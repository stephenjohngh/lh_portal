<!-- src/lib/apps/users/components/AuditDashboard.svelte -->
<!-- Dashboard showing audit log statistics -->
<script>
  import { onMount } from 'svelte';
  import { auditLogsStore } from '../stores/auditLogsStore';

  export let logs = [];

  let stats = {
    totalEvents: 0,
    totalLogins: 0,
    failedLogins: 0,
    dataChanges: 0,
    permissionChanges: 0,
    criticalEvents: 0,
    warningEvents: 0,
    flaggedEvents: 0,
    authEvents: 0,
    userEvents: 0,
    issueEvents: 0
  };

  let loading = false;
  let timeRange = 30; // days

  $: calculateStats(logs);

  async function loadStats() {
    loading = true;
    try {
      stats = await auditLogsStore.getStats(timeRange);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      loading = false;
    }
  }

  function calculateStats(logs) {
    if (!logs || logs.length === 0) return;

    stats = {
      totalEvents: logs.length,
      totalLogins: logs.filter(l => l.event_type === 'login').length,
      failedLogins: logs.filter(l => l.event_type === 'failed_login').length,
      dataChanges: logs.filter(l => ['create', 'update', 'delete'].includes(l.event_type)).length,
      permissionChanges: logs.filter(l => l.event_type === 'permission_change').length,
      criticalEvents: logs.filter(l => l.severity === 'critical').length,
      warningEvents: logs.filter(l => l.severity === 'warning').length,
      flaggedEvents: logs.filter(l => l.flagged).length,
      authEvents: logs.filter(l => l.event_category === 'auth').length,
      userEvents: logs.filter(l => l.event_category === 'users').length,
      issueEvents: logs.filter(l => l.event_category === 'issues').length
    };
  }

  onMount(() => {
    if (logs.length === 0) {
      loadStats();
    }
  });
</script>

<div class="mb-6">
  <!-- Overview Stats -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
    <div class="card">
      <div class="text-3xl font-bold text-white">{stats.totalEvents}</div>
      <div class="text-muted-sm">Total Events</div>
      <div class="text-xs text-muted mt-1">
        All logged activities
      </div>
    </div>

    <div class="card">
      <div class="text-3xl font-bold text-green-400">{stats.totalLogins}</div>
      <div class="text-muted-sm">Successful Logins</div>
      <div class="text-xs text-muted mt-1">
        User sign-ins
      </div>
    </div>

    <div class="card">
      <div class="text-3xl font-bold text-red-400">{stats.failedLogins}</div>
      <div class="text-muted-sm">Failed Logins</div>
      <div class="text-xs text-muted mt-1">
        Authentication failures
      </div>
    </div>

    <div class="card">
      <div class="text-3xl font-bold text-blue-400">{stats.dataChanges}</div>
      <div class="text-muted-sm">Data Changes</div>
      <div class="text-xs text-muted mt-1">
        Create/Update/Delete
      </div>
    </div>
  </div>

  <!-- Security Stats -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
    <div class="card">
      <div class="text-3xl font-bold text-purple-400">{stats.criticalEvents}</div>
      <div class="text-muted-sm">Critical Events</div>
      <div class="text-xs text-muted mt-1">
        High severity issues
      </div>
    </div>

    <div class="card">
      <div class="text-3xl font-bold text-amber-400">{stats.warningEvents}</div>
      <div class="text-muted-sm">Warnings</div>
      <div class="text-xs text-muted mt-1">
        Potential issues
      </div>
    </div>

    <div class="card">
      <div class="text-3xl font-bold text-red-400">{stats.flaggedEvents}</div>
      <div class="text-muted-sm">Flagged Events</div>
      <div class="text-xs text-muted mt-1">
        Marked as suspicious
      </div>
    </div>

    <div class="card">
      <div class="text-3xl font-bold text-cyan-400">{stats.permissionChanges}</div>
      <div class="text-muted-sm">Permission Changes</div>
      <div class="text-xs text-muted mt-1">
        Access modifications
      </div>
    </div>
  </div>

  <!-- Category Breakdown -->
  <div class="grid grid-cols-3 gap-4">
    <div class="card">
      <div class="flex items-center justify-between mb-2">
        <span class="text-muted-sm">Authentication</span>
        <span class="text-2xl font-bold text-blue-400">{stats.authEvents}</span>
      </div>
      <div class="w-full bg-slate-700 rounded-full h-2">
        <div 
          class="bg-blue-400 h-2 rounded-full" 
          style="width: {stats.totalEvents > 0 ? (stats.authEvents / stats.totalEvents * 100) : 0}%"
        />
      </div>
    </div>

    <div class="card">
      <div class="flex items-center justify-between mb-2">
        <span class="text-muted-sm">User Management</span>
        <span class="text-2xl font-bold text-purple-400">{stats.userEvents}</span>
      </div>
      <div class="w-full bg-slate-700 rounded-full h-2">
        <div 
          class="bg-purple-400 h-2 rounded-full" 
          style="width: {stats.totalEvents > 0 ? (stats.userEvents / stats.totalEvents * 100) : 0}%"
        />
      </div>
    </div>

    <div class="card">
      <div class="flex items-center justify-between mb-2">
        <span class="text-muted-sm">Issues</span>
        <span class="text-2xl font-bold text-green-400">{stats.issueEvents}</span>
      </div>
      <div class="w-full bg-slate-700 rounded-full h-2">
        <div 
          class="bg-green-400 h-2 rounded-full" 
          style="width: {stats.totalEvents > 0 ? (stats.issueEvents / stats.totalEvents * 100) : 0}%"
        />
      </div>
    </div>
  </div>

  <!-- Health Indicators -->
  <div class="mt-4 grid grid-cols-3 gap-4">
    <!-- Failed Login Rate -->
    <div class="card {stats.failedLogins > stats.totalLogins * 0.2 ? 'border-red-500' : 'border-slate-600'}">
      <div class="flex items-center space-x-2 mb-1">
        <span class="text-muted-sm">Failed Login Rate</span>
        {#if stats.failedLogins > stats.totalLogins * 0.2}
          <span class="text-red-400 text-xs">⚠ High</span>
        {:else}
          <span class="text-green-400 text-xs">✓ Normal</span>
        {/if}
      </div>
      <div class="text-xl font-bold">
        {stats.totalLogins > 0 ? ((stats.failedLogins / (stats.totalLogins + stats.failedLogins)) * 100).toFixed(1) : 0}%
      </div>
    </div>

    <!-- Critical Event Rate -->
    <div class="card {stats.criticalEvents > 0 ? 'border-purple-500' : 'border-slate-600'}">
      <div class="flex items-center space-x-2 mb-1">
        <span class="text-muted-sm">Critical Events</span>
        {#if stats.criticalEvents > 0}
          <span class="text-purple-400 text-xs">⚠ {stats.criticalEvents} found</span>
        {:else}
          <span class="text-green-400 text-xs">✓ None</span>
        {/if}
      </div>
      <div class="text-xl font-bold">
        {stats.criticalEvents}
      </div>
    </div>

    <!-- Flagged Events -->
    <div class="card {stats.flaggedEvents > 0 ? 'border-red-500' : 'border-slate-600'}">
      <div class="flex items-center space-x-2 mb-1">
        <span class="text-muted-sm">Flagged Activity</span>
        {#if stats.flaggedEvents > 0}
          <span class="text-red-400 text-xs">🚩 {stats.flaggedEvents} flagged</span>
        {:else}
          <span class="text-green-400 text-xs">✓ None</span>
        {/if}
      </div>
      <div class="text-xl font-bold">
        {stats.flaggedEvents}
      </div>
    </div>
  </div>
</div>
