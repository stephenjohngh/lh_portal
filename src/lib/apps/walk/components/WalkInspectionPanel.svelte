<!-- src/lib/apps/walk/components/WalkInspectionPanel.svelte -->
<!-- Record an inspection result (pass/fail/na) for the current element -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { walkStore } from '../stores/walkStore.js';
  import { getElementDisplayName } from '$lib/utils/planConstants';
  import { fmtDateTime } from '$lib/utils/dates';

  const logger   = getLogger('WalkInspectionPanel');
  const dispatch = createEventDispatcher();

  export let element;
  export let session;
  // For building-wide sessions session.floor_level is NULL — the parent (WalkSession)
  // should pass $walkStore.currentFloor here so the header shows the correct floor.
  export let floorLevel = session?.floor_level ?? null;

  let result         = '';
  let notes          = '';
  let saving         = false;
  let error          = null;
  let history        = [];
  let loadingHistory = true;

  onMount(async () => {
    history = await walkStore.loadElementInspectionHistory(element.id);
    loadingHistory = false;
  });

  $: displayName = getElementDisplayName(element, floorLevel);
  $: canSave     = !!result;

  async function handleSave() {
    if (!result) return;
    saving = true; error = null;
    try {
      await walkStore.recordInspection({
        elementId: element.id,
        result,
        notes
      });
      dispatch('saved');
    } catch (err) {
      logger('Save failed:', err.message);
      error = err.message;
    } finally { saving = false; }
  }
</script>

