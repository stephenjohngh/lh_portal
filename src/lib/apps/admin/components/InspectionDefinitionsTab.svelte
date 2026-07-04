<!-- src/lib/apps/admin/components/InspectionDefinitionsTab.svelte -->
<!-- Admin > Inspections: CRUD for inspection_definitions. Reads component/type
     reference data from buildingAssetsStore (lazy-loaded by AdminApp) to show a
     live match count per definition and to power the scope editor. -->
<script>
  import { onMount } from 'svelte';
  import { inspectionDefinitionsStore } from '../stores/inspectionDefinitionsStore.js';
  import { buildingAssetsStore } from '$lib/apps/building_assets/stores/buildingAssetsStore.js';
  import { applyInspectionScope } from '$lib/apps/building_assets/utils/inspectionScope.js';
  import { frequencyLabel } from '$lib/utils/inspectionSchedule';
  import Button        from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import InspectionDefinitionModal from './InspectionDefinitionModal.svelte';

  $: ({ definitions, loading, error } = $inspectionDefinitionsStore);
  $: bas = $buildingAssetsStore;
  $: ctx = { types: bas.types, attrDefs: bas.attrDefs, componentAttrs: bas.componentAttrs, inspections: bas.inspections };

  let editing = null;      // definition row or null-for-new sentinel
  let showModal = false;
  let saving = false;
  let pendingDelete = null;
  let deletingId = null;

  onMount(() => { if (definitions.length === 0) inspectionDefinitionsStore.load(); });

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
            </div>
            {#if d.description}<p class="desc">{d.description}</p>{/if}
            <div class="meta">
              <span class="freq">{frequencyLabel(d.frequency_days)}</span>
              {#if n != null}<span class="dot">·</span><span>{n} component{n === 1 ? '' : 's'}</span>{/if}
            </div>
          </div>
          <div class="row-actions">
            <Button variant="secondary" size="small" on:click={() => openEdit(d)}>Edit</Button>
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
    components={bas.components} componentAttrs={bas.componentAttrs} inspections={bas.inspections}
    componentLinks={bas.componentLinks}
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
  message={pendingDelete ? `Delete “${pendingDelete.name}”? Past inspection sessions are kept but detached from this definition.` : ''}
  confirmText="Delete"
  on:confirm={confirmDelete}
  on:cancel={() => (pendingDelete = null)}
/>

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
  .desc { font-size: 0.8rem; color: rgb(148 163 184); margin-top: 0.2rem; }
  .meta { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: rgb(148 163 184); margin-top: 0.3rem; }
  .freq { color: rgb(203 213 225); }
  .row-actions { display: flex; gap: 0.4rem; flex-shrink: 0; }
</style>
