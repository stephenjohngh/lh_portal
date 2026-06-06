<!-- src/lib/apps/mor/components/CaseList.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import CaseCard from '$lib/apps/mor/components/CaseCard.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import { STATUS_LABEL, OPEN_STATUSES } from '$lib/apps/mor/utils/morHelpers';

  export let cases   = [];
  export let loading = false;

  const dispatch = createEventDispatcher();

  // ── Filters ──────────────────────────────────────────────────────────────
  let filterStatus    = '';
  let filterMechanism = '';
  let filterUrgent    = false;
  let search          = '';

  // Set-based lookup (single iteration of OPEN_STATUSES at module load).
  const OPEN_SET = new Set(OPEN_STATUSES);

  let showFilter = 'open'; // 'all' | 'open' | 'closed'

  $: filtered = cases.filter(c => {
    if (showFilter === 'open'   && !OPEN_SET.has(c.status)) return false;
    if (showFilter === 'closed' && c.status !== 'closed' && c.status !== 'reclassified') return false;
    if (filterStatus    && c.status    !== filterStatus)    return false;
    if (filterMechanism && c.mechanism !== filterMechanism) return false;
    if (filterUrgent    && !c.urgency)                      return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.reference.toLowerCase().includes(q) &&
          !c.description.toLowerCase().includes(q) &&
          !(c.location_text ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Stats (computed once per cases change)
  $: stats = (() => {
    let open = 0, urgent = 0, bsr = 0;
    for (const c of cases) {
      if (OPEN_SET.has(c.status)) {
        open++;
        if (c.urgency) urgent++;
      }
      if (['bsr_notice','bsr_report'].includes(c.status) && !c.bsr_report_submitted_at) bsr++;
    }
    return { open, urgent, bsr };
  })();
</script>

<!-- Stats row -->
<div class="grid grid-cols-3 gap-3 mb-4">
  {#each [
    { label: 'Open cases',    value: stats.open,   colour: 'text-blue-300' },
    { label: 'Urgent',        value: stats.urgent, colour: 'text-red-300'  },
    { label: 'Awaiting BSR',  value: stats.bsr,    colour: 'text-orange-300' },
  ] as stat}
    <div class="bg-slate-800 border border-slate-700 rounded-lg p-3 text-center">
      <p class="text-2xl font-bold {stat.colour}">{stat.value}</p>
      <p class="text-xs text-slate-500 mt-0.5">{stat.label}</p>
    </div>
  {/each}
</div>

<!-- Filter toolbar -->
<div class="flex flex-wrap items-center gap-2 mb-4">
  <!-- Open / closed / all toggle -->
  <div class="flex rounded-lg border border-slate-600 overflow-hidden text-xs">
    {#each [['open','Open'], ['closed','Closed'], ['all','All']] as [val, label]}
      <button
        type="button"
        class="px-3 py-1.5 transition-colors
               {showFilter === val ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}"
        on:click={() => showFilter = val}
      >{label}</button>
    {/each}
  </div>

  <select bind:value={filterStatus}
    class="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-300
           focus:outline-none focus:ring-1 focus:ring-purple-500">
    <option value="">All statuses</option>
    {#each Object.entries(STATUS_LABEL) as [val, label]}
      <option value={val}>{label}</option>
    {/each}
  </select>

  <select bind:value={filterMechanism}
    class="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-300
           focus:outline-none focus:ring-1 focus:ring-purple-500">
    <option value="">All mechanisms</option>
    <option value="structural">Structural</option>
    <option value="fire_smoke">Fire / Smoke</option>
    <option value="both">Both</option>
  </select>

  <label class="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
    <input type="checkbox" bind:checked={filterUrgent} class="accent-red-500" />
    Urgent only
  </label>

  <input
    type="text"
    bind:value={search}
    placeholder="Search…"
    class="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white
           placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 ml-auto w-48"
  />
</div>

<!-- List -->
{#if loading}
  <LoadingSpinner />
{:else if filtered.length === 0}
  <div class="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
    <p class="text-slate-400 text-sm">No cases match the current filters.</p>
  </div>
{:else}
  <div class="space-y-2">
    {#each filtered as c (c.id)}
      <CaseCard {c} on:select={e => dispatch('select', e.detail)} />
    {/each}
  </div>
{/if}
