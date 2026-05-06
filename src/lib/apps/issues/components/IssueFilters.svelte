<!-- src/lib/apps/issues/components/IssueFilters.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { STATUS_FILTERS } from '$lib/utils/constants';
  import Button from '$lib/components/common/Button.svelte';

  export let searchTerm    = '';
  export let statusFilter  = 'current';
  export let resultCount   = 0;
  export let showExpandToggle = false;
  export let allExpanded   = false;
  export let issues        = [];   // all issues — for the jump-to dropdown

  const dispatch = createEventDispatcher();

  function handleToggleExpand() {
    dispatch('toggleExpand', !allExpanded);
  }

  $: sortedIssues = [...issues].sort((a, b) => (a.issue_number ?? 0) - (b.issue_number ?? 0));

  function handleJump(e) {
    const issueId = e.target.value;
    if (!issueId) return;
    dispatch('jumptoissue', { issueId });
    // Reset immediately so the placeholder re-appears
    e.target.value = '';
  }
</script>

<div class="space-y-3">
  <!-- Search / Jump / Status row -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-3">

    <!-- Search -->
    <input
      type="text"
      bind:value={searchTerm}
      placeholder="Search issues…"
      class="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white
             placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
    />

    <!-- Jump-to-issue dropdown -->
    <select
      value=""
      on:change={handleJump}
      class="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white
             focus:outline-none focus:ring-2 focus:ring-purple-500"
    >
      <option value="" disabled>Jump to issue…</option>
      {#each sortedIssues as issue (issue.id)}
        <option value={issue.id}>
          {#if issue.issue_number}#{issue.issue_number} — {/if}{issue.name}
        </option>
      {/each}
    </select>

    <!-- Status filter -->
    <select
      bind:value={statusFilter}
      class="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white
             focus:outline-none focus:ring-2 focus:ring-purple-500"
    >
      {#each STATUS_FILTERS as filter}
        <option value={filter.value}>{filter.label}</option>
      {/each}
    </select>

  </div>

  <!-- Results Count and Toggle -->
  <div class="flex justify-between items-center">
    <div class="text-sm text-gray-400">
      {resultCount} {resultCount === 1 ? 'issue' : 'issues'} found
      <span class="text-gray-500">
        ({STATUS_FILTERS.find(f => f.value === statusFilter)?.label || 'current'})
      </span>
    </div>
    
    <!-- Expand/Collapse Toggle -->
    {#if showExpandToggle}
      <Button
        variant="primary"
        size="medium"
        icon={allExpanded ? 'chevron-up' : 'chevron-down'}
        on:click={handleToggleExpand}
      >
        {allExpanded ? 'Collapse All' : 'Expand All'}
      </Button>
    {/if}
  </div>
</div>
