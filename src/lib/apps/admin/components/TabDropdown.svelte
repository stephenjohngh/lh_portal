<!-- src/lib/apps/admin/components/TabDropdown.svelte -->
<!-- A tab-bar dropdown: a trigger styled like a tab that opens a menu of
     sub-tabs. Highlights (and shows the active sub-tab's name) when one of its
     items is the current tab. Groups less-frequently-used admin tabs so the
     top bar stays short. Emits 'select' with the chosen tab id. -->
<script>
  import { createEventDispatcher } from 'svelte';

  export let label;            // group label, e.g. 'Other Config'
  export let icon = '';        // optional emoji
  export let items = [];       // [{ id, icon, label }]
  export let activeTab;        // current active tab id

  const dispatch = createEventDispatcher();

  let open = false;
  let root;                    // wrapper el — click-outside test

  $: activeItem = items.find(i => i.id === activeTab) ?? null;
  $: isActive   = !!activeItem;

  function toggle() { open = !open; }

  function choose(id) {
    open = false;
    dispatch('select', id);
  }

  function onWindowClick(e) {
    if (open && root && !root.contains(e.target)) open = false;
  }

  function onWindowKey(e) {
    if (e.key === 'Escape') open = false;
  }
</script>

<svelte:window on:click={onWindowClick} on:keydown={onWindowKey} />

<div class="dd" bind:this={root}>
  <button
    class="px-4 py-2 transition-colors {isActive
      ? 'border-b-2 border-purple-500 text-white font-semibold'
      : 'text-gray-400 hover:text-white'}"
    aria-haspopup="true"
    aria-expanded={open}
    on:click|stopPropagation={toggle}
  >
    <span class="flex items-center space-x-2">
      {#if icon}<span>{icon}</span>{/if}
      <span>{label}</span>
      {#if activeItem}<span class="text-xs text-muted">· {activeItem.label}</span>{/if}
      <span class="dd-caret" class:dd-open={open}>▾</span>
    </span>
  </button>

  {#if open}
    <div class="dd-menu">
      {#each items as item (item.id)}
        <button
          class="dd-item"
          class:dd-item-active={item.id === activeTab}
          on:click|stopPropagation={() => choose(item.id)}
        >
          {#if item.icon}<span>{item.icon}</span>{/if}
          <span>{item.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .dd { position: relative; display: inline-block; }
  .dd-caret { font-size: 0.7rem; transition: transform 0.15s; }
  .dd-open { transform: rotate(180deg); }
  .dd-menu {
    position: absolute; top: 100%; left: 0; z-index: 30; margin-top: 0.25rem;
    min-width: 12rem; background: rgb(30 41 59); border: 1px solid rgb(71 85 105);
    border-radius: 0.5rem; box-shadow: 0 10px 25px rgb(0 0 0 / 0.4); padding: 0.25rem;
    display: flex; flex-direction: column;
  }
  .dd-item {
    display: flex; align-items: center; gap: 0.5rem; width: 100%; text-align: left;
    padding: 0.5rem 0.75rem; border-radius: 0.375rem; color: rgb(203 213 225);
    font-size: 0.9rem; transition: background 0.12s, color 0.12s;
  }
  .dd-item:hover { background: rgb(51 65 85); color: white; }
  .dd-item-active { color: white; background: rgb(51 65 85); font-weight: 600; }
</style>
