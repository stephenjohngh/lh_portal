<!-- src/lib/apps/walk/components/WalkRepairStart.svelte -->
<!-- Repair session start screen.
     Shows all elements with status 'failed' or 'replace' in a selected building.
     Tapping an element resumes/opens the walk session at that element. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { walkStore } from '../stores/walkStore.js';
  import { ELEMENT_TYPE_OPTIONS, getElementDisplayName, ELEMENT_STATUS_OPTIONS } from '$lib/utils/planConstants';

  const logger = getLogger('WalkRepairStart');
  const dispatch = createEventDispatcher();

  $: plans      = $walkStore.plans;
  $: allElements = $walkStore.allElements;

  let saving           = false;
  let error            = null;

  $: buildings = [...new Set(plans.map(p => p.building))].sort();

  // Always use the first building alphabetically — no manual selection
  $: selectedBuilding = buildings[0] ?? '';

  // Floors for selected building, with floor_level → plan mapping
  $: buildingPlans = plans.filter(p => p.building === selectedBuilding);

  // All elements needing repair in the selected building, with floor_level injected
  $: repairElements = buildingPlans.flatMap(plan =>
    (allElements[plan.id] || [])
      .filter(el => el.status === 'failed' || el.status === 'replace')
      .map(el => ({ ...el, _floor: plan.floor_level, _planId: plan.id }))
  ).sort((a, b) => {
    // failed before replace, then by floor, then asset_id
    if (a.status !== b.status) return a.status === 'failed' ? -1 : 1;
    const FLOOR_ORDER = { L: 0, U: 1, G: 2, '1': 3, '2': 4, '3': 5, '4': 6, '5': 7, '6': 8, '7': 9 };
    const floorDiff = (FLOOR_ORDER[a._floor] ?? 99) - (FLOOR_ORDER[b._floor] ?? 99);
    if (floorDiff !== 0) return floorDiff;
    return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
  });

  function typeIcon(t) { return ELEMENT_TYPE_OPTIONS.find(o => o.value === t)?.icon ?? '■'; }

  function statusLabel(s) {
    return s === 'failed' ? 'FAILED' : s === 'replace' ? 'REPLACE' : s;
  }

  async function handleSelectElement(el) {
    saving = true; error = null;
    try {
      // Start a single-floor repair session for this element's plan
      await walkStore.startSession({
        building:     el._building ?? selectedBuilding,
        floorLevel:   el._floor,
        elementType:  el.element_type,
        startAssetId: el.asset_id || null,
        planId:       el._planId,
        sessionName:  `Repair_${el.asset_id ?? 'element'}_${selectedBuilding}_F${el._floor}_${new Date().toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }).replace(/\s+/g, '_')}`,
        lightSubtypeFilter: null,
        sessionType:  'repair'
      });
      dispatch('started');
    } catch (err) {
      logger('❌ Start repair session failed:', err.message);
      error = err.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="rs">
  <div class="rs-hdr">
    <button class="back-btn" on:click={() => dispatch('back')}>← Back</button>
    <span class="rs-title">START REPAIR</span>
  </div>

  <div class="rs-body">

    <!-- Elements needing repair -->
    <section class="grp">
      <div class="grp-lbl">SELECT ELEMENT TO REPAIR</div>
      {#if !selectedBuilding}
        <p class="hint">No buildings available — add plans first.</p>
      {:else if repairElements.length === 0}
        <div class="empty-repair">
          <div class="empty-icon">✓</div>
          <div class="empty-txt">No failed or replace elements in {selectedBuilding}</div>
        </div>
      {:else}
        <p class="hint">{repairElements.length} element{repairElements.length !== 1 ? 's' : ''} need attention — tap to start repair session</p>
        <div class="el-list">
          {#each repairElements as el (el.id)}
            <button class="el-btn" class:is-replace={el.status === 'replace'}
                    on:click={() => handleSelectElement(el)}
                    disabled={saving}>
              <span class="el-icon">{typeIcon(el.element_type)}</span>
              <div class="el-body">
                <div class="el-name">{getElementDisplayName(el, el._floor)}</div>
                {#if el.label}<div class="el-label">{el.label}</div>{/if}
                <div class="el-meta">
                  Floor {el._floor}
                  {#if el.subtype} · {el.subtype}{/if}
                </div>
              </div>
              <span class="el-status st-{el.status}">{statusLabel(el.status)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </section>

    {#if error}<div class="err-box">⚠ {error}</div>{/if}

  </div>
</div>

<style>
  .rs { display: flex; flex-direction: column; min-height: calc(100vh - 64px); background: #0d0d14; color: #f0f0f0; font-family: 'DM Mono', 'Courier New', monospace; }

  .rs-hdr { display: flex; align-items: center; gap: 1rem; padding: 1.25rem 1.5rem 1rem; border-bottom: 1px solid #2e2e42; background: #111122; }
  .back-btn { background: none; border: none; color: #fb923c; font-family: inherit; font-size: 0.9rem; font-weight: 700; cursor: pointer; padding: 0; }
  .back-btn:hover { color: #fdba74; }
  .rs-title { font-size: 0.7rem; letter-spacing: 0.25em; color: #fb923c; }

  .rs-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 2rem; flex: 1; }
  .grp { display: flex; flex-direction: column; gap: 0.75rem; }
  .grp-lbl { font-size: 0.65rem; letter-spacing: 0.2em; color: #fb923c; font-weight: 700; }
  .hint { font-size: 0.82rem; color: #bbb; margin: 0; }

  .empty-repair { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 3rem 2rem; }
  .empty-icon   { font-size: 2.5rem; color: #4ade80; }
  .empty-txt    { font-size: 0.82rem; color: #ccc; text-align: center; }

  .el-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .el-btn {
    width: 100%; display: flex; align-items: center; gap: 0.875rem;
    padding: 0.875rem 1rem; background: #1a0a0a; border: 2px solid #7f1d1d;
    border-radius: 10px; text-align: left; font-family: inherit;
    cursor: pointer; transition: all 0.15s;
  }
  .el-btn:hover:not(:disabled)   { border-color: #ef4444; background: #250d0d; }
  .el-btn.is-replace             { background: #1a1200; border-color: #713f12; }
  .el-btn.is-replace:hover:not(:disabled) { border-color: #d97706; background: #231a00; }
  .el-btn:disabled               { opacity: 0.5; cursor: not-allowed; }

  .el-icon  { font-size: 1.35rem; flex-shrink: 0; }
  .el-body  { flex: 1; min-width: 0; }
  .el-name  { font-size: 0.9rem; color: #f0f0f0; font-weight: 700; }
  .el-label { font-size: 0.72rem; color: #fb923c; margin-top: 0.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .el-meta  { font-size: 0.7rem; color: #bbb; margin-top: 0.15rem; }

  .el-status { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; padding: 0.2rem 0.5rem; border-radius: 4px; flex-shrink: 0; }
  .st-failed  { background: #2a0000; color: #f87171; border: 1px solid #7f1d1d; }
  .st-replace { background: #1a1200; color: #fbbf24; border: 1px solid #713f12; }

  .err-box { font-size: 0.825rem; color: #fca5a5; padding: 0.875rem 1rem; background: #2a0000; border: 2px solid #ef4444; border-radius: 8px; }
</style>
