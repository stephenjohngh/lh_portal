<!-- src/lib/apps/issues/components/meetings/MeetingAssignModal.svelte -->
<!--
  Admin-only modal for retroactively assigning existing issues, comments,
  and actions to a meeting (migration tool).

  Each item can be tagged independently:
    - Issues:   sets issues.meeting_id   (marks the issue as created in that meeting)
    - Comments: sets comments.meeting_id (marks the comment as made during the meeting)
    - Actions:  sets actions.meeting_id  (marks the action as assigned during the meeting)

  Default filter: show only items with no current meeting tag (meeting_id IS NULL).
  Toggle off to see all items, including those already tagged to other meetings.

  The "select all" checkbox on each issue row selects the issue record itself
  plus all its visible (filtered) comments and actions in one click.
-->
<script>
  import Modal           from '$lib/components/common/Modal.svelte';
  import Button          from '$lib/components/common/Button.svelte';
  import { meetingsStore } from '../../stores/meetingsStore';
  import { issuesStore }   from '../../stores/issuesStore';
  import { fmtDate }     from '$lib/utils/dates';

  export let show    = false;
  export let meeting = null;   // target meeting object
  export let issues  = [];     // all issues (unfiltered — all statuses)

  let showOnlyUntagged = true;
  let saving           = false;
  let pageError        = '';

  // Selection sets — reassigned to trigger Svelte reactivity
  let selectedIssues   = new Set();
  let selectedComments = new Set();
  let selectedActions  = new Set();
  let expanded         = new Set();

  // Reset when opened
  let prevShow = false;
  $: if (show && !prevShow) {
    prevShow = true;
    selectedIssues   = new Set();
    selectedComments = new Set();
    selectedActions  = new Set();
    expanded         = new Set();
    pageError        = '';
    showOnlyUntagged = true;
  }
  $: if (!show) prevShow = false;

  // -- Filtering helpers ------------------------------------------------

  function isUntagged(item)    { return !item.meeting_id; }

  function visibleComments(issue) {
    return (issue.comments || []).filter(c => showOnlyUntagged ? isUntagged(c) : true);
  }
  function visibleActions(issue) {
    return (issue.actions || []).filter(a => showOnlyUntagged ? isUntagged(a) : true);
  }
  function issueHasVisibleItems(issue) {
    const selfVisible = showOnlyUntagged ? isUntagged(issue) : true;
    return selfVisible || visibleComments(issue).length > 0 || visibleActions(issue).length > 0;
  }

  $: visibleIssues = issues.filter(issueHasVisibleItems);

  // -- Per-issue selection state ----------------------------------------

  function isAllSelectedForIssue(issue) {
    const vc = visibleComments(issue);
    const va = visibleActions(issue);
    const selfVisible = showOnlyUntagged ? isUntagged(issue) : true;
    const selfOk = !selfVisible || selectedIssues.has(issue.id);
    const cOk = vc.every(c => selectedComments.has(c.id));
    const aOk = va.every(a => selectedActions.has(a.id));
    return selfOk && cOk && aOk && (selfVisible || vc.length > 0 || va.length > 0);
  }

  function isAnySelectedForIssue(issue) {
    return selectedIssues.has(issue.id) ||
      visibleComments(issue).some(c => selectedComments.has(c.id)) ||
      visibleActions(issue).some(a => selectedActions.has(a.id));
  }

  // -- Selection toggles ------------------------------------------------

  function toggleSet(s, id) {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  }

  function toggleIssue(id) {
    selectedIssues = toggleSet(selectedIssues, id);
  }
  function toggleComment(id) {
    selectedComments = toggleSet(selectedComments, id);
  }
  function toggleAction(id) {
    selectedActions = toggleSet(selectedActions, id);
  }
  function toggleExpand(id) {
    expanded = toggleSet(expanded, id);
  }

  function selectAllForIssue(issue, checked) {
    const vc = visibleComments(issue);
    const va = visibleActions(issue);
    const selfVisible = showOnlyUntagged ? isUntagged(issue) : true;
    const ni = new Set(selectedIssues);
    const nc = new Set(selectedComments);
    const na = new Set(selectedActions);
    if (checked) {
      if (selfVisible) ni.add(issue.id);
      for (const c of vc) nc.add(c.id);
      for (const a of va) na.add(a.id);
    } else {
      ni.delete(issue.id);
      for (const c of vc) nc.delete(c.id);
      for (const a of va) na.delete(a.id);
    }
    selectedIssues = ni; selectedComments = nc; selectedActions = na;
  }

  function selectAll() {
    const ni = new Set(), nc = new Set(), na = new Set();
    for (const issue of visibleIssues) {
      if (showOnlyUntagged ? isUntagged(issue) : true) ni.add(issue.id);
      for (const c of visibleComments(issue)) nc.add(c.id);
      for (const a of visibleActions(issue))  na.add(a.id);
    }
    selectedIssues = ni; selectedComments = nc; selectedActions = na;
  }

  function clearAll() {
    selectedIssues = new Set(); selectedComments = new Set(); selectedActions = new Set();
  }

  // -- Totals -----------------------------------------------------------

  $: totalSelected = selectedIssues.size + selectedComments.size + selectedActions.size;

  // -- Helpers ----------------------------------------------------------

  function getMeetingLabel(meetingId) {
    if (!meetingId) return '';
    const m = $meetingsStore.list.find(m => m.id === meetingId);
    return m ? `${m.title} (${fmtDate(m.meeting_date)})` : '(unknown meeting)';
  }

  function untaggedSummary(issue) {
    const parts = [];
    if (isUntagged(issue))                                        parts.push('issue');
    const uc = (issue.comments || []).filter(isUntagged).length;
    const ua = (issue.actions  || []).filter(isUntagged).length;
    if (uc > 0) parts.push(`${uc} comment${uc === 1 ? '' : 's'}`);
    if (ua > 0) parts.push(`${ua} action${ua === 1 ? '' : 's'}`);
    return parts.length ? parts.join(', ') + ' untagged' : '';
  }

  // -- Submit -----------------------------------------------------------

  async function handleAssign() {
    if (totalSelected === 0 || !meeting) return;
    saving    = true;
    pageError = '';
    const result = await issuesStore.assignToMeeting(meeting.id, {
      issueIds:   [...selectedIssues],
      commentIds: [...selectedComments],
      actionIds:  [...selectedActions]
    });
    saving = false;
    if (!result.success) { pageError = result.error ?? 'Assignment failed'; return; }
    show = false;
  }
