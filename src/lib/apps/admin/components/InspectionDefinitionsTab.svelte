<!-- src/lib/apps/admin/components/InspectionDefinitionsTab.svelte -->
<!-- Admin > Inspections: CRUD for statutory_obligations. Reads component/type
     reference data from buildingAssetsStore (lazy-loaded by AdminApp) to show a
     live match count per definition and to power the scope editor. -->
<script>
  import { onMount } from 'svelte';
  import { inspectionDefinitionsStore } from '../stores/inspectionDefinitionsStore.js';
  import { buildingAssetsStore } from '$lib/apps/building_assets/stores/buildingAssetsStore.js';
  import { applyInspectionScope } from '$lib/apps/building_assets/utils/inspectionScope.js';
  import { frequencyLabel } from '$lib/utils/inspectionSchedule';
  import { isWalkEvidenced, isJobEvidenced } from '$lib/utils/obligationEvidence.js';
  import Button        from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import { isRecordableReason } from '$lib/utils/statutoryExclusions.js';
  import { fmtDate } from '$lib/utils/dates.js';
  import InspectionDefinitionModal from './InspectionDefinitionModal.svelte';
  import StatutoryTemplatePanel from './StatutoryTemplatePanel.svelte';

  $: ({ definitions, loading, error } = $inspectionDefinitionsStore);
  $: bas = $buildingAssetsStore;
  $: ctx = { types: bas.types, attrDefs: bas.attrDefs, componentAttrs: bas.componentAttrs, inspections: bas.inspections };

  let editing = null;      // definition row or null-for-new sentinel
  let showModal = false;
  let saving = false;
  let pendingDelete = null;
  let deletingId = null;

  // Retirement. A repealed requirement is FLAGGED, never deleted: the walks and
  // jobs done under it are still evidence, and deleting would orphan them.
  let retiring = null;
  let unretiring = null;
  let retireOn = new Date().toISOString().slice(0, 10);
  let retireReason = '';
  let retireBusy = false;
  let retireError = '';

  $: retireReasonOk = isRecordableReason(retireReason);

  function askRetire(d) {
    retiring = d; retireReason = ''; retireError = '';
    retireOn = new Date().toISOString().slice(0, 10);
  }
  function askUnretire(d) { unretiring = d; retireReason = ''; retireError = ''; }

  async function confirmRetire() {
    const d = retiring, reason = retireReason, on = retireOn;
    retireBusy = true; retireError = '';
    try {
      await inspectionDefinitionsStore.retire(d.id, { retiredOn: on, reason });
      retiring = null;
    } catch (err) { retireError = err.message; } finally { retireBusy = false; }
  }

  async function confirmUnretire() {
    const d = unretiring, reason = retireReason;
    retireBusy = true; retireError = '';
    try {
      await inspectionDefinitionsStore.unretire(d.id, reason);
      unretiring = null;
    } catch (err) { retireError = err.message; } finally { retireBusy = false; }
  }

  onMount(() => {
    if (definitions.length === 0) inspectionDefinitionsStore.load();
    // The recorded decisions about which register entries apply to this
    // building. Never fatal — without them the gap report asks about everything,
    // which is the safe direction to fail in.
    inspectionDefinitionsStore.loadExclusions();
  });

  function matchCount(def) {
    if (!bas.components?.length) return null;
    return applyInspectionScope(bas.components, def.scope ?? {}, ctx).length;
  }

  function openNew()  { editing = null; showModal = true; }
  function openEdit(d) { editing = d; showModal = true; }
  function closeModal() { showModal = false; editing = null; saving = false; }

  async function handleSave(e) {
    const { id, data } = e.detail;
    saving = true;
    try {
      if (id) await inspectionDefinitionsStore.save(id, data);
      else    await inspectionDefinitionsStore.create(data);
      closeModal();
    } catch (err) {
      // store surfaces error via state; keep modal open
      saving = false;
    }
  }

  function requestDelete(d) { pendingDelete = d; }
  async function confirmDelete() {
    if (!pendingDelete) return;
    deletingId = pendingDelete.id;
    try {
      await inspectionDefinitionsStore.remove(pendingDelete.id);
      pendingDelete = null;
    } finally {
      deletingId = null;
    }
  }
</script>

