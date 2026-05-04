<!-- src/lib/apps/issues/components/reports/ActionsReportPanel.svelte -->
<script>
  import { onMount }      from 'svelte';
  import Button           from '$lib/components/common/Button.svelte';
  import Badge            from '$lib/components/common/Badge.svelte';
  import { profiles, profilesStore } from '$lib/stores/profiles';
  import { meetingsStore }           from '../../stores/meetingsStore';
  import { fmtDate, fmtDateLong, isOverdue } from '$lib/utils/dates';
  import { downloadResponse }        from '$lib/utils/download';
  import { getLogger }               from '$lib/utils/logger';
  import { sortActions }             from '$lib/utils/actionSort';

  const logger = getLogger('ActionsReportPanel');

  export let issues = [];

  onMount(() => profilesStore.load());

  // ── Filters ───────────────────────────────────────────────────────────────
  let selectedUser      = 'all';
  let filterMeetingId   = '';
  let includeInProgress = true;
  let includePending    = true;
  let includeCompleted  = false;

  // ── Sort ─────────────────────────────────────────────────────────────────
  // 'standard' = priority → issue number → status → deadline → created
  // 'deadline' = earliest action deadline first (per issue group)
  let sortMode = 'standard';

  let isGenerating  = false;
  let downloadError = '';

  // ── Sort helpers ──────────────────────────────────────────────────────────

  function deadlineThenCreated(a, b) {
    const hasA = !!a.date_deadline;
    const hasB = !!b.date_deadline;
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return  1;
    if (hasA && hasB) {
      const da = new Date(a.date_deadline).setHours(0, 0, 0, 0);
      const db = new Date(b.date_deadline).setHours(0, 0, 0, 0);
      if (da !== db) return da - db;
    }
    return new Date(a.created_at) - new Date(b.created_at);
  }

  function earliestDeadline(actions) {
    return actions.reduce((min, a) => {
      if (!a.date_deadline) return min;
      const t = new Date(a.date_deadline).setHours(0, 0, 0, 0);
      return min === null ? t : Math.min(min, t);
    }, null);
  }

  // ── Core derived data ─────────────────────────────────────────────────────

  $: sortedGroups = (() => {
    const groups = issues
      .map(issue => ({
        issue: {
          id:           issue.id,
          name:         issue.name,
          priority:     issue.priority,
          issue_number: issue.issue_number,
          status:       issue.status
        },
        actions: (issue.actions || []).filter(action => {
          const statusMatch =
            (action.status === 'in-progress' && includeInProgress) ||
            (action.status === 'pending'     && includePending)     ||
            (action.status === 'completed'   && includeCompleted);
          const userMatch =
            selectedUser === 'all'         ? true :
            selectedUser === 'unallocated' ? (!action.name_text || !action.name_text.trim()) :
            action.name_text === selectedUser;
          const meetingMatch = filterMeetingId ? action.meeting_id === filterMeetingId : true;
          return statusMatch && userMatch && meetingMatch;
        })
      }))
      .filter(g => g.actions.length > 0);

    // Sort actions within each group
    for (const g of groups) {
      if (sortMode === 'deadline') {
        g.actions = g.actions.slice().sort(deadlineThenCreated);
      } else {
        g.actions = sortActions(g.actions); // status → deadline → created
      }
    }

    // Sort groups
    if (sortMode === 'deadline') {
      groups.sort((a, b) => {
        const aMin = earliestDeadline(a.actions);
        const bMin = earliestDeadline(b.actions);
        if (aMin !== null && bMin === null) return -1;
        if (aMin === null && bMin !== null) return  1;
        if (aMin !== null && bMin !== null && aMin !== bMin) return aMin - bMin;
        if (a.issue.priority !== b.issue.priority) return a.issue.priority - b.issue.priority;
        return (a.issue.issue_number ?? 0) - (b.issue.issue_number ?? 0);
      });
    } else {
      groups.sort((a, b) => {
        if (a.issue.priority !== b.issue.priority) return a.issue.priority - b.issue.priority;
        return (a.issue.issue_number ?? 0) - (b.issue.issue_number ?? 0);
      });
    }

    return groups;
  })();

  $: totalActionCount = sortedGroups.reduce((n, g) => n + g.actions.length, 0);

  // Global action numbers (1, 2, 3… across all groups in display order)
  $: actionNumbers = (() => {
    const map = {};
    let n = 1;
    for (const g of sortedGroups) for (const a of g.actions) map[a.id] = n++;
    return map;
  })();

  $: todayLong = fmtDateLong(new Date().toISOString());

  // ── Sort label for the report header ─────────────────────────────────────

  $: sortLabel = sortMode === 'deadline'
    ? 'Earliest deadline first'
    : 'Priority → Issue number → Status → Deadline';

  // ── Download ──────────────────────────────────────────────────────────────

  async function downloadWord() {
    isGenerating  = true;
    downloadError = '';
    try {
      const response = await fetch('/api/reports/generate-actions-docx', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groups:   sortedGroups,
          sortMode,
          selectedUser,
          userName: selectedUser === 'all'         ? 'All Users'
                  : selectedUser === 'unallocated' ? 'Unallocated'
                  :                                  selectedUser
        })
      });
      if (!response.ok) {
        const ct = response.headers.get('content-type');
        if (ct?.includes('application/json')) {
          const { error } = await response.json();
          throw new Error(error || 'Failed to generate document');
        }
        throw new Error(`Server error: ${response.status}`);
      }
      const today  = new Date().toISOString().split('T')[0];
      const suffix = selectedUser === 'all'         ? 'All_Users'
                   : selectedUser === 'unallocated' ? 'Unallocated'
                   :                                  selectedUser.replace(/\s+/g, '_');
      const filename = `Actions_Report_${suffix}_${today}.docx`;
      await downloadResponse(response, filename);
      logger('✅ Downloaded:', filename);
    } catch (err) {
      logger('❌', err.message);
      downloadError = err.message;
    } finally {
      isGenerating = false;
    }
  }
