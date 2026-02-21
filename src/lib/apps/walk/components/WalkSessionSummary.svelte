<!-- src/lib/apps/walk/components/WalkSessionSummary.svelte -->
<!-- Read-only summary of a completed walk session: stats + per-element results -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { walkStore } from '../stores/walkStore.js';
  import { ELEMENT_TYPE_OPTIONS } from '$lib/utils/planConstants';

  const dispatch = createEventDispatcher();

  export let session; // the walk_sessions row

  let inspections = []; // element_inspections rows for this session
  let loading     = true;
  let error       = null;

  // Group by element for display
  $: byElement = groupByElement(inspections);
  $: elements  = Object.values(byElement);

  $: passCount  = inspections.filter(i => i.result === 'pass').length;
  $: failCount  = inspections.filter(i => i.result === 'fail').length;
  $: naCount    = inspections.filter(i => i.result === 'na').length;
  $: totalInspected = elements.length;

  $: typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === session?.element_type);

  onMount(async () => {
    try {
      inspections = await walkStore.loadSessionInspections(session.id);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  function groupByElement(rows) {
    // Keyed by asset_id snapshot — elements may have been deleted since
    const map = {};
    for (const row of rows) {
      const key = row.element_id;
      if (!map[key]) {
        map[key] = {
          element_id:   row.element_id,
          asset_id:     row.asset_id,
          element_type: row.element_type,
          subtype:      row.subtype,
          inspections:  []
        };
      }
      map[key].inspections.push(row);
    }
    // Sort: fails first, then by asset_id
    return Object.fromEntries(
      Object.entries(map).sort(([, a], [, b]) => {
        const aWorst = worstResult(a.inspections);
        const bWorst = worstResult(b.inspections);
        if (aWorst !== bWorst) return resultRank(aWorst) - resultRank(bWorst);
        return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
      })
    );
  }

  function worstResult(inspList) {
    if (inspList.some(i => i.result === 'fail')) return 'fail';
    if (inspList.some(i => i.result === 'pass')) return 'pass';
    return 'na';
  }

  function resultRank(r) {
    return { fail: 0, pass: 1, na: 2 }[r] ?? 3;
  }

  function resultLabel(r) {
    return { pass: '✓ PASS', fail: '✗ FAIL', na: '— N/A' }[r] ?? r;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    return `${formatDate(iso)}  ${formatTime(iso)}`;
  }
</script>

<div class="summary">

  <!-- ── Header ───────────────────────────────────────────────────────── -->
  <div class="summary-header">
    <button class="back-btn" on:click={() => dispatch('back')}>← BACK</button>
    <div class="summary-title">SESSION SUMMARY</div>
  </div>

  <!-- ── Session meta ──────────────────────────────────────────────────── -->
  <div class="meta-block">
    <div class="meta-type">
      <span class="meta-icon">{typeConfig?.icon}</span>
      <span>{typeConfig?.label ?? session.element_type}</span>
    </div>
    <div class="meta-location">{session.building} · Floor {session.floor_level}</div>
    <div class="meta-dates">
      <span>{formatDateTime(session.started_at)}</span>
      {#if session.closed_at}
        <span class="meta-arrow">→</span>
        <span>{formatTime(session.closed_at)}</span>
      {/if}
    </div>
    {#if session.notes}
      <div class="meta-notes">"{session.notes}"</div>
    {/if}
  </div>

  {#if loading}
    <div class="loading-state">
      <div class="spinner-small"></div>
      <span>Loading results…</span>
    </div>

  {:else if error}
    <div class="error-msg">⚠ {error}</div>

  {:else if inspections.length === 0}
    <div class="empty-state">
      <div class="empty-icon">◫</div>
      <div class="empty-text">No inspections recorded</div>
      <div class="empty-sub">No elements were inspected during this session</div>
    </div>

  {:else}

    <!-- ── Stats bar ───────────────────────────────────────────────────── -->
    <div class="stats-bar">
      <div class="stat">
        <div class="stat-val">{totalInspected}</div>
        <div class="stat-key">INSPECTED</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat stat-pass">
        <div class="stat-val">{passCount}</div>
        <div class="stat-key">PASS</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat stat-fail">
        <div class="stat-val">{failCount}</div>
        <div class="stat-key">FAIL</div>
      </div>
      {#if naCount > 0}
        <div class="stat-divider"></div>
        <div class="stat stat-na">
          <div class="stat-val">{naCount}</div>
          <div class="stat-key">N/A</div>
        </div>
      {/if}
    </div>

    <!-- ── Per-element results ─────────────────────────────────────────── -->
    <div class="section-title">ELEMENTS</div>

    <div class="element-list">
      {#each elements as el (el.element_id)}
        {@const worst = worstResult(el.inspections)}
        {@const latest = el.inspections[el.inspections.length - 1]}
        <div class="element-row result-{worst}">
          <div class="element-row-top">
            <div class="element-id">{el.asset_id || '—'}</div>
            {#if el.subtype}
              <div class="element-subtype">{el.subtype}</div>
            {/if}
            <div class="element-result result-badge-{worst}">
              {resultLabel(worst)}
            </div>
          </div>

          <!-- Individual inspection entries if more than one -->
          {#if el.inspections.length > 1}
            <div class="insp-list">
              {#each el.inspections as insp}
                <div class="insp-row">
                  <span class="insp-time">{formatTime(insp.inspected_at)}</span>
                  <span class="insp-result result-text-{insp.result}">{resultLabel(insp.result)}</span>
                  {#if insp.notes}
                    <span class="insp-notes">{insp.notes}</span>
                  {/if}
                </div>
              {/each}
            </div>
          {:else if latest?.notes}
            <div class="element-notes">{latest.notes}</div>
          {/if}
        </div>
      {/each}
    </div>

  {/if}
</div>

<style>
  .summary {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding-bottom: 2rem;
  }

  /* ── Header ──────────────────────────────────────────────────────────── */
  .summary-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #1e1e2a;
    background: #0d0d13;
  }

  .back-btn {
    background: none;
    border: none;
    color: #f97316;
    font-family: inherit;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
  }
  .back-btn:hover { color: #fb923c; }

  .summary-title {
    font-size: 0.65rem;
    letter-spacing: 0.25em;
    color: #444;
    flex: 1;
    text-align: right;
  }

  /* ── Session meta ─────────────────────────────────────────────────────── */
  .meta-block {
    padding: 1.25rem;
    border-bottom: 1px solid #1e1e2a;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .meta-type {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: #e8e8e0;
    font-weight: 600;
  }

  .meta-icon { font-size: 1.1rem; }

  .meta-location {
    font-size: 0.75rem;
    color: #666;
  }

  .meta-dates {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.7rem;
    color: #444;
    margin-top: 0.1rem;
  }

  .meta-arrow { color: #333; }

  .meta-notes {
    font-size: 0.75rem;
    color: #666;
    font-style: italic;
    margin-top: 0.4rem;
    padding-top: 0.5rem;
    border-top: 1px solid #1a1a24;
  }

  /* ── Stats bar ────────────────────────────────────────────────────────── */
  .stats-bar {
    display: flex;
    align-items: center;
    padding: 1rem 1.25rem;
    background: #0d0d13;
    border-bottom: 1px solid #1e1e2a;
    gap: 0;
  }

  .stat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
  }

  .stat-val {
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 1;
    color: #e8e8e0;
  }

  .stat-key {
    font-size: 0.55rem;
    letter-spacing: 0.15em;
    color: #444;
  }

  .stat-pass .stat-val { color: #22c55e; }
  .stat-fail .stat-val { color: #ef4444; }
  .stat-na   .stat-val { color: #555; }

  .stat-divider {
    width: 1px;
    height: 2.5rem;
    background: #1e1e2a;
    flex-shrink: 0;
  }

  /* ── Section title ────────────────────────────────────────────────────── */
  .section-title {
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    color: #333;
    padding: 1rem 1.25rem 0.5rem;
  }

  /* ── Element list ─────────────────────────────────────────────────────── */
  .element-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0 1.25rem;
  }

  .element-row {
    background: #111118;
    border: 1px solid #1e1e2a;
    border-radius: 8px;
    padding: 0.875rem 1rem;
  }

  .element-row.result-fail { border-color: #3a1515; }
  .element-row.result-pass { border-color: #0f2a18; }

  .element-row-top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .element-id {
    font-size: 0.9rem;
    font-weight: 700;
    color: #e8e8e0;
    flex: 1;
    font-variant-numeric: tabular-nums;
  }

  .element-subtype {
    font-size: 0.65rem;
    color: #555;
    background: #1a1a24;
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
  }

  .element-result {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    flex-shrink: 0;
  }

  .result-badge-pass { color: #22c55e; }
  .result-badge-fail { color: #ef4444; }
  .result-badge-na   { color: #555; }

  .element-notes {
    font-size: 0.75rem;
    color: #666;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #1a1a24;
    font-style: italic;
  }

  /* ── Multiple inspections per element ─────────────────────────────────── */
  .insp-list {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #1a1a24;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .insp-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.72rem;
  }

  .insp-time  { color: #444; flex-shrink: 0; }
  .insp-notes { color: #555; font-style: italic; flex: 1; }

  .result-text-pass { color: #22c55e; font-weight: 600; }
  .result-text-fail { color: #ef4444; font-weight: 600; }
  .result-text-na   { color: #555; }

  /* ── States ───────────────────────────────────────────────────────────── */
  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 4rem 2rem;
    color: #444;
    font-size: 0.8rem;
    letter-spacing: 0.1em;
  }

  .spinner-small {
    width: 18px;
    height: 18px;
    border: 2px solid #1e1e2a;
    border-top-color: #f97316;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .error-msg {
    margin: 1.25rem;
    font-size: 0.8rem;
    color: #ef4444;
    padding: 0.875rem 1rem;
    background: #1a0000;
    border: 1px solid #3a1515;
    border-radius: 8px;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    gap: 0.5rem;
  }

  .empty-icon { font-size: 3rem; color: #222; }
  .empty-text { font-size: 0.875rem; color: #444; }
  .empty-sub  { font-size: 0.75rem; color: #333; text-align: center; }
</style>
