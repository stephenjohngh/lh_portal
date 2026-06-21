<!-- src/lib/apps/info/components/SectionSidebar.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { permissions }  from '$lib/stores/permissions';
  import Icon             from '$lib/components/icons/Icon.svelte';
  import ProtectedButton  from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog    from '$lib/components/common/ConfirmDialog.svelte';

  export let sections        = [];
  export let selectedId      = null;   // null = All Notes
  export let noteCounts      = {};     // { sectionId: count }

  const dispatch = createEventDispatcher();

  let pendingDelete   = null;
  let deleting        = false;

  // Reactive (not a function call in markup — that wouldn't re-run when
  // noteCounts changes, since Svelte can't see the dependency inside it).
  $: totalCount = Object.values(noteCounts).reduce((s, n) => s + n, 0);

  function requestDelete(section, e) {
    e.stopPropagation();
    pendingDelete = section;
  }

  async function confirmDelete() {
    deleting = true;
    try {
      dispatch('delete', pendingDelete);
    } finally {
      deleting     = false;
      pendingDelete = null;
    }
  }
</script>

<aside class="w-52 shrink-0 border-r border-slate-700 bg-slate-800/40
              flex flex-col h-full overflow-y-auto">

  <!-- All Notes -->
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div
    class="flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors text-sm
           {selectedId === null
             ? 'bg-purple-600/20 text-purple-300 border-r-2 border-purple-500'
             : 'text-slate-300 hover:bg-slate-700/50'}"
    on:click={() => dispatch('select', null)}
  >
    <Icon name="book" size={4} className="shrink-0" />
    <span class="flex-1 font-medium">All Notes</span>
    <span class="text-xs text-slate-500 tabular-nums">{totalCount}</span>
  </div>

  <div class="px-3 pt-3 pb-1">
    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sections</p>
  </div>

  {#each sections as section (section.id)}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div
      class="group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors text-sm
             {selectedId === section.id
               ? 'bg-purple-600/20 text-purple-300 border-r-2 border-purple-500'
               : 'text-slate-300 hover:bg-slate-700/50'}"
      title={section.description || section.name}
      on:click={() => dispatch('select', section.id)}
    >
      <span class="w-2.5 h-2.5 rounded-full shrink-0"
            style="background:{section.colour}"></span>
      <span class="flex-1 truncate">{section.name}</span>
      <span class="text-xs text-slate-500 tabular-nums">{noteCounts[section.id] ?? 0}</span>

      {#if $permissions.isAdmin}
        <div class="hidden group-hover:flex items-center gap-0.5">
          <button
            class="p-0.5 rounded text-slate-500 hover:text-purple-300 transition-colors"
            title="Edit section"
            on:click|stopPropagation={() => dispatch('edit', section)}
          >
            <Icon name="edit" size={3} />
          </button>
          <button
            class="p-0.5 rounded text-slate-500 hover:text-red-400 transition-colors"
            title="Delete section"
            on:click|stopPropagation={(e) => requestDelete(section, e)}
          >
            <Icon name="delete" size={3} />
          </button>
        </div>
      {/if}
    </div>
  {/each}

  {#if sections.length === 0}
    <p class="px-3 py-2 text-xs text-slate-600 italic">No sections yet</p>
  {/if}

  <!-- New Section (admin only) -->
  {#if $permissions.isAdmin}
    <div class="mt-auto px-3 py-3 border-t border-slate-700">
      <button
        class="w-full flex items-center gap-1.5 text-xs text-slate-500
               hover:text-purple-300 transition-colors"
        on:click={() => dispatch('newSection')}
      >
        <Icon name="plus" size={3} />
        New Section
      </button>
    </div>
  {/if}
</aside>

<!-- Delete confirm -->
<ConfirmDialog
  show={!!pendingDelete}
  danger={true}
  processing={deleting}
  title="Delete Section"
  message="Delete '{pendingDelete?.name}'? All notes and documents in this section will be permanently deleted."
  confirmLabel="Delete Section"
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