<div class="ip">

  <div class="ip-hdr">
    <button class="back-btn" on:click={() => dispatch('cancel')}>← Back</button>
    <div class="ip-name-block">
      <div class="ip-name">{displayName}</div>
      {#if element.label}<div class="ip-label">{element.label}</div>{/if}
    </div>
  </div>

  <div class="ip-body">

    <div class="sec">
      <div class="sec-lbl">INSPECTION RESULT</div>
      <div class="result-grid">
        <button class="rb r-pass" class:sel={result === 'pass'} on:click={() => result = 'pass'}>
          <span class="ri">✓</span><span class="rl">PASS</span>
        </button>
        <button class="rb r-fail" class:sel={result === 'fail'} on:click={() => result = 'fail'}>
          <span class="ri">✗</span><span class="rl">FAIL</span>
        </button>
        <button class="rb r-na"   class:sel={result === 'na'}   on:click={() => result = 'na'}>
          <span class="ri">—</span><span class="rl">N/A</span>
        </button>
      </div>
    </div>

    <div class="sec">
      <div class="sec-lbl">NOTES</div>
      <textarea class="notes-ta" bind:value={notes}
        placeholder="Observations, issues found, actions required…" rows="4"></textarea>
    </div>

    {#if error}<div class="err-box">⚠ {error}</div>{/if}

    <button class="save-btn" on:click={handleSave} disabled={saving || !canSave}>
      {saving ? 'SAVING…' : 'RECORD INSPECTION'}
    </button>

    <div class="sec">
      <div class="sec-lbl">INSPECTION HISTORY</div>
      {#if loadingHistory}
        <div class="hist-msg">Loading…</div>
      {:else if history.length === 0}
        <div class="hist-msg">No previous inspections recorded for this element.</div>
      {:else}
        <div class="hist-list">
          {#each history as rec}
            <div class="hist-item hist-{rec.inspection_result}">
              <div class="hist-hdr">
                <div class="hist-result">
                  {rec.inspection_result === 'pass' ? '✓ PASS' : rec.inspection_result === 'fail' ? '✗ FAIL' : '— N/A'}
                </div>
                <div class="hist-date">{fmtDateTime(rec.inspected_at)}</div>
              </div>
              {#if rec.inspector?.full_name}
                <div class="hist-who">by {rec.inspector.full_name}</div>
              {/if}
              {#if rec.inspector_notes}
                <div class="hist-notes">{rec.inspector_notes}</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

  </div>
</div>

<style>
  .ip {
    display: flex; flex-direction: column; flex: 1;
    background: #0d0d14; color: #f0f0f0;
    font-family: 'DM Mono', 'Courier New', monospace;
    overflow-y: auto; padding-bottom: 2rem;
  }

  .ip-hdr {
    display: flex; align-items: center; gap: 1rem;
    padding: 1rem 1.25rem; border-bottom: 1px solid #2e2e42;
    position: sticky; top: 0; background: #111122; z-index: 5;
  }
  .back-btn {
    background: none; border: none; color: #fb923c;
    font-family: inherit; font-size: 0.875rem; font-weight: 700;
    cursor: pointer; padding: 0; white-space: nowrap;
  }
  .back-btn:hover { color: #fdba74; }
  .ip-name-block { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .ip-name  { font-size: 0.95rem; color: #f0f0f0; font-weight: 700; letter-spacing: 0.04em; }
  .ip-label { font-size: 0.75rem; color: #fb923c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .ip-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 1.5rem; }

  .sec     { display: flex; flex-direction: column; gap: 0.75rem; }
  .sec-lbl { font-size: 0.62rem; letter-spacing: 0.2em; color: #fb923c; font-weight: 700; }

  /* ── Result grid ──────────────────────────────────────────────────────────*/
  .result-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; }
  .rb {
    display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
    padding: 1.25rem 0.5rem; border-radius: 10px; border: 2px solid transparent;
    font-family: inherit; cursor: pointer; transition: all 0.15s; background: #1a1a2e;
  }
  .ri { font-size: 1.6rem; }
  .rl { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; }

  .r-pass        { color: #4ade80; }
  .r-pass:hover  { border-color: #22c55e; }
  .r-pass.sel    { border-color: #22c55e; background: #0a1f0a; }

  .r-fail        { color: #f87171; }
  .r-fail:hover  { border-color: #ef4444; }
  .r-fail.sel    { border-color: #ef4444; background: #1f0a0a; }

  .r-na          { color: #ccc; }
  .r-na:hover    { border-color: #5e5e78; }
  .r-na.sel      { border-color: #5e5e78; background: #181828; }

  /* ── Notes ────────────────────────────────────────────────────────────────*/
  .notes-ta {
    background: #1a1a2e; border: 2px solid #2e2e48; border-radius: 8px;
    color: #f0f0f0; font-family: inherit; font-size: 0.875rem;
    padding: 0.875rem 1rem; width: 100%; box-sizing: border-box; resize: none;
  }
  .notes-ta:focus { outline: none; border-color: #fb923c; }
  .notes-ta::placeholder { color: #777; }

  /* ── Error / save ─────────────────────────────────────────────────────────*/
  .err-box {
    font-size: 0.825rem; color: #fca5a5; padding: 0.875rem 1rem;
    background: #2a0000; border: 2px solid #ef4444; border-radius: 8px;
  }

  .save-btn {
    padding: 1.25rem; background: #22c55e; border: none; border-radius: 10px;
    color: #0a0a0f; font-family: inherit; font-size: 0.9rem; font-weight: 800;
    letter-spacing: 0.2em; cursor: pointer; transition: background 0.15s;
  }
  .save-btn:hover:not(:disabled) { background: #16a34a; }
  .save-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  /* ── History ──────────────────────────────────────────────────────────────*/
  .hist-msg { font-size: 0.8rem; color: #ccc; padding: 0.5rem 0; }
  .hist-list { display: flex; flex-direction: column; gap: 0.5rem; }

  .hist-item {
    padding: 0.875rem 1rem; border-radius: 8px;
    border: 1px solid #2e2e42; background: #111122;
  }
  .hist-hdr  { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.25rem; }
  .hist-result { font-size: 0.85rem; font-weight: 700; letter-spacing: 0.06em; }

  .hist-pass .hist-result { color: #4ade80; }
  .hist-fail .hist-result { color: #f87171; }
  .hist-na   .hist-result { color: #ccc; }

  .hist-date  { font-size: 0.68rem; color: #ccc; }
  .hist-who   { font-size: 0.72rem; color: #fb923c; margin-bottom: 0.25rem; }
  .hist-notes { font-size: 0.8rem; color: #eee; line-height: 1.4; }
</style>
