<!-- src/lib/apps/parking/components/AgreementsTab.svelte -->
<!-- Every agreement, live ones first. Selecting one opens its panel. -->
<script>
  import { parkingStore } from '../stores/parkingStore.js';
  import { STATUSES, STATUS_LABEL, BASIS_LABEL, LIVE } from '../utils/agreementModel.js';
  import { fmtDate } from '$lib/utils/dates.js';
  import AgreementPanel from './AgreementPanel.svelte';

  export let canEdit = false;
  export let selectedId = null;

  let status = 'live';          // 'live' | '' (all) | a status
  let q = '';

  $: s = $parkingStore;
  $: holderName = (id) => {
    const h = s.holders.find(x => x.id === id);
    return h ? (h.company_name ? `${h.company_name} — ${h.display_name}` : h.display_name) : '—';
  };
  $: bayRef = (bayId) => s.bays.find(b => b.bay_id === bayId)?.ref ?? '—';

  $: rows = s.agreements
    .filter(a => status === '' || (status === 'live' ? LIVE.has(a.status) : a.status === status))
    .filter(a => {
      const needle = q.trim().toLowerCase();
      return !needle || [a.reference, bayRef(a.bay_id), holderName(a.holder_id), a.unit_ref]
        .some(v => String(v ?? '').toLowerCase().includes(needle));
    })
    .sort((a, b) => Number(LIVE.has(b.status)) - Number(LIVE.has(a.status)) || b.starts_on.localeCompare(a.starts_on));

  $: selected = s.agreements.find(a => a.id === selectedId) ?? null;
</script>

<div class="flex flex-wrap items-center gap-2 mb-3">
  <input bind:value={q} placeholder="Search reference, bay, holder…"
    class="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 w-60" />
  <select bind:value={status} class="px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200">
    <option value="live">Live (draft, active, notice)</option>
    <option value="">All</option>
    {#each STATUSES as st}<option value={st.value}>{st.label}</option>{/each}
  </select>
</div>

<div class="grid gap-4 {selected ? 'lg:grid-cols-[1fr_24rem]' : ''}">
  <div class="min-w-0">
    {#if rows.length === 0}
      <p class="text-sm text-slate-500 italic py-4">
        {s.agreements.length ? 'No agreements match.' : 'No agreements yet. Allocate a bay from the Bays tab.'}</p>
    {:else}
      <table class="w-full text-sm" data-testid="agreement-list">
        <thead>
          <tr class="border-b border-slate-700 text-left text-xs text-slate-400">
            <th class="py-2 pr-3 font-medium">Reference</th>
            <th class="py-2 pr-3 font-medium">Bay</th>
            <th class="py-2 pr-3 font-medium">Holder</th>
            <th class="py-2 pr-3 font-medium">Dates</th>
            <th class="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as a (a.id)}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <tr class="border-b border-slate-800 cursor-pointer hover:bg-slate-800/60 {a.id === selectedId ? 'bg-slate-800' : ''}"
              on:click={() => selectedId = a.id}>
              <td class="py-2 pr-3 font-mono text-slate-200">{a.reference}</td>
              <td class="py-2 pr-3 font-mono text-slate-300">{bayRef(a.bay_id)}</td>
              <td class="py-2 pr-3 text-slate-200">{holderName(a.holder_id)}
                <span class="text-xs text-slate-500">· {BASIS_LABEL[a.basis]}</span></td>
              <td class="py-2 pr-3 text-xs text-slate-400">{fmtDate(a.starts_on)} → {a.ends_on ? fmtDate(a.ends_on) : 'rolling'}</td>
              <td class="py-2 text-xs text-slate-300">{STATUS_LABEL[a.status]}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
  {#if selected}
    <AgreementPanel agreement={selected} {canEdit} on:close={() => selectedId = null} on:showBay />
  {/if}
</div>
