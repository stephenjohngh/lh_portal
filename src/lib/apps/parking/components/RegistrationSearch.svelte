<!-- src/lib/apps/parking/components/RegistrationSearch.svelte -->
<!-- "Whose car is this, and should it be here?" — the question actually asked
     in a car park. Searches on Enter, not per keystroke, because every search
     is written to the audit log (parkingStore.lookupRegistration), and a log
     line per letter typed would bury the lookups that matter. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { parkingStore } from '../stores/parkingStore.js';
  import { normaliseReg, STATUS_LABEL } from '../utils/agreementModel.js';
  import { fmtDate } from '$lib/utils/dates.js';

  const dispatch = createEventDispatcher();
  let q = '';
  let hits = null;        // null until a search is run

  function search() {
    if (normaliseReg(q).length < 2) { hits = null; return; }
    hits = parkingStore.lookupRegistration(q);
  }
  function open(id) { hits = null; q = ''; dispatch('showAgreement', id); }
</script>

<div class="relative">
  <input bind:value={q} placeholder="Registration, then Enter"
    on:keydown={(e) => e.key === 'Enter' && search()}
    class="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 w-56 font-mono uppercase"
    aria-label="Search by registration" />
  {#if hits}
    <div class="absolute right-0 z-20 mt-1 w-96 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-2 text-sm"
      data-testid="registration-results">
      {#if hits.length === 0}
        <p class="text-slate-400 p-2">No vehicle registered as <span class="font-mono">{normaliseReg(q)}</span>.
          It is not authorised to park here.</p>
      {:else}
        {#each hits as h (h.vehicle.id)}
          <button class="w-full text-left p-2 rounded hover:bg-slate-700" on:click={() => h.agreement && open(h.agreement.id)}>
            <span class="font-mono text-white">{h.vehicle.registration}</span>
            {#if h.current}<span class="text-xs text-green-400 ml-1">authorised</span>
            {:else}<span class="text-xs text-amber-400 ml-1">no longer authorised{h.vehicle.to_date ? ' since ' + fmtDate(h.vehicle.to_date) : ''}</span>{/if}
            <span class="block text-xs text-slate-400">
              {h.bay?.ref ?? '—'} · {h.agreement?.reference ?? '—'} ({STATUS_LABEL[h.agreement?.status] ?? '—'})
              · {h.holder?.display_name ?? '—'}{h.holder?.phone ? ' · ' + h.holder.phone : ''}
            </span>
          </button>
        {/each}
      {/if}
      <button class="w-full text-right text-xs text-slate-500 hover:text-white mt-1" on:click={() => hits = null}>Close</button>
    </div>
  {/if}
</div>
