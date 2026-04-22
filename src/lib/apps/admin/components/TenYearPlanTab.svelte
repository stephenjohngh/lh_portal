<!-- src/lib/apps/admin/components/TenYearPlanTab.svelte -->
<!-- 10-year maintenance plan view.
     Shows all maintenance groups with renewal dates and costs.
     Each row has an Edit button that opens a compact modal to update planning data. -->
<script>
  import { maintenanceGroupsStore } from '../stores/maintenanceGroupsStore.js';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import { fmtDate }  from '$lib/utils/dates.js';

  $: ({ groups, loading, error } = $maintenanceGroupsStore);

  // ── Edit modal state ──────────────────────────────────────────────────
  let showModal  = false;
  let saving     = false;
  let modalError = '';
  let editId     = null;

  let editLastRenewal  = '';    // YYYY-MM-DD string
  let editLifetime     = '';    // string — numeric input
  let editCost         = '';    // string — numeric input
  let editNotes        = '';

  function openEdit(g) {
    editId          = g.id;
    editLastRenewal = g.last_renewal_date ?? '';
    editLifetime    = g.lifetime_years    != null ? String(g.lifetime_years) : '';
    editCost        = g.expected_cost     != null ? String(g.expected_cost)  : '';
    editNotes       = g.notes             ?? '';
    modalError      = '';
    showModal       = true;
  }

  async function handleSave() {
    saving = true; modalError = '';
    try {
      await maintenanceGroupsStore.savePlan(editId, {
        last_renewal_date: editLastRenewal || null,
        lifetime_years:    editLifetime !== '' ? parseFloat(editLifetime) : null,
        expected_cost:     editCost     !== '' ? parseFloat(editCost)     : null,
        notes:             editNotes,
      });
      showModal = false;
    } catch (err) {
      modalError = err.message;
    } finally {
      saving = false;
    }
  }

  // ── Calculated fields ─────────────────────────────────────────────────
  function expectedRenewal(lastDate, lifetimeYears) {
    if (!lastDate || lifetimeYears == null) return null;
    const d = new Date(lastDate + 'T00:00:00');
    const yrs   = Math.floor(lifetimeYears);
    const extra = Math.round((lifetimeYears - yrs) * 12);   // fractional → months
    d.setFullYear(d.getFullYear() + yrs);
    d.setMonth(d.getMonth() + extra);
    return d.toISOString().split('T')[0];
  }

  function renewalStatus(renewalDate) {
    if (!renewalDate) return 'none';
    const now  = new Date();
    const due  = new Date(renewalDate + 'T00:00:00');
    const days = Math.ceil((due - now) / 86400000);
    if (days < 0)   return 'overdue';
    if (days < 365) return 'soon';
    return 'ok';
  }

  const statusCfg = {
    none:    { label: '—',       cls: 'text-slate-600' },
    ok:      { label: '',        cls: 'text-emerald-400' },
    soon:    { label: '< 1 yr',  cls: 'text-amber-400' },
    overdue: { label: 'OVERDUE', cls: 'text-red-400 font-semibold' },
  };

  function fmtCost(v) {
    if (v == null) return '—';
    return '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  // Total expected cost across all groups that have one
  $: totalCost = groups.reduce((sum, g) => sum + (g.expected_cost ?? 0), 0);
  $: groupsWithData = groups.filter(g => g.last_renewal_date || g.lifetime_years || g.expected_cost);
</script>

<!-- ── Header ──────────────────────────────────────────────────────────── -->
<div class="flex-between mb-4">
  <div>
    <h3 class="text-lg font-semibold text-white">10-Year Maintenance Plan</h3>
    <p class="text-muted-sm mt-0.5">
      Set renewal cycles and estimated costs per group. Expected renewal is calculated automatically.
    </p>
  </div>
  {#if totalCost > 0}
    <div class="text-right">
      <p class="text-xs text-slate-500">Total estimated cost</p>
      <p class="text-xl font-bold text-purple-400">{fmtCost(totalCost)}</p>
    </div>
  {/if}
</div>

<ErrorDisplay message={error} onDismiss={() => maintenanceGroupsStore.load()} />

{#if loading}
  <LoadingSpinner />

{:else if groups.length === 0}
  <div class="empty-state">
    No groups found. Create groups in the Maint. Groups tab first.
  </div>

{:else}
  <div class="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-700 text-left">
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Group</th>
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Last Renewal</th>
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">Lifetime (yr)</th>
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Expected Renewal</th>
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Estimated Cost</th>
          <th class="px-4 py-2.5 w-20"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-700/60">
        {#each groups as g (g.id)}
          {@const renewal  = expectedRenewal(g.last_renewal_date, g.lifetime_years)}
          {@const status   = renewalStatus(renewal)}
          {@const scfg     = statusCfg[status]}
          <tr class="hover:bg-slate-700/30 transition-colors {!g.last_renewal_date ? 'opacity-60' : ''}">
            <td class="px-4 py-3 font-medium text-white">
              {g.name}
              {#if g.notes}
                <p class="text-xs text-slate-500 mt-0.5 font-normal truncate max-w-[200px]">{g.notes}</p>
              {/if}
            </td>
            <td class="px-4 py-3 text-slate-300">
              {fmtDate(g.last_renewal_date)}
            </td>
            <td class="px-4 py-3 text-center text-slate-300">
              {g.lifetime_years != null ? g.lifetime_years : '—'}
            </td>
            <td class="px-4 py-3">
              {#if renewal}
                <span class={scfg.cls}>
                  {fmtDate(renewal)}
                  {#if scfg.label}
                    <span class="ml-1 text-xs">({scfg.label})</span>
                  {/if}
                </span>
              {:else}
                <span class="text-slate-600">—</span>
              {/if}
            </td>
            <td class="px-4 py-3 text-right font-mono {g.expected_cost ? 'text-purple-300' : 'text-slate-600'}">
              {fmtCost(g.expected_cost)}
            </td>
            <td class="px-4 py-3 text-right">
              <button
                on:click={() => openEdit(g)}
                class="px-2.5 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >Edit</button>
            </td>
          </tr>
        {/each}

        <!-- Totals row -->
        {#if totalCost > 0}
          <tr class="border-t-2 border-slate-600 bg-slate-800/70">
            <td class="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide" colspan="4">
              Total ({groupsWithData.length} of {groups.length} groups with data)
            </td>
            <td class="px-4 py-3 text-right font-bold text-purple-300 font-mono">{fmtCost(totalCost)}</td>
            <td></td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>

  <!-- Summary card if no data at all -->
  {#if groupsWithData.length === 0}
    <div class="card-info mt-4">
      <p class="text-sm text-blue-300">
        No planning data yet. Click <strong>Edit</strong> on any row to add renewal dates and costs.
      </p>
    </div>
  {/if}
{/if}

<!-- ── Plan edit modal ────────────────────────────────────────────────────── -->
{#if showModal}
  {@const g = groups.find(x => x.id === editId)}
  <Modal bind:show={showModal} size="small" title="Edit Plan — {g?.name ?? ''}">

    {#if modalError}
      <div class="alert-error mb-4 text-sm">{modalError}</div>
    {/if}

    <div class="form-spacing">

      <div class="flex flex-col gap-1">
        <label for="tp-last" class="text-label">Last Renewal Date</label>
        <input id="tp-last" type="date" bind:value={editLastRenewal} class="input" />
      </div>

      <div class="flex flex-col gap-1">
        <label for="tp-life" class="text-label">Lifetime (years)</label>
        <input
          id="tp-life"
          type="number"
          min="0.5"
          max="50"
          step="0.5"
          bind:value={editLifetime}
          placeholder="e.g. 10"
          class="input"
        />
        <p class="text-muted-sm">Fractional years supported, e.g. 7.5 = 7 yr 6 mo</p>
      </div>

      <!-- Expected renewal (calculated, read-only preview) -->
      {#if editLastRenewal && editLifetime}
        {@const preview = expectedRenewal(editLastRenewal, parseFloat(editLifetime) || 0)}
        {#if preview}
          <div class="px-3 py-2 rounded-lg bg-purple-900/20 border border-purple-700/30">
            <p class="text-xs text-slate-400">Expected renewal date</p>
            <p class="text-sm font-semibold text-purple-300">{fmtDate(preview)}</p>
          </div>
        {/if}
      {/if}

      <div class="flex flex-col gap-1">
        <label for="tp-cost" class="text-label">Estimated Cost (£)</label>
        <input
          id="tp-cost"
          type="number"
          min="0"
          step="100"
          bind:value={editCost}
          placeholder="e.g. 25000"
          class="input"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label for="tp-notes" class="text-label">Notes</label>
        <textarea
          id="tp-notes"
          rows="2"
          bind:value={editNotes}
          placeholder="Scope, assumptions, contractor…"
          class="textarea"
        ></textarea>
      </div>

    </div>

    <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
      <Button variant="secondary" on:click={() => showModal = false} disabled={saving}>
        Cancel
      </Button>
      <Button variant="primary" on:click={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>

  </Modal>
{/if}
