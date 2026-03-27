<!-- src/lib/apps/v2proto/components/admin/SystemPanel.svelte -->
<!-- Panel 1 of 4: Building Systems list with inline add / edit. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { v2protoStore } from '../../stores/v2protoStore.js';

  export let systems         = [];
  export let selectedSystemId = null;

  const dispatch = createEventDispatcher();

  let editingId = null;   // uuid | 'new' | null
  let form      = {};
  let saving    = false;
  let error     = '';

  // Type counts per system (derived from live store)
  $: typeCounts = $v2protoStore.types.reduce((acc, t) => {
    acc[t.building_system_id] = (acc[t.building_system_id] ?? 0) + 1;
    return acc;
  }, {});

  function startEdit(sys) {
    editingId = sys.id;
    form = {
      name:               sys.name,
      uniclass_code:      sys.uniclass_code ?? '',
      description:        sys.description ?? '',
      notes:              sys.notes ?? '',
      presentation_order: sys.presentation_order,
      visible:            sys.visible
    };
    error = '';
  }

  function startNew() {
    editingId = 'new';
    form = {
      name:               '',
      uniclass_code:      '',
      description:        '',
      notes:              '',
      presentation_order: (systems.length + 1) * 10,
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
      if (editingId === 'new') {
        const row = await v2protoStore.createSystem(form);
        dispatch('saved');
        editingId = null;
        dispatch('select', row.id);  // auto-select the newly created system
      } else {
        await v2protoStore.updateSystem(editingId, form);
        dispatch('saved');
        editingId = null;
      }
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  // Shared input classes
  const inp = 'w-full px-2 py-1.5 text-xs rounded bg-slate-900 border border-slate-600 ' +
              'focus:outline-none focus:border-purple-500 text-white placeholder-slate-500';
</script>

<div class="w-48 shrink-0 flex flex-col bg-slate-800/30">

  <!-- Header -->
  <div class="px-3 py-2.5 border-b border-slate-700 bg-slate-800/60">
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
      Systems
      <span class="font-normal normal-case text-slate-600">({systems.length})</span>
    </p>
  </div>

  <!-- List -->
  <div class="flex-1 overflow-y-auto">
    {#each systems as sys (sys.id)}

      {#if editingId === sys.id}
        <!-- ── Inline edit form ───────────────────────────────────── -->
        <div class="p-3 border-b border-slate-700 bg-slate-700/40">
          <p class="text-xs font-semibold text-purple-400 mb-2">Edit System</p>
          {#if error}
            <p class="text-xs text-red-400 mb-2">{error}</p>
          {/if}
          <div class="space-y-1.5">
            <input bind:value={form.name}          class={inp} placeholder="Name *" />
            <input bind:value={form.uniclass_code} class="{inp} font-mono" placeholder="Uniclass code" />
            <input bind:value={form.description}   class={inp} placeholder="Description" />
            <input
              type="number"
              bind:value={form.presentation_order}
              class={inp}
              placeholder="Order"
            />
            <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input type="checkbox" bind:checked={form.visible} class="rounded accent-purple-500" />
              Visible
            </label>
          </div>
          <div class="flex gap-2 mt-3">
            <button
              on:click={save}
              disabled={saving}
              class="flex-1 py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-500
                     disabled:opacity-50 text-white transition-colors"
            >{saving ? 'Saving…' : 'Save'}</button>
            <button
              on:click={cancel}
              class="px-3 py-1.5 text-xs rounded bg-slate-600 hover:bg-slate-500 text-white transition-colors"
            >✕</button>
          </div>
        </div>

      {:else}
        <!-- ── Normal row ─────────────────────────────────────────── -->
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div
          class="w-full text-left px-3 py-2.5 border-b border-slate-700/50 transition-colors group cursor-pointer
                 {selectedSystemId === sys.id
                   ? 'bg-purple-600/15 border-l-2 border-l-purple-500'
                   : 'hover:bg-slate-700/40'}"
          on:click={() => dispatch('select', sys.id)}
        >
          <div class="flex items-start justify-between gap-1 min-w-0">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate leading-tight
                         {sys.visible ? 'text-white' : 'text-slate-500 line-through'}">
                {sys.name}
              </p>
              {#if sys.uniclass_code}
                <p class="text-xs font-mono text-slate-500 truncate">{sys.uniclass_code}</p>
              {/if}
              <p class="text-xs text-slate-500 mt-0.5">
                {typeCounts[sys.id] ?? 0} type{(typeCounts[sys.id] ?? 0) === 1 ? '' : 's'}
              </p>
            </div>
            <button
              class="shrink-0 text-xs px-1.5 py-0.5 rounded text-slate-500
                     hover:text-white hover:bg-slate-600 transition-colors opacity-0
                     group-hover:opacity-100 mt-0.5"
              on:click|stopPropagation={() => startEdit(sys)}
            >Edit</button>
          </div>
        </div>
      {/if}

    {/each}

    <!-- ── No data empty state ──────────────────────────────────── -->
    {#if systems.length === 0 && editingId !== 'new'}
      <p class="px-3 py-4 text-xs text-slate-600 italic">No systems yet</p>
    {/if}

    <!-- ── New system form ─────────────────────────────────────── -->
    {#if editingId === 'new'}
      <div class="p-3 bg-slate-700/40">
        <p class="text-xs font-semibold text-green-400 mb-2">New System</p>
        {#if error}
          <p class="text-xs text-red-400 mb-2">{error}</p>
        {/if}
        <div class="space-y-1.5">
          <input bind:value={form.name}          class={inp} placeholder="Name *" />
          <input bind:value={form.uniclass_code} class="{inp} font-mono" placeholder="Uniclass code" />
          <input bind:value={form.description}   class={inp} placeholder="Description" />
          <input
            type="number"
            bind:value={form.presentation_order}
            class={inp}
            placeholder="Order"
          />
          <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input type="checkbox" bind:checked={form.visible} class="rounded accent-purple-500" />
            Visible
          </label>
        </div>
        <div class="flex gap-2 mt-3">
          <button
            on:click={save}
            disabled={saving}
            class="flex-1 py-1.5 text-xs rounded bg-green-600 hover:bg-green-500
                   disabled:opacity-50 text-white transition-colors"
          >{saving ? 'Creating…' : 'Create'}</button>
          <button
            on:click={cancel}
            class="px-3 py-1.5 text-xs rounded bg-slate-600 hover:bg-slate-500 text-white transition-colors"
          >✕</button>
        </div>
      </div>
    {/if}

  </div>

  <!-- Footer: Add button -->
  {#if editingId !== 'new'}
    <div class="px-3 py-2.5 border-t border-slate-700">
      <button
        on:click={startNew}
        class="w-full py-1.5 text-xs rounded border border-dashed border-slate-600
               text-slate-400 hover:text-white hover:border-purple-500 transition-colors"
      >+ Add System</button>
    </div>
  {/if}

</div>
