<!-- src/lib/apps/planner/components/CategoriesModal.svelte -->
<!-- The building's own categories.

     Four of them are marked "used by other apps" and cannot be removed: the
     aggregation files every maintenance job, meeting, action deadline and
     Golden Thread review under one of them, so deleting one would leave those
     items uncategorised with no way to put it right. They can be renamed and
     recoloured — what a building calls its own compliance work is its business.

     Colour is a choice from a fixed palette rather than a colour picker. That
     is not a limitation to apologise for: Tailwind generates only the classes
     it can see in the source, so a hex value chosen here would render as no
     colour at all. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal         from '$lib/components/common/Modal.svelte';
  import Button        from '$lib/components/common/Button.svelte';
  import FormInput     from '$lib/components/common/FormInput.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import { PALETTE, swatch, pickable } from '../utils/categories.js';

  export let show = false;
  export let categories = [];
  export let canEdit = false;
  export let canDelete = false;
  export let error = '';

  const dispatch = createEventDispatcher();

  let newName = '';
  let newColour = 'sky';

  /** The one being renamed, and what it is being renamed to. */
  let editingId = null;
  let editName = '';

  let pendingDelete = null;

  $: ordered = pickable(categories);

  function add() {
    if (!newName.trim()) return;
    dispatch('create', { name: newName.trim(), colour: newColour });
    newName = '';
  }

  function startRename(category) {
    editingId = category.id;
    editName = category.name;
  }

  function saveRename() {
    const id = editingId;
    const name = editName.trim();
    editingId = null;
    if (id && name) dispatch('update', { id, name });
  }

  function confirmDelete() {
    const category = pendingDelete;
    pendingDelete = null;
    if (category) dispatch('delete', category);
  }
</script>

<Modal bind:show title="Categories" size="large" on:close={() => dispatch('close')}>
  {#if error}
    <div class="mb-3"><ErrorDisplay message={error} onDismiss={() => error = ''} /></div>
  {/if}

  <div class="space-y-1.5">
    {#each ordered as category (category.id)}
      <div class="flex items-center gap-3 p-2 rounded border border-slate-700 bg-slate-800/40">
        <span class="w-2.5 h-2.5 rounded-full shrink-0 {swatch(category.colour).dot}"></span>

        {#if editingId === category.id}
          <input
            bind:value={editName}
            on:keydown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') editingId = null; }}
            class="flex-1 px-2 py-0.5 text-sm bg-slate-900 border border-slate-600 rounded
                   text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <Button variant="primary" size="small" on:click={saveRename}>Save</Button>
          <Button variant="secondary" size="small" on:click={() => editingId = null}>Cancel</Button>
        {:else}
          <span class="text-sm text-white flex-1">{category.name}</span>

          {#if category.system}
            <span class="text-[10px] text-slate-500"
                  title="Items from other apps are filed under this, so it cannot be removed">
              used by other apps
            </span>
          {/if}

          {#if canEdit}
            <!-- Recolouring is a row of swatches rather than a dropdown: the
                 choice IS the colour, and reading its name to pick it is a step
                 nobody needs. -->
            <div class="flex items-center gap-1">
              {#each PALETTE as colour}
                <button
                  type="button"
                  title={colour.label}
                  aria-label={colour.label}
                  class="w-3 h-3 rounded-full {colour.dot} transition-transform
                         {category.colour === colour.key
                           ? 'ring-2 ring-offset-1 ring-offset-slate-800 ring-white/60 scale-110'
                           : 'opacity-50 hover:opacity-100'}"
                  on:click={() => dispatch('update', { id: category.id, colour: colour.key })}
                ></button>
              {/each}
            </div>

            <button type="button" class="text-slate-600 hover:text-purple-300 text-xs px-1"
                    title="Rename" on:click={() => startRename(category)}>✎</button>
          {/if}

          {#if canDelete && !category.system}
            <button type="button" class="text-slate-600 hover:text-red-400 text-xs px-1"
                    title="Remove" on:click={() => pendingDelete = category}>×</button>
          {/if}
        {/if}
      </div>
    {/each}
  </div>

  {#if canEdit}
    <div class="mt-4 pt-3 border-t border-slate-700">
      <p class="text-xs text-slate-400 mb-2">Add a category</p>
      <div class="flex items-end gap-2 flex-wrap">
        <div class="flex-1 min-w-[10rem]">
          <FormInput label="Name" bind:value={newName} placeholder="e.g. Fire safety" />
        </div>

        <div class="flex items-center gap-1 pb-2">
          {#each PALETTE as colour}
            <button
              type="button"
              title={colour.label}
              aria-label={colour.label}
              class="w-4 h-4 rounded-full {colour.dot} transition-transform
                     {newColour === colour.key
                       ? 'ring-2 ring-offset-1 ring-offset-slate-800 ring-white/60 scale-110'
                       : 'opacity-50 hover:opacity-100'}"
              on:click={() => newColour = colour.key}
            ></button>
          {/each}
        </div>

        <div class="pb-2">
          <Button variant="primary" size="small" disabled={!newName.trim()} on:click={add}>
            Add
          </Button>
        </div>
      </div>
    </div>
  {/if}

  <div slot="footer" class="flex justify-end">
    <Button variant="secondary" on:click={() => dispatch('close')}>Close</Button>
  </div>
</Modal>

<ConfirmDialog
  show={!!pendingDelete}
  danger={true}
  title="Remove this category?"
  message={pendingDelete
    ? `“${pendingDelete.name}” goes. Events filed under it keep their entry and show in grey until they are given another category — nothing is deleted with it.`
    : ''}
  confirmText="Remove"
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
