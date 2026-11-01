<!-- src/lib/apps/dossier/components/DocTree.svelte -->
<!-- Recursive doc tree. Renders itself for children via <svelte:self>.
     All structural intent is dispatched upward — this component never touches
     the store, so the move guards in utils/docTree.js stay authoritative.
     It has NO per-row buttons: seven of them covered every page name, and
     hiding them until hover was reversed because touch screens cannot hover
     (2026-10-27). The actions live in DocTreeToolbar, acting on the selected page. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { createEventDispatcher } from 'svelte';

  export let nodes      = [];     // tree nodes from buildTree()
  export let selectedId = null;
  export let depth      = 0;      // render depth, for indentation only
  export let collapsed  = {};     // id -> true when its children are hidden

  const dispatch = createEventDispatcher();

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

      </div>

      {#if node.children.length && !collapsed[node.id]}
        <svelte:self
          nodes={node.children}
          {selectedId}
          depth={depth + 1}
          bind:collapsed
          on:select
          on:collapse
        />
      {/if}
    </li>
  {/each}
</ul>
