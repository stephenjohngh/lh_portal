<!-- src/lib/apps/v2proto/components/ComponentCard.svelte -->
<!-- Displays one component with its resolved type and attribute values -->
<script>
  import { createEventDispatcher } from 'svelte';

  export let component;      // components row
  export let types    = [];  // component_types[] — for lookup
  export let attrDefs = {};  // { typeId: type_attributes[] }
  export let attrs    = [];  // component_attributes[] for this component

  const dispatch = createEventDispatcher();

  $: type   = types.find(t => t.code === component.type_code) ?? null;
  $: defs   = type ? (attrDefs[type.id] ?? []) : [];

  // Build display list of attribute values with their definition names
  $: attrDisplay = attrs
    .map(a => {
      const def = defs.find(d => d.id === a.type_attribute_id);
      return def ? { name: def.name, value: a.value, isPrimary: def.is_primary } : null;
    })
    .filter(Boolean);

  const PRIORITY_COLOURS = {
    critical: 'text-red-400',
    high:     'text-orange-400',
    medium:   'text-yellow-400',
    low:      'text-slate-400'
  };

  const STATUS_COLOURS = {
    active:   'bg-slate-600 text-slate-300',
    OK:       'bg-green-600/30 text-green-400',
    problem:  'bg-orange-600/30 text-orange-400',
    failed:   'bg-red-600/30 text-red-400',
    inactive: 'bg-slate-700 text-slate-500'
  };
</script>

<div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600 flex gap-3">

  <!-- Type colour badge -->
  {#if type}
    <div
      class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg shrink-0"
      style="background-color: #{type.colour}"
      title={type.name}
    >
      {type.initial}
    </div>
  {:else}
    <div class="w-10 h-10 rounded-lg bg-slate-600 flex items-center justify-center text-slate-400 shrink-0">?</div>
  {/if}

  <div class="flex-1 min-w-0">
    <!-- Header -->
    <div class="flex items-start gap-2 flex-wrap">
      <span class="font-semibold text-white">
        {component.label || component.asset_id || component.type_code}
      </span>
      {#if component.asset_id && component.label}
        <span class="text-slate-500 text-sm font-mono">{component.asset_id}</span>
      {/if}
      <span class="text-xs px-1.5 py-0.5 rounded {STATUS_COLOURS[component.status] ?? STATUS_COLOURS.active}">
        {component.status}
      </span>
    </div>

    <!-- Type + primary attribute -->
    <div class="flex items-center gap-2 mt-0.5 flex-wrap">
      <span class="text-sm text-slate-400">{type?.name ?? component.type_code}</span>
      {#if component.primary_attribute}
        <span class="text-sm font-medium text-yellow-300">
          ★ {component.primary_attribute}
        </span>
      {/if}
    </div>

    <!-- Other attribute values -->
    {#if attrDisplay.length > 0}
      <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {#each attrDisplay.filter(a => !a.isPrimary) as a}
          <span class="text-xs text-slate-400">
            <span class="text-slate-500">{a.name}:</span>
            <span class="text-slate-300 ml-1">
              {#if a.value === 'true'}✓
              {:else if a.value === 'false'}✗
              {:else}{a.value}
              {/if}
            </span>
          </span>
        {/each}
      </div>
    {/if}

    <!-- Position -->
    <p class="text-xs text-slate-600 mt-1 font-mono">
      x={component.x_position.toFixed(2)} y={component.y_position.toFixed(2)}
    </p>
  </div>

  <!-- Delete button -->
  <button
    on:click={() => dispatch('delete', { id: component.id })}
    class="text-slate-600 hover:text-red-400 transition-colors shrink-0 mt-0.5"
    title="Delete component"
  >
    ✕
  </button>
</div>
