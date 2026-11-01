<!-- src/lib/apps/dossier/components/PageTreeList.svelte -->
<!-- The pack's pages as the same indented tree the sidebar shows, to pick one.
     Searching flattens it: a match deep in the tree is shown on its own, with its
     parent's name, rather than hidden under a collapsed branch. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { matchesSearch } from '#lib/utils/textSearch.js';
  import { flattenTree } from '../utils/docTree.js';

  export let docs = [];
  /** A page that cannot be chosen (the one being edited). */
  export let excludeId = null;
  export let search = '';

  const dispatch = createEventDispatcher();
  $: rows = flattenTree(docs);
  $: titleOf = new Map(docs.map(d => [d.id, d.title]));
  $: searching = !!search.trim();
  $: visible = searching ? rows.filter(r => r.id !== excludeId && matchesSearch([r.title, r.slug], search)) : rows;
</script>

<div class="max-h-80 overflow-y-auto" data-testid="page-tree-list">
  {#each visible as doc (doc.id)}
    {@const blocked = doc.id === excludeId}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div
      class="flex items-center gap-2 py-1.5 pr-2 rounded transition-colors
             {blocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-700'}"
      style="padding-left: {(searching ? 0 : doc.depth) * 14 + 8}px"
      data-testid="page-row"
      on:click={() => { if (!blocked) dispatch('pick', doc); }}
    >
      <span class="text-slate-500 shrink-0 text-xs">{doc.depth && !searching ? '↳' : '▤'}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-slate-200 truncate">{doc.title}</p>
        {#if searching && doc.parent_doc_id}<p class="text-[11px] text-slate-500 truncate">in {titleOf.get(doc.parent_doc_id) ?? '…'}</p>{/if}
      </div>
      {#if blocked}<span class="text-[10px] text-slate-500 shrink-0">this page</span>{/if}
    </div>
  {/each}
  {#if visible.length === 0}
    <p class="text-xs text-slate-500 text-center py-6">No pages match “{search}”.</p>
  {/if}
</div>
