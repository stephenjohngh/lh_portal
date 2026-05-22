<!-- src/lib/apps/building_assets/components/AttrFilterPopover.svelte -->
<!--
  Two-step popover that builds an attribute filter:
    1. Pick an attribute from the list of `availableDefs` (search-filterable)
    2. Pick an operator (when applicable) and value(s) — adapts to display_type

  Emits:
    apply  → { defId, op, values, includeUnset }
    cancel → ()

  When `existing` is supplied the popover opens pre-filled in step 2 for that
  attribute (i.e. "edit an existing chip" flow).

  This component is purely presentational and self-contained — parent owns
  whether/where to render it. Currently rendered absolutely-positioned just
  below the "+ Add filter" anchor in ComponentsTab.
-->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { defaultFilterFor, OP_SYMBOL } from '../utils/attrFilters.js';

  /** Effective attribute definitions allowed for this popover (already filtered to fixed XOR condition) */
  export let availableDefs = [];
  /** { [attrDefId]: type_attribute_options[] } — only used for dropdown/radio */
  export let attrOptions   = {};
  /** Pre-fill for edit: { defId, op, values, includeUnset } or null */
  export let existing      = null;
  /** Label shown in the title bar — "Fixed" or "Condition" */
  export let className     = '';

  const dispatch = createEventDispatcher();

  let search   = '';
  let chosenId = existing?.defId ?? null;
  /** @type {{ op:string, values:any, includeUnset:boolean } | null} */
  let draft    = existing
    ? { op: existing.op, values: existing.values, includeUnset: !!existing.includeUnset }
    : null;

  $: chosenDef = availableDefs.find(d => d.id === chosenId) ?? null;
  $: chosenOptions = chosenDef ? (attrOptions[chosenDef.id] ?? []) : [];

  // Search filter — case-insensitive name + system/type scope hint
  $: filteredDefs = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableDefs;
    return availableDefs.filter(d => d.name.toLowerCase().includes(q));
  })();

  // When the user picks a new attribute, seed the draft with sensible defaults.
  function pickAttr(def) {
    chosenId = def.id;
    draft    = defaultFilterFor(def);
  }

  function backToPicker() {
    chosenId = null;
    draft    = null;
  }

  // -- Multi-select option toggling (dropdown / radio) -------------------------
  function toggleValueInSet(value) {
    if (!draft) return;
    const next = new Set(draft.values ?? []);
    if (next.has(value)) next.delete(value);
    else                 next.add(value);
    draft = { ...draft, values: [...next] };
  }

  // -- Apply / Cancel ---------------------------------------------------------
  $: applyEnabled = (() => {
    if (!chosenDef || !draft) return false;
    if (draft.op === 'in')                                return (draft.values ?? []).length > 0;
    if (['lt','lte','eq','gte','gt'].includes(draft.op)) return draft.values !== '' && draft.values != null && !Number.isNaN(Number(draft.values));
    if (['contains','starts','eq_text'].includes(draft.op)) return String(draft.values ?? '').trim() !== '';
    // is_true / is_false don't need a value
    return true;
  })();

  function apply() {
    if (!applyEnabled) return;
    dispatch('apply', {
      defId:        chosenDef.id,
      op:           draft.op,
      values:       draft.op === 'in' ? draft.values : draft.values,
      includeUnset: !!draft.includeUnset,
    });
  }

  function cancel() { dispatch('cancel'); }

  // ESC to close
  function onKeydown(e) { if (e.key === 'Escape') cancel(); }
  onMount(() => { window.addEventListener('keydown', onKeydown); return () => window.removeEventListener('keydown', onKeydown); });

  // -- Number operator list (in display order) --------------------------------
  const NUMBER_OPS = [
    { value: 'lt',  label: '<'  },
    { value: 'lte', label: '≤'  },
    { value: 'eq',  label: '='  },
    { value: 'gte', label: '≥'  },
    { value: 'gt',  label: '>'  },
  ];

  // Text operator list
  const TEXT_OPS = [
    { value: 'contains', label: 'contains'    },
    { value: 'starts',   label: 'starts with' },
    { value: 'eq_text',  label: 'equals'      },
  ];
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div
  class="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-80 max-h-[60vh] flex flex-col overflow-hidden"
  on:click|stopPropagation
  role="dialog"
  aria-label="Attribute filter"
  tabindex="-1"
