<!-- src/lib/apps/inspection/components/InspectionRepairStart.svelte -->
<!-- Lists all failed/problem components and starts a single-component repair session. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getLogger }   from '$lib/utils/logger';
  import { inspectionStore } from '../stores/inspectionStore.js';
  import { buildingInitials } from '../utils/sessionNaming.js';
  import { fmtMonthYearCompact } from '$lib/utils/dates';
  import WalkError  from '$lib/apps/inspection/components/common/WalkError.svelte';
  import WalkButton from '$lib/apps/inspection/components/common/WalkButton.svelte';
  import WalkSpinner from '$lib/apps/inspection/components/common/WalkSpinner.svelte';

  const logger   = getLogger('InspectionRepairStart');
  const dispatch = createEventDispatcher();

  $: facilities    = $inspectionStore.facilities;
  $: types         = $inspectionStore.types;
  $: floors        = $inspectionStore.floors;

  let saving       = false;
  let error        = null;
  let loadingList  = true;
  let repairItems  = [];   // { component, floor, type }

  let selectedBuilding = '';
  $: { if (facilities.length > 0 && !selectedBuilding) selectedBuilding = facilities[0]?.short_name ?? facilities[0]?.name ?? ''; }

  onMount(async () => {
    await loadRepairList();
  });

  $: if (selectedBuilding) loadRepairList();

  async function loadRepairList() {
    loadingList = true;
    try {
      const comps = await inspectionStore.getFailedComponents(selectedBuilding);
      repairItems = comps.map(c => ({
        component: c,
        floor:     c._floor,
        type:      types.find(t => t.code === c.type_code),
      }));
    } catch (err) {
      error = err.message;
    } finally {
      loadingList = false;
    }
  }

  function statusLabel(s) { return s === 'failed' ? 'FAILED' : s === 'problem' ? 'PROBLEM' : s; }

  async function handleSelect(item) {
    saving = true; error = null;
    try {
      const { component, floor, type } = item;
      const name = `Repair_${buildingInitials(selectedBuilding)}_${floor?.short_name ?? '?'}_${fmtMonthYearCompact()}`;
      await inspectionStore.startSession({
        building:          selectedBuilding,
        floor,
        typeFilter:        [component.type_code],
        emergencyOnly:     false,
        sessionName:       name,
        sessionType:       'repair',
        preset:            'custom',
        targetComponentId: component.id,
      });
      dispatch('started');
    } catch (err) {
      logger('❌ Start repair:', err.message);
      error = err.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="rs">
  <div class="rs-hdr">
    <WalkButton variant="ghost" size="sm" on:click={() => dispatch('back')}>← Back</WalkButton>
    <span class="rs-title">START REPAIR</span>
    <WalkButton variant="success" size="sm" on:click={() => dispatch('finish')}>FINISH ✓</WalkButton>
  </div>

  <div class="rs-body">
    <section class="grp">
      <div class="grp-lbl">SELECT COMPONENT TO CHECK</div>

      {#if loadingList}
        <WalkSpinner />
      {:else if repairItems.length === 0}
        <div class="empty-repair">
          <div class="empty-icon">✓</div>
          <div class="empty-txt">No failed or problem components in {selectedBuilding}</div>
        </div>
      {:else}
        <p class="hint">{repairItems.length} component{repairItems.length !== 1 ? 's' : ''} need attention — tap to inspect</p>
        <div class="el-list">
          {#each repairItems as item (item.component.id)}
            {@const { component, floor, type } = item}
            <button
              class="el-btn"
              class:is-problem={component.status === 'problem'}
              on:click={() => handleSelect(item)}
              disabled={saving}
            >
              {#if type}
                <div class="el-dot" style="background:#{type.colour}">{type.initial}</div>
              {:else}
                <div class="el-dot">?</div>
              {/if}
              <div class="el-body">
                <div class="el-ref">{floor?.short_name ?? '?'} / {component.asset_id ?? component.label ?? '?'}</div>
                <div class="el-type">{type?.name ?? component.type_code}</div>
                {#if component.label}<div class="el-label">{component.label}</div>{/if}
                <div class="el-meta">Floor {floor?.name ?? floor?.short_name ?? '?'}</div>
              </div>
              <span class="el-status st-{component.status}">{statusLabel(component.status)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <WalkError message={error || ''} />
  </div>
</div>

<style>
  .rs { display:flex; flex-direction:column; min-height:calc(100vh - 64px); background:#0d0d14; color:#f0f0f0; font-family:'DM Mono','Courier New',monospace; }
  .rs-hdr { display:flex; align-items:center; gap:1rem; padding:1.25rem 1.5rem 1rem; border-bottom:1px solid #2e2e42; background:#111122; }
  .rs-title { font-size:0.7rem; letter-spacing:0.25em; color:#fb923c; flex:1; text-align:center; }
  .rs-body { padding:1.5rem; display:flex; flex-direction:column; gap:2rem; flex:1; }
  .grp { display:flex; flex-direction:column; gap:0.75rem; }
  .grp-lbl { font-size:0.65rem; letter-spacing:0.2em; color:#fb923c; font-weight:700; }
  .hint { font-size:0.82rem; color:#bbb; margin:0; }
  .empty-repair { display:flex; flex-direction:column; align-items:center; gap:0.5rem; padding:3rem 2rem; }
  .empty-icon { font-size:2.5rem; color:#4ade80; }
  .empty-txt { font-size:0.82rem; color:#ccc; text-align:center; }
  .el-list { display:flex; flex-direction:column; gap:0.5rem; }
  .el-btn { width:100%; display:flex; align-items:center; gap:0.875rem; padding:0.875rem 1rem; background:#1a0a0a; border:2px solid #7f1d1d; border-radius:10px; text-align:left; font-family:inherit; cursor:pointer; transition:all 0.15s; }
  .el-btn:hover:not(:disabled) { border-color:#ef4444; background:#250d0d; }
  .el-btn.is-problem { background:#1a1200; border-color:#713f12; }
  .el-btn.is-problem:hover:not(:disabled) { border-color:#d97706; background:#231a00; }
  .el-btn:disabled { opacity:0.5; cursor:not-allowed; }
  .el-dot { width:2rem; height:2rem; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:700; color:#fff; flex-shrink:0; background:#444; }
  .el-body { flex:1; min-width:0; }
  .el-ref   { font-size:0.9rem; color:#f0f0f0; font-weight:700; font-variant-numeric:tabular-nums; }
  .el-type  { font-size:0.72rem; color:#ccc; margin-top:0.1rem; }
  .el-label { font-size:0.72rem; color:#fb923c; margin-top:0.1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .el-meta  { font-size:0.68rem; color:#888; margin-top:0.15rem; }
  .el-status { font-size:0.6rem; font-weight:700; letter-spacing:0.1em; padding:0.2rem 0.5rem; border-radius:4px; flex-shrink:0; }
  .st-failed  { background:#2a0000; color:#f87171; border:1px solid #7f1d1d; }
  .st-problem { background:#1a1200; color:#fbbf24; border:1px solid #713f12; }
</style>
