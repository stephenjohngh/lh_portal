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

  let selectedUser      = 'all';
  let filterMeetingId   = '';
  let includeInProgress = true;
  let includePending    = true;
  let includeCompleted  = false;

  let isGenerating  = false;
  let downloadError = '';

  $: allActions = issues.flatMap(issue =>
    (issue.actions || []).map(action => ({
      ...action,
      issue_name:     issue.name,
      issue_priority: issue.priority,
      issue_status:   issue.status
    }))
  );

  $: filteredActions = allActions.filter(action => {
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
  });

  $: sortedActions = sortActions(filteredActions);

  $: todayLong = fmtDateLong(new Date().toISOString());

  async function downloadWord() {
    isGenerating  = true;
    downloadError = '';
    try {
      const response = await fetch('/api/reports/generate-actions-docx', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actions:      sortedActions,
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

    <div class="mt-auto pt-4 border-t border-slate-700">
      <p class="text-xs text-slate-500 mb-3">
        {sortedActions.length} action{sortedActions.length === 1 ? '' : 's'}
      </p>
      <Button
        variant="primary"
        size="medium"
        icon="download"
        disabled={isGenerating || sortedActions.length === 0}
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

      {#if sortedActions.length === 0}
        <div class="text-center py-16 text-gray-400">
          <p class="text-lg font-medium">No actions match the current filters.</p>
          <p class="text-sm mt-1">Adjust the filters to see results.</p>
        </div>

      {:else}
        <div class="mb-8 pb-5 border-b border-gray-200">
          <h1 class="text-3xl font-bold text-gray-900 mb-1">Actions Report</h1>
          <p class="text-gray-500 text-sm">Generated {todayLong}</p>
          <p class="text-gray-400 text-xs mt-1">
            {selectedUser === 'all' ? 'All users' : selectedUser === 'unallocated' ? 'Unallocated' : selectedUser}
            · {sortedActions.length} action{sortedActions.length === 1 ? '' : 's'}
            {#if filterMeetingId} · meeting filter active{/if}
          </p>
          <p class="text-gray-400 text-xs">Sorted: Status → Deadline → Created</p>
        </div>

        <div class="space-y-4">
          {#each sortedActions as action, index (action.id)}
            <div class="border border-gray-300 rounded-lg overflow-hidden">
              <div class="bg-gray-100 p-4 border-b border-gray-300">
                <div class="flex items-start gap-3">
                  <span class="text-base font-bold text-gray-400 shrink-0 mt-0.5">{index + 1}.</span>
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-gray-900 leading-snug">{action.action_text}</p>
                    <p class="text-sm text-gray-500 mt-0.5">
                      Issue: <span class="font-medium text-gray-700">{action.issue_name}</span>
                    </p>
                  </div>
                </div>
              </div>
              <div class="p-4 bg-white">
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
                  {#if action.issue_status === 'parked'}
                    <Badge variant="warning" icon="🅿️" outline>Issue Parked</Badge>
                  {:else if action.issue_status === 'completed'}
                    <Badge variant="success" icon="✓" outline>Issue Completed</Badge>
                  {/if}
                </div>
                <p class="text-xs text-gray-400">Added: {fmtDate(action.created_at)}</p>
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
