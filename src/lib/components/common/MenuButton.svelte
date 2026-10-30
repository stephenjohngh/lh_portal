<!-- src/lib/components/common/MenuButton.svelte -->
<!-- A button that opens a small menu of actions. The one place a menu is drawn,
     so every menu looks and behaves alike (it was hand-written in the schematic
     toolbar). `admin` gives the amber-on-brown look of anything only an
     administrator sees. Dispatches `select` with the item's key. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button from './Button.svelte';

  /** The button's text. */
  export let label = '';
  /** @type {{ key: string, label: string, icon?: string, danger?: boolean }[]} */
  export let items = [];
  export let admin = false;
  export let size = 'small';
  export let variant = 'secondary';

  const dispatch = createEventDispatcher();
  let open = false;

  function pick(key) {
    open = false;
    dispatch('select', key);
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="relative shrink-0" on:mouseleave={() => open = false}>
  <Button {variant} {size} {admin} on:click={() => open = !open}>
    {label}
    <span class="ml-1.5 text-[10px] opacity-70">{open ? '▲' : '▼'}</span>
  </Button>

  {#if open}
    <div
      class="absolute left-0 top-full mt-1 z-50 min-w-[10rem] rounded-lg shadow-xl flex flex-col py-1 text-xs
             {admin ? 'admin-only' : 'bg-slate-800 border border-slate-600'}"
    >
      {#each items as it (it.key)}
        <button
          type="button"
          class="flex items-center gap-2 px-3 py-2 text-left transition-colors
                 {it.danger ? 'text-red-400' : admin ? 'text-amber-200' : 'text-slate-300'}
                 {admin ? 'hover:bg-amber-900/40' : 'hover:bg-slate-700'}"
          on:click={() => pick(it.key)}
        >
          {#if it.icon}<span class="w-4 text-center">{it.icon}</span>{/if}
          {it.label}
        </button>
      {/each}
    </div>
  {/if}
</div>
