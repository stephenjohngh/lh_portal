<!-- src/lib/apps/v2proto/components/AttrField.svelte -->
<!-- Renders a single attribute input control based on type_attributes.display_type -->
<script>
  import { createEventDispatcher } from 'svelte';

  export let def;       // type_attributes row (name, display_type, required, is_primary)
  export let options;   // type_attribute_options[] — only populated for dropdown/radio
  export let value;     // current string value (always stored as text)

  const dispatch = createEventDispatcher();

  function emit(val) {
    dispatch('change', { attrDefId: def.id, value: String(val) });
  }

  // For checkbox: value is stored as 'true' / 'false' string
  $: checked = value === 'true';
</script>

<div class="flex flex-col gap-1">
  <p class="text-xs text-slate-400 flex items-center gap-1">
    {def.name}
    {#if def.is_primary}
      <span class="text-yellow-400 text-xs" title="Primary attribute">★</span>
    {/if}
    {#if def.required}
      <span class="text-red-400">*</span>
    {/if}
    <span class="ml-1 text-slate-600 font-mono text-xs">[{def.display_type}]</span>
  </p>

  {#if def.display_type === 'checkbox'}
    <label class="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        {checked}
        on:change={e => emit(e.target.checked)}
        class="w-4 h-4 rounded accent-purple-500"
      />
      <span class="text-sm text-slate-300">{value === 'true' ? 'Yes' : 'No'}</span>
    </label>

  {:else if def.display_type === 'number'}
    <input
      type="number"
      value={value ?? ''}
      on:input={e => emit(e.target.value)}
      placeholder={def.required ? 'Required' : 'Optional'}
      class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
             focus:outline-none focus:border-purple-500 w-32"
    />

  {:else if def.display_type === 'dropdown'}
    <select
      value={value ?? ''}
      on:change={e => emit(e.target.value)}
      class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
             focus:outline-none focus:border-purple-500"
    >
      {#if !def.required}
        <option value="">— none —</option>
      {:else}
        <option value="" disabled>Select…</option>
      {/if}
      {#each options.filter(o => o.visible) as opt}
        <option value={opt.value}>
          {opt.value}
          {#if opt.priority_override}
            [{opt.priority_override}]
          {/if}
        </option>
      {/each}
    </select>

  {:else if def.display_type === 'radio'}
    <div class="flex flex-wrap gap-2">
      {#each options.filter(o => o.visible) as opt}
        <label class="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name={def.id}
            value={opt.value}
            checked={value === opt.value}
            on:change={() => emit(opt.value)}
            class="accent-purple-500"
          />
          <span class="text-sm text-slate-300">{opt.value}</span>
        </label>
      {/each}
    </div>

  {:else if def.display_type === 'textarea'}
    <textarea
      value={value ?? ''}
      on:input={e => emit(e.target.value)}
      rows="3"
      placeholder={def.required ? 'Required' : 'Optional'}
      class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
             focus:outline-none focus:border-purple-500 resize-y"
    ></textarea>

  {:else}
    <!-- display_type === 'text' or anything unknown -->
    <input
      type="text"
      value={value ?? ''}
      on:input={e => emit(e.target.value)}
      placeholder={def.required ? 'Required' : 'Optional'}
      class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
             focus:outline-none focus:border-purple-500"
    />
  {/if}
</div>
