<!-- src/lib/apps/walk/components/WalkInspectionPanel.svelte -->
<!-- Record an inspection result (pass/fail/na) for the current element -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { walkStore } from '../stores/walkStore.js';
  import { getElementDisplayName } from '$lib/utils/planConstants';

  const logger = getLogger('WalkInspectionPanel');
  const dispatch = createEventDispatcher();

  export let element;
  export let session;

  let result  = '';   // 'pass' | 'fail' | 'na'
  let notes   = '';
  let saving  = false;
  let error   = null;

  // Load inspection history for this element
  let history = [];
  let loadingHistory = true;

  onMount(async () => {
    history = await walkStore.loadElementInspectionHistory(element.id);
    loadingHistory = false;
  });

  $: displayName = getElementDisplayName(element, session?.floor_level);
  $: canSave = !!result;

  async function handleSave() {
    if (!result) return;
    saving = true;
    error  = null;
    try {
      await walkStore.addInspection({
        sessionId: session.id,
        elementId: element.id,
        planId:    session.planId,
        result,
        notes,
        element
      });
      dispatch('saved');
    } catch (err) {
      logger('❌ Inspection save failed:', err.message);
      error = err.message;
    } finally {
      saving = false;
    }
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="inspection-panel">

  <div class="panel-header">
    <button class="back-btn" on:click={() => dispatch('cancel')}>← Back</button>
    <div class="panel-name">{displayName}</div>
  </div>

  <div class="panel-body">

    <!-- Result picker -->
    <div class="section-block">
      <div class="block-title">INSPECTION RESULT</div>
      <div class="result-grid">
        <button
          class="result-btn result-pass"
          class:selected={result === 'pass'}
          on:click={() => result = 'pass'}
        >
          <span class="result-icon">✓</span>
          <span class="result-label">PASS</span>
        </button>
        <button
          class="result-btn result-fail"
          class:selected={result === 'fail'}
          on:click={() => result = 'fail'}
        >
          <span class="result-icon">✗</span>
          <span class="result-label">FAIL</span>
        </button>
        <button
          class="result-btn result-na"
          class:selected={result === 'na'}
          on:click={() => result = 'na'}
        >
          <span class="result-icon">—</span>
          <span class="result-label">N/A</span>
        </button>
      </div>
    </div>

    <!-- Notes -->
    <div class="section-block">
      <div class="block-title">INSPECTION NOTES</div>
      <textarea
        class="notes-area"
        bind:value={notes}
        placeholder="Observations, issues found, actions required…"
        rows="5"
      ></textarea>
    </div>

    {#if error}
      <div class="error-msg">⚠ {error}</div>
    {/if}

    <button
      class="save-btn"
      on:click={handleSave}
      disabled={saving || !canSave}
    >
      {saving ? 'SAVING…' : 'RECORD INSPECTION'}
    </button>

    <!-- History -->
    <div class="section-block">
      <div class="block-title">INSPECTION HISTORY</div>
      {#if loadingHistory}
        <div class="history-loading">Loading…</div>
      {:else if history.length === 0}
        <div class="history-empty">No previous inspections recorded for this element.</div>
      {:else}
        <div class="history-list">
          {#each history as record}
            <div class="history-item history-{record.result}">
              <div class="history-item-header">
                <div class="history-item-result">
                  {record.result === 'pass' ? '✓ PASS' :
                   record.result === 'fail' ? '✗ FAIL' : '— N/A'}
                </div>
                <div class="history-item-date">{formatDateTime(record.inspected_at)}</div>
              </div>
              {#if record.inspector?.full_name}
                <div class="history-item-inspector">by {record.inspector.full_name}</div>
              {/if}
              {#if record.notes}
                <div class="history-item-notes">{record.notes}</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

  </div>
</div>

<style>
  .inspection-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    padding-bottom: 2rem;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #1e1e2a;
    position: sticky;
    top: 0;
    background: #0a0a0f;
    z-index: 5;
  }

  .back-btn {
    background: none;
    border: none;
    color: #f97316;
    font-family: inherit;
    font-size: 0.8rem;
    letter-spacing: 0.05em;
    cursor: pointer;
    padding: 0;
    white-space: nowrap;
  }

  .panel-name {
    font-size: 0.9rem;
    color: #e8e8e0;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .panel-body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* ── Sections ────────────────────────────────────────────────────────── */
  .section-block { display: flex; flex-direction: column; gap: 0.75rem; }

  .block-title {
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    color: #f97316;
  }

  /* ── Result grid ─────────────────────────────────────────────────────── */
  .result-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.5rem;
  }

  .result-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    padding: 1.25rem 0.5rem;
    border-radius: 10px;
    border: 2px solid transparent;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s;
    background: #111118;
  }

  .result-icon { font-size: 1.5rem; }
  .result-label { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.12em; }

  /* Pass */
  .result-pass { color: #22c55e; }
  .result-pass:hover { border-color: #22c55e; }
  .result-pass.selected { border-color: #22c55e; background: #0a1a0a; }

  /* Fail */
  .result-fail { color: #ef4444; }
  .result-fail:hover { border-color: #ef4444; }
  .result-fail.selected { border-color: #ef4444; background: #1a0a0a; }

  /* N/A */
  .result-na { color: #666; }
  .result-na:hover { border-color: #444; }
  .result-na.selected { border-color: #444; background: #111; }

  /* ── Notes ───────────────────────────────────────────────────────────── */
  .notes-area {
    background: #111118;
    border: 1px solid #1e1e2a;
    border-radius: 8px;
    color: #e8e8e0;
    font-family: inherit;
    font-size: 0.875rem;
    padding: 0.875rem 1rem;
    width: 100%;
    box-sizing: border-box;
    resize: none;
  }

  .notes-area:focus { outline: none; border-color: #f97316; }

  /* ── Error / save ────────────────────────────────────────────────────── */
  .error-msg {
    font-size: 0.8rem;
    color: #ef4444;
    padding: 0.75rem 1rem;
    background: #1a0000;
    border: 1px solid #ef4444;
    border-radius: 6px;
  }

  .save-btn {
    padding: 1.25rem;
    background: #22c55e;
    border: none;
    border-radius: 8px;
    color: #0a0a0f;
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    cursor: pointer;
    transition: background 0.15s;
  }

  .save-btn:hover:not(:disabled) { background: #16a34a; }
  .save-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  /* ── History ─────────────────────────────────────────────────────────── */
  .history-loading,
  .history-empty {
    font-size: 0.75rem;
    color: #444;
    padding: 1rem 0;
  }

  .history-list { display: flex; flex-direction: column; gap: 0.5rem; }

  .history-item {
    padding: 0.875rem 1rem;
    border-radius: 8px;
    border: 1px solid #1e1e2a;
    background: #0d0d13;
  }

  .history-item-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.25rem;
  }

  .history-item-result {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .history-pass .history-item-result { color: #22c55e; }
  .history-fail .history-item-result { color: #ef4444; }
  .history-na   .history-item-result { color: #555; }

  .history-item-date {
    font-size: 0.65rem;
    color: #444;
  }

  .history-item-inspector {
    font-size: 0.7rem;
    color: #555;
    margin-bottom: 0.25rem;
  }

  .history-item-notes {
    font-size: 0.775rem;
    color: #888;
    line-height: 1.4;
  }
</style>