</script>

<Modal bind:show title="Assign existing items to meeting" size="xlarge" on:close={() => show = false}>

  <div class="flex flex-col" style="height: 60vh; min-height: 400px;">

    <!-- Target meeting -->
    <div class="pb-3 mb-3 border-b border-slate-700 shrink-0">
      <p class="text-sm text-slate-300">
        Target meeting:
        <span class="font-semibold text-white">{meeting?.title}</span>
        <span class="text-slate-500 ml-1">{fmtDate(meeting?.meeting_date)} · {meeting?.meeting_type}</span>
      </p>
      <p class="text-xs text-slate-500 mt-0.5">
        Tagging an item makes it appear in this meeting's minutes.
        Items can be tagged independently — the issue record, individual comments, and individual actions.
      </p>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center gap-4 pb-3 mb-0 border-b border-slate-700 shrink-0 flex-wrap">
      <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
        <input type="checkbox" bind:checked={showOnlyUntagged} class="rounded" />
        Show only untagged items
      </label>
      <div class="flex gap-3 ml-auto text-xs">
        <button type="button"
          class="text-purple-300 hover:text-purple-100 underline"
          on:click={selectAll}>
          Select all visible
        </button>
        <button type="button"
          class="text-slate-400 hover:text-slate-200 underline"
          on:click={clearAll}>
          Clear all
        </button>
      </div>
      <span class="text-xs text-slate-500 shrink-0">
        {visibleIssues.length} {visibleIssues.length === 1 ? 'issue' : 'issues'} shown
      </span>
    </div>

    <!-- Issue list -->
    <div class="flex-1 overflow-y-auto divide-y divide-slate-700/50 mt-1">

      {#if visibleIssues.length === 0}
        <div class="py-12 text-center text-slate-500 italic text-sm">
          {showOnlyUntagged
            ? 'All items are already tagged to a meeting.'
            : 'No issues found.'}
        </div>

      {:else}
        {#each visibleIssues as issue (issue.id)}
          {@const vc        = visibleComments(issue)}
          {@const va        = visibleActions(issue)}
          {@const isExp     = expanded.has(issue.id)}
          {@const allSel    = isAllSelectedForIssue(issue)}
          {@const hasSubItems = vc.length > 0 || va.length > 0}
          {@const selfVisible = showOnlyUntagged ? isUntagged(issue) : true}

          <div class="py-3">

            <!-- Issue row -->
            <div class="flex items-start gap-3">

              <!-- Select-all checkbox for this issue -->
              <input
                type="checkbox"
                checked={allSel}
                aria-label="Select all items for issue {issue.name}"
                class="mt-0.5 rounded shrink-0 cursor-pointer"
                on:change={(e) => selectAllForIssue(issue, e.target.checked)}
              />

              <!-- Issue info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2 flex-wrap">
                  {#if issue.issue_number}
                    <span class="text-slate-400 font-mono text-xs shrink-0">#{issue.issue_number}</span>
                  {/if}
                  <span class="font-medium text-white text-sm">{issue.name}</span>
                  {#if !isUntagged(issue)}
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-amber-300 border border-slate-600 shrink-0">
                      tagged: {getMeetingLabel(issue.meeting_id)}
                    </span>
                  {/if}
                </div>
                {#if untaggedSummary(issue)}
                  <p class="text-xs text-slate-500 mt-0.5">{untaggedSummary(issue)}</p>
                {/if}
              </div>

              <!-- Expand button -->
              {#if hasSubItems || !showOnlyUntagged}
                <button
                  type="button"
                  class="text-xs text-slate-400 hover:text-slate-200 shrink-0 px-2 py-1
                         rounded border border-slate-700 hover:border-slate-500 transition-colors"
                  on:click={() => toggleExpand(issue.id)}
                >
                  {isExp ? '▲ collapse' : '▼ expand'}
                </button>
              {/if}
            </div>

            <!-- Expanded items -->
            {#if isExp}
              <div class="mt-3 ml-8 space-y-4">

                <!-- Issue record -->
                {#if selfVisible}
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIssues.has(issue.id)}
                      class="rounded"
                      on:change={() => toggleIssue(issue.id)}
                    />
                    <span class="text-xs font-semibold text-blue-300 uppercase tracking-wide">
                      Issue record
                    </span>
                    <span class="text-xs text-slate-500">tags the issue itself to this meeting</span>
                  </label>
                {:else if !showOnlyUntagged}
                  <p class="text-xs text-slate-500">
                    Issue already tagged: {getMeetingLabel(issue.meeting_id)}
                  </p>
                {/if}

                <!-- Comments -->
                {#if vc.length > 0}
                  <div>
                    <p class="text-[10px] uppercase tracking-wide text-blue-400/70 font-semibold mb-1.5">
                      Comments
                    </p>
                    <div class="space-y-2">
                      {#each vc as c (c.id)}
                        <label class="flex items-start gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={selectedComments.has(c.id)}
                            class="mt-0.5 rounded shrink-0"
                            on:change={() => toggleComment(c.id)}
                          />
                          <div class="min-w-0">
                            <p class="text-sm text-slate-200 group-hover:text-white leading-snug line-clamp-2">
                              {c.comment_text}
                            </p>
                            {#if !isUntagged(c)}
                              <p class="text-[10px] text-amber-400 mt-0.5">
                                currently tagged: {getMeetingLabel(c.meeting_id)}
                              </p>
                            {/if}
                          </div>
                        </label>
                      {/each}
                    </div>
                  </div>
                {/if}

                <!-- Actions -->
                {#if va.length > 0}
                  <div>
                    <p class="text-[10px] uppercase tracking-wide text-amber-400/70 font-semibold mb-1.5">
                      Actions
                    </p>
                    <div class="space-y-2">
                      {#each va as a (a.id)}
                        <label class="flex items-start gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={selectedActions.has(a.id)}
                            class="mt-0.5 rounded shrink-0"
                            on:change={() => toggleAction(a.id)}
                          />
                          <div class="min-w-0">
                            <p class="text-sm text-slate-200 group-hover:text-white leading-snug line-clamp-2">
                              {a.action_text}
                            </p>
                            <div class="flex items-center gap-2 flex-wrap text-[10px] text-slate-500 mt-0.5">
                              {#if a.name_text}<span>👤 {a.name_text}</span>{/if}
                              {#if a.status}<span class="capitalize">{a.status}</span>{/if}
                            </div>
                            {#if !isUntagged(a)}
                              <p class="text-[10px] text-amber-400">
                                currently tagged: {getMeetingLabel(a.meeting_id)}
                              </p>
                            {/if}
                          </div>
                        </label>
                      {/each}
                    </div>
                  </div>
                {/if}

              </div>
            {/if}

          </div>
        {/each}
      {/if}
    </div>

  </div>

  {#if pageError}
    <p class="text-sm text-red-400 mt-2">{pageError}</p>
  {/if}

  <div slot="footer" class="flex items-center justify-between gap-3 flex-wrap">
    <p class="text-sm text-slate-400">
      {#if totalSelected === 0}
        Nothing selected
      {:else}
        {totalSelected} item{totalSelected === 1 ? '' : 's'} selected
        {#if selectedIssues.size > 0}
          · {selectedIssues.size} issue{selectedIssues.size === 1 ? '' : 's'}
        {/if}
        {#if selectedComments.size > 0}
          · {selectedComments.size} comment{selectedComments.size === 1 ? '' : 's'}
        {/if}
        {#if selectedActions.size > 0}
          · {selectedActions.size} action{selectedActions.size === 1 ? '' : 's'}
        {/if}
      {/if}
    </p>
    <div class="flex gap-2">
      <Button variant="secondary" on:click={() => show = false} disabled={saving}>
        Cancel
      </Button>
      <Button
        variant="primary"
        icon="plus"
        on:click={handleAssign}
        disabled={saving || totalSelected === 0}
      >
        {saving ? 'Assigning…' : `Assign ${totalSelected > 0 ? totalSelected + ' item' + (totalSelected === 1 ? '' : 's') : 'nothing'}`}
      </Button>
    </div>
  </div>

</Modal>
