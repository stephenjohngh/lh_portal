<!-- src/lib/apps/parking/components/HoldersTab.svelte -->
<!-- People and companies holding, or recorded as holding, a bay.
     ⚠ Deliberately NO search by address or flat: this is a list of parties to
     agreements, and finding "who lives at Flat 12" is the one question it must
     not become a way to answer (design §3.2). Search is by name only. -->
<script>
  import { matchesSearch } from '#lib/utils/textSearch.js';
  import { createEventDispatcher } from 'svelte';
  import { parkingStore } from '../stores/parkingStore.js';
  import { HOLDER_TYPE_LABEL, STATUS_LABEL, LIVE } from '../utils/agreementModel.js';
  import Button      from '#lib/components/common/Button.svelte';
  import HolderModal from './HolderModal.svelte';

  export let canEdit = false;

  const dispatch = createEventDispatcher();
  let q = '';
  let editing = null;      // a holder, or {} to add
  let modalOpen = false;

  $: s = $parkingStore;
  $: rows = s.holders.filter(h => matchesSearch([h.display_name, h.company_name], q));
  $: agreementsOf = (id) => s.agreements.filter(a => a.holder_id === id);
  $: bayRef = (bayId) => s.bays.find(b => b.bay_id === bayId)?.ref ?? '—';

  function open(h) { editing = h; modalOpen = true; }
</script>

<div class="flex flex-wrap items-center gap-2 mb-3">
  <input bind:value={q} placeholder="Search by name…"
    class="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 w-56 max-w-full" />
  {#if canEdit}<Button size="small" variant="primary" on:click={() => open(null)}>Add a holder</Button>{/if}
</div>

{#if rows.length === 0}
  <p class="text-sm text-slate-500 italic py-4">{s.holders.length ? 'No holders match.' : 'No holders yet.'}</p>
{:else}
  <div class="overflow-x-auto"><table class="w-full text-sm" data-testid="holder-list">
    <thead>
      <tr class="border-b border-slate-700 text-left text-xs text-slate-400">
        <th class="py-2 pr-3 font-medium">Name</th>
        <th class="py-2 pr-3 font-medium">Kind</th>
        <th class="py-2 pr-3 font-medium">Contact</th>
        <th class="py-2 pr-3 font-medium">Agreements</th>
        <th class="py-2"></th>
      </tr>
    </thead>
    <tbody>
      {#each rows as h (h.id)}
        <tr class="border-b border-slate-800 align-top">
          <td class="py-2 pr-3 text-slate-200">{h.display_name}
            {#if h.company_name}<span class="block text-xs text-slate-500">{h.company_name}</span>{/if}</td>
          <td class="py-2 pr-3 text-xs text-slate-400">{HOLDER_TYPE_LABEL[h.holder_type]}</td>
          <td class="py-2 pr-3 text-xs text-slate-400">{h.email ?? ''}{#if h.phone}<span class="block">{h.phone}</span>{/if}</td>
          <td class="py-2 pr-3 text-xs">
            {#each agreementsOf(h.id) as a (a.id)}
              <button class="block text-left hover:underline {LIVE.has(a.status) ? 'text-slate-200' : 'text-slate-500'}"
                on:click={() => dispatch('showAgreement', a.id)}>
                <span class="font-mono">{a.reference}</span> · {bayRef(a.bay_id)} · {STATUS_LABEL[a.status]}
              </button>
            {:else}<span class="text-slate-600">None</span>{/each}
          </td>
          <td class="py-2 text-right">
            {#if canEdit}<button class="text-xs text-purple-400 hover:text-purple-300" on:click={() => open(h)}>Edit</button>{/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table></div>
{/if}

<HolderModal show={modalOpen} holder={editing} on:close={() => modalOpen = false} on:saved={() => modalOpen = false} />
