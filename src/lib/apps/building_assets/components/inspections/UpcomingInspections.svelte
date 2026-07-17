<!-- src/lib/apps/building_assets/components/inspections/UpcomingInspections.svelte -->
<!-- "Upcoming / Due" — one row per active inspection definition, most urgent
     first. Due/overdue state is derived read-time by computeInspectionSchedule
     (the same util the mobile app and Admin config use, so the surfaces cannot
     diverge). Rotating definitions also show their derived next trigger.
     Read-only: walks are started from the mobile Inspection app. -->
<script>
  import { computeInspectionSchedule, sortBySchedule, frequencyLabel, scheduleDueText } from '$lib/utils/inspectionSchedule';
  import { fmtDate } from '$lib/utils/dates';
  import { buildingAssetsStore } from '../../stores/buildingAssetsStore.js';
  import { buildRotatingWalk } from '$lib/apps/inspection/utils/inspectionRotation.js';
  import { lastDefinitionInspections } from '$lib/apps/inspection/public.js';
  import { buildComponentRef } from '$lib/utils/componentRef.js';

  export let definitions = [];   // active inspection_definitions rows
  export let sessions    = [];   // walk_sessions (only closed ones with a definition_id contribute)

  $: states = sortBySchedule(computeInspectionSchedule(definitions, sessions));
  $: dueCount = states.filter(s => s.overdue).length;

  // -- Rotating: derive the next trigger ("Next: G/CP/03") -------------------
  $: bas = $buildingAssetsStore;
  let rotLastTested = {};   // { [definitionId]: { componentId: ISO } }
  $: for (const d of definitions.filter(x => x.mode === 'rotating')) {
    if (!(d.id in rotLastTested)) loadLastTested(d.id);
  }
  async function loadLastTested(defId) {
    rotLastTested = { ...rotLastTested, [defId]: {} };   // sync guard against re-entry
    try {
      const map = await lastDefinitionInspections(defId);
      rotLastTested = { ...rotLastTested, [defId]: map };
    } catch { /* keep {} — trigger shown as if never tested */ }
  }
  function nextTriggerRef(definition) {
    if (!bas.components?.length) return null;
    const { trigger } = buildRotatingWalk(definition, {
      components:     bas.components,
      floors:         bas.floors,
      componentLinks: bas.componentLinks,
      ctx: { types: bas.types, attrDefs: bas.attrDefs, componentAttrs: bas.componentAttrs, inspections: bas.inspections },
      lastTested:     rotLastTested[definition.id] ?? {},
    });
    return trigger ? buildComponentRef(trigger, bas.floors, bas.types) : null;
  }

  const BAND = {
    never_run: { label: 'Never run', cls: 'b-overdue' },
    overdue:   { label: 'Overdue',   cls: 'b-overdue' },
    due_soon:  { label: 'Due soon',  cls: 'b-soon' },
    ok:        { label: 'OK',        cls: 'b-ok' },
    on_demand: { label: 'On demand', cls: 'b-od' },
  };

</script>

{#if definitions.length > 0}
  <div class="upcoming">
    <div class="up-head">
      <p class="up-title">Upcoming / Due</p>
      {#if dueCount > 0}
        <span class="up-due-count">{dueCount} due</span>
      {/if}
    </div>
    <div class="up-rows">
      {#each states as st (st.definition.id)}
        {@const b = BAND[st.band]}
        <div class="up-row">
          <span class="up-band {b.cls}">{b.label}</span>
          <span class="up-name">{st.definition.name}</span>
          {#if st.definition.mode === 'rotating'}
            <span class="up-rot">Rotating</span>
            {@const nextRef = nextTriggerRef(st.definition)}
            {#if nextRef}<span class="up-next">Next: <strong>{nextRef}</strong></span>{/if}
          {/if}
          <span class="up-freq">{frequencyLabel(st.definition.frequency_days)}</span>
          <span class="up-due">{scheduleDueText(st)}</span>
          {#if st.unfinishedAttempt}
            <span class="up-unfinished" title="A session was closed before all components were inspected — it does not count as a completed run.">
              ⚠ Unfinished {fmtDate(st.lastAttempt)}
            </span>
          {/if}
          <span class="up-last">{st.lastRun ? `Last: ${fmtDate(st.lastRun)}` : 'No completed runs'}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .upcoming { border: 1px solid rgb(71 85 105 / 0.6); border-radius: 8px; background: rgb(30 41 59 / 0.35); padding: 0.75rem 1rem; }
  .up-head  { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; }
  .up-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; color: rgb(148 163 184); }
  .up-due-count { font-size: 0.7rem; font-weight: 700; color: rgb(248 113 113); background: rgb(239 68 68 / 0.12); border: 1px solid rgb(239 68 68 / 0.35); border-radius: 999px; padding: 0.05rem 0.5rem; }

  .up-rows { display: flex; flex-direction: column; }
  .up-row  { display: flex; align-items: center; gap: 0.75rem; padding: 0.45rem 0; border-top: 1px solid rgb(71 85 105 / 0.35); flex-wrap: wrap; }
  .up-row:first-child { border-top: none; }

  .up-band { flex-shrink: 0; width: 5.2rem; text-align: center; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.3rem; border-radius: 4px; border: 1px solid transparent; }
  .b-overdue { background: rgb(239 68 68 / 0.15); color: rgb(252 165 165); border-color: rgb(239 68 68 / 0.35); }
  .b-soon    { background: rgb(217 119 6 / 0.15); color: rgb(251 191 36);  border-color: rgb(217 119 6 / 0.35); }
  .b-ok      { background: rgb(34 197 94 / 0.12); color: rgb(134 239 172); border-color: rgb(34 197 94 / 0.3); }
  .b-od      { background: rgb(71 85 105 / 0.4);  color: rgb(148 163 184); border-color: rgb(71 85 105 / 0.6); }

  .up-name { font-weight: 600; color: rgb(226 232 240); font-size: 0.875rem; }
  .up-rot  { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.1rem 0.4rem; border-radius: 4px; background: rgb(251 146 60 / 0.2); color: rgb(251 146 60); }
  .up-next { font-size: 0.75rem; color: rgb(203 213 225); font-family: ui-monospace, monospace; }
  .up-next strong { color: rgb(226 232 240); }
  .up-freq { font-size: 0.78rem; color: rgb(203 213 225); }
  .up-due  { font-size: 0.78rem; color: rgb(148 163 184); }
  .up-unfinished { font-size: 0.72rem; font-weight: 600; color: rgb(252 165 165); background: rgb(220 38 38 / 0.12); border: 1px solid rgb(220 38 38 / 0.35); border-radius: 4px; padding: 0.05rem 0.4rem; }
  .up-last { font-size: 0.72rem; color: rgb(100 116 139); margin-left: auto; }
</style>
