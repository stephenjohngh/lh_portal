<!-- src/lib/apps/admin/components/AuditDashboard.svelte -->
<!-- Dense audit-log dashboard. One row of stat tiles + one slim health-summary
     row, instead of the 4-row block this used to be. The previous app-activity
     progress bars were dropped because the same information is now reachable
     directly via the App filter dropdown in the parent toolbar. -->
<script>
  import { onMount } from 'svelte';
  import { auditLogsStore } from '../stores/auditLogsStore';

  export const logs = [];  // passed in for external reference only — stats load from the store

  let stats = {
    totalEvents: 0, totalLogins: 0, failedLogins: 0, dataChanges: 0,
    permissionChanges: 0, criticalEvents: 0, warningEvents: 0,
    flaggedEvents: 0, authEvents: 0, userEvents: 0, issueEvents: 0, planEvents: 0
  };

  let loading = false;
  let timeRange = 30;

  // totalCount from the store reflects the full DB count (not just the page)
  $: totalCount = $auditLogsStore.totalCount;

  // Derived health flags
  $: failRatePct = (stats.totalLogins + stats.failedLogins) > 0
    ? (stats.failedLogins / (stats.totalLogins + stats.failedLogins) * 100)
    : 0;
  $: failRateHigh = stats.failedLogins > stats.totalLogins * 0.2 && stats.failedLogins > 0;

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

  // Always load from DB so all stat cards reflect the full dataset
  onMount(loadStats);
</script>

<div class="mb-4 space-y-2">

  <!-- Single dense row of 8 stat tiles -->
  <div class="grid grid-cols-4 md:grid-cols-8 gap-2">
    <div class="bg-slate-700/50 rounded px-2 py-1.5 border border-slate-600">
      <div class="text-lg font-bold text-white leading-tight">{totalCount}</div>
      <div class="text-[10px] text-gray-400 uppercase tracking-wide">Total</div>
    </div>
    <div class="bg-slate-700/50 rounded px-2 py-1.5 border border-slate-600">
      <div class="text-lg font-bold text-green-400 leading-tight">{stats.totalLogins}</div>
      <div class="text-[10px] text-gray-400 uppercase tracking-wide">Logins</div>
    </div>
    <div class="bg-slate-700/50 rounded px-2 py-1.5 border border-slate-600">
      <div class="text-lg font-bold text-red-400 leading-tight">{stats.failedLogins}</div>
      <div class="text-[10px] text-gray-400 uppercase tracking-wide">Fails</div>
    </div>
    <div class="bg-slate-700/50 rounded px-2 py-1.5 border border-slate-600">
      <div class="text-lg font-bold text-blue-400 leading-tight">{stats.dataChanges}</div>
      <div class="text-[10px] text-gray-400 uppercase tracking-wide">Changes</div>
    </div>
    <div class="bg-slate-700/50 rounded px-2 py-1.5 border border-slate-600">
      <div class="text-lg font-bold text-purple-400 leading-tight">{stats.criticalEvents}</div>
      <div class="text-[10px] text-gray-400 uppercase tracking-wide">Critical</div>
    </div>
    <div class="bg-slate-700/50 rounded px-2 py-1.5 border border-slate-600">
      <div class="text-lg font-bold text-amber-400 leading-tight">{stats.warningEvents}</div>
      <div class="text-[10px] text-gray-400 uppercase tracking-wide">Warnings</div>
    </div>
    <div class="bg-slate-700/50 rounded px-2 py-1.5 border border-slate-600">
      <div class="text-lg font-bold text-red-400 leading-tight">{stats.flaggedEvents}</div>
      <div class="text-[10px] text-gray-400 uppercase tracking-wide">Flagged</div>
    </div>
    <div class="bg-slate-700/50 rounded px-2 py-1.5 border border-slate-600">
      <div class="text-lg font-bold text-cyan-400 leading-tight">{stats.permissionChanges}</div>
      <div class="text-[10px] text-gray-400 uppercase tracking-wide">Perms</div>
    </div>
  </div>

  <!-- Slim health-summary line -->
  <div class="flex flex-wrap items-center gap-3 text-xs text-gray-400 px-1">
    <span class="flex items-center gap-1.5">
      <span class="text-gray-500">Fail rate:</span>
      <span class="font-semibold {failRateHigh ? 'text-red-400' : 'text-green-400'}">
        {failRatePct.toFixed(1)}%
      </span>
      {#if failRateHigh}<span class="text-red-400">⚠</span>{:else}<span class="text-green-400">✓</span>{/if}
    </span>
    <span class="text-slate-600">·</span>
    <span class="flex items-center gap-1.5">
      <span class="text-gray-500">Critical:</span>
      <span class="font-semibold {stats.criticalEvents > 0 ? 'text-purple-400' : 'text-green-400'}">
        {stats.criticalEvents}
      </span>
      {#if stats.criticalEvents > 0}<span class="text-purple-400">⚠</span>{:else}<span class="text-green-400">✓</span>{/if}
    </span>
    <span class="text-slate-600">·</span>
    <span class="flex items-center gap-1.5">
      <span class="text-gray-500">Flagged:</span>
      <span class="font-semibold {stats.flaggedEvents > 0 ? 'text-red-400' : 'text-green-400'}">
        {stats.flaggedEvents}
      </span>
      {#if stats.flaggedEvents > 0}<span class="text-red-400">🚩</span>{:else}<span class="text-green-400">✓</span>{/if}
    </span>
    <span class="text-slate-600">·</span>
    <span class="text-gray-500">Last {timeRange} days</span>
  </div>
</div>
