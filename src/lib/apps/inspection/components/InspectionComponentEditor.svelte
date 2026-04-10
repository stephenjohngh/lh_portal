<!-- src/lib/apps/inspection/components/InspectionComponentEditor.svelte -->
<!-- Admin-only: full component + attribute editing during a v2 walk. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger }   from '$lib/utils/logger';
  import { inspectionStore } from '../stores/inspectionStore.js';
  import WalkButton   from '$lib/apps/inspection/components/common/WalkButton.svelte';
  import WalkError    from '$lib/apps/inspection/components/common/WalkError.svelte';
  import WalkTextarea from '$lib/apps/inspection/components/common/WalkTextarea.svelte';

  const logger   = getLogger('InspectionComponentEditor');
  const dispatch = createEventDispatcher();

  export let component;  // components row
  export let floor;      // floors row

  $: types    = $inspectionStore.types;
  $: systems  = $inspectionStore.systems;
  $: attrDefs = $inspectionStore.attrDefs;

  // Derive type and attribute definitions reactively
  $: typeObj   = types.find(t => t.code === component?.type_code);
  $: typeId    = typeObj?.id ?? null;
  $: defs      = typeId ? (attrDefs[typeId] ?? []) : [];

  // Local form state
  let saving    = false;
  let error     = null;
  let form      = {};
  let attrValues = {};

  // Initialise form from component whenever it changes
  $: {
    form = {
      asset_id:  component?.asset_id  ?? '',
      label:     component?.label     ?? '',
      notes:     component?.notes     ?? '',
      status:    component?.status    ?? 'ok',
      type_code: component?.type_code ?? '',
    };
  }

  // Load existing attribute values for this component
  $: {
    const compAttrs = $inspectionStore.allComponentAttrs?.[component?.id] ?? [];
    attrValues = {};
    for (const a of compAttrs) {
      attrValues[a.type_attribute_id] = a.value;
    }
  }

  async function handleSave() {
    saving = true; error = null;
    try {
      await inspectionStore.updateComponent(component.id, {
        asset_id:  form.asset_id?.trim()  || null,
        label:     form.label?.trim()     || null,
        notes:     form.notes?.trim()     || null,
        status:    form.status,
        type_code: form.type_code,
      }, attrValues);
      dispatch('saved');
    } catch (err) {
      logger('Save failed:', err.message);
      error = err.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="ed">
  <div class="ed-hdr">
    <WalkButton variant="ghost" size="sm" on:click={() => dispatch('cancel')}>← Back</WalkButton>
    <div class="ed-title">
      <div class="ed-ref">{floor?.short_name ?? '?'} / {component?.asset_id ?? '?'}</div>
      {#if component?.label}<div class="ed-label">{component.label}</div>{/if}
    </div>
    {#if typeObj}
      <div class="ed-dot" style="background:#{typeObj.colour}">{typeObj.initial}</div>
    {/if}
  </div>

  <div class="ed-body">

    <!-- Asset ID -->
    <div class="sec">
      <label class="sec-lbl" for="ed-asset">ASSET ID</label>
      <input id="ed-asset" class="fi" type="text" bind:value={form.asset_id} placeholder="e.g. FD-042" />
    </div>

    <!-- Label -->
    <div class="sec">
      <label class="sec-lbl" for="ed-label">LABEL / DESCRIPTION</label>
      <input id="ed-label" class="fi" type="text" bind:value={form.label} placeholder="Optional label" />
    </div>

    <!-- Component type -->
    <div class="sec">
      <label class="sec-lbl" for="ed-type">COMPONENT TYPE</label>
      <select id="ed-type" class="fs" bind:value={form.type_code}>
        {#each types as t}
          <option value={t.code}>{t.name}</option>
        {/each}
      </select>
    </div>

    <!-- Status -->
    <div class="sec">
      <label class="sec-lbl" for="ed-status">STATUS</label>
      <select id="ed-status" class="fs" bind:value={form.status}>
        <option value="ok">OK</option>
        <option value="problem">Problem</option>
        <option value="failed">Failed</option>
        <option value="inactive">Inactive</option>
      </select>
    </div>

    <!-- Dynamic type attributes -->
    {#if defs.length > 0}
      <div class="sec">
        <div class="sec-lbl">ATTRIBUTES</div>
        <div class="attr-list">
          {#each defs as def (def.id)}
            <div class="attr-row">
              <label class="attr-lbl" for="attr-{def.id}">
                {def.name}
                {#if def._scope === 'system'}<span class="inherited-badge">system</span>{/if}
              </label>
              {#if def.data_type === 'boolean'}
                <div class="bool-wrap">
                  <input
                    id="attr-{def.id}"
                    type="checkbox"
                    checked={attrValues[def.id] === 'true'}
                    on:change={e => attrValues = { ...attrValues, [def.id]: e.target.checked ? 'true' : 'false' }}
                    class="bool-cb"
                  />
                  <span class="bool-lbl">{attrValues[def.id] === 'true' ? 'Yes' : 'No'}</span>
                </div>
              {:else if def.data_type === 'select' && def.options?.length > 0}
                <select
                  id="attr-{def.id}"
                  class="fs"
                  value={attrValues[def.id] ?? ''}
                  on:change={e => attrValues = { ...attrValues, [def.id]: e.target.value }}
                >
                  <option value="">— select —</option>
                  {#each def.options as opt}
                    <option value={opt}>{opt}</option>
                  {/each}
                </select>
              {:else}
                <input
                  id="attr-{def.id}"
                  type="text"
                  class="fi"
                  value={attrValues[def.id] ?? ''}
                  on:input={e => attrValues = { ...attrValues, [def.id]: e.target.value }}
                  placeholder={def.name}
                />
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Notes -->
    <div class="sec">
      <div class="sec-lbl">NOTES</div>
      <WalkTextarea bind:value={form.notes} placeholder="Component notes…" rows={3} />
    </div>

    <WalkError message={error || ''} />

    <WalkButton variant="primary" size="full" loading={saving} on:click={handleSave}>
      {saving ? 'SAVING…' : 'SAVE CHANGES'}
    </WalkButton>

  </div>
</div>

<style>
  .ed { display:flex; flex-direction:column; min-height:calc(100vh - 64px); background:#0d0d14; color:#f0f0f0; font-family:'DM Mono','Courier New',monospace; }
  .ed-hdr { display:flex; align-items:center; gap:0.875rem; padding:1rem 1.25rem; background:#111122; border-bottom:1px solid #2e2e42; }
  .ed-title { flex:1; min-width:0; }
  .ed-ref   { font-size:0.95rem; font-weight:700; color:#f0f0f0; font-variant-numeric:tabular-nums; }
  .ed-label { font-size:0.72rem; color:#fb923c; margin-top:0.1rem; }
  .ed-dot   { width:2rem; height:2rem; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:700; color:#fff; flex-shrink:0; }
  .ed-body  { display:flex; flex-direction:column; gap:1.25rem; padding:1.5rem; flex:1; }

  .sec     { display:flex; flex-direction:column; gap:0.5rem; }
  .sec-lbl { font-size:0.62rem; letter-spacing:0.2em; color:#fb923c; font-weight:700; }

  .fi { width:100%; padding:0.75rem 1rem; background:#111122; border:1px solid #2e2e42; border-radius:8px; color:#f0f0f0; font-family:inherit; font-size:0.875rem; }
  .fi:focus { outline:none; border-color:#fb923c; }
  .fs { width:100%; padding:0.75rem 1rem; background:#111122; border:1px solid #2e2e42; border-radius:8px; color:#f0f0f0; font-family:inherit; font-size:0.875rem; }
  .fs:focus { outline:none; border-color:#fb923c; }

  .attr-list { display:flex; flex-direction:column; gap:0.875rem; }
  .attr-row  { display:flex; flex-direction:column; gap:0.35rem; }
  .attr-lbl  { font-size:0.75rem; color:#ccc; display:flex; align-items:center; gap:0.5rem; }
  .inherited-badge { font-size:0.55rem; background:#1a0e30; color:#a78bfa; padding:0.1rem 0.35rem; border-radius:3px; border:1px solid #4c1d95; }

  .bool-wrap { display:flex; align-items:center; gap:0.75rem; padding:0.5rem 0; }
  .bool-cb   { width:1.2rem; height:1.2rem; accent-color:#fb923c; cursor:pointer; }
  .bool-lbl  { font-size:0.85rem; color:#f0f0f0; }
</style>
