<!-- src/lib/apps/golden_thread/components/GtRisks.svelte -->
<!-- Risk register tab (Stage D). Register list + heat-map dashboard + detail +
     create/edit, all reading gtRiskStore. Owner names come from the GT people
     registry; the GT-document picker uses the current register. -->
<script>
  import { onMount } from 'svelte';
  import { gtRiskStore } from '$lib/apps/golden_thread/stores/gtRiskStore';
  import { permissions } from '$lib/stores/permissions';
  import { listPersons, listCurrentDocuments } from '$lib/apps/golden_thread/public.js';
  import { RISK_STATUSES, RISK_STATUS_LABELS, RISK_STATUS_BADGE } from '$lib/apps/golden_thread/utils/gtRiskLifecycle.js';
  import { RISK_DOMAINS, RISK_DOMAIN_LABELS, DEFAULT_RISK_BANDS, liveRating } from '$lib/apps/golden_thread/utils/gtRiskScoring.js';
  import Badge         from '$lib/components/common/Badge.svelte';
  import Button        from '$lib/components/common/Button.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import GtRiskForm    from '$lib/apps/golden_thread/components/GtRiskForm.svelte';
  import GtRiskDetail  from '$lib/apps/golden_thread/components/GtRiskDetail.svelte';
  import GtRiskHeatmap from '$lib/apps/golden_thread/components/GtRiskHeatmap.svelte';

  $: ({ risks, selectedRisk, riskLinks, alertsByRisk, loading, saving, error } = $gtRiskStore);
  $: canEdit = $permissions.isAdmin || $permissions.canModify;

  let view = 'register';    // 'register' | 'heatmap'
  let viewingId = null;     // open risk id
  let showForm = false;
  let editing = null;

  let persons = [];
  let documents = [];
  $: personName = new Map(persons.map((p) => [p.id, p.full_name]));

  // Filters
  let fDomain = 'all';
  let fStatus = 'all';
  let fBand = 'all';

  onMount(async () => {
    await gtRiskStore.load();
    try { persons = await listPersons(); } catch { persons = []; }
    try { documents = await listCurrentDocuments(); } catch { documents = []; }
  });

  function bandOf(r) { return liveRating(r, alertsByRisk[r.id] ?? {}).band; }

  $: filtered = risks.filter((r) => {
    if (fDomain !== 'all' && r.domain !== fDomain) return false;
    if (fStatus !== 'all' && r.status !== fStatus) return false;
    if (fBand !== 'all' && bandOf(r)?.band !== fBand) return false;
    return true;
  });

  async function openRisk(r) { await gtRiskStore.loadRisk(r.id); viewingId = r.id; }
  function backToList() { viewingId = null; gtRiskStore.clearSelected(); }

  function newRisk()  { editing = null; showForm = true; }
  function editRisk(r) { editing = r; showForm = true; }

  async function handleSubmit({ detail }) {
    const { id, data } = detail;
    const r = id ? await gtRiskStore.saveRisk(id, data) : await gtRiskStore.createRisk(data);
    if (r.success) {
      showForm = false; editing = null;
      if (viewingId) await gtRiskStore.loadRisk(viewingId);
    }
  }

  function onHeatCell({ detail }) {
    fDomain = detail.domain; fStatus = 'all'; fBand = 'all';
    view = 'register';
  }
</script>

