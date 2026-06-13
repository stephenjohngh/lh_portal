<!-- src/lib/apps/building_assets/components/MultiSelectDropdown.svelte -->
<!-- Reusable multi-select dropdown for the Components-tab filter bar (System,
     Status). A labelled button shows a summary; the dropdown lists checkbox
     options. Open state is CONTROLLED by the parent (so only one dropdown is
     open at a time, matching the original openDropdown behaviour): `open` is a
     prop and clicking the button dispatches `toggle`. Selection is a bindable
     Set. Phase-2 example #4 — extracting a reusable primitive (vs a one-off
     panel). See CLAUDE.md "Testing".

     NB: deliberately scoped to the FLAT-list dropdowns. Floor (has preset
     side-effects) and Type (grouped by system) keep their bespoke markup. -->
<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  export let label       = '';
  export let placeholder = 'All';          // summary when nothing selected
  export let noun        = 'selected';     // used in "{n} {noun}" for 2+
  export let options     = [];             // [{ value, label }]
  export let selected    = new Set();      // bindable Set of values
  export let open        = false;          // controlled by parent
  export let minWidth    = '130px';

  function toggle(value) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value); else next.add(value);
    selected = next;                       // reassign so bind: propagates
  }

  $: summary =
    selected.size === 0 ? placeholder
    : selected.size === 1 ? (options.find(o => selected.has(o.value))?.label ?? `1 ${noun}`)
    : `${selected.size} ${noun}`;
</script>

<div class="flex flex-col gap-1 relative">
  <p class="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">{label}</p>
  <button
    on:click={() => dispatch('toggle')}
    style="min-width: {minWidth}"
    class="bg-slate-700 border rounded px-3 py-1.5 text-xs text-white
           focus:outline-none flex items-center justify-between gap-2 text-left
           {selected.size > 0 ? 'border-purple-500/70' : 'border-slate-600 hover:border-slate-500'}"
  >
    <span class="truncate">{summary}</span>
    <span class="text-slate-500 shrink-0 text-[10px]">▾</span>
  </button>
  {#if open}
    <div class="absolute top-full left-0 mt-1 z-50 bg-slate-800 border border-slate-600
                rounded-lg shadow-xl min-w-max py-1 max-h-64 overflow-y-auto">
      {#each options as o (o.value)}
        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700/80 cursor-pointer">
          <input type="checkbox" checked={selected.has(o.value)}
                 on:change={() => toggle(o.value)}
                 class="rounded accent-purple-500 shrink-0" />
          <span class="text-xs text-slate-300 whitespace-nowrap">{o.label}</span>
        </label>
      {/each}
    </div>
  {/if}
</div>
