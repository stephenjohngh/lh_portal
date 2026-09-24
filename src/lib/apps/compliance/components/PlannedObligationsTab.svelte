<!-- src/lib/apps/compliance/components/PlannedObligationsTab.svelte -->
<!-- Compliance > PLANNED OBLIGATIONS: CRUD for statutory_obligations — what THIS
     building does about the duties in the compliance obligations register.
     Reads component/type reference data from buildingAssetsStore (lazy-loaded
     by ComplianceApp) for the live match count and the scope editor.

     ⚠ V2 SPLIT THE REGISTER OUT OF HERE. StatutoryTemplatePanel used to sit
     stacked above this list on one tab; it is now its own tab, rendered by
     ComplianceObligationsTab. Two different objects on one screen was the
     conflation the vocabulary work exists to end, so do not render it here
     again. The register → plan sequence is carried by the apply report's
     "Set them up →" button rather than by the scroll position. -->
<script>
  import { onMount } from 'svelte';
  import { inspectionDefinitionsStore } from '../stores/inspectionDefinitionsStore.js';
  import { buildingAssetsStore } from '$lib/apps/building_assets/stores/buildingAssetsStore.js';
  import { applyInspectionScope } from '$lib/apps/building_assets/utils/inspectionScope.js';
  import { frequencyLabel } from '$lib/utils/inspectionSchedule';
  import { isWalkEvidenced, isJobEvidenced, EVIDENCE_ROUTE_LABEL } from '$lib/utils/obligationEvidence.js';
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
  import PlannedObligationModal from './PlannedObligationModal.svelte';
  import FilterBar from '$lib/components/common/FilterBar.svelte';
  import {
    filterObligations, obligationFilterFields, hasEmptyScope,
  } from '../utils/registerFilter.js';

  $: ({ definitions, loading, error } = $inspectionDefinitionsStore);
  $: bas = $buildingAssetsStore;
  $: ctx = { types: bas.types, attrDefs: bas.attrDefs, componentAttrs: bas.componentAttrs, inspections: bas.inspections };

  // Five rows today, ~84 the moment the register is applied — so the
  // filters go in now rather than after the list has already become unusable.
  let search = '';
  /** @type {Record<string, Set<string>>} */
  let filters = {};
  $: filterFields = obligationFilterFields(definitions);
  $: shown = filterObligations(definitions, { ...filters, q: search });

  let editing = null;      // definition row or null-for-new sentinel
  let showModal = false;
  let saving = false;
  let saveError = '';
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
    } catch (/** @type {any} */ err) { retireError = err.message; } finally { retireBusy = false; }
  }

  async function confirmUnretire() {
    const d = unretiring, reason = retireReason;
    retireBusy = true; retireError = '';
    try {
      await inspectionDefinitionsStore.unretire(d.id, reason);
      unretiring = null;
    } catch (/** @type {any} */ err) { retireError = err.message; } finally { retireBusy = false; }
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
  function closeModal() { showModal = false; editing = null; saving = false; saveError = ''; }

  async function handleSave(e) {
    const { id, data } = e.detail;
    saving = true; saveError = '';
    try {
      if (id) await inspectionDefinitionsStore.save(id, data);
      else    await inspectionDefinitionsStore.create(data);
      closeModal();
    } catch (/** @type {any} */ err) {
      // ⛔ This used to say "store surfaces error via state", and it does not:
      // `save` and `create` throw without touching the store's error. So a
      // refused save — a constraint, a permission, a dropped connection — left
      // the modal open with nothing said, which reads as "it saved". The modal
      // stays open and now says why.
      saveError = err?.message ?? 'Could not save the planned obligation.';
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
      <!-- ⚠ Was "This building's schedule", and that was wrong the day it
           shipped: a SCHEDULE puts work on a calendar with dates and people.
           This says WHAT we do and the logic for when — which is a plan, and
           in ISO terms each row is a planned obligation. The calendar lives in
           Maintenance and on the phone. -->
      <h3 class="heading-section">Planned obligations</h3>
      <p class="text-muted">What this building does about the duties on the <strong>Compliance obligations</strong> tab — in-house
        walks and booked contractor visits, each with how often it comes round. ⚠ Only the in-house
        walks reach the phone; a contractor visit is scheduled in Maintenance.</p>
    </div>
    <ProtectedButton requireAdmin={true} variant="primary" on:click={openNew}>+ Add a planned obligation</ProtectedButton>
  </div>

  {#if error}<ErrorDisplay message={error} />{/if}

  {#if loading && definitions.length === 0}
    <LoadingSpinner />
  {:else if definitions.length === 0}
    <p class="empty">No planned obligations yet. Add one from the <strong>Compliance obligations</strong> tab, or set something up directly here.</p>
  {:else}
    <FilterBar
      fields={filterFields}
      bind:values={filters}
      bind:query={search}
      searchPlaceholder="Name, reference…"
      resultLabel="{shown.length} of {definitions.length}"
    />

    {#if shown.length === 0}
      <p class="empty">No planned obligations match these filters.</p>
    {/if}

    <div class="rows">
      {#each shown as d (d.id)}
        {@const n = matchCount(d)}
        <div class="row" class:inactive={!d.active}>
          <div class="row-main">
            <div class="row-title">
              <span class="nm">{d.name}</span>
              {#if !d.active}<span class="badge off">Inactive</span>{/if}
              {#if d.mode === 'rotating'}<span class="badge rot">Rotating</span>{/if}
              <!-- ⚠ All THREE routes are named, including the walk. The
                   Evidence facet offers three options and this row used to name
                   only two, so a walk-evidenced obligation was identified by the
                   ABSENCE of a badge — indistinguishable from a row where
                   nothing was stated. -->
              <!-- ⚠ These read from EVIDENCE_ROUTE_LABEL rather than spelling
                   themselves out. They used to say "Contractor job" and
                   "Inspection walk" while the Evidence facet — filtering the
                   very same rows — said "Contractor visit" and "In-house walk".
                   Two words for one object is the other half of the fault the
                   vocabulary work exists to end. -->
              {#if !isWalkEvidenced(d)}<span class="badge job">{EVIDENCE_ROUTE_LABEL.maintenance_job}</span>
              {:else if isJobEvidenced(d)}<span class="badge job">{EVIDENCE_ROUTE_LABEL.either}</span>
              {:else}<span class="badge walk">{EVIDENCE_ROUTE_LABEL.inspection}</span>{/if}
              {#if d.template_key}
                <span class="badge tmpl" title="Linked to a compliance obligation in the register, so it counts towards coverage">Statutory</span>
              {/if}
              {#if hasEmptyScope(d)}
                <span class="badge unscoped"
                  title="Nobody has chosen what this covers, so it covers all 1,092 components">Covers everything — not chosen</span>
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
  <PlannedObligationModal
    definition={editing}
    types={bas.types} systems={bas.systems} floors={bas.floors} attrDefs={bas.attrDefs}
    attrOptions={bas.attrOptions}
    components={bas.components} componentAttrs={bas.componentAttrs} inspections={bas.inspections}
    componentLinks={bas.componentLinks}
    {definitions}
    {saving}
    {saveError}
    on:save={handleSave}
    on:close={closeModal}
  />
{/if}

<ConfirmDialog
  show={!!pendingDelete}
  danger={true}
  processing={!!deletingId}
  title="Delete — only for something created by mistake, with no history worth keeping"
  message={pendingDelete ? `Delete “${pendingDelete.name}”? Past inspection walks and contractor jobs are kept but DETACHED — their evidence loses what it was for. If this is no longer required because the law changed, use Retire instead: it keeps the link.` : ''}
  confirmText="Delete"
  on:confirm={confirmDelete}
  on:cancel={() => (pendingDelete = null)}
/>

<!-- Retiring is not deleting. The planned obligation and every walk or job done
     under it stay exactly where they are; what stops is NEW work. -->
<Modal show={!!retiring} title="No longer required" size="medium" on:close={() => (retiring = null)}>
  {#if retiring}
    <div class="rt-body">
      <p class="rt-name">{retiring.name}</p>
      {#if retiring.statutory_ref}<p class="text-muted">{retiring.statutory_ref}</p>{/if}
      <p class="rt-warn">
        This keeps the planned obligation and everything ever done under it &mdash; the walks, the jobs and the
        certificates stay attached and still print. What stops is <em>new</em> work: it leaves the walk
        list and the job scheduler, and the compliance report shows it as
        <strong>No longer required</strong> rather than as a gap.
        <br /><br />
        Use this when the law changed. Use <em>Delete</em> only for something created by mistake that
        has no history worth keeping.
      </p>
      {#if retireError}<ErrorDisplay message={retireError} onDismiss={() => (retireError = '')} />{/if}
      <FormInput label="No longer required from" type="date" bind:value={retireOn}
        helpText="The date it stopped applying, which may not be today. Anything due before that date was still required." />
      <FormTextarea label="What withdrew it?" bind:value={retireReason} rows={3} required={true}
        placeholder="e.g. Repealed by the Fire Safety (England) (Amendment) Regulations 2027"
        helpText="Required. Somebody asking &ldquo;why did this check stop?&rdquo; in three years needs to find the answer here." />
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
  /* ⛔ NO overflow:hidden here. Rounding is on the head itself, because a
     clipped container cuts off any popup a child opens — the fault found three
     times over in this codebase. */

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
  .badge.walk { background: rgb(251 146 60 / 0.16); color: rgb(253 186 116); }
  .badge.tmpl { background: rgb(248 113 113 / 0.16); color: rgb(252 165 165); }
  .badge.unscoped { background: rgb(251 191 36 / 0.16); color: rgb(252 211 77); }
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
