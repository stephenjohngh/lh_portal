<!-- src/lib/components/common/FilterBar.svelte -->
<!--
  A search box + a row of multi-select facets + Clear, with read-only pills
  summarising what is active. The shape the Components tab arrived at, lifted so
  a second list does not have to rebuild it.

  Data-driven on purpose: `fields` describes the facets, `values` holds a Set
  per facet key. A caller adds a filter by adding a field, not by adding markup,
  which is what keeps two lists on one bar.

  Only one dropdown may be open at a time — the bar owns that state, because it
  is presentation, not something a caller should have to track.

  Props in, `values`/`query` bound out. Everything derived is computed here.
-->
<script>
  import MultiSelectDropdown from './MultiSelectDropdown.svelte';

  /** @type {{key:string,label:string,placeholder?:string,noun?:string,minWidth?:string,options:{value:string,label:string,short?:string}[]}[]} */
  export let fields = [];
  /** @type {Record<string, Set<string>>} bindable — one Set per field key */
  export let values = {};
  /** @type {string} bindable free-text query */
  export let query = '';
  export let searchPlaceholder = 'Name, reference…';
  /** Shown to the right of Clear, e.g. "34 of 116". Caller computes it. */
  export let resultLabel = '';

  let openKey = null;

  // Every field needs a Set before it can be bound into. Guarded against
  // re-running: this block writes to `values`, which it also reads.
  $: {
    let changed = false;
    for (const f of fields) {
      if (!(values[f.key] instanceof Set)) { values[f.key] = new Set(); changed = true; }
    }
    if (changed) values = values;
  }

  // ⚠ Every derived value below reads `values` DIRECTLY rather than through a
  // helper. Svelte tracks the variables a reactive statement mentions, so
  // `fields.reduce((n, f) => n + setOf(f.key).size, 0)` depends on `fields` and
  // never on `values` — the counts and pills simply stop updating when a
  // selection changes. Caught by a test; it is invisible by reading.
  $: facets = fields.map(f => ({
    field:    f,
    selected: values[f.key] instanceof Set ? values[f.key] : new Set(),
  }));

  $: activeCount =
    facets.reduce((n, x) => n + x.selected.size, 0) + (query.trim() ? 1 : 0);

  /** The label to show in a pill for the values selected in one facet. */
  function pillText(field, selected) {
    const names = field.options
      .filter(o => selected.has(o.value))
      .map(o => o.short ?? o.label);
    return `${field.label}: ${names.join(', ')}`;
  }

  function clearAll() {
    for (const f of fields) values[f.key] = new Set();
    values = values;
    query = '';
    openKey = null;
  }
</script>

<div class="flex flex-wrap items-end gap-3">
  <div class="flex flex-col gap-1 w-44">
    <p class="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Search</p>
    <input
      type="text"
      bind:value={query}
      placeholder={searchPlaceholder}
      class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-xs text-white
             placeholder:text-slate-500 focus:outline-none focus:border-purple-500 w-full"
    />
  </div>

  {#each facets as { field } (field.key)}
    <MultiSelectDropdown
      label={field.label}
      placeholder={field.placeholder ?? 'All'}
      noun={field.noun ?? 'selected'}
      minWidth={field.minWidth ?? '130px'}
      options={field.options}
      bind:selected={values[field.key]}
      open={openKey === field.key}
      on:toggle={() => openKey = openKey === field.key ? null : field.key}
    />
  {/each}

  {#if activeCount > 0}
    <button
      on:click={clearAll}
      class="text-xs text-purple-400 hover:text-purple-300 transition-colors self-end pb-1.5"
    >Clear</button>
  {/if}

  {#if resultLabel}
    <span class="text-xs text-slate-400 self-end pb-1.5 ml-auto">{resultLabel}</span>
  {/if}

  {#if activeCount > 0}
    <div class="w-full flex flex-wrap gap-1.5 mt-0.5">
      {#each facets as { field, selected } (field.key)}
        {#if selected.size > 0}
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                       bg-slate-700 text-slate-300 border border-slate-600">
            {pillText(field, selected)}
          </span>
        {/if}
      {/each}
      {#if query.trim()}
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                     bg-slate-700 text-slate-300 border border-slate-600">
          "{query.trim()}"
        </span>
      {/if}
    </div>
  {/if}
</div>
