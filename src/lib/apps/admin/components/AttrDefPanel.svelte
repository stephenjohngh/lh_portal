<!-- src/lib/apps/admin/components/AttrDefPanel.svelte -->
<!-- Panel 3 of 4: Attribute Definitions for the selected Type. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { buildingAssetsStore } from '$lib/apps/building_assets/stores/buildingAssetsStore.js';
  import { inp } from '$lib/apps/building_assets/ui.js';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

  export let attrDefs          = [];   // effective type_attributes[], each with _scope: 'system'|'type'
  export let mode              = null; // 'type' | 'system' | null
  export let selectedTypeId    = null;
  export let selectedSystemId  = null;
  export let selectedAttrDefId = null;

  const dispatch = createEventDispatcher();

  const DISPLAY_TYPES = ['text', 'number', 'checkbox', 'dropdown', 'radio', 'textarea'];

  // ── Full-attr edit / new ──────────────────────────────────────────────────
  let editingId     = null;
  let form          = {};
  let saving        = false;
  let deletingId    = null;
  let pendingDelete = null;   // attrDef id pending confirmation
  let pendingOverride = null; // def whose override is being removed
  let error         = '';

  // ── Default-value override (type mode only) ───────────────────────────────
  let editingOverrideId = null;  // system attr id whose default is being overridden
  let overrideValue     = '';
  let savingOverride    = false;
  let overrideError     = '';

  function deleteRow(id) {
    pendingDelete = id;
  }

  async function confirmDelete() {
    const id = pendingDelete;
    if (!id) return;
    deletingId = id;
    try {
      await buildingAssetsStore.deleteAttrDef(id);
      dispatch('saved');
    } catch (err) {
      error = err.message;
    } finally {
      deletingId    = null;
      pendingDelete = null;
    }
  }

  $: existingPrimary = attrDefs.find(d => d.is_primary && d.id !== editingId);

  // In type mode an inherited (system-level) attr is read-only for full editing
  function isInherited(def) { return def._scope === 'system' && mode === 'type'; }

  // Names of system-inherited attrs — used to block shadowing in Add form
  $: inheritedNames = new Set(attrDefs.filter(d => d._scope === 'system').map(d => d.name));

  function startEdit(def) {
    cancelOverride();
    editingId = def.id;
    form = {
      name:               def.name,
      display_type:       def.display_type,
      required:           def.required,
      default_value:      def.default_value ?? '',
      is_primary:         def.is_primary,
      checkable:          def.checkable ?? false,
      presentation_order: def.presentation_order,
      visible:            def.visible,
      help_notes:         def.help_notes ?? ''
    };
    error = '';
  }

  function startNew() {
    cancelOverride();
    editingId = 'new';
    form = {
      name:               '',
      display_type:       'text',
      required:           false,
      default_value:      '',
      is_primary:         false,
      checkable:          false,
      presentation_order: (attrDefs.length + 1) * 10,
      visible:            true,
      help_notes:         ''
    };
    error = '';
  }

  $: addLabel = mode === 'system' ? '+ Add System Attribute' : '+ Add Type Attribute';

  function cancel() {
    editingId = null;
    form      = {};
    error     = '';
  }

  async function save() {
    if (!form.name?.trim()) { error = 'Name is required'; return; }

    // In type mode, block names that shadow an inherited system attr
    if (editingId === 'new' && mode === 'type' && inheritedNames.has(form.name.trim())) {
      error = `"${form.name.trim()}" is already an inherited system attribute. Use the Override → button on that attribute to change its default value for this type.`;
      return;
    }

    saving = true;
    error  = '';
    try {
      if (form.is_primary && existingPrimary) {
        await buildingAssetsStore.clearPrimaryForType(selectedTypeId);
      }

      if (editingId === 'new') {
        const scopeKey = mode === 'system'
          ? { building_system_id: selectedSystemId }
          : { component_type_id:  selectedTypeId };
        const row = await buildingAssetsStore.createAttrDef({ ...form, ...scopeKey });
        dispatch('saved');
        editingId = null;
        dispatch('select', row.id);
      } else {
        await buildingAssetsStore.updateAttrDef(editingId, form);
        dispatch('saved');
        editingId = null;
      }
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  // ── Override helpers ──────────────────────────────────────────────────────

  function startOverride(def) {
    cancel(); // close any full edit form
    editingOverrideId = def.id;
    overrideValue     = def._defaultOverride ? (def.default_value ?? '') : '';
    overrideError     = '';
  }

  function cancelOverride() {
    editingOverrideId = null;
    overrideValue     = '';
    overrideError     = '';
  }

  async function saveOverride(def) {
    savingOverride = true;
    overrideError  = '';
    try {
      if (def._defaultOverride) {
        // Update the existing override row
        await buildingAssetsStore.updateAttrDef(def._overrideId, { default_value: overrideValue });
      } else {
        // Create a new type-level row — only name + default_value matter
        await buildingAssetsStore.createAttrDef({
          component_type_id: selectedTypeId,
          name:              def.name,
          default_value:     overrideValue,
          display_type:      def.display_type,  // mirrored for DB NOT NULL
          visible:           true
        });
      }
      cancelOverride();
      dispatch('saved');
    } catch (err) {
      overrideError = err.message;
    } finally {
      savingOverride = false;
    }
  }

  function removeOverride(def) {
    pendingOverride = def;
  }

  async function confirmRemoveOverride() {
    const def = pendingOverride;
    if (!def) return;
    try {
      await buildingAssetsStore.deleteAttrDef(def._overrideId);
      dispatch('saved');
    } catch (err) {
      overrideError = err.message;
    } finally {
      pendingOverride = null;
    }
  }

  // ── Style helpers ─────────────────────────────────────────────────────────

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
      {mode === 'system' ? 'System Attributes' : 'Attribute Defs'}
      <span class="font-normal normal-case text-slate-600">({attrDefs.length})</span>
    </p>
    {#if mode === 'system'}
      <p class="text-xs text-blue-400/70 mt-0.5">Inherited by all types in this system</p>
    {:else if mode === 'type'}
      <p class="text-xs text-slate-600 mt-0.5">
        <span class="text-blue-400/70">↑ inherited</span>
        · <span class="text-amber-400/70">↻ default overridden</span>
        · own
      </p>
    {/if}
  </div>

  <!-- List -->
  <div class="flex-1 overflow-y-auto">

    {#if !mode}
      <p class="px-3 py-4 text-xs text-slate-600 italic">Select a system or type</p>

    {:else}
      {#each attrDefs as def (def.id)}

        {#if editingId === def.id}
          <!-- ── Inline full-edit form ─────────────────────────────── -->
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
                <label class="flex items-center gap-2 text-xs text-green-300 cursor-pointer select-none">
                  <input type="checkbox" bind:checked={form.checkable} class="rounded accent-green-500" />
                  ✓ Shows in walk checklist
                </label>
                <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input type="checkbox" bind:checked={form.visible} class="rounded accent-purple-500" />
                  Visible
                </label>
              </div>

              <textarea bind:value={form.help_notes} class={inp} rows="3"
                placeholder="Help notes shown to inspector in walk checklist (optional)"></textarea>
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
          <!-- ── Normal row ─────────────────────────────────────────── -->
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="w-full text-left px-3 py-2.5 border-b border-slate-700/50 transition-colors group cursor-pointer
                   {isInherited(def) ? 'bg-blue-900/10' : ''}
                   {selectedAttrDefId === def.id
                     ? 'bg-purple-600/15 border-l-2 border-l-purple-500'
                     : 'hover:bg-slate-700/40'}"
            on:click={() => dispatch('select', def.id)}
          >
            <div class="flex items-start justify-between gap-1 min-w-0">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  {#if isInherited(def)}
                    <span class="text-xs px-1 py-px rounded bg-blue-800/40 text-blue-400/80 font-mono"
                          title="Inherited from system — edit at system level">↑</span>
                  {/if}
                  {#if def._defaultOverride}
                    <span class="text-xs px-1 py-px rounded bg-amber-700/30 text-amber-400/80 font-mono"
                          title="Default value overridden for this type">↻</span>
                  {/if}
                  <p class="text-sm font-medium leading-tight
                             {def.visible ? (isInherited(def) ? 'text-slate-400' : 'text-white') : 'text-slate-500 line-through'}">
                    {def.name}
                  </p>
                  {#if def.is_primary}
                    <span class="text-yellow-400 text-xs" title="Primary — stored in components.primary_attribute">★</span>
                  {/if}
                  {#if def.required}
                    <span class="text-red-400 text-xs">*</span>
                  {/if}
                  {#if def.checkable}
                    <span class="text-green-400 text-xs" title="Shows in walk inspection checklist">✓list</span>
                  {/if}
                  {#if def.help_notes}
                    <span class="text-sky-400 text-xs" title={def.help_notes}>💬</span>
                  {/if}
                </div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="text-xs px-1.5 py-0.5 rounded font-mono {DT_COLOURS[def.display_type] ?? ''}">
                    {def.display_type}
                  </span>
                  {#if def.default_value}
                    <span class="text-xs truncate {def._defaultOverride ? 'text-amber-500/80' : 'text-slate-600'}">
                      → {def.default_value}
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Actions column -->
              {#if !isInherited(def)}
                <!-- Type-own attr: full edit / delete -->
                <div class="flex gap-1 shrink-0 mt-0.5">
                  <button
                    class="text-xs px-1.5 py-0.5 rounded text-slate-500
                           hover:text-white hover:bg-slate-600 transition-colors"
                    on:click|stopPropagation={() => startEdit(def)}
                  >Edit</button>
                  <button
                    class="text-xs px-1.5 py-0.5 rounded text-slate-500
                           hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    disabled={deletingId === def.id}
                    on:click|stopPropagation={() => deleteRow(def.id)}
                    title="Delete attribute"
                  >{deletingId === def.id ? '…' : '✕'}</button>
                </div>
              {:else if def._defaultOverride}
                <!-- Inherited + has override: edit/remove override -->
                <div class="flex gap-1 shrink-0 mt-0.5">
                  <button
                    class="text-xs px-1.5 py-0.5 rounded text-amber-500/70
                           hover:text-amber-300 hover:bg-amber-800/20 transition-colors"
                    on:click|stopPropagation={() => startOverride(def)}
                    title="Edit default value override">Edit</button>
                  <button
                    class="text-xs px-1.5 py-0.5 rounded text-slate-500
                           hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    on:click|stopPropagation={() => removeOverride(def)}
                    title="Remove override — revert to system default">✕</button>
                </div>
              {:else}
                <!-- Inherited, no override: offer Override button on hover -->
                <button
                  class="shrink-0 text-xs px-1.5 py-0.5 rounded text-slate-600
                         hover:text-amber-300 hover:bg-amber-800/20 transition-colors
                         opacity-0 group-hover:opacity-100 mt-0.5"
                  on:click|stopPropagation={() => startOverride(def)}
                  title="Override the default value for this type only"
                >Override →</button>
              {/if}
            </div>

            <!-- Inline override mini-form -->
            {#if editingOverrideId === def.id}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <div class="mt-2 pt-2 border-t border-amber-700/30"
                   on:click|stopPropagation>
                <p class="text-[10px] text-amber-400/70 mb-1.5 uppercase tracking-wide">
                  Override default for this type
                </p>
                {#if overrideError}
                  <p class="text-xs text-red-400 mb-1">{overrideError}</p>
                {/if}
                <div class="flex gap-1.5 items-center">
                  <input
                    bind:value={overrideValue}
                    class="{inp} flex-1 text-xs"
                    placeholder="New default value (empty = blank)"
                  />
                  <button
                    on:click={() => saveOverride(def)}
                    disabled={savingOverride}
                    class="px-2 py-1 text-xs rounded bg-amber-600 hover:bg-amber-500
                           disabled:opacity-50 text-white transition-colors shrink-0"
                  >{savingOverride ? '…' : '✓'}</button>
                  <button
                    on:click={cancelOverride}
                    class="px-2 py-1 text-xs rounded bg-slate-600 hover:bg-slate-500
                           text-white transition-colors shrink-0"
                  >✕</button>
                </div>
              </div>
            {/if}

          </div>
        {/if}

      {/each}

      {#if attrDefs.length === 0 && editingId !== 'new'}
        <p class="px-3 py-4 text-xs text-slate-600 italic">
          {mode === 'system' ? 'No system attributes' : 'No attribute definitions'}
        </p>
      {/if}

      <!-- ── New attr def form ──────────────────────────────────────── -->
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
              <label class="flex items-center gap-2 text-xs text-green-300 cursor-pointer select-none">
                <input type="checkbox" bind:checked={form.checkable} class="rounded accent-green-500" />
                ✓ Shows in walk checklist
              </label>
              <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input type="checkbox" bind:checked={form.visible} class="rounded accent-purple-500" />
                Visible
              </label>
            </div>

            <textarea bind:value={form.help_notes} class={inp} rows="3"
              placeholder="Help notes shown to inspector in walk checklist (optional)"></textarea>
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
  {#if mode && editingId !== 'new'}
    <div class="px-3 py-2.5 border-t border-slate-700">
      <button
        on:click={startNew}
        class="w-full py-1.5 text-xs rounded border border-dashed
               {mode === 'system'
                 ? 'border-blue-700 text-blue-400/70 hover:text-blue-300 hover:border-blue-500'
                 : 'border-slate-600 text-slate-400 hover:text-white hover:border-purple-500'}
               transition-colors"
      >{addLabel}</button>
    </div>
  {/if}

</div>

<ConfirmDialog
  show={!!pendingDelete}
  title="Delete attribute"
  message="Delete this attribute definition? This will also delete its options and any component values using it."
  confirmText="Delete"
  danger={true}
  processing={!!deletingId}
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>

<ConfirmDialog
  show={!!pendingOverride}
  title="Remove override"
  message={pendingOverride ? `Remove the default-value override for "${pendingOverride.name}"? The system default will apply again.` : ''}
  confirmText="Remove"
  danger={true}
  on:confirm={confirmRemoveOverride}
  on:cancel={() => pendingOverride = null}
/>
