<!-- src/lib/apps/management/components/ActivityLogToolbar.svelte -->
<!-- The Activity Log header controls: Include/Hide Historic toggle + sort
     field select + sort direction button. Phase-2 example #3 (the first from
     ActivityLogSection): bindable props (showHistoric / sortField / sortDir)
     combined with a <select bind:value> and a bit of internal logic
     (toggleSortDir). See CLAUDE.md "Testing". -->
<script>
  import Button from '$lib/components/common/Button.svelte';

  export let historicCount = 0;
  export let showHistoric  = false;        // bindable
  export let sortField     = 'updated_at'; // bindable: 'updated_at'|'created_at'|'sequence'
  export let sortDir       = 'desc';       // bindable: 'desc'|'asc'

  function toggleSortDir() {
    sortDir = sortDir === 'desc' ? 'asc' : 'desc';
  }
</script>

{#if historicCount > 0}
  <Button variant="secondary" size="small" on:click={() => showHistoric = !showHistoric}>
    {showHistoric ? 'Hide' : 'Include'} Historic
  </Button>
{/if}

<!-- Sort controls -->
<div class="flex items-center gap-1">
  <select
    bind:value={sortField}
    class="text-xs bg-slate-700 border border-slate-600 rounded px-2 py-1 text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
  >
    <option value="updated_at">Modified</option>
    <option value="created_at">Created</option>
    <option value="sequence">Sequence</option>
  </select>
  <button
    on:click={toggleSortDir}
    class="text-xs px-2 py-1 bg-slate-700 border border-slate-600 rounded text-gray-300 hover:bg-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 leading-none"
    title={sortDir === 'desc' ? 'Newest first — click for oldest first' : 'Oldest first — click for newest first'}
  >
    {sortDir === 'desc' ? '↓' : '↑'}
  </button>
</div>