<div class="space-y-4">
  {#if error}<ErrorDisplay message={error} onDismiss={() => gtRiskStore.clearError()} />{/if}

  {#if viewingId && selectedRisk}
    <GtRiskDetail
      risk={selectedRisk}
      links={riskLinks}
      signals={alertsByRisk[selectedRisk.id] ?? {}}
      {documents}
      ownerName={personName.get(selectedRisk.owner_id) ?? ''}
      {saving}
      on:back={backToList}
      on:edit={(e) => editRisk(e.detail)}
      on:changed={async () => { await gtRiskStore.loadRisk(viewingId); }}
    />
  {:else}
    <!-- Header + sub-nav -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex gap-1">
        <button class="px-3 py-1.5 text-sm rounded {view === 'register' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}" on:click={() => view = 'register'}>Register</button>
        <button class="px-3 py-1.5 text-sm rounded {view === 'heatmap' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}" on:click={() => view = 'heatmap'}>Heat-map</button>
      </div>
      {#if canEdit}<ProtectedButton action="modify" variant="primary" size="small" on:click={newRisk}>+ New risk</ProtectedButton>{/if}
    </div>

    {#if loading}
      <LoadingSpinner />
    {:else if view === 'heatmap'}
      <GtRiskHeatmap {risks} {alertsByRisk} on:cell={onHeatCell} />
    {:else}
      <!-- Filters -->
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-xs text-slate-400">Domain
          <select bind:value={fDomain} class="mt-1 block bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200">
            <option value="all">All</option>
            {#each RISK_DOMAINS as d}<option value={d}>{RISK_DOMAIN_LABELS[d]}</option>{/each}
          </select>
        </label>
        <label class="text-xs text-slate-400">Status
          <select bind:value={fStatus} class="mt-1 block bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200">
            <option value="all">All</option>
            {#each RISK_STATUSES as s}<option value={s}>{RISK_STATUS_LABELS[s]}</option>{/each}
          </select>
        </label>
        <label class="text-xs text-slate-400">Band (live)
          <select bind:value={fBand} class="mt-1 block bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200">
            <option value="all">All</option>
            {#each DEFAULT_RISK_BANDS as b}<option value={b.band}>{b.label}</option>{/each}
          </select>
        </label>
        <span class="text-xs text-slate-500 pb-1">{filtered.length} of {risks.length}</span>
      </div>

      {#if filtered.length === 0}
        <p class="text-sm text-slate-400 py-8 text-center">
          {risks.length === 0 ? 'No risks in the register yet.' : 'No risks match these filters.'}
        </p>
      {:else}
        <div class="overflow-x-auto rounded-lg border border-slate-700">
          <table class="w-full text-sm">
            <thead class="bg-slate-800 text-slate-300">
              <tr>
                <th class="text-left font-medium px-3 py-2">Ref</th>
                <th class="text-left font-medium px-3 py-2">Title</th>
                <th class="text-left font-medium px-3 py-2">Domain</th>
                <th class="text-left font-medium px-3 py-2">Status</th>
                <th class="text-left font-medium px-3 py-2">Live rating</th>
                <th class="text-left font-medium px-3 py-2">Owner</th>
              </tr>
            </thead>
            <tbody>
              {#each filtered as r (r.id)}
                {@const lr = liveRating(r, alertsByRisk[r.id] ?? {})}
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <tr class="border-t border-slate-700 hover:bg-slate-800/50 cursor-pointer" on:click={() => openRisk(r)}>
                  <td class="px-3 py-2 font-mono text-xs text-slate-300">{r.reference}</td>
                  <td class="px-3 py-2 text-white">{r.title}</td>
                  <td class="px-3 py-2 text-slate-400">{RISK_DOMAIN_LABELS[r.domain] ?? r.domain}</td>
                  <td class="px-3 py-2"><Badge color={RISK_STATUS_BADGE[r.status] ?? 'bg-slate-500'}>{RISK_STATUS_LABELS[r.status] ?? r.status}</Badge></td>
                  <td class="px-3 py-2">
                    {#if lr.band}<Badge color={lr.band.badge}>{lr.band.label}{#if lr.escalated} ⚠{/if}</Badge>{:else}—{/if}
                  </td>
                  <td class="px-3 py-2 text-slate-400">{personName.get(r.owner_id) ?? '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  {/if}
</div>

{#if showForm}
  <GtRiskForm risk={editing} {persons} {saving} on:submit={handleSubmit} on:close={() => { showForm = false; editing = null; }} />
{/if}
