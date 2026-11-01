<!-- src/lib/apps/dossier/components/DocTreeToolbar.svelte -->
<!-- The page actions, acting on the SELECTED page. They used to sit on every
     row (seven buttons covering each name); a row-level hover variant was
     tried and dropped because a touch screen cannot hover. One toolbar costs a
     row of height and is reachable by mouse, keyboard and touch alike.
     Like DocTree it only dispatches — the move guards stay in utils/docTree.js. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { createEventDispatcher } from 'svelte';

  /** The selected page, or null. */
  export let doc = null;
  export let isAdmin = false;

  const dispatch = createEventDispatcher();
  $: off = !doc;
</script>

<div class="flex items-center gap-0.5 px-1.5 py-1 border-b border-slate-700/50 shrink-0"
     role="toolbar" aria-label="Page actions" data-testid="doc-tree-toolbar">
  <Button variant="tertiary" size="xs" title="Move up" disabled={off} on:click={() => dispatch('move', { node: doc, kind: 'up' })}>↑</Button>
  <Button variant="tertiary" size="xs" title="Move down" disabled={off} on:click={() => dispatch('move', { node: doc, kind: 'down' })}>↓</Button>
  <Button variant="tertiary" size="xs" title="Indent" disabled={off} on:click={() => dispatch('move', { node: doc, kind: 'indent' })}>→</Button>
  <Button variant="tertiary" size="xs" title="Outdent" disabled={off} on:click={() => dispatch('move', { node: doc, kind: 'outdent' })}>←</Button>
  <span class="w-px h-4 bg-slate-700 mx-1"></span>
  <Button variant="tertiary" size="xs" title="New child page" disabled={off} on:click={() => dispatch('newChild', doc)}>+ Child</Button>
  <Button variant="tertiary" size="xs" title="Rename" disabled={off} on:click={() => dispatch('rename', doc)}>✎ Rename</Button>
  {#if isAdmin}
    <Button admin size="xs" title="Delete page" disabled={off} on:click={() => dispatch('delete', doc)}>× Delete</Button>
  {/if}
  {#if off}<span class="text-[10px] text-slate-500 ml-auto">Select a page</span>{/if}
</div>
