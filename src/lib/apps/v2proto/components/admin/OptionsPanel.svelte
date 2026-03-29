<!-- src/lib/apps/v2proto/components/admin/OptionsPanel.svelte -->
<!-- Panel 4 of 4: Dropdown / radio options for the selected Attribute Definition.
     Only meaningful when attrDef.display_type is 'dropdown' or 'radio'.
     Each option can carry a priority_override. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { v2protoStore } from '../../stores/v2protoStore.js';
  import { inp } from '../../ui.js';

  export let options  = [];    // type_attribute_options[] for selected attr def
  export let attrDef  = null;  // the selected type_attributes row (or null)

  const dispatch = createEventDispatcher();

  const PRIORITY_OVERRIDES = ['', 'critical', 'high', 'medium', 'low'];

  let editingId  = null;
  let form       = {};
  let saving     = false;
  let deletingId = null;
  let error      = '';

  async function deleteRow(id) {
    if (!confirm('Delete this option?')) return;
    deletingId = id;
    try {
      await v2protoStore.deleteOption(id);
      dispatch('saved');
    } catch (err) {
      error = err.message;
    } finally {
      deletingId = null;
    }
  }

  $: isActive = attrDef &&
    (attrDef.display_type === 'dropdown' || attrDef.display_type === 'radio');

  function startEdit(opt) {
    editingId = opt.id;
    form = {
      value:              opt.value,
      presentation_order: opt.presentation_order,
      visible:            opt.visible,
      priority_override:  opt.priority_override ?? ''
    };
    error = '';
  }

  function startNew() {
    editingId = 'new';
    form = {
      value:              '',
      presentation_order: (options.length + 1) * 10,
      visible:            true,
      priority_override:  ''
    };
    error = '';
  }

  function cancel() {
    editingId = null;
    form      = {};
    error     = '';
  }

  async function save() {
    if (!form.value?.trim()) { error = 'Value is required'; return; }
    saving = true;
    error  = '';
    try {
      if (editingId === 'new') {
        await v2protoStore.createOption({
          ...form,
          type_attribute_id: attrDef.id
        });
      } else {
        await v2protoStore.updateOption(editingId, form);
      }
      dispatch('saved');
      editingId = null;
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  const sel = inp + ' cursor-pointer';

  const PRIORITY_COLOURS = {
    critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
    high:     'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    medium:   'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    low:      'bg-slate-500/20 text-slate-400 border border-slate-500/30'
  };
</script>

<div class="flex-1 min-w-0 flex flex-col bg-slate-800/30">

  <!-- Header -->
  <div class="px-3 py-2.5 border-b border-slate-700 bg-slate-800/60">
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
      Options
      {#if attrDef}
        <span class="font-normal normal-case text-slate-600">
          ({options.length}) — {attrDef.name}
        </span>
      {:else}
        <span class="font-normal normal-case text-slate-600">({options.length})</span>
      {/if}
    </p>
  </div>

  <!-- Body -->
  <div class="flex-1 overflow-y-auto">

    {#if !attrDef}
      <p class="px-3 py-4 text-xs text-slate-600 italic">Select an attribute definition</p>

    {:else if !isActive}
      <div class="px-3 py-4 text-center">
        <p class="text-xs text-slate-600 italic">
          Options only apply to <span class="font-mono text-slate-500">dropdown</span>
          and <span class="font-mono text-slate-500">radio</span> attributes.
        </p>
        <p class="text-xs text-slate-700 mt-1">
          Current type: <span class="font-mono">{attrDef.display_type}</span>
        </p>
      </div>

    {:else}
      <!-- Primary attribute note -->
      {#if attrDef.is_primary}
        <div class="mx-3 mt-2 mb-1 px-2 py-1.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400">
          ★ Primary attribute — values here drive <code class="text-yellow-300">components.primary_attribute</code>
          and maintenance regime filtering.
        </div>
      {/if}

      <!-- Option rows -->
      {#each options as opt (opt.id)}

        {#if editingId === opt.id}
          <!-- ── Inline edit form ─────────────────────────────── -->
          <div class="p-3 border-b border-slate-700 bg-slate-700/40">
            <p class="text-xs font-semibold text-purple-400 mb-2">Edit Option</p>
            {#if error}<p class="text-xs text-red-400 mb-2">{error}</p>{/if}
            <div class="space-y-1.5">
              <input bind:value={form.value} class={inp} placeholder="Value *" />

              <select bind:value={form.priority_override} class={sel}
                      title="Override component priority when primary_attribute = this value">
                <option value="">No priority override</option>
                {#each PRIORITY_OVERRIDES.filter(p => p) as p}
                  <option value={p}>↑ {p}</option>
                {/each}
              </select>

              <input type="number" bind:value={form.presentation_order} class={inp} placeholder="Order" />

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
          <!-- ── Normal row ─────────────────────────────────────── -->
          <div class="px-3 py-2.5 border-b border-slate-700/50 flex items-center gap-2 group
                      hover:bg-slate-700/40 transition-colors">
            <p class="flex-1 text-sm font-medium
                       {opt.visible ? 'text-white' : 'text-slate-500 line-through'}">
              {opt.value}
            </p>
            {#if opt.priority_override}
              <span class="text-xs px-1.5 py-0.5 rounded {PRIORITY_COLOURS[opt.priority_override] ?? ''}">
                ↑ {opt.priority_override}
              </span>
            {/if}
            {#if !opt.visible}
              <span class="text-xs text-slate-600 italic">hidden</span>
            {/if}
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
              <button
                class="text-xs px-1.5 py-0.5 rounded text-slate-500
                       hover:text-white hover:bg-slate-600 transition-colors"
                on:click={() => startEdit(opt)}
              >Edit</button>
              <button
                class="text-xs px-1.5 py-0.5 rounded text-slate-500
                       hover:text-red-400 hover:bg-red-500/10 transition-colors"
                disabled={deletingId === opt.id}
                on:click|stopPropagation={() => deleteRow(opt.id)}
                title="Delete option"
              >{deletingId === opt.id ? '…' : '✕'}</button>
            </div>
          </div>
        {/if}

      {/each}

      {#if options.length === 0 && editingId !== 'new'}
        <p class="px-3 py-4 text-xs text-slate-600 italic">No options yet</p>
      {/if}

      <!-- ── New option form ────────────────────────────────────── -->
      {#if editingId === 'new'}
        <div class="p-3 bg-slate-700/40">
          <p class="text-xs font-semibold text-green-400 mb-2">New Option</p>
          {#if error}<p class="text-xs text-red-400 mb-2">{error}</p>{/if}
          <div class="space-y-1.5">
            <input bind:value={form.value} class={inp} placeholder="Value *" />

            <select bind:value={form.priority_override} class={sel}>
              <option value="">No priority override</option>
              {#each PRIORITY_OVERRIDES.filter(p => p) as p}
                <option value={p}>↑ {p}</option>
              {/each}
            </select>

            <input type="number" bind:value={form.presentation_order} class={inp} placeholder="Order" />

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
  {#if isActive && editingId !== 'new'}
    <div class="px-3 py-2.5 border-t border-slate-700">
      <button
        on:click={startNew}
        class="w-full py-1.5 text-xs rounded border border-dashed border-slate-600
               text-slate-400 hover:text-white hover:border-purple-500 transition-colors"
      >+ Add Option</button>
    </div>
  {/if}

</div>