>
  <!-- Header -->
  <div class="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-800/50">
    <div class="text-xs font-semibold text-slate-200 uppercase tracking-wider">
      {#if chosenDef}
        <button
          on:click={backToPicker}
          class="text-slate-400 hover:text-white mr-1"
          aria-label="Back to attribute list"
        >‹</button>
        {chosenDef.name}
      {:else}
        {className || 'Filter'} — pick an attribute
      {/if}
    </div>
    <button
      on:click={cancel}
      class="text-slate-500 hover:text-white text-sm"
      aria-label="Close"
    >✕</button>
  </div>

  <!-- ── Step 1: attribute picker ─────────────────────────────────────────── -->
  {#if !chosenDef}
    <div class="p-2 border-b border-slate-800">
      <input
        type="text"
        bind:value={search}
        placeholder="Search attributes…"
        class="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
      />
    </div>

    <div class="overflow-y-auto flex-1">
      {#if filteredDefs.length === 0}
        <p class="text-xs text-slate-500 px-3 py-4 text-center">
          {search ? 'No attributes match.' : 'No attributes available for the current type filter.'}
        </p>
      {:else}
        <ul class="py-1">
          {#each filteredDefs as def (def.id)}
            <li>
              <button
                on:click={() => pickAttr(def)}
                class="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
              >
                <span class="flex-1">{def.name}</span>
                <span class="text-[10px] text-slate-500 font-mono">{def.display_type}</span>
                {#if def._scope === 'system'}
                  <span class="text-[10px] text-blue-400/70" title="Inherited from system">↑sys</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {:else}
    <!-- ── Step 2: value editor adapts to display_type ─────────────────────── -->
    <div class="overflow-y-auto flex-1 p-3 space-y-3">

      {#if chosenDef.display_type === 'dropdown' || chosenDef.display_type === 'radio'}
        <!-- Multi-select options — OR within attribute -->
        {#if chosenOptions.length === 0}
          <p class="text-xs text-slate-500">No options defined for this attribute.</p>
        {:else}
          <p class="text-[11px] text-slate-500">Select one or more — components matching any are shown.</p>
          <div class="flex flex-wrap gap-1.5">
            {#each chosenOptions as opt (opt.id)}
              {@const selected = (draft?.values ?? []).includes(opt.value)}
              <button
                on:click={() => toggleValueInSet(opt.value)}
                class="px-2 py-1 text-xs rounded border transition-colors
                       {selected
                         ? 'bg-purple-600/30 border-purple-500/60 text-purple-200'
                         : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'}"
              >{opt.value}</button>
            {/each}
          </div>
        {/if}

      {:else if chosenDef.display_type === 'checkbox'}
        <!-- Tri-state via operator pick: any / true / false -->
        <p class="text-[11px] text-slate-500">Match components whose value is…</p>
        <div class="flex gap-1.5">
          {#each [['is_true','✓ Yes / true'], ['is_false','✗ No / false']] as [op, label]}
            <button
              on:click={() => draft = { ...draft, op, values: '' }}
              class="px-3 py-1 text-xs rounded border transition-colors
                     {draft?.op === op
                       ? 'bg-purple-600/30 border-purple-500/60 text-purple-200'
                       : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'}"
            >{label}</button>
          {/each}
        </div>

      {:else if chosenDef.display_type === 'number'}
        <!-- Operator + numeric value -->
        <div class="flex items-center gap-2">
          <select
            bind:value={draft.op}
            class="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          >
            {#each NUMBER_OPS as o}
              <option value={o.value}>{o.label}</option>
            {/each}
          </select>
          <input
            type="number"
            bind:value={draft.values}
            placeholder="0"
            class="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          />
        </div>

      {:else}
        <!-- text / textarea — operator + free text -->
        <div class="flex items-center gap-2">
          <select
            bind:value={draft.op}
            class="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          >
            {#each TEXT_OPS as o}
              <option value={o.value}>{o.label}</option>
            {/each}
          </select>
          <input
            type="text"
            bind:value={draft.values}
            placeholder="text…"
            class="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          />
        </div>
      {/if}

      <!-- includeUnset toggle — always offered -->
      <label class="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer pt-2 border-t border-slate-800">
        <input
          type="checkbox"
          bind:checked={draft.includeUnset}
          class="rounded accent-purple-500"
        />
        Also include components with no value for this attribute
        {#if chosenDef.checkable}
          <span class="text-[10px] text-slate-600">(or never inspected)</span>
        {/if}
      </label>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-end gap-2 px-3 py-2 border-t border-slate-700 bg-slate-800/50">
      <button
        on:click={cancel}
        class="px-3 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
      >Cancel</button>
      <button
        on:click={apply}
        disabled={!applyEnabled}
        class="px-3 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium"
      >{existing ? 'Update' : 'Add filter'}</button>
    </div>
  {/if}
</div>
