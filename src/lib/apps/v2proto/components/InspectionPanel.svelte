<!-- src/lib/apps/v2proto/components/InspectionPanel.svelte -->
<!-- Walk inspection panel for a single component.
     Shows overall result selector, checkable attribute checklist, and notes.
     checklist_results saved as JSONB on component_inspections.
     Demonstrates the checkable attribute flow in the v2 data model. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { v2protoStore } from '../stores/v2protoStore.js';

  export let component      = null;  // components row
  export let typeConfig     = null;  // component_types row
  export let checkableAttrs = [];    // type_attributes[] where checkable = true (effective set)
  export let lastInspection = null;  // component_inspections row or null

  const dispatch = createEventDispatcher();

  const RESULTS = [
    { value: 'OK',       label: 'OK',       cls: 'bg-green-600 hover:bg-green-500',   selCls: 'ring-2 ring-green-400' },
    { value: 'problem',  label: 'Problem',  cls: 'bg-yellow-600 hover:bg-yellow-500', selCls: 'ring-2 ring-yellow-400' },
    { value: 'failed',   label: 'Failed',   cls: 'bg-red-600 hover:bg-red-500',       selCls: 'ring-2 ring-red-400' },
    { value: 'inactive', label: 'Inactive', cls: 'bg-slate-600 hover:bg-slate-500',   selCls: 'ring-2 ring-slate-400' }
  ];

  // Initialise form from last inspection or defaults
  let result    = lastInspection?.inspection_result ?? 'OK';
  let notes     = lastInspection?.inspector_notes   ?? '';

  // Build checklist: one entry per checkable attr, defaulting to false
  // Pre-populate from last inspection if available
  let checklist = Object.fromEntries(
    checkableAttrs.map(a => [
      a.id,
      lastInspection?.checklist_results?.[a.id] ?? false
    ])
  );

  let saving = false;
  let error  = '';

  $: checkedCount = Object.values(checklist).filter(Boolean).length;
  $: allChecked   = checkableAttrs.length > 0 && checkedCount === checkableAttrs.length;

  function checkAll() {
    checklist = Object.fromEntries(checkableAttrs.map(a => [a.id, true]));
  }

  async function save() {
    saving = true;
    error  = '';
    try {
      await v2protoStore.saveInspection(component.id, {
        result,
        notes,
        checklistResults: checklist
      });
      dispatch('saved');
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-5">

  <!-- Header -->
  <div class="flex items-start justify-between gap-3">
    <div class="flex items-center gap-3">
      {#if typeConfig}
        <div
          class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg shrink-0"
          style="background-color: #{typeConfig.colour}"
          title={typeConfig.name}
        >
          {typeConfig.initial}
        </div>
      {:else}
        <div class="w-10 h-10 rounded-lg bg-slate-600 flex items-center justify-center text-slate-400 shrink-0">?</div>
      {/if}
      <div>
        <p class="font-semibold text-white leading-tight">
          {component?.label || component?.asset_id || 'Component'}
        </p>
        <p class="text-xs text-slate-400">{typeConfig?.name ?? component?.type_code}</p>
        {#if component?.primary_attribute}
          <p class="text-xs text-yellow-300 mt-0.5">★ {component.primary_attribute}</p>
        {/if}
      </div>
    </div>
    <button
      on:click={() => dispatch('close')}
      class="text-slate-500 hover:text-white transition-colors shrink-0 text-xl leading-none"
      title="Close"
    >✕</button>
  </div>

  {#if error}
    <p class="text-red-400 text-sm px-3 py-2 rounded bg-red-500/10 border border-red-500/30">{error}</p>
  {/if}

  <!-- Overall result -->
  <div>
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Inspection Result</p>
    <div class="grid grid-cols-4 gap-2">
      {#each RESULTS as r}
        <button
          on:click={() => result = r.value}
          class="py-2 text-sm rounded font-medium text-white transition-all
                 {r.cls} {result === r.value ? r.selCls : 'opacity-50'}"
        >{r.label}</button>
      {/each}
    </div>
  </div>

  <!-- Checklist -->
  {#if checkableAttrs.length > 0}
    <div>
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Inspection Checklist
          <span class="font-normal normal-case text-slate-500 ml-1">
            {checkedCount}/{checkableAttrs.length} checked
          </span>
        </p>
        {#if !allChecked}
          <button
            on:click={checkAll}
            class="text-xs text-slate-500 hover:text-green-400 transition-colors"
          >Check all</button>
        {/if}
      </div>

      <div class="space-y-1.5">
        {#each checkableAttrs as attr (attr.id)}
          <label
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer select-none transition-colors
                   {checklist[attr.id]
                     ? 'bg-green-900/20 border-green-700/40 text-white'
                     : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-600'}"
          >
            <input
              type="checkbox"
              bind:checked={checklist[attr.id]}
              class="w-4 h-4 rounded accent-green-500 shrink-0"
            />
            <span class="text-sm flex-1">{attr.name}</span>
            {#if attr._scope === 'system'}
              <span class="text-xs text-blue-400/60 shrink-0" title="System-level attribute">↑</span>
            {/if}
            {#if checklist[attr.id]}
              <span class="text-green-400 text-sm shrink-0">✓</span>
            {/if}
          </label>
        {/each}
      </div>
    </div>
  {:else}
    <div class="text-xs text-slate-600 italic px-1">
      No checklist items defined for this type.
      <span class="text-slate-500">Add attributes with "Shows in walk checklist" enabled in the Admin tab.</span>
    </div>
  {/if}

  <!-- Notes -->
  <div>
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Inspector Notes</p>
    <textarea
      bind:value={notes}
      rows="2"
      placeholder="Notes about this inspection…"
      class="w-full px-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-600
             focus:outline-none focus:border-purple-500 text-white placeholder-slate-600
             resize-none transition-colors"
    ></textarea>
  </div>

  <!-- Last inspection info -->
  {#if lastInspection}
    <p class="text-xs text-slate-600">
      Last inspected:
      {new Date(lastInspection.inspected_at).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric'
      })}
      — result was
      <span class="text-slate-400">{lastInspection.inspection_result}</span>
    </p>
  {/if}

  <!-- Actions -->
  <div class="flex gap-3">
    <button
      on:click={save}
      disabled={saving}
      class="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors
             bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >{saving ? 'Saving…' : 'Save Inspection'}</button>
    <button
      on:click={() => dispatch('close')}
      class="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white
             bg-slate-700 hover:bg-slate-600 transition-colors"
    >Cancel</button>
  </div>

</div>