</script>

<div class="flex h-full">

  <!-- ── Filter panel ── -->
  <aside class="w-64 shrink-0 border-r border-slate-700 bg-slate-800/60 p-5 flex flex-col gap-5 overflow-y-auto">

    <!-- Assignee -->
    <div>
      <p class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Assignee</p>
      <select
        bind:value={selectedUser}
        class="w-full px-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm"
      >
        <option value="all">All users</option>
        <option value="unallocated">Unallocated</option>
        {#each $profiles.list as profile (profile.id)}
          <option value={profile.full_name}>{profile.full_name}</option>
        {/each}
        <option value="External">External</option>
      </select>
    </div>

    <!-- Action status -->
    <div>
      <p class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Action status</p>
      <div class="flex flex-col gap-1.5">
        <label class="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
          <input type="checkbox" bind:checked={includeInProgress} class="rounded" />
          In progress
        </label>
        <label class="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
          <input type="checkbox" bind:checked={includePending} class="rounded" />
          Pending
        </label>
        <label class="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
          <input type="checkbox" bind:checked={includeCompleted} class="rounded" />
          Completed
        </label>
      </div>
    </div>

    <!-- Meeting -->
    <div>
      <p class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Meeting</p>
      <select
        bind:value={filterMeetingId}
        class="w-full px-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm"
      >
        <option value="">All meetings</option>
        {#each $meetingsStore.list as m (m.id)}
          <option value={m.id}>{m.title} ({fmtDate(m.meeting_date)})</option>
        {/each}
      </select>
    </div>

    <!-- Sort -->
    <div>
      <p class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Sort by</p>
      <div class="flex flex-col gap-1.5">
        <label class="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
          <input type="radio" bind:group={sortMode} value="standard" class="accent-purple-400" />
          Standard
          <span class="text-[10px] text-slate-500 leading-tight">priority · issue · status</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
          <input type="radio" bind:group={sortMode} value="deadline" class="accent-purple-400" />
          Deadline
          <span class="text-[10px] text-slate-500 leading-tight">earliest first</span>
        </label>
      </div>
    </div>

    <!-- Download -->
    <div class="mt-auto pt-4 border-t border-slate-700">
      <p class="text-xs text-slate-500 mb-3">
        {totalActionCount} action{totalActionCount === 1 ? '' : 's'}
        across {sortedGroups.length} issue{sortedGroups.length === 1 ? '' : 's'}
      </p>
      <Button
        variant="primary"
        size="medium"
        icon="download"
        disabled={isGenerating || totalActionCount === 0}
        on:click={downloadWord}
      >
        {isGenerating ? 'Generating…' : 'Download Word doc'}
      </Button>
      {#if downloadError}
        <p class="text-xs text-red-400 mt-2 break-words">{downloadError}</p>
      {/if}
    </div>
  </aside>

  <!-- ── Live preview ── -->
  <div class="flex-1 overflow-y-auto bg-white text-gray-900">
    <div class="max-w-4xl mx-auto p-8">

      {#if totalActionCount === 0}
        <div class="text-center py-16 text-gray-400">
          <p class="text-lg font-medium">No actions match the current filters.</p>
          <p class="text-sm mt-1">Adjust the filters to see results.</p>
        </div>

      {:else}
        <!-- Report header -->
        <div class="mb-8 pb-5 border-b border-gray-200">
          <h1 class="text-3xl font-bold text-gray-900 mb-1">Actions Report</h1>
          <p class="text-gray-500 text-sm">Generated {todayLong}</p>
          <p class="text-gray-400 text-xs mt-1">
            {selectedUser === 'all' ? 'All users' : selectedUser === 'unallocated' ? 'Unallocated' : selectedUser}
            · {totalActionCount} action{totalActionCount === 1 ? '' : 's'}
            across {sortedGroups.length} issue{sortedGroups.length === 1 ? '' : 's'}
            {#if filterMeetingId} · meeting filter active{/if}
          </p>
          <p class="text-gray-400 text-xs">Sorted: {sortLabel}</p>
        </div>

        <!-- Grouped issues -->
        <div class="space-y-8">
          {#each sortedGroups as group (group.issue.id)}

            <!-- Issue header -->
            <div>
              <div class="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded-lg px-4 py-2.5 mb-3">
                {#if group.issue.issue_number}
                  <span class="text-gray-400 text-sm font-mono shrink-0">#{group.issue.issue_number}</span>
                  <span class="text-gray-300 shrink-0">—</span>
                {/if}
                <span class="font-bold text-gray-800 flex-1 leading-snug">{group.issue.name}</span>
                {#if group.issue.status === 'parked'}
                  <span class="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded border border-amber-200 font-medium shrink-0">Parked</span>
                {:else if group.issue.status === 'completed'}
                  <span class="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded border border-green-200 font-medium shrink-0">Completed</span>
                {/if}
                <span class="text-xs text-gray-500 shrink-0">{group.actions.length} {group.actions.length === 1 ? 'action' : 'actions'}</span>
              </div>

              <!-- Actions for this issue -->
              <div class="space-y-3 pl-2">
                {#each group.actions as action (action.id)}
                  <div class="border border-gray-200 rounded-lg overflow-hidden">
                    <div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
                      <div class="flex items-start gap-3">
                        <span class="text-sm font-bold text-gray-400 shrink-0 mt-0.5 tabular-nums">{actionNumbers[action.id]}.</span>
                        <p class="font-semibold text-gray-900 leading-snug">{action.action_text}</p>
                      </div>
                    </div>
                    <div class="px-4 py-3 bg-white">
                      <div class="flex flex-wrap gap-2 mb-2">
                        {#if action.name_text}
                          <Badge variant="info" icon="👤" outline>{action.name_text}</Badge>
                        {/if}
                        {#if action.date_deadline}
                          <Badge variant={isOverdue(action.date_deadline) ? 'danger' : 'warning'} icon="📅" outline>
                            Due: {fmtDate(action.date_deadline)}{isOverdue(action.date_deadline) ? ' ⚠️' : ''}
                          </Badge>
                        {/if}
                        <Badge variant="primary" outline className="capitalize">{action.status}</Badge>
                      </div>
                      <p class="text-xs text-gray-400">Added: {fmtDate(action.created_at)}</p>
                    </div>
                  </div>
                {/each}
              </div>
            </div>

          {/each}
        </div>

        <p class="text-center text-gray-400 text-sm mt-10 pt-6 border-t border-gray-200 italic">
          End of Report
        </p>
      {/if}
    </div>
  </div>
</div>
