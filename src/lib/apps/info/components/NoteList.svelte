<!-- src/lib/apps/info/components/NoteList.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { permissions } from '$lib/stores/permissions';
  import Icon            from '$lib/components/icons/Icon.svelte';
  import Button          from '$lib/components/common/Button.svelte';
  import LoadingSpinner  from '$lib/components/common/LoadingSpinner.svelte';
  import { fmtDate }     from '$lib/utils/dates.js';

  export let notes       = [];
  export let loading     = false;
  export let showSection = true;  // show section dot+name when viewing All Notes

  const dispatch = createEventDispatcher();

  let search       = '';
  let showArchived = false;

  $: filtered = notes.filter(n => {
    if (!showArchived && n.status === 'archived') return false;
    if (showArchived  && n.status !== 'archived') return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      (n.body  ?? '').toLowerCase().includes(q) ||
      (n.tags  ?? []).some(t => t.toLowerCase().includes(q))
    );
  });

  $: activeCount   = notes.filter(n => n.status !== 'archived').length;
  $: archivedCount = notes.filter(n => n.status === 'archived').length;
</script>

<div class="flex flex-col h-full">

  <!-- Toolbar -->
  <div class="flex items-center gap-2 px-4 py-3 border-b border-slate-700 bg-slate-800/30">
    <!-- Search -->
    <div class="relative flex-1">
      <Icon name="search" size={4}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
      <input
        type="text"
        bind:value={search}
        placeholder="Search notes…"
        class="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-700/50 border border-slate-600
               rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none
               focus:border-purple-500"
      />
    </div>

    <!-- Archive toggle -->
    <button
      class="px-2.5 py-1.5 text-xs rounded-lg border transition-colors
             {showArchived
               ? 'bg-slate-600 border-slate-500 text-slate-200'
               : 'border-slate-600 text-slate-500 hover:border-slate-400 hover:text-slate-300'}"
      title="{showArchived ? 'Show active notes' : 'Show archived notes'}"
      on:click={() => showArchived = !showArchived}
    >
      <Icon name="archive" size={3} className="inline -mt-0.5 mr-1" />
      {showArchived ? 'Archived' : archivedCount > 0 ? `${archivedCount} archived` : 'Archive'}
    </button>

    <!-- New Note -->
    {#if $permissions.canModify}
      <Button variant="primary" size="small" icon="plus"
              on:click={() => dispatch('new')}>New Note</Button>
    {/if}
  </div>

  <!-- List -->
  {#if loading}
    <div class="flex-1 flex items-center justify-center">
      <LoadingSpinner size="medium" />
    </div>

  {:else if filtered.length === 0}
    <div class="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500 p-8">
      {#if search}
        <Icon name="search" size={8} />
        <p class="text-sm">No notes match "{search}"</p>
        <button class="text-xs text-purple-400 hover:text-purple-300"
                on:click={() => search = ''}>Clear search</button>
      {:else if showArchived}
        <Icon name="archive" size={8} />
        <p class="text-sm">No archived notes in this section</p>
      {:else}
        <Icon name="book" size={8} />
        <p class="text-sm">No notes yet</p>
        {#if $permissions.canModify}
          <Button variant="primary" size="small" icon="plus"
                  on:click={() => dispatch('new')}>Create the first note</Button>
        {/if}
      {/if}
    </div>

  {:else}
    <div class="flex-1 overflow-y-auto divide-y divide-slate-700/50">
      {#each filtered as note (note.id)}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div
          class="px-4 py-3 cursor-pointer hover:bg-slate-700/30 transition-colors"
          on:click={() => dispatch('select', note)}
        >
          <div class="flex items-start gap-2 min-w-0">
            <!-- Pin star -->
            {#if note.is_pinned}
              <span class="text-amber-400 mt-0.5 shrink-0" title="Pinned">★</span>
            {/if}

            <div class="flex-1 min-w-0">
              <!-- Title row -->
              <div class="flex items-center gap-2 mb-0.5">
                <span class="font-semibold text-white text-sm truncate">{note.title}</span>
                {#if note.status === 'archived'}
                  <span class="shrink-0 text-xs text-slate-500 border border-slate-600
                               rounded px-1 py-px">archived</span>
                {/if}
              </div>

              <!-- Body preview -->
              {#if note.body}
                <p class="text-xs text-slate-400 line-clamp-2 mb-1">{note.body}</p>
              {/if}

              <!-- Meta row -->
              <div class="flex items-center gap-3 flex-wrap text-xs text-slate-500">
                {#if showSection && note.section}
                  <span class="flex items-center gap-1">
                    <span class="w-2 h-2 rounded-full"
                          style="background:{note.section.colour}"></span>
                    {note.section.name}
                  </span>
                {/if}

                {#if (note.documents ?? []).length > 0}
                  <span>📎 {note.documents.length}</span>
                {/if}

                {#each (note.tags ?? []).slice(0, 3) as tag}
                  <span class="bg-slate-700 rounded px-1.5 py-px">{tag}</span>
                {/each}

                <span class="ml-auto tabular-nums">{fmtDate(note.updated_at)}</span>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Footer count -->
  {#if !loading}
    <div class="px-4 py-2 border-t border-slate-700 text-xs text-slate-600">
      {filtered.length} {showArchived ? 'archived' : 'active'} note{filtered.length === 1 ? '' : 's'}
      {#if search}&nbsp;· matching "{search}"{/if}
    </div>
  {/if}
</div>
