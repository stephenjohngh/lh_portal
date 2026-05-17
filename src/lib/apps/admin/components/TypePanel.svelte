<!-- src/lib/apps/admin/components/TypePanel.svelte -->
<!-- Panel 2 of 4: Component Types for the selected System. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { buildingAssetsStore } from '$lib/apps/building_assets/stores/buildingAssetsStore.js';
  import { inp } from '$lib/apps/building_assets/ui.js';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

  export let types           = [];
  export let selectedSystemId = null;
  export let selectedTypeId   = null;

  const dispatch = createEventDispatcher();

  const MARKER_SHAPES  = ['circle', 'circle_inner', 'square', 'square_inner', 'diamond'];
  const MARKER_SIZES   = ['sm', 'md', 'lg', 'xl'];
  const PRIORITY_BASES = ['critical', 'high', 'medium', 'low'];

  let editingId    = null;
  let form         = {};
  let saving       = false;
  let deletingId   = null;
  let pendingDelete = null;  // id pending confirmation
  let error        = '';

  function deleteRow(id) {
    pendingDelete = id;
  }

  async function confirmDelete() {
    const id = pendingDelete;
    if (!id) return;
    deletingId = id;
    try {
      await buildingAssetsStore.deleteType(id);
      dispatch('saved');
    } catch (err) {
      error = err.message;
    } finally {
      deletingId    = null;
      pendingDelete = null;
    }
  }

  // Attr def counts per type (from live store)
  $: attrCounts = Object.entries($buildingAssetsStore.attrDefs).reduce((acc, [typeId, defs]) => {
    acc[typeId] = defs.length;
    return acc;
  }, {});

  function startEdit(t) {
    editingId = t.id;
    form = {
      name:               t.name,
      description:        t.description ?? '',
      notes:              t.notes ?? '',
      initial:            t.initial,
      colour:             '#' + t.colour,
      marker_shape:       t.marker_shape,
      marker_size:        t.marker_size ?? 'md',
      attribute_group:    t.attribute_group ?? '',
      inspection_panel:   t.inspection_panel,
      default_attribute:   t.default_attribute  ?? '',
      priority_base:       t.priority_base,
      presentation_order:  t.presentation_order,
      visible:             t.visible,
      highlight_attribute: t.highlight_attribute ?? '',
      highlight_colour:    t.highlight_colour ? '#' + t.highlight_colour : ''
    };
    error = '';
  }

  function startNew() {
    editingId = 'new';
    form = {
      name:               '',
      code:               '',
      description:        '',
      notes:              '',
      initial:            '',
      colour:             '#888888',
      marker_shape:       'circle',
      marker_size:        'md',
      attribute_group:    '',
      inspection_panel:   'standard',
      default_attribute:   '',
      priority_base:       'medium',
      presentation_order:  (types.length + 1) * 10,
      visible:             true,
      highlight_attribute: '',
      highlight_colour:    ''
    };
    error = '';
  }

  function cancel() {
    editingId = null;
    form      = {};
    error     = '';
  }

  async function save() {
    if (!form.name?.trim())    { error = 'Name is required'; return; }
    if (editingId === 'new') {
      if (!form.code?.trim())  { error = 'Code is required'; return; }
      if (!form.initial?.trim()) { error = 'Initial is required'; return; }
    }
    saving = true;
    error  = '';
    try {
      if (editingId === 'new') {
        const row = await buildingAssetsStore.createType({
          ...form,
          building_system_id: selectedSystemId
        });
        dispatch('saved');
        editingId = null;
        dispatch('select', row.id);
      } else {
        await buildingAssetsStore.updateType(editingId, form);
        dispatch('saved');
        editingId = null;
      }
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  const sel  = inp + ' cursor-pointer';

  const PRIORITY_COLOURS = {
    critical: 'bg-red-500/20 text-red-400',
    high:     'bg-orange-500/20 text-orange-400',
    medium:   'bg-yellow-500/20 text-yellow-400',
    low:      'bg-slate-500/20 text-slate-400'
  };
</script>

<div class="w-56 shrink-0 flex flex-col bg-slate-800/30">

  <!-- Header -->
  <div class="px-3 py-2.5 border-b border-slate-700 bg-slate-800/60">
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
      Types
      <span class="font-normal normal-case text-slate-600">({types.length})</span>
    </p>
  </div>

  <!-- List -->
  <div class="flex-1 overflow-y-auto">

    {#if !selectedSystemId}
      <p class="px-3 py-4 text-xs text-slate-600 italic">Select a system</p>

    {:else}
      {#each types as t (t.id)}

        {#if editingId === t.id}
          <!-- -- Inline edit form ----------------------------------- -->
          <div class="p-3 border-b border-slate-700 bg-slate-700/40">
            <p class="text-xs font-semibold text-purple-400 mb-2">Edit Type</p>
            {#if error}<p class="text-xs text-red-400 mb-2">{error}</p>{/if}
            <div class="space-y-1.5">
              <input bind:value={form.name}        class={inp} placeholder="Name *" />

              <!-- code: read-only when editing -->
              <div class="relative">
                <input
                  value={t.code}
                  disabled
                  class="{inp} opacity-50 cursor-not-allowed font-mono"
                  title="Code cannot be changed after creation"
                />
                <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-600">🔒</span>
              </div>

              <div class="flex gap-1.5">
                <input bind:value={form.initial} class="{inp} w-12 text-center font-bold uppercase"
                       maxlength="1" placeholder="A" title="Single character initial" />
                <input type="color" bind:value={form.colour}
                       class="h-[30px] w-10 rounded border border-slate-600 cursor-pointer bg-slate-900 p-0.5" />
                <input bind:value={form.colour}
                       class="{inp} flex-1 font-mono" placeholder="#888888" maxlength="7" />
              </div>

              <select bind:value={form.marker_shape} class={sel}>
                {#each MARKER_SHAPES as s}
                  <option value={s}>{s}</option>
                {/each}
              </select>

              <div>
                <label for="type-marker-size" class="text-xs text-slate-400 mb-1 block">Marker Size</label>
                <select id="type-marker-size" bind:value={form.marker_size} class={inp}>
                  {#each MARKER_SIZES as sz}
                    <option value={sz}>{sz === 'sm' ? 'Small' : sz === 'md' ? 'Medium' : sz === 'lg' ? 'Large' : 'X-Large'}</option>
                  {/each}
                </select>
              </div>

              <select bind:value={form.priority_base} class={sel}>
                {#each PRIORITY_BASES as p}
                  <option value={p}>{p}</option>
                {/each}
              </select>

              <input bind:value={form.attribute_group}   class={inp} placeholder="Attribute group (e.g. door)" />
              <input bind:value={form.inspection_panel}  class={inp} placeholder="Inspection panel (e.g. standard)" />
              <input bind:value={form.default_attribute} class={inp} placeholder="Default attribute value" />

              <input type="number" bind:value={form.presentation_order} class={inp} placeholder="Order" />

              <!-- Highlight halo -->
              <div class="pt-1 border-t border-slate-600/50 space-y-1">
                <p class="text-[10px] text-slate-500 uppercase tracking-wide">Highlight halo</p>
                <input bind:value={form.highlight_attribute} class={inp}
                       placeholder="Attribute name (e.g. Retained Open)" />
                <div class="flex gap-1.5 items-center">
                  {#if form.highlight_colour}
                    <input type="color" bind:value={form.highlight_colour}
                           class="h-[28px] w-8 rounded border border-slate-600 cursor-pointer bg-slate-900 p-0.5 shrink-0" />
                  {/if}
                  <input bind:value={form.highlight_colour}
                         class="{inp} flex-1 font-mono" placeholder="#colour (empty = auto)" maxlength="7" />
                  {#if form.highlight_colour}
                    <button type="button" on:click={() => form.highlight_colour = ''}
                            class="text-xs px-1.5 py-0.5 rounded bg-slate-600 hover:bg-slate-500 text-white shrink-0"
                            title="Clear — use auto-contrast colour">✕</button>
                  {/if}
                </div>
              </div>

              <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input type="checkbox" bind:checked={form.visible} class="rounded accent-purple-500" />
                Visible
              </label>
            </div>
            <div class="flex gap-2 mt-3">
              <button on:click={save} disabled={saving}
                class="flex-1 py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-500
                       disabled:opacity-50 text-white transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button on:click={cancel}
                class="px-3 py-1.5 text-xs rounded bg-slate-600 hover:bg-slate-500 text-white transition-colors">
                ✕
              </button>
            </div>
          </div>

        {:else}
          <!-- -- Normal row ----------------------------------------- -->
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="w-full text-left px-3 py-2.5 border-b border-slate-700/50 transition-colors group cursor-pointer
                   {selectedTypeId === t.id
                     ? 'bg-purple-600/15 border-l-2 border-l-purple-500'
                     : 'hover:bg-slate-700/40'}"
            on:click={() => dispatch('select', t.id)}
          >
            <div class="flex items-start justify-between gap-1 min-w-0">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 mb-0.5">
                  <!-- Colour badge with initial -->
                  <span
                    class="w-5 h-5 rounded text-xs font-bold flex items-center justify-center shrink-0 text-white"
                    style="background-color: #{t.colour}"
                  >{t.initial}</span>
                  <p class="text-sm font-medium truncate leading-tight
                             {t.visible ? 'text-white' : 'text-slate-500 line-through'}">
                    {t.name}
                  </p>
                </div>
                <p class="text-xs font-mono text-slate-500 truncate pl-6.5">{t.code}</p>
                <div class="flex items-center gap-1 mt-0.5 pl-6.5">
                  <span class="text-xs px-1 py-0.5 rounded {PRIORITY_COLOURS[t.priority_base] ?? ''}">
                    {t.priority_base}
                  </span>
                  {#if t.marker_size && t.marker_size !== 'md'}
                    <span class="text-xs px-1 py-0.5 rounded bg-slate-600/40 text-slate-400">
                      {t.marker_size}
                    </span>
                  {/if}
                  <span class="text-xs text-slate-600">
                    {attrCounts[t.id] ?? 0} attr{(attrCounts[t.id] ?? 0) === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <div class="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5">
                <button
                  class="text-xs px-1.5 py-0.5 rounded text-slate-500
                         hover:text-white hover:bg-slate-600 transition-colors"
                  on:click|stopPropagation={() => startEdit(t)}
                >Edit</button>
                <button
                  class="text-xs px-1.5 py-0.5 rounded text-slate-500
                         hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  disabled={deletingId === t.id}
                  on:click|stopPropagation={() => deleteRow(t.id)}
                  title="Delete type"
                >{deletingId === t.id ? '…' : '✕'}</button>
              </div>
            </div>
          </div>
        {/if}

      {/each}

      {#if types.length === 0 && editingId !== 'new'}
        <p class="px-3 py-4 text-xs text-slate-600 italic">No types in this system</p>
      {/if}

      <!-- -- New type form ---------------------------------------- -->
      {#if editingId === 'new'}
        <div class="p-3 bg-slate-700/40">
          <p class="text-xs font-semibold text-green-400 mb-2">New Type</p>
          {#if error}<p class="text-xs text-red-400 mb-2">{error}</p>{/if}
          <div class="space-y-1.5">
            <input bind:value={form.name}  class={inp} placeholder="Name *" />
            <input bind:value={form.code}  class="{inp} font-mono" placeholder="code_snake_case *"
                   title="Stable identifier — cannot change after creation" />

            <div class="flex gap-1.5">
              <input bind:value={form.initial} class="{inp} w-12 text-center font-bold uppercase"
                     maxlength="1" placeholder="A" title="Single character initial" />
              <input type="color" bind:value={form.colour}
                     class="h-[30px] w-10 rounded border border-slate-600 cursor-pointer bg-slate-900 p-0.5" />
              <input bind:value={form.colour}
                     class="{inp} flex-1 font-mono" placeholder="#888888" maxlength="7" />
            </div>

            <select bind:value={form.marker_shape} class={sel}>
              {#each MARKER_SHAPES as s}
                <option value={s}>{s}</option>
              {/each}
            </select>

            <div>
              <label for="new-type-marker-size" class="text-xs text-slate-400 mb-1 block">Marker Size</label>
              <select id="new-type-marker-size" bind:value={form.marker_size} class={inp}>
                {#each MARKER_SIZES as sz}
                  <option value={sz}>{sz === 'sm' ? 'Small' : sz === 'md' ? 'Medium' : sz === 'lg' ? 'Large' : 'X-Large'}</option>
                {/each}
              </select>
            </div>

            <select bind:value={form.priority_base} class={sel}>
              {#each PRIORITY_BASES as p}
                <option value={p}>{p}</option>
              {/each}
            </select>

            <input bind:value={form.attribute_group}  class={inp} placeholder="Attribute group (e.g. door)" />
            <input bind:value={form.inspection_panel} class={inp} placeholder="Inspection panel" />

            <input type="number" bind:value={form.presentation_order} class={inp} placeholder="Order" />

            <!-- Highlight halo -->
            <div class="pt-1 border-t border-slate-600/50 space-y-1">
              <p class="text-[10px] text-slate-500 uppercase tracking-wide">Highlight halo</p>
              <input bind:value={form.highlight_attribute} class={inp}
                     placeholder="Attribute name (e.g. Retained Open)" />
              <div class="flex gap-1.5 items-center">
                {#if form.highlight_colour}
                  <input type="color" bind:value={form.highlight_colour}
                         class="h-[28px] w-8 rounded border border-slate-600 cursor-pointer bg-slate-900 p-0.5 shrink-0" />
                {/if}
                <input bind:value={form.highlight_colour}
                       class="{inp} flex-1 font-mono" placeholder="#colour (empty = auto)" maxlength="7" />
                {#if form.highlight_colour}
                  <button type="button" on:click={() => form.highlight_colour = ''}
                          class="text-xs px-1.5 py-0.5 rounded bg-slate-600 hover:bg-slate-500 text-white shrink-0"
                          title="Clear — use auto-contrast colour">✕</button>
                {/if}
              </div>
            </div>

            <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input type="checkbox" bind:checked={form.visible} class="rounded accent-purple-500" />
              Visible
            </label>
          </div>
          <div class="flex gap-2 mt-3">
            <button on:click={save} disabled={saving}
              class="flex-1 py-1.5 text-xs rounded bg-green-600 hover:bg-green-500
                     disabled:opacity-50 text-white transition-colors">
              {saving ? 'Creating…' : 'Create'}
            </button>
            <button on:click={cancel}
              class="px-3 py-1.5 text-xs rounded bg-slate-600 hover:bg-slate-500 text-white transition-colors">
              ✕
            </button>
          </div>
        </div>
      {/if}
    {/if}

  </div>

  <!-- Footer: Add button -->
  {#if selectedSystemId && editingId !== 'new'}
    <div class="px-3 py-2.5 border-t border-slate-700">
      <button
        on:click={startNew}
        class="w-full py-1.5 text-xs rounded border border-dashed border-slate-600
               text-slate-400 hover:text-white hover:border-purple-500 transition-colors"
      >+ Add Type</button>
    </div>
  {/if}

</div>

<ConfirmDialog
  show={!!pendingDelete}
  title="Delete type"
  message="Delete this type? This will also delete its attribute definitions and options."
  confirmText="Delete"
  danger={true}
  processing={!!deletingId}
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
