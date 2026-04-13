<!-- src/lib/apps/building_assets/components/TypeBrowser.svelte -->
<!-- Read-only browser: System → Type → Attribute Definitions + Options -->
<script>
  export let systems  = [];
  export let types    = [];
  export let attrDefs = {};    // { typeId: type_attributes[] }
  export let attrOptions = {}; // { attrDefId: type_attribute_options[] }

  let selectedSystem = null;
  let selectedType   = null;

  $: systemTypes = selectedSystem
    ? types.filter(t => t.building_system_id === selectedSystem.id)
    : [];

  $: typeDefs = selectedType ? (attrDefs[selectedType.id] ?? []) : [];

  function colourStyle(hex) {
    return `background-color: #${hex}`;
  }

  const PRIORITY_COLOURS = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high:     'bg-orange-500/20 text-orange-400 border-orange-500/30',
    medium:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low:      'bg-slate-500/20 text-slate-400 border-slate-500/30'
  };
</script>

<div class="flex gap-4 h-full min-h-0">

  <!-- Systems column -->
  <div class="w-52 shrink-0 flex flex-col gap-1">
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Systems</p>
    {#each systems as sys}
      <button
        class="text-left px-3 py-2 rounded-lg text-sm transition-colors
               {selectedSystem?.id === sys.id
                 ? 'bg-purple-600 text-white'
                 : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}"
        on:click={() => { selectedSystem = sys; selectedType = null; }}
      >
        <div class="font-medium">{sys.name}</div>
        {#if sys.uniclass_code}
          <div class="text-xs opacity-60 font-mono">{sys.uniclass_code}</div>
        {/if}
        <div class="text-xs opacity-60 mt-0.5">
          {types.filter(t => t.building_system_id === sys.id).length} types
        </div>
      </button>
    {/each}
    {#if systems.length === 0}
      <p class="text-slate-500 text-sm italic">No systems found — run seed SQL</p>
    {/if}
  </div>

  <!-- Types column -->
  <div class="w-52 shrink-0 flex flex-col gap-1">
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
      Types {selectedSystem ? `— ${selectedSystem.name}` : ''}
    </p>
    {#if !selectedSystem}
      <p class="text-slate-600 text-sm italic">Select a system</p>
    {:else}
      {#each systemTypes as t}
        <button
          class="text-left px-3 py-2 rounded-lg text-sm transition-colors
                 {selectedType?.id === t.id
                   ? 'bg-purple-600 text-white'
                   : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}"
          on:click={() => selectedType = t}
        >
          <div class="flex items-center gap-2">
            <span
              class="w-6 h-6 rounded text-xs font-bold flex items-center justify-center shrink-0"
              style={colourStyle(t.colour)}
            >
              {t.initial}
            </span>
            <span class="font-medium">{t.name}</span>
          </div>
          <div class="text-xs opacity-60 mt-0.5 font-mono pl-8">{t.code}</div>
          <div class="flex gap-1 mt-1 pl-8">
            <span class="text-xs px-1.5 py-0.5 rounded border {PRIORITY_COLOURS[t.priority_base] ?? ''}">
              {t.priority_base}
            </span>
            {#if t.attribute_group}
              <span class="text-xs px-1.5 py-0.5 rounded bg-slate-600/50 text-slate-400 border border-slate-600">
                {t.attribute_group}
              </span>
            {/if}
          </div>
        </button>
      {/each}
      {#if systemTypes.length === 0}
        <p class="text-slate-600 text-sm italic">No types in this system</p>
      {/if}
    {/if}
  </div>

  <!-- Attribute Definitions + Options column -->
  <div class="flex-1 min-w-0">
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
      Attribute Definitions {selectedType ? `— ${selectedType.name}` : ''}
    </p>

    {#if !selectedType}
      <p class="text-slate-600 text-sm italic">Select a type</p>
    {:else if typeDefs.length === 0}
      <p class="text-slate-600 text-sm italic">No attribute definitions for this type</p>
    {:else}
      <div class="flex flex-col gap-3">
        {#each typeDefs as def}
          {@const opts = attrOptions[def.id] ?? []}
          <div class="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
            <div class="flex items-center gap-2 mb-2">
              <span class="font-medium text-sm text-white">{def.name}</span>
              {#if def.is_primary}
                <span class="text-yellow-400 text-xs" title="Primary attribute — stored in components.primary_attribute">★ primary</span>
              {/if}
              <span class="ml-auto text-xs font-mono px-2 py-0.5 rounded bg-slate-600 text-slate-300">
                {def.display_type}
              </span>
              {#if def.required}
                <span class="text-xs text-red-400">required</span>
              {/if}
            </div>

            {#if opts.length > 0}
              <div class="flex flex-wrap gap-1.5">
                {#each opts as opt}
                  <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full
                               bg-slate-600 text-slate-200 border border-slate-500">
                    {opt.value}
                    {#if opt.priority_override}
                      <span class="text-orange-400 font-semibold">↑{opt.priority_override}</span>
                    {/if}
                    {#if !opt.visible}
                      <span class="text-slate-500">hidden</span>
                    {/if}
                  </span>
                {/each}
              </div>
            {:else if def.display_type === 'dropdown' || def.display_type === 'radio'}
              <p class="text-xs text-slate-500 italic">No options defined</p>
            {/if}

            {#if def.default_value}
              <p class="text-xs text-slate-500 mt-1">Default: {def.default_value}</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