<div class="insp-defs">
  <div class="head">
    <div>
      <h3 class="heading-section">Inspections</h3>
      <p class="text-muted">Define what is inspected, how often, and what is checked. Drives the mobile app’s due list.</p>
    </div>
    <ProtectedButton requireAdmin={true} variant="primary" on:click={openNew}>+ New inspection</ProtectedButton>
  </div>

  {#if error}<ErrorDisplay message={error} />{/if}

  <!-- The gap report sits ABOVE the list deliberately: what is absent is the
       thing a list of what exists can never show you. -->
  <StatutoryTemplatePanel {definitions} />

  {#if loading && definitions.length === 0}
    <LoadingSpinner />
  {:else if definitions.length === 0}
    <p class="empty">No inspections defined yet. Create one to get started.</p>
  {:else}
    <div class="rows">
      {#each definitions as d (d.id)}
        {@const n = matchCount(d)}
        <div class="row" class:inactive={!d.active}>
          <div class="row-main">
            <div class="row-title">
              <span class="nm">{d.name}</span>
              {#if !d.active}<span class="badge off">Inactive</span>{/if}
              {#if d.mode === 'rotating'}<span class="badge rot">Rotating</span>{/if}
              {#if !isWalkEvidenced(d)}<span class="badge job">Contractor job</span>
              {:else if isJobEvidenced(d)}<span class="badge job">Either route</span>{/if}
              {#if d.template_key}
                <span class="badge tmpl" title="Counts towards the statutory template above">Statutory</span>
              {/if}
              {#if d.retired_on}
                <span class="badge retired" title={d.retired_reason ?? ''}>
                  No longer required · {fmtDate(d.retired_on)}
                </span>
              {/if}
            </div>
            {#if d.description}<p class="desc">{d.description}</p>{/if}
            <div class="meta">
              <span class="freq">{frequencyLabel(d.frequency_days)}</span>
              {#if n != null}<span class="dot">·</span><span>{n} component{n === 1 ? '' : 's'}</span>{/if}
            </div>
          </div>
          <div class="row-actions">
            <Button variant="secondary" size="small" on:click={() => openEdit(d)}>Edit</Button>
            {#if d.retired_on}
              <ProtectedButton requireAdmin={true} variant="secondary" size="small"
                on:click={() => askUnretire(d)}>Reinstate</ProtectedButton>
            {:else}
              <ProtectedButton requireAdmin={true} variant="secondary" size="small"
                title="No longer required — keeps it and its evidence, stops new work"
                on:click={() => askRetire(d)}>Retire</ProtectedButton>
            {/if}
            <ProtectedButton requireAdmin={true} variant="danger" size="small" on:click={() => requestDelete(d)}>Delete</ProtectedButton>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showModal}
  <InspectionDefinitionModal
    definition={editing}
    types={bas.types} systems={bas.systems} floors={bas.floors} attrDefs={bas.attrDefs}
    attrOptions={bas.attrOptions}
    components={bas.components} componentAttrs={bas.componentAttrs} inspections={bas.inspections}
    componentLinks={bas.componentLinks}
    {definitions}
    {saving}
    on:save={handleSave}
    on:close={closeModal}
  />
{/if}

<ConfirmDialog
  show={!!pendingDelete}
  danger={true}
  processing={!!deletingId}
  title="Delete inspection"
  message={pendingDelete ? `Delete “${pendingDelete.name}”? Past inspection sessions are kept but DETACHED — their evidence loses what it was for. If this is no longer required because the law changed, use Retire instead: it keeps the link.` : ''}
  confirmText="Delete"
  on:confirm={confirmDelete}
  on:cancel={() => (pendingDelete = null)}
/>

<!-- Retiring is not deleting. The requirement and every walk or job done under
     it stay exactly where they are; what stops is NEW work. -->
<Modal show={!!retiring} title="No longer required" size="medium" on:close={() => (retiring = null)}>
  {#if retiring}
    <div class="rt-body">
      <p class="rt-name">{retiring.name}</p>
      {#if retiring.statutory_ref}<p class="text-muted">{retiring.statutory_ref}</p>{/if}
      <p class="rt-warn">
        This keeps the obligation and everything ever done under it &mdash; the walks, the jobs and the
        certificates stay attached and still print. What stops is <em>new</em> work: it leaves the walk
        list and the job scheduler, and the compliance report shows it as
        <strong>No longer required</strong> rather than as a gap.
        <br /><br />
        Use this when the law changed. Use <em>Delete</em> only for something created by mistake that
        has no history worth keeping.
      </p>
      {#if retireError}<ErrorDisplay message={retireError} onDismiss={() => (retireError = '')} />{/if}
      <FormInput label="No longer required from" type="date" bind:value={retireOn}
        helpText="The date it stopped applying &mdash; not today, if they differ. Work before this date was still required." />
      <FormTextarea label="What withdrew it?" bind:value={retireReason} rows={3} required={true}
        placeholder="e.g. Repealed by the Fire Safety (England) (Amendment) Regulations 2027"
        helpText="Required. This answers &ldquo;why did this check stop?&rdquo; three years from now." />
      <div class="rt-actions">
        <Button variant="secondary" disabled={retireBusy} on:click={() => (retiring = null)}>Cancel</Button>
        <Button variant="primary" disabled={retireBusy || !retireReasonOk} on:click={confirmRetire}>
          {retireBusy ? 'Recording...' : 'Record'}
        </Button>
      </div>
    </div>
  {/if}
</Modal>

<Modal show={!!unretiring} title="Required again" size="medium" on:close={() => (unretiring = null)}>
  {#if unretiring}
    <div class="rt-body">
      <p class="rt-name">{unretiring.name}</p>
      <p class="rt-warn">
        This puts it back on the walk list and the scheduler, and it counts in the compliance position
        again from now.
      </p>
      {#if retireError}<ErrorDisplay message={retireError} onDismiss={() => (retireError = '')} />{/if}
      <FormTextarea label="Why does it apply again?" bind:value={retireReason} rows={3} required={true}
        placeholder="e.g. Reinstated by SI 2028/44" />
      <div class="rt-actions">
        <Button variant="secondary" disabled={retireBusy} on:click={() => (unretiring = null)}>Cancel</Button>
        <Button variant="primary" disabled={retireBusy || !retireReasonOk} on:click={confirmUnretire}>
          {retireBusy ? 'Recording...' : 'Record'}
        </Button>
      </div>
    </div>
  {/if}
</Modal>

<style>
  .insp-defs { display: flex; flex-direction: column; gap: 1rem; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
  .empty { color: rgb(148 163 184); font-size: 0.9rem; padding: 1.5rem 0; }
  .rows { display: flex; flex-direction: column; gap: 0.5rem; }
  .row {
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    padding: 0.75rem 1rem; border-radius: 8px;
    background: rgb(30 41 59 / 0.4); border: 1px solid rgb(71 85 105 / 0.5);
  }
  .row.inactive { opacity: 0.6; }
  .row-title { display: flex; align-items: center; gap: 0.5rem; }
  .nm { font-weight: 600; color: rgb(226 232 240); }
  .badge { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.1rem 0.4rem; border-radius: 4px; }
  .badge.off { background: rgb(71 85 105 / 0.4); color: rgb(148 163 184); }
  .badge.rot { background: rgb(251 146 60 / 0.2); color: rgb(251 146 60); }
  .badge.job { background: rgb(56 189 248 / 0.18); color: rgb(125 211 252); }
  .badge.tmpl { background: rgb(248 113 113 / 0.16); color: rgb(252 165 165); }
  .badge.retired { background: rgb(148 163 184 / 0.22); color: rgb(203 213 225); text-transform: none; letter-spacing: 0; }
  .rt-body { display: flex; flex-direction: column; gap: 0.6rem; }
  .rt-name { font-weight: 600; color: rgb(226 232 240); }
  .rt-warn { font-size: 0.8rem; color: rgb(203 213 225); background: rgb(56 189 248 / 0.1); border-radius: 6px; padding: 0.5rem 0.65rem; line-height: 1.45; }
  .rt-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.3rem; }
  .desc { font-size: 0.8rem; color: rgb(148 163 184); margin-top: 0.2rem; }
  .meta { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: rgb(148 163 184); margin-top: 0.3rem; }
  .freq { color: rgb(203 213 225); }
  .row-actions { display: flex; gap: 0.4rem; flex-shrink: 0; }
</style>
