<!-- src/lib/apps/dossier/components/PackList.svelte -->
<!-- The Pack list — the app's landing surface. Rows are clickable divs (not
     buttons) because they contain action buttons; nesting interactive elements
     is a Svelte a11y compile error. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button          from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import LoadingSpinner  from '$lib/components/common/LoadingSpinner.svelte';
  import Icon            from '$lib/components/icons/Icon.svelte';
  import { fmtDate }     from '$lib/utils/dates';

  export let packs   = [];
  export let loading = false;

  const dispatch = createEventDispatcher();

  let showArchived = false;

  $: visible = packs.filter(p => showArchived ? p.status === 'archived' : p.status !== 'archived');
  $: archivedCount = packs.filter(p => p.status === 'archived').length;
</script>

<div class="flex flex-col h-full">

  <!-- Toolbar -->
  <div class="flex items-center gap-3 px-5 py-3 border-b border-slate-700 shrink-0">
    <p class="text-sm font-semibold text-white">
      {showArchived ? 'Archived packs' : 'Packs'}
      <span class="text-slate-500 font-normal">({visible.length})</span>
    </p>

    <div class="flex-1"></div>

    {#if archivedCount > 0 || showArchived}
      <button
        class="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
        on:click={() => showArchived = !showArchived}
      >
        {showArchived ? '← Back to active' : `Archived (${archivedCount})`}
      </button>
    {/if}

    <!-- Not a filter on this list: it shows PUBLICATIONS, of which one pack can
         have several, and the question it answers spans every pack. -->
    <button
      class="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
      title="Every link issued from every pack"
      on:click={() => dispatch('showPublished')}
    >Published links</button>

    <Button variant="primary" size="small" on:click={() => dispatch('new')}>
      + New Pack
    </Button>
  </div>

  <!-- Body -->
  <div class="flex-1 min-h-0 overflow-y-auto p-4">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <LoadingSpinner size="large" />
      </div>

    {:else if visible.length === 0}
      <div class="text-center py-16 px-4">
        <p class="text-slate-400 text-sm">
          {#if showArchived}
            No archived packs.
          {:else}
            No packs yet.
          {/if}
        </p>
        {#if !showArchived}
          <p class="text-slate-500 text-xs mt-2 max-w-md mx-auto">
            A pack is a briefing you assemble for someone outside the portal —
            a narrative, a chronology and the evidence behind it.
          </p>
        {/if}
      </div>

    {:else}
      <div class="space-y-2">
        {#each visible as pack (pack.id)}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="group flex items-start gap-3 p-4 rounded-lg border border-slate-700
                   bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600
                   cursor-pointer transition-colors"
            on:click={() => dispatch('open', pack)}
          >
            <div class="text-slate-500 mt-0.5 shrink-0">
              <Icon name="book" size={18} />
            </div>

            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-white truncate">{pack.title}</p>
              {#if pack.description}
                <p class="text-xs text-slate-400 mt-1 line-clamp-2">{pack.description}</p>
              {/if}
              <p class="text-xs text-slate-500 mt-1.5">
                Updated {fmtDate(pack.updated_at ?? pack.created_at)}
              </p>
            </div>

            <div class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100
                        focus-within:opacity-100 transition-opacity">
              <Button variant="secondary" size="small"
                      on:click={(e) => { e.stopPropagation(); dispatch('edit', pack); }}>
                Edit
              </Button>
              <Button variant="secondary" size="small"
                      title="Make an independent copy — the way to reuse a pack as a template"
                      on:click={(e) => { e.stopPropagation(); dispatch('duplicate', pack); }}>
                Duplicate
              </Button>
              <Button variant="secondary" size="small"
                      on:click={(e) => { e.stopPropagation(); dispatch('archive', pack); }}>
                {pack.status === 'archived' ? 'Restore' : 'Archive'}
              </Button>
              <ProtectedButton requireAdmin={true} variant="danger" size="small"
                      title="Delete this pack and everything in it"
                      on:click={(e) => { e.stopPropagation(); dispatch('delete', pack); }}>
                Delete
              </ProtectedButton>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
