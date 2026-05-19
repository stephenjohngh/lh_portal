<!-- src/lib/apps/inspection/components/InspectionSessionSummary.svelte -->
<!-- Read-only summary of a completed inspection walk session: stats + per-component results -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { inspectionStore }  from '../stores/inspectionStore.js';
  import { flattenInspectionRows, groupByComponent, worstResult, resultLabel, sessionFloorLabel, presetLabel } from '../utils/inspectionHelpers.js';
  import { fmtDate, fmtTime } from '$lib/utils/dates';
  import WalkStatsBars from '$lib/apps/inspection/components/common/WalkStatsBars.svelte';
  import WalkError     from '$lib/apps/inspection/components/common/WalkError.svelte';
  import WalkButton    from '$lib/apps/inspection/components/common/WalkButton.svelte';

  const dispatch = createEventDispatcher();

  export let session; // row from the v2_walk_sessions table (kept historic name)

  let inspections = [];
  let loading     = true;
  let error       = null;

  $: floors = $inspectionStore.floors;
  $: types  = $inspectionStore.types;

  $: grouped = groupByComponent(flattenInspectionRows(inspections));

  $: passCount      = inspections.filter(i => i.inspection_result === 'ok').length;
  $: failCount      = inspections.filter(i => i.inspection_result === 'failed').length;
  $: problemCount   = inspections.filter(i => i.inspection_result === 'problem').length;
  $: inactiveCount  = inspections.filter(i => i.inspection_result === 'inactive').length;
  $: totalInspected = grouped.length;
  $: totalComponents = session?.total_components_count || totalInspected;

  $: floorLabel  = sessionFloorLabel(session, floors);
  $: presetDisp  = presetLabel(session?.session_preset ?? '');

  onMount(async () => {
    try {
      inspections = await inspectionStore.loadSessionInspections(session.id);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  function resultCls(r) {
    return { ok:'res-ok', failed:'res-failed', problem:'res-problem', inactive:'res-inactive' }[r] ?? '';
  }
  function resultTextCls(r) {
    return { ok:'rt-ok', failed:'rt-fail', problem:'rt-prob', inactive:'rt-na' }[r] ?? '';
  }

  function getType(typeCode) {
    return types.find(t => t.code === typeCode);
  }
</script>

<div class="sum">

  <div class="sum-hdr">
    <WalkButton variant="ghost" size="sm" on:click={() => dispatch('back')}>← BACK</WalkButton>
    <div class="sum-title">SESSION SUMMARY</div>
  </div>

  <!-- -- Meta --------------------------------------------------------------- -->
  <div class="meta">
    <div class="meta-preset">{presetDisp}</div>
    {#if session?.emergency_only}
      <span class="em-pill">⚡ Emergency Only</span>
    {/if}
    {#if session?.session_name}
      <div class="meta-sname">{session.session_name}</div>
    {/if}
    <div class="meta-loc">
      {session?.building ?? '—'} · {floorLabel}
    </div>
    {#if session?.inspector_name}
      <div class="meta-insp">Inspector: {session.inspector_name}</div>
    {/if}
    <div class="meta-dates">
      <span>{fmtDate(session?.started_at)} {fmtTime(session?.started_at)}</span>
      {#if session?.closed_at}
        <span class="arr">→</span>
        <span>{fmtTime(session.closed_at)}</span>
      {/if}
    </div>
    {#if session?.notes}
      <div class="meta-notes">"{session.notes}"</div>
    {/if}
  </div>

  {#if loading}
    <div class="state-center">
      <div class="spinner"></div>
      <span>Loading results…</span>
    </div>

  {:else if error}
    <WalkError message={error} />

  {:else if inspections.length === 0}
    <div class="state-center">
      <div class="empty-icon">◫</div>
      <div class="empty-txt">No inspections recorded</div>
    </div>

  {:else}
    <WalkStatsBars
      total={totalComponents}
      inspected={totalInspected}
      passCount={passCount}
      failCount={failCount}
      problemCount={problemCount}
      inactiveCount={inactiveCount}
    />

    <div class="sec-title">COMPONENTS</div>

    <div class="comp-list">
      {#each grouped as g (g.component_id)}
        {@const worst = worstResult(g.rows)}
        {@const latest = g.rows[g.rows.length - 1]}
        {@const t = getType(g.type_code)}
        <div class="comp-row {resultCls(worst)}">
          <div class="comp-top">
            {#if t}
              <div class="comp-dot" style="background:#{t.colour}">{t.initial}</div>
            {:else}
              <div class="comp-dot">?</div>
            {/if}
            <div class="comp-info">
              <div class="comp-ref">{g.floor_name ?? '?'} / {g.asset_id ?? '?'}</div>
              {#if g.label}<div class="comp-label">{g.label}</div>{/if}
              {#if g.type_name}<div class="comp-type">{g.type_name}</div>{/if}
            </div>
            <div class="comp-res {resultTextCls(worst)}">{resultLabel(worst)}</div>
          </div>

          {#if g.rows.length > 1}
            <div class="insp-list">
              {#each g.rows as ins}
                <div class="insp-row">
                  <span class="insp-t">{fmtTime(ins.inspected_at)}</span>
                  <span class="insp-r {resultTextCls(ins.result)}">{resultLabel(ins.result)}</span>
                  {#if ins.inspector_notes}<span class="insp-n">{ins.inspector_notes}</span>{/if}
                </div>
              {/each}
            </div>
          {:else if latest?.inspector_notes}
            <div class="comp-notes">{latest.inspector_notes}</div>
          {/if}

          {#if latest?.photo_urls?.length > 0}
            <div class="photo-strip">
              {#each latest.photo_urls as url, i (url)}
                <a href={url} target="_blank" rel="noopener" class="photo-link">
                  <img src={url} alt="Inspection {i+1}" />
                </a>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

</div>

<style>
  .sum { display:flex; flex-direction:column; min-height:calc(100vh - 64px); padding-bottom:2rem; background:#0d0d14; color:#f0f0f0; font-family:'DM Mono','Courier New',monospace; }

  .sum-hdr { display:flex; align-items:center; gap:1rem; padding:1rem 1.25rem; border-bottom:1px solid #2e2e42; background:#111122; }
  .sum-title { font-size:0.65rem; letter-spacing:0.25em; color:#ccc; flex:1; text-align:right; }

  .meta { padding:1.25rem; border-bottom:1px solid #2e2e42; display:flex; flex-direction:column; gap:0.35rem; }
  .meta-preset { font-size:0.95rem; color:#f0f0f0; font-weight:700; }
  .em-pill { font-size:0.62rem; padding:0.15rem 0.45rem; background:#2a1800; color:#fb923c; border-radius:4px; align-self:flex-start; }
  .meta-sname   { font-size:0.85rem; color:#fb923c; font-weight:700; }
  .meta-loc     { font-size:0.78rem; color:#ddd; }
  .meta-insp    { font-size:0.75rem; color:#fb923c; }
  .meta-dates   { display:flex; align-items:center; gap:0.4rem; font-size:0.72rem; color:#ccc; margin-top:0.1rem; }
  .arr          { color:#888; }
  .meta-notes   { font-size:0.75rem; color:#ddd; font-style:italic; margin-top:0.4rem; padding-top:0.5rem; border-top:1px solid #2e2e42; }

  .sec-title { font-size:0.62rem; letter-spacing:0.2em; color:#ccc; padding:1rem 1.25rem 0.5rem; }

  .comp-list { display:flex; flex-direction:column; gap:0.5rem; padding:0 1.25rem; }
  .comp-row { background:#111122; border:2px solid #2e2e42; border-radius:8px; padding:0.875rem 1rem; }
  .res-failed   { border-color:#7f1d1d; }
  .res-problem  { border-color:#7c2d12; }
  .res-ok       { border-color:#166534; }
  .res-inactive { border-color:#2e2e42; }

  .comp-top { display:flex; align-items:center; gap:0.75rem; }
  .comp-dot { width:1.75rem; height:1.75rem; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.65rem; font-weight:700; color:#fff; flex-shrink:0; background:#444; }
  .comp-info { flex:1; min-width:0; }
  .comp-ref  { font-size:0.9rem; font-weight:700; color:#f0f0f0; font-variant-numeric:tabular-nums; }
  .comp-label { font-size:0.7rem; color:#fb923c; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .comp-type  { font-size:0.65rem; color:#888; margin-top:0.1rem; }
  .comp-res { font-size:0.68rem; font-weight:700; letter-spacing:0.08em; flex-shrink:0; }
  .rt-ok   { color:#4ade80; }
  .rt-fail { color:#f87171; }
  .rt-prob { color:#fb923c; }
  .rt-na   { color:#aaa; }

  .comp-notes { font-size:0.78rem; color:#ddd; margin-top:0.5rem; padding-top:0.5rem; border-top:1px solid #2e2e42; font-style:italic; }

  .insp-list { margin-top:0.5rem; padding-top:0.5rem; border-top:1px solid #2e2e42; display:flex; flex-direction:column; gap:0.3rem; }
  .insp-row  { display:flex; align-items:baseline; gap:0.5rem; font-size:0.73rem; }
  .insp-t    { color:#ccc; flex-shrink:0; }
  .insp-n    { color:#ddd; font-style:italic; flex:1; }

  .photo-strip { display:flex; gap:0.3rem; margin-top:0.5rem; flex-wrap:wrap; }
  .photo-link img { width:2.75rem; height:2.75rem; object-fit:cover; border-radius:4px; border:1px solid #2e2e42; }

  .state-center { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:4rem 2rem; gap:0.5rem; color:#ccc; font-size:0.82rem; letter-spacing:0.08em; flex:1; }
  .spinner { width:20px; height:20px; border:2px solid #2e2e42; border-top-color:#fb923c; border-radius:50%; animation:spin 0.8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .empty-icon { font-size:3rem; color:#3e3e58; }
  .empty-txt  { font-size:0.875rem; color:#ccc; }
</style>
