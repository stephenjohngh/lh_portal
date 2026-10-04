<!-- src/lib/apps/parking/components/RegistrationSearch.svelte -->
<!-- "Whose car is this, and should it be here?" — the question actually asked
     in a car park. Searches on Enter, not per keystroke, because every search
     is written to the audit log (parkingStore.lookupRegistration), and a log
     line per letter typed would bury the lookups that matter. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { parkingStore } from '../stores/parkingStore.js';
  import { normaliseReg, STATUS_LABEL } from '../utils/agreementModel.js';
  import { fmtDate } from '#lib/utils/dates.js';

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
        <!-- Only what the app knows: holders of bays that belong to flats may
             not be recorded, and visitors never are. -->
        <p class="text-slate-400 p-2">No vehicle registered as <span class="font-mono">{normaliseReg(q)}</span>
          on a parking agreement here.
          <span class="block text-xs text-slate-500 mt-1">Bays that belong to flats may not have their holders
            recorded, and visitors are not recorded at all.</span></p>
      {:else}
        {#each hits as h (h.vehicle.id)}
          <button class="w-full text-left p-2 rounded hover:bg-slate-700" on:click={() => h.agreement && open(h.agreement.id)}>
            <span class="font-mono text-white">{h.vehicle.registration}</span>
            {#if h.standing === 'authorised'}<span class="text-xs text-green-400 ml-1">authorised today</span>
            {:else if h.standing === 'pending'}<span class="text-xs text-sky-400 ml-1">not yet authorised{h.agreement?.status === 'draft'
              ? ' (agreement is a draft)' : ' — from ' + fmtDate([h.agreement?.starts_on, h.vehicle.from_date].filter(Boolean).sort().pop())}</span>
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
