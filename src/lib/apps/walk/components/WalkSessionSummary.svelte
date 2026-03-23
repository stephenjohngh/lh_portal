<!-- src/lib/apps/walk/components/WalkSessionSummary.svelte -->
<!-- Read-only summary of a completed walk session: stats + per-element results -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { walkStore } from '../stores/walkStore.js';
  import { ELEMENT_TYPE_OPTIONS, getElementDisplayName } from '$lib/utils/planConstants';
  import { groupByElement, worstResult, resultLabel, flattenInspectionRows } from '../utils/walkHelpers.js';
  import { fmtDate, fmtTime } from '$lib/utils/dates';

  const dispatch = createEventDispatcher();

  export let session; // the walk_sessions row

  let inspections = [];
  let loading     = true;
  let error       = null;

  // groupByElement returns an array sorted fail-first, then floor, then asset_id
  $: grouped   = groupByElement(inspections);

  $: passCount      = inspections.filter(i => i.result === 'OK').length;
  $: failCount      = inspections.filter(i => i.result === 'failed').length;
  $: repairCount    = inspections.filter(i => i.result === 'problem').length;
  $: naCount        = inspections.filter(i => i.result === 'inactive').length;
  $: totalInspected = grouped.length;

  $: typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === session?.element_type);

  onMount(async () => {
    try {
      inspections = flattenInspectionRows(await walkStore.loadSessionInspections(session.id));
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });
</script>

<div class="sum">

  <div class="sum-hdr">
    <button class="back-btn" on:click={() => dispatch('back')}>← BACK</button>
    <div class="sum-title">SESSION SUMMARY</div>
  </div>

  <div class="meta">
    <div class="meta-type">
      <span class="meta-icon">{typeConfig?.icon}</span>
      <span class="meta-typename">{typeConfig?.label ?? session.element_type}</span>
      {#if session.light_subtype_filter === 'emergency'}
        <span class="em-pill">Emergency</span>
      {/if}
    </div>
    {#if session.session_name}
      <div class="meta-sname">{session.session_name}</div>
    {/if}
    <div class="meta-loc">
      {session.building} · {session.floor_level ? `Floor ${session.floor_level}` : 'All Floors'}
    </div>
    {#if session.inspector_name}
      <div class="meta-inspector">Inspector: {session.inspector_name}</div>
    {/if}
    <div class="meta-dates">
      <span>{fmtDate(session.started_at)} {fmtTime(session.started_at)}</span>
      {#if session.closed_at}
        <span class="arr">→</span>
        <span>{fmtTime(session.closed_at)}</span>
      {/if}
    </div>
    {#if session.notes}
      <div class="meta-notes">"{session.notes}"</div>
    {/if}
  </div>

  {#if loading}
    <div class="state-center">
      <div class="spinner"></div>
      <span>Loading results…</span>
    </div>

  {:else if error}
    <div class="err-box">⚠ {error}</div>

  {:else if inspections.length === 0}
    <div class="state-center">
      <div class="empty-icon">◫</div>
      <div class="empty-txt">No inspections recorded</div>
      <div class="empty-sub">No elements were inspected during this session</div>
    </div>

  {:else}
    <div class="stats-bar">
      <div class="stat">
        <div class="stat-v">{totalInspected}</div>
        <div class="stat-k">INSPECTED</div>
      </div>
      <div class="stat-div"></div>
      <div class="stat stat-pass">
        <div class="stat-v">{passCount}</div>
        <div class="stat-k">PASS</div>
      </div>
      <div class="stat-div"></div>
      <div class="stat stat-fail">
        <div class="stat-v">{failCount}</div>
        <div class="stat-k">FAIL</div>
      </div>
      {#if repairCount > 0}
        <div class="stat-div"></div>
        <div class="stat stat-repair">
          <div class="stat-v">{repairCount}</div>
          <div class="stat-k">PROBLEM</div>
        </div>
      {/if}
      {#if naCount > 0}
        <div class="stat-div"></div>
        <div class="stat stat-na">
          <div class="stat-v">{naCount}</div>
          <div class="stat-k">INACTIVE</div>
        </div>
      {/if}
    </div>

    <div class="sec-title">ELEMENTS</div>

    <div class="el-list">
      {#each grouped as el (el.element_id)}
        {@const worst  = worstResult(el.rows)}
        {@const latest = el.rows[el.rows.length - 1]}
        {@const dispName = getElementDisplayName(
          { asset_id: el.asset_id, element_type: el.element_type },
          el.floor_level
        )}
        <div class="el-row res-{worst}">
          <div class="el-top">
            <div class="el-name-block">
              <div class="el-id">{dispName}</div>
              {#if el.label}<div class="el-label">{el.label}</div>{/if}
            </div>
            {#if el.subtype}<div class="el-sub">{el.subtype}</div>{/if}
            <div class="el-res el-res-{worst}">{resultLabel(worst)}</div>
          </div>

          {#if el.rows.length > 1}
            <div class="insp-list">
              {#each el.rows as ins}
                <div class="insp-row">
                  <span class="insp-t">{fmtTime(ins.inspected_at)}</span>
                  <span class="insp-r r-{ins.result}">{resultLabel(ins.result)}</span>
                  {#if ins.inspector_notes}<span class="insp-n">{ins.inspector_notes}</span>{/if}
                </div>
              {/each}
            </div>
          {:else if latest?.inspector_notes}
            <div class="el-notes">{latest.inspector_notes}</div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sum {
    display: flex; flex-direction: column;
    min-height: 100vh; padding-bottom: 2rem;
    background: #0d0d14; color: #f0f0f0;
    font-family: 'DM Mono', 'Courier New', monospace;
  }

  /* ── Header ───────────────────────────────────────────────────────────────*/
  .sum-hdr {
    display: flex; align-items: center; gap: 1rem;
    padding: 1rem 1.25rem; border-bottom: 1px solid #2e2e42; background: #111122;
  }
  .back-btn {
    background: none; border: none; color: #fb923c;
    font-family: inherit; font-size: 0.75rem; font-weight: 800;
    letter-spacing: 0.12em; cursor: pointer; padding: 0; flex-shrink: 0;
  }
  .back-btn:hover { color: #fdba74; }
  .sum-title { font-size: 0.65rem; letter-spacing: 0.25em; color: #ccc; flex: 1; text-align: right; }

  /* ── Meta block ───────────────────────────────────────────────────────────*/
  .meta {
    padding: 1.25rem; border-bottom: 1px solid #2e2e42;
    display: flex; flex-direction: column; gap: 0.35rem;
  }
  .meta-type { display: flex; align-items: center; gap: 0.5rem; }
  .meta-icon { font-size: 1.25rem; }
  .meta-typename { font-size: 0.95rem; color: #f0f0f0; font-weight: 700; }
  .em-pill {
    font-size: 0.62rem; padding: 0.15rem 0.45rem;
    background: #2a1800; color: #fb923c; border-radius: 4px;
  }
  .meta-sname    { font-size: 0.85rem; color: #fb923c; font-weight: 700; }
  .meta-loc      { font-size: 0.78rem; color: #ddd; }
  .meta-inspector { font-size: 0.75rem; color: #fb923c; }
  .meta-dates    { display: flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; color: #ccc; margin-top: 0.1rem; }
  .arr           { color: #888; }
  .meta-notes    { font-size: 0.75rem; color: #ddd; font-style: italic; margin-top: 0.4rem; padding-top: 0.5rem; border-top: 1px solid #2e2e42; }

  /* ── Stats bar ────────────────────────────────────────────────────────────*/
  .stats-bar {
    display: flex; align-items: center;
    padding: 1rem 1.25rem; background: #111122; border-bottom: 1px solid #2e2e42;
  }
  .stat { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.2rem; }
  .stat-v { font-size: 1.85rem; font-weight: 800; line-height: 1; color: #f0f0f0; }
  .stat-k { font-size: 0.55rem; letter-spacing: 0.15em; color: #ccc; }
  .stat-pass .stat-v   { color: #4ade80; }
  .stat-fail .stat-v   { color: #f87171; }
  .stat-repair .stat-v { color: #fb923c; }
  .stat-na   .stat-v   { color: #aaa; }
  .stat-div  { width: 1px; height: 2.5rem; background: #2e2e42; flex-shrink: 0; }

  /* ── Section title ────────────────────────────────────────────────────────*/
  .sec-title { font-size: 0.62rem; letter-spacing: 0.2em; color: #ccc; padding: 1rem 1.25rem 0.5rem; }

  /* ── Element list ─────────────────────────────────────────────────────────*/
  .el-list { display: flex; flex-direction: column; gap: 0.5rem; padding: 0 1.25rem; }
  .el-row {
    background: #111122; border: 2px solid #2e2e42; border-radius: 8px; padding: 0.875rem 1rem;
  }
  .res-fail   { border-color: #7f1d1d; }
  .res-repair { border-color: #7c2d12; }
  .res-pass   { border-color: #166534; }
  .el-top { display: flex; align-items: center; gap: 0.5rem; }
  .el-name-block { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; min-width: 0; }
  .el-id    { font-size: 0.95rem; font-weight: 700; color: #f0f0f0; font-variant-numeric: tabular-nums; }
  .el-label { font-size: 0.72rem; color: #fb923c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .el-sub   { font-size: 0.65rem; color: #ccc; background: #222235; padding: 0.15rem 0.4rem; border-radius: 3px; flex-shrink: 0; }
  .el-res   { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; flex-shrink: 0; }
  .el-res-pass   { color: #4ade80; }
  .el-res-fail   { color: #f87171; }
  .el-res-repair { color: #fb923c; }
  .el-res-na     { color: #aaa; }

  .el-notes {
    font-size: 0.78rem; color: #ddd; margin-top: 0.5rem;
    padding-top: 0.5rem; border-top: 1px solid #2e2e42; font-style: italic;
  }

  .insp-list { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #2e2e42; display: flex; flex-direction: column; gap: 0.3rem; }
  .insp-row  { display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.73rem; }
  .insp-t    { color: #ccc; flex-shrink: 0; }
  .insp-n    { color: #ddd; font-style: italic; flex: 1; }
  .r-pass   { color: #4ade80; font-weight: 700; }
  .r-fail   { color: #f87171; font-weight: 700; }
  .r-repair { color: #fb923c; font-weight: 700; }
  .r-na     { color: #aaa; }

  /* ── States ───────────────────────────────────────────────────────────────*/
  .state-center {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 4rem 2rem; gap: 0.5rem; color: #ccc; font-size: 0.82rem; letter-spacing: 0.08em;
    flex: 1;
  }
  .spinner {
    width: 20px; height: 20px; border: 2px solid #2e2e42;
    border-top-color: #fb923c; border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .err-box { margin: 1.25rem; font-size: 0.825rem; color: #fca5a5; padding: 0.875rem 1rem; background: #2a0000; border: 2px solid #ef4444; border-radius: 8px; }
  .empty-icon { font-size: 3rem; color: #3e3e58; }
  .empty-txt  { font-size: 0.875rem; color: #ccc; }
  .empty-sub  { font-size: 0.75rem; color: #bbb; text-align: center; }
</style>
