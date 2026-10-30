<!-- src/lib/apps/dossier/components/DocTree.svelte -->
<!-- Recursive doc tree. Renders itself for children via <svelte:self>.
     All structural intent is dispatched upward — this component never touches
     the store, so the move guards in utils/docTree.js stay authoritative. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { createEventDispatcher } from 'svelte';
  import { permissions } from '#lib/stores/permissions.js';

  export let nodes      = [];     // tree nodes from buildTree()
  export let selectedId = null;
  export let depth      = 0;      // render depth, for indentation only
  export let collapsed  = {};     // id -> true when its children are hidden

  const dispatch = createEventDispatcher();

  $: canEdit = $permissions.isAdmin || $permissions.canModify;

  function toggle(id) {
    // Reassign so the change propagates through the recursive instances.
    collapsed = { ...collapsed, [id]: !collapsed[id] };
    dispatch('collapse', collapsed);
  }
</script>

<ul class="list-none m-0 p-0">
  {#each nodes as node (node.id)}
    <li>
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        class="group relative flex items-center gap-1 pr-1 py-1 rounded cursor-pointer
               hover:bg-slate-700/50 transition-colors
               {selectedId === node.id ? 'bg-slate-700' : ''}"
        style="padding-left: {depth * 12 + 4}px"
        title={node.title}
        on:click={() => dispatch('select', node)}
      >
        <!-- Expand / collapse -->
        {#if node.children.length}
          <Button variant="tertiary" size="xs" title={collapsed[node.id] ? 'Expand' : 'Collapse'} on:click={(e) => { e.stopPropagation(); (() => toggle(node.id))(e); }}>{collapsed[node.id] ? '▶' : '▼'}</Button>
        {:else}
          <span class="w-4 shrink-0"></span>
        {/if}

        <span class="flex-1 min-w-0 truncate text-sm
                     {selectedId === node.id ? 'text-white' : 'text-slate-300'}">
          {node.title}
        </span>

        {#if canEdit}
          <!-- Absolutely positioned so the controls consume NO width while
               hidden — otherwise seven buttons permanently squeeze the page
               title, which is what caused every name to truncate. They float
               over the row on hover, with the row's own background behind them.
               opacity (not `hidden`) keeps them keyboard-reachable. -->
          <span class="absolute right-1 top-1/2 -translate-y-1/2 z-10
                       flex items-center gap-0.5 rounded px-0.5
                       bg-slate-700 shadow-sm
                      ">
            <Button variant="tertiary" size="xs" title="Move up" on:click={(e) => { e.stopPropagation(); (() => dispatch('move', { node, kind: 'up' }))(e); }}>↑</Button>
            <Button variant="tertiary" size="xs" title="Move down" on:click={(e) => { e.stopPropagation(); (() => dispatch('move', { node, kind: 'down' }))(e); }}>↓</Button>
            <Button variant="tertiary" size="xs" title="Indent" on:click={(e) => { e.stopPropagation(); (() => dispatch('move', { node, kind: 'indent' }))(e); }}>→</Button>
            <Button variant="tertiary" size="xs" title="Outdent" on:click={(e) => { e.stopPropagation(); (() => dispatch('move', { node, kind: 'outdent' }))(e); }}>←</Button>
            <Button variant="tertiary" size="xs" title="New child page" on:click={(e) => { e.stopPropagation(); (() => dispatch('newChild', node))(e); }}>+</Button>
            <Button variant="tertiary" size="xs" title="Rename" on:click={(e) => { e.stopPropagation(); (() => dispatch('rename', node))(e); }}>✎</Button>
            {#if $permissions.isAdmin}
              <Button admin size="xs" title="Delete page" on:click={e => { e.stopPropagation(); dispatch('delete', node); }}>×</Button>
            {/if}
          </span>
        {/if}
      </div>

      {#if node.children.length && !collapsed[node.id]}
        <svelte:self
          nodes={node.children}
          {selectedId}
          depth={depth + 1}
          bind:collapsed
          on:select
          on:move
          on:newChild
          on:rename
          on:delete
          on:collapse
        />
      {/if}
    </li>
  {/each}
</ul>
