<!-- src/lib/apps/v2proto/components/admin/MaintenancePanel.svelte -->
<!-- Sub-panel below the 4 columns. Shows maintenance_regime rows for the
     selected Type. Admin can add, edit, and DELETE regime rows. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { v2protoStore } from '../../stores/v2protoStore.js';

  export let regimeRows    = [];   // maintenance_regime[] for selected type
  export let typeId        = null;
  export let typeName      = '';
  export let primaryOptions = [];  // type_attribute_options[] for is_primary attr def

  const dispatch = createEventDispatcher();

  let editingId   = null;
  let form        = {};
  let saving      = false;
  let deletingId  = null;
  let error       = '';

  function frequencyLabel(days) {
    if (!days) return '';
    if (days === 1)    return '1 day';
    if (days < 14)     return `${days} days`;
    if (days < 60)     return `${Math.round(days / 7)} weeks`;
    if (days < 400)    return `${Math.round(days / 30)} months`;
    return `${(days / 365).toFixed(1)} years`;
  }

  function startEdit(row) {
    editingId = row.id;
    form = {
      task_name:        row.task_name,
      frequency_days:   row.frequency_days,
      attribute_filter: row.attribute_filter ?? ''
    };
    error = '';
  }

  function startNew() {
    editingId = 'new';
    form = {
      task_name:        '',
      frequency_days:   365,
      attribute_filter: ''
    };
    error = '';
  }

  function cancel() {
    editingId = null;
    form      = {};
    error     = '';
  }

  async function save() {
    if (!form.task_name?.trim())       { error = 'Task name is required'; return; }
    if (!form.frequency_days || form.frequency_days < 1) {
      error = 'Frequency must be a positive number of days'; return;
    }
    saving = true;
    error  = '';
    try {
      if (editingId === 'new') {
        await v2protoStore.createRegime({ ...form, type_id: typeId });
      } else {
        await v2protoStore.updateRegime(editingId, form);
      }
      dispatch('saved');
      editingId = null;
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  async function deleteRow(id) {
    if (!confirm('Delete this maintenance task? This cannot be undone.')) return;
    deletingId = id;
    try {
      await v2protoStore.deleteRegime(id);
      dispatch('saved');
    } catch (err) {
      error = err.message;
    } finally {
      deletingId = null;
    }
  }

  const inp = 'w-full px-2 py-1.5 text-xs rounded bg-slate-900 border border-slate-600 ' +
              'focus:outline-none focus:border-purple-500 text-white placeholder-slate-500';
  const sel = inp + ' cursor-pointer';
</script>

<div class="rounded-xl border border-slate-700 bg-slate-800/30 overflow-hidden">

  <!-- Header -->
  <div class="px-4 py-3 border-b border-slate-700 bg-slate-800/60 flex items-center justify-between">
    <div>
      <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        Maintenance Regime
        <span class="font-normal normal-case text-slate-600">— {typeName}</span>
      </p>
      <p class="text-xs text-slate-600 mt-0.5">
        Regime rows define recurring tasks. Each task can be filtered to a specific
        <code>primary_attribute</code> value, or left blank to apply to all components of this type.
      </p>
    </div>
    {#if editingId !== 'new'}
      <button
        on:click={startNew}
        class="ml-4 shrink-0 px-3 py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-500
               text-white transition-colors"
      >+ Add Task</button>
    {/if}
  </div>

  {#if error}
    <div class="mx-4 mt-3 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-400">
      {error}
      <button class="ml-2 underline" on:click={() => error = ''}>dismiss</button>
    </div>
  {/if}

  <!-- New task form -->
  {#if editingId === 'new'}
    <div class="p-4 border-b border-slate-700 bg-slate-700/30">
      <p class="text-xs font-semibold text-green-400 mb-3">New Maintenance Task</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div class="sm:col-span-2">
          <p class="text-xs text-slate-400 block mb-1">Task name *</p>
          <input bind:value={form.task_name} class={inp} placeholder="e.g. Monthly emergency lighting functional test" />
        </div>
        <div>
          <p class="text-xs text-slate-400 block mb-1">
            Frequency (days) *
            {#if form.frequency_days}
              <span class="text-slate-500 font-normal">≈ {frequencyLabel(form.frequency_days)}</span>
            {/if}
          </p>
          <input type="number" min="1" bind:value={form.frequency_days} class={inp} placeholder="365" />
        </div>
        {#if primaryOptions.length > 0}
          <div class="sm:col-span-3">
            <p class="text-xs text-slate-400 block mb-1">
              Attribute filter
              <span class="text-slate-600 font-normal">(leave blank = applies to all components of this type)</span>
            </p>
            <select bind:value={form.attribute_filter} class="{sel} max-w-xs">
              <option value="">All components</option>
              {#each primaryOptions as opt}
                <option value={opt.value}>{opt.value}</option>
              {/each}
            </select>
          </div>
        {:else}
          <div class="sm:col-span-3">
            <p class="text-xs text-slate-400 block mb-1">Attribute filter</p>
            <input
              bind:value={form.attribute_filter}
              class="{inp} max-w-xs"
              placeholder="e.g. Emergency (or leave blank for all)"
            />
            <p class="text-xs text-slate-600 mt-0.5">
              No primary attribute options defined — type a value manually or leave blank.
            </p>
          </div>
        {/if}
      </div>
      <div class="flex gap-2 mt-3">
        <button on:click={save} disabled={saving}
          class="px-4 py-1.5 text-xs rounded bg-green-600 hover:bg-green-500
                 disabled:opacity-50 text-white transition-colors">
          {saving ? 'Creating…' : 'Create Task'}
        </button>
        <button on:click={cancel}
          class="px-4 py-1.5 text-xs rounded bg-slate-600 hover:bg-slate-500 text-white transition-colors">
          Cancel
        </button>
      </div>
    </div>
  {/if}

  <!-- Regime rows -->
  {#if regimeRows.length === 0 && editingId !== 'new'}
    <p class="px-4 py-4 text-xs text-slate-600 italic">
      No maintenance tasks defined for this type.
    </p>
  {:else}
    <div class="divide-y divide-slate-700/50">
      {#each regimeRows as row (row.id)}

        {#if editingId === row.id}
          <!-- ── Inline edit form ──────────────────────────────── -->
          <div class="p-4 bg-slate-700/30">
            <p class="text-xs font-semibold text-purple-400 mb-3">Edit Task</p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div class="sm:col-span-2">
                <p class="text-xs text-slate-400 block mb-1">Task name *</p>
                <input bind:value={form.task_name} class={inp} />
              </div>
              <div>
                <p class="text-xs text-slate-400 block mb-1">
                  Frequency (days) *
                  {#if form.frequency_days}
                    <span class="text-slate-500 font-normal">≈ {frequencyLabel(form.frequency_days)}</span>
                  {/if}
                </p>
                <input type="number" min="1" bind:value={form.frequency_days} class={inp} />
              </div>
              {#if primaryOptions.length > 0}
                <div class="sm:col-span-3">
                  <p class="text-xs text-slate-400 block mb-1">Attribute filter</p>
                  <select bind:value={form.attribute_filter} class="{sel} max-w-xs">
                    <option value="">All components</option>
                    {#each primaryOptions as opt}
                      <option value={opt.value}>{opt.value}</option>
                    {/each}
                  </select>
                </div>
              {:else}
                <div class="sm:col-span-3">
                  <p class="text-xs text-slate-400 block mb-1">Attribute filter</p>
                  <input bind:value={form.attribute_filter} class="{inp} max-w-xs"
                         placeholder="leave blank for all" />
                </div>
              {/if}
            </div>
            <div class="flex gap-2 mt-3">
              <button on:click={save} disabled={saving}
                class="px-4 py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-500
                       disabled:opacity-50 text-white transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button on:click={cancel}
                class="px-4 py-1.5 text-xs rounded bg-slate-600 hover:bg-slate-500 text-white transition-colors">
                Cancel
              </button>
            </div>
          </div>

        {:else}
          <!-- ── Normal row ─────────────────────────────────────── -->
          <div class="px-4 py-3 flex items-center gap-3 group hover:bg-slate-700/20 transition-colors">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-white truncate">{row.task_name}</p>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-xs text-slate-400">
                  Every {row.frequency_days}d
                  <span class="text-slate-600">({frequencyLabel(row.frequency_days)})</span>
                </span>
                {#if row.attribute_filter}
                  <span class="text-xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">
                    {row.attribute_filter} only
                  </span>
                {:else}
                  <span class="text-xs text-slate-600 italic">all components</span>
                {/if}
              </div>
            </div>
            <div class="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                on:click={() => startEdit(row)}
                class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >Edit</button>
              <button
                on:click={() => deleteRow(row.id)}
                disabled={deletingId === row.id}
                class="text-xs px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400
                       disabled:opacity-50 transition-colors"
              >{deletingId === row.id ? '…' : 'Delete'}</button>
            </div>
          </div>
        {/if}

      {/each}
    </div>
  {/if}

</div>
