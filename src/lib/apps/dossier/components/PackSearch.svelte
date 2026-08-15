<!-- src/lib/apps/dossier/components/PackSearch.svelte -->
<!-- Search within one pack — the same component in the workspace and in the
     published reader.

     One component for both surfaces for the same reason there is one renderer:
     the author and the recipient should be looking at the same pack. If search
     drifted between them, an author could fail to find what a reader can see.

     Deliberately plain Tailwind with no theme-specific classes beyond slate,
     because it renders inside both the portal shell and the public pack page.

     Merge doc D7: within a pack, never across publications. This component is
     handed content and cannot reach anything else. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { searchPack, describeResults, MIN_QUERY } from '../utils/packSearch.js';

  /** { docs, datasets, records } — whatever surface this is on. */
  export let content = null;
  /** Compact mode for the reader's header. */
  export let placeholder = 'Search this pack…';

  const dispatch = createEventDispatcher();

  let query = '';
  let open  = false;

  $: results = query.trim().length >= MIN_QUERY && content
    ? searchPack(content, query)
    : [];
  $: summary = describeResults(results, query);
  $: open = query.trim().length >= MIN_QUERY;

  function choose(result) {
    dispatch('go', result);
    // Keep the query: a reader checking several hits for the same phrase should
    // not have to retype it. Escape or the clear button ends the search.
    open = false;
  }

  function clear() {
    query = ''; open = false;
    dispatch('clear');
  }

  function onKeydown(event) {
    if (event.key === 'Escape') clear();
  }
</script>

<div class="relative">
  <input
    type="search"
    bind:value={query}
    on:keydown={onKeydown}
    on:focus={() => (open = query.trim().length >= MIN_QUERY)}
    {placeholder}
    aria-label="Search this pack"
    class="w-full bg-slate-900 border border-slate-700 rounded pl-2.5 pr-7 py-1.5
           text-xs text-slate-200 placeholder-slate-500
           focus:outline-none focus:border-purple-500"
  />

  {#if query}
    <!-- The panel sits over the page tree, so there must be a way out of it
         that is not "select all and delete". Escape does the same. -->
    <button
      class="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 text-slate-500
             hover:text-slate-200 transition-colors"
      title="Clear search (Esc)"
      aria-label="Clear search"
      on:click={clear}
    >×</button>
  {/if}

  {#if open}
    <div
      class="absolute z-30 mt-1 w-full max-h-80 overflow-y-auto rounded
             border border-slate-700 bg-slate-800 shadow-lg"
    >
      <div class="flex items-center gap-2 px-3 py-2 border-b border-slate-700/70">
        <p class="text-[11px] text-slate-500 flex-1">{summary}</p>
        <button
          class="text-[11px] text-slate-500 hover:text-slate-200 transition-colors shrink-0"
          on:click={clear}
        >Clear</button>
      </div>

      {#each results as result, i (result.kind + (result.docId ?? result.datasetId) + i)}
        <button
          class="w-full text-left px-3 py-2 border-b border-slate-700/40
                 hover:bg-slate-700/60 transition-colors"
          on:click={() => choose(result)}
        >
          <p class="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span class="text-slate-500">
              {result.kind === 'page' ? '📄' : result.kind === 'file' ? '📎' : '▤'}
            </span>
            <span class="truncate">{result.title}</span>
            <span class="text-slate-600">· {result.where}</span>
          </p>
          <p class="text-xs text-slate-200 mt-0.5">
            <!-- The hit is emphasised from the offsets the search returned, so
                 author text is never interpolated into markup. -->
            {result.snippet.text.slice(0, result.snippet.from)}<mark
              class="bg-purple-500/30 text-white rounded-sm"
            >{result.snippet.text.slice(result.snippet.from, result.snippet.to)}</mark
            >{result.snippet.text.slice(result.snippet.to)}
          </p>
        </button>
      {/each}
    </div>
  {/if}
</div>
