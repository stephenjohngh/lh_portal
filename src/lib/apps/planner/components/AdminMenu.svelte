<!-- src/lib/apps/planner/components/AdminMenu.svelte -->
<!-- The planner's admin-only menu.

     There is one item in it today — Categories — which would make a plain
     button the simpler thing. It is a menu anyway because the alternative is
     that the second admin control lands beside "+ New event" and the toolbar
     grows a button every time something is configurable. A named place for
     "settings only an admin touches" also says, without a tooltip, that these
     are a different kind of control from the ones next to them.

     Open state is CONTROLLED by the parent, the same way MultiSelectDropdown
     works, so only one menu in the toolbar can be open at a time and the
     parent's click-outside handling covers both. -->
<script>
  import { createEventDispatcher } from 'svelte';

  /** [{ id, label, hint? }] */
  export let items = [];
  export let open = false;

  const dispatch = createEventDispatcher();

  function choose(id) {
    dispatch('select', id);
  }
</script>

<div class="relative">
  <button
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    title="Settings only an admin can change"
    class="bg-slate-700 border border-slate-600 hover:border-slate-500 rounded
           px-3 py-1.5 text-xs text-white flex items-center gap-1.5
           focus:outline-none transition-colors"
    on:click={() => dispatch('toggle')}
  >
    Admin
    <span class="text-slate-500 text-[10px]">▾</span>
  </button>

  {#if open}
    <!-- Right-aligned: the menu sits near the end of the toolbar, and a
         left-aligned one would hang off the edge on a narrow screen. -->
    <div role="menu"
         class="absolute top-full right-0 mt-1 z-50 min-w-max py-1
                bg-slate-800 border border-slate-600 rounded-lg shadow-xl">
      {#each items as item (item.id)}
        <button
          type="button"
          role="menuitem"
          class="w-full text-left px-3 py-1.5 hover:bg-slate-700/80 transition-colors"
          on:click={() => choose(item.id)}
        >
          <span class="block text-xs text-slate-200 whitespace-nowrap">{item.label}</span>
          {#if item.hint}
            <span class="block text-[10px] text-slate-500 whitespace-nowrap">{item.hint}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
