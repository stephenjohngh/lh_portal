<!-- src/lib/apps/v2walk/components/V2WalkInspectionPanel.svelte -->
<!-- Single inspection panel for any component type.
     Dynamically renders the checkable type_attributes for this component's type. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getLogger }    from '$lib/utils/logger';
  import { v2walkStore }  from '../stores/v2walkStore.js';
  import { resultLabel }  from '../utils/v2walkHelpers.js';
  import { fmtDate, fmtTime } from '$lib/utils/dates';
  import V2WalkResultSection from './V2WalkResultSection.svelte';
  import WalkButton  from '$lib/apps/v2walk/components/common/WalkButton.svelte';
  import WalkSpinner from '$lib/apps/v2walk/components/common/WalkSpinner.svelte';
  import WalkBadge   from '$lib/apps/v2walk/components/common/WalkBadge.svelte';

  const logger   = getLogger('V2WalkInspectionPanel');
  const dispatch = createEventDispatcher();

  export let component;   // current components row
  export let floor;       // current floors row
  export let type;        // component_types row for this component
  export let session;     // active v2_walk_sessions row

  $: attrDefs      = $v2walkStore.attrDefs;
  $: allTypes      = $v2walkStore.types;

  // Checkable attrs for this component's type
  $: typeId         = allTypes.find(t => t.code === component?.type_code)?.id ?? null;
  $: checklistDefs  = typeId ? (attrDefs[typeId] ?? []).filter(d => d.checkable) : [];

  // Form state
  let result           = '';
  let notes            = '';
  let checklistResults = {};
  let photoUrls        = [];
  let saving           = false;
  let error            = null;

  // History
  let history     = [];
  let histLoading = true;

  // Reset when component changes
  $: component, resetForm();
  function resetForm() {
    result = ''; notes = ''; checklistResults = {}; photoUrls = []; error = null;
  }

  onMount(async () => {
    await loadHistory();
  });

  $: component?.id, loadHistory();
  async function loadHistory() {
    if (!component?.id) return;
    histLoading = true;
    history = await v2walkStore.loadComponentInspectionHistory(component.id);
    histLoading = false;
  }

  async function handleSave() {
    if (!result) { error = 'Select a result first.'; return; }
    saving = true; error = null;
    try {
      await v2walkStore.recordInspection({
        componentId:      component.id,
        result,
        notes,
        photoUrls,
        checklistResults,
      });
      dispatch('saved');
    } catch (err) {
      logger('❌ recordInspection:', err.message);
      error = err.message;
    } finally {
      saving = false;
    }
  }

  function resultColor(r) {
    return { ok:'green', failed:'red', problem:'amber', inactive:'grey' }[r] ?? 'grey';
  }
</script>

<div class="ip">
  <div class="ip-hdr">
    <WalkButton variant="ghost" size="sm" on:click={() => dispatch('cancel')}>← Back</WalkButton>
    <div class="ip-title">
      <div class="ip-ref">{floor?.short_name ?? '?'} / {component?.asset_id ?? '?'}</div>
      {#if component?.label}<div class="ip-label">{component.label}</div>{/if}
    </div>
    {#if type}
      <div class="ip-dot" style="background:#{type.colour}">{type.initial}</div>
    {/if}
  </div>

  <div class="ip-body">
    <V2WalkResultSection
      bind:result
      bind:notes
      bind:checklistResults
      bind:photoUrls
      {checklistDefs}
      {saving}
      {error}
      {session}
      {component}
      on:save={handleSave}
    />

    <!-- ── History ────────────────────────────────────────────────────────────── -->
    {#if histLoading}
      <WalkSpinner />
    {:else if history.length > 0}
      <div class="hist-sec">
        <div class="hist-title">PREVIOUS INSPECTIONS</div>
        <div class="hist-list">
          {#each history.slice(0, 5) as h (h.id)}
            <div class="hist-row">
              <WalkBadge color={resultColor(h.inspection_result)}>{resultLabel(h.inspection_result)}</WalkBadge>
              <div class="hist-body">
                <div class="hist-date">{fmtDate(h.inspected_at)} {fmtTime(h.inspected_at)}</div>
                {#if h.session?.session_name}<div class="hist-sess">{h.session.session_name}</div>{/if}
                {#if h.inspector_notes}<div class="hist-notes">{h.inspector_notes}</div>{/if}
                {#if h.photo_urls?.length > 0}
                  <div class="hist-photos">
                    {#each h.photo_urls as url, i (url)}
                      <a href={url} target="_blank" rel="noopener" class="hist-photo-link">
                        <img src={url} alt="Photo {i+1}" />
                      </a>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .ip { display:flex; flex-direction:column; min-height:calc(100vh - 64px); background:#0d0d14; color:#f0f0f0; font-family:'DM Mono','Courier New',monospace; }
  .ip-hdr { display:flex; align-items:center; gap:0.875rem; padding:1rem 1.25rem; background:#111122; border-bottom:1px solid #2e2e42; }
  .ip-title { flex:1; min-width:0; }
  .ip-ref   { font-size:0.95rem; font-weight:700; color:#f0f0f0; font-variant-numeric:tabular-nums; }
  .ip-label { font-size:0.72rem; color:#fb923c; margin-top:0.1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ip-dot { width:2rem; height:2rem; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:700; color:#fff; flex-shrink:0; }
  .ip-body { padding:1.25rem; display:flex; flex-direction:column; gap:1.5rem; flex:1; }
  .hist-sec   { margin-top:0.5rem; }
  .hist-title { font-size:0.62rem; letter-spacing:0.2em; color:#888; margin-bottom:0.75rem; }
  .hist-list  { display:flex; flex-direction:column; gap:0.75rem; }
  .hist-row   { display:flex; align-items:flex-start; gap:0.75rem; }
  .hist-body  { flex:1; min-width:0; }
  .hist-date  { font-size:0.7rem; color:#ccc; }
  .hist-sess  { font-size:0.68rem; color:#888; }
  .hist-notes { font-size:0.75rem; color:#ddd; font-style:italic; margin-top:0.2rem; }
  .hist-photos { display:flex; gap:0.3rem; margin-top:0.35rem; flex-wrap:wrap; }
  .hist-photo-link img { width:3rem; height:3rem; object-fit:cover; border-radius:4px; border:1px solid #2e2e42; }
</style>
