<!-- src/lib/apps/v2proto/components/admin/AttrDefPanel.svelte -->
<!-- Panel 3 of 4: Attribute Definitions for the selected Type. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { v2protoStore } from '../../stores/v2protoStore.js';

  export let attrDefs          = [];   // type_attributes[] for selected type
  export let selectedTypeId    = null;
  export let selectedAttrDefId = null;

  const dispatch = createEventDispatcher();

  const DISPLAY_TYPES = ['text', 'number', 'checkbox', 'dropdown', 'radio', 'textarea'];

  let editingId = null;
  let form      = {};
  let saving    = false;
  let error     = '';

  $: existingPrimary = attrDefs.find(d => d.is_primary && d.id !== editingId);

  function startEdit(def) {
    editingId = def.id;
    form = {
      name:               def.name,
      display_type:       def.display_type,
      required:           def.required,
      default_value:      def.default_value ?? '',
      is_primary:         def.is_primary,
      presentation_order: def.presentation_order,
      visible:            def.visible
    };
    error = '';
  }

  function startNew() {
    editingId = 'new';
    form = {
      name:               '',
      display_type:       'text',
      required:           false,
      default_value:      '',
      is_primary:         false,
      presentation_order: (attrDefs.length + 1) * 10,
      visible:            true
    };
    error = '';
  }

  function cancel() {
    editingId = null;
    form      = {};
    error     = '';
  }

  async function save() {
    if (!form.name?.trim()) { error = 'Name is required'; return; }
    saving = true;
    error  = '';
    try {
      if (form.is_primary && existingPrimary) {
        // Clear any existing is_primary before setting this one
        await v2protoStore.clearPrimaryForType(selectedTypeId);
      }

      if (editingId === 'new') {
        const row = await v2protoStore.createAttrDef({
          ...form,
          component_type_id: selectedTypeId
        });
        dispatch('saved');
        editingId = null;
        dispatch('select', row.id);
      } else {
        await v2protoStore.updateAttrDef(editingId, form);
        dispatch('saved');
        editingId = null;
      }
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  const inp = 'w-full px-2 py-1.5 text-xs rounded bg-slate-900 border border-slate-600 ' +
              'focus:outline-none focus:border-purple-500 text-white placeholder-slate-500';
  const sel = inp + ' cursor-pointer';

  const DT_COLOURS = {
    text:     'bg-slate-600 text-slate-300',
    number:   'bg-blue-600/30 text-blue-400',
    checkbox: 'bg-green-600/30 text-green-400',
    dropdown: 'bg-purple-600/30 text-purple-400',
    radio:    'bg-pink-600/30 text-pink-400',
    textarea: 'bg-amber-600/30 text-amber-400'
  };
</script>

<div class="w-64 shrink-0 flex flex-col bg-slate-800/30">

  <!-- Header -->
  <div class="px-3 py-2.5 border-b border-slate-700 bg-slate-800/60">
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
      Attribute Defs
      <span class="font-normal normal-case text-slate-600">({attrDefs.length})</span>
    </p>
  </div>

  <!-- List -->
  <div class="flex-1 overflow-y-auto">

    {#if !selectedTypeId}
      <p class="px-3 py-4 text-xs text-slate-600 italic">Select a type</p>

    {:else}
      {#each attrDefs as def (def.id)}

        {#if editingId === def.id}
          <!-- ── Inline edit form ─────────────────────────────── -->
          <div class="p-3 border-b border-slate-700 bg-slate-700/40">
            <p class="text-xs font-semibold text-purple-400 mb-2">Edit Attribute</p>
            {#if error}<p class="text-xs text-red-400 mb-2">{error}</p>{/if}
            <div class="space-y-1.5">
              <input bind:value={form.name} class={inp} placeholder="Attribute name *" />

              <select bind:value={form.display_type} class={sel}>
                {#each DISPLAY_TYPES as dt}
                  <option value={dt}>{dt}</option>
                {/each}
              </select>

              <input bind:value={form.default_value} class={inp} placeholder="Default value" />
              <input type="number" bind:value={form.presentation_order} class={inp} placeholder="Order" />

              <div class="space-y-1">
                <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input type="checkbox" bind:checked={form.required} class="rounded accent-purple-500" />
                  Required
                </label>
                <label class="flex items-center gap-2 text-xs cursor-pointer select-none
                              {existingPrimary && !form.is_primary ? 'text-slate-500' : 'text-yellow-300'}">
                  <input type="checkbox" bind:checked={form.is_primary} class="rounded accent-yellow-500" />
                  ★ Primary attribute
                  {#if existingPrimary && form.is_primary}
                    <span class="text-orange-400">(will unset "{existingPrimary.name}")</span>
                  {/if}
                </label>
                <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input type="checkbox" bind:checked={form.visible} class="rounded accent-purple-500" />
                  Visible
                </label>
              </div>
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
          <!-- ── Normal row ─────────────────────────────────────── -->
          <button
            class="w-full text-left px-3 py-2.5 border-b border-slate-700/50 transition-colors group
                   {selectedAttrDefId === def.id
                     ? 'bg-purple-600/15 border-l-2 border-l-purple-500'
                     : 'hover:bg-slate-700/40'}"
            on:click={() => dispatch('select', def.id)}
          >
            <div class="flex items-start justify-between gap-1 min-w-0">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <p class="text-sm font-medium leading-tight
                             {def.visible ? 'text-white' : 'text-slate-500 line-through'}">
                    {def.name}
                  </p>
                  {#if def.is_primary}
                    <span class="text-yellow-400 text-xs" title="Primary — stored in components.primary_attribute">★</span>
                  {/if}
                  {#if def.required}
                    <span class="text-red-400 text-xs">*</span>
                  {/if}
                </div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="text-xs px-1.5 py-0.5 rounded font-mono {DT_COLOURS[def.display_type] ?? ''}">
                    {def.display_type}
                  </span>
                  {#if def.default_value}
                    <span class="text-xs text-slate-600 truncate">→ {def.default_value}</span>
                  {/if}
                </div>
              </div>
              <button
                class="shrink-0 text-xs px-1.5 py-0.5 rounded text-slate-500
                       hover:text-white hover:bg-slate-600 transition-colors opacity-0
                       group-hover:opacity-100 mt-0.5"
                on:click|stopPropagation={() => startEdit(def)}
              >Edit</button>
            </div>
          </button>
        {/if}

      {/each}

      {#if attrDefs.length === 0 && editingId !== 'new'}
        <p class="px-3 py-4 text-xs text-slate-600 italic">No attribute definitions</p>
      {/if}

      <!-- ── New attr def form ──────────────────────────────────── -->
      {#if editingId === 'new'}
        <div class="p-3 bg-slate-700/40">
          <p class="text-xs font-semibold text-green-400 mb-2">New Attribute</p>
          {#if error}<p class="text-xs text-red-400 mb-2">{error}</p>{/if}
          <div class="space-y-1.5">
            <input bind:value={form.name} class={inp} placeholder="Attribute name *" />

            <select bind:value={form.display_type} class={sel}>
              {#each DISPLAY_TYPES as dt}
                <option value={dt}>{dt}</option>
              {/each}
            </select>

            <input bind:value={form.default_value} class={inp} placeholder="Default value" />
            <input type="number" bind:value={form.presentation_order} class={inp} placeholder="Order" />

            <div class="space-y-1">
              <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input type="checkbox" bind:checked={form.required} class="rounded accent-purple-500" />
                Required
              </label>
              <label class="flex items-center gap-2 text-xs cursor-pointer select-none
                            {form.is_primary ? 'text-yellow-300' : 'text-slate-300'}">
                <input type="checkbox" bind:checked={form.is_primary} class="rounded accent-yellow-500" />
                ★ Primary attribute
                {#if existingPrimary && form.is_primary}
                  <span class="text-orange-400">(will unset "{existingPrimary.name}")</span>
                {/if}
              </label>
              <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input type="checkbox" bind:checked={form.visible} class="rounded accent-purple-500" />
                Visible
              </label>
            </div>
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
  {#if selectedTypeId && editingId !== 'new'}
    <div class="px-3 py-2.5 border-t border-slate-700">
      <button
        on:click={startNew}
        class="w-full py-1.5 text-xs rounded border border-dashed border-slate-600
               text-slate-400 hover:text-white hover:border-purple-500 transition-colors"
      >+ Add Attribute</button>
    </div>
  {/if}

</div>
