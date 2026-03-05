<!-- src/lib/apps/walk/components/WalkElementEditor.svelte -->
<!-- Mobile-optimised form to edit all fields of an element during a walk -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { walkStore } from '../stores/walkStore.js';
  import {
    ELEMENT_TYPE_OPTIONS, ELEMENT_STATUS_OPTIONS, BATTERY_OPTIONS, SECURITY_OPTIONS,
    getSubtypesForType, getElementDisplayName
  } from '$lib/utils/planConstants';

  const logger   = getLogger('WalkElementEditor');
  const dispatch = createEventDispatcher();

  export let element;
  export let floorLevel;

  let form    = { ...element };
  let saving  = false;
  let error   = null;

  $: subtypeOptions = getSubtypesForType(form.element_type);
  $: isLight = form.element_type === 'light';
  $: isDoor  = form.element_type === 'communal_door' || form.element_type === 'apartment_door';
  $: displayName = getElementDisplayName({ asset_id: form.asset_id, element_type: form.element_type }, floorLevel);

  function handleTypeChange() {
    const defaults = {
      communal_door:  'Fire Door',
      apartment_door: 'Fire Door',
      light:          'Bulkhead',
      fire_control:   'Sensor',
      other:          'Camera'
    };
    form.subtype         = defaults[form.element_type] ?? '';
    form.emergency       = false;
    form.battery         = 'none';
    form.movement_sensor = false;
    form.light_sensor    = false;
    form.wattage         = null;
    form.security        = 'none';
    form.retained        = false;
  }

  async function handleSave() {
    saving = true; error = null;
    try {
      await walkStore.updateElement(element.id, {
        element_type: form.element_type, label: form.label?.trim() || null,
        subtype: form.subtype || null, asset_id: form.asset_id?.trim() || null,
        status: form.status, notes: form.notes || null,
        emergency: form.emergency ?? false, battery: form.battery || null,
        movement_sensor: form.movement_sensor ?? false, light_sensor: form.light_sensor ?? false,
        wattage: form.wattage ? Number(form.wattage) : null,
        security: form.security || null, retained: form.retained ?? false
      });
      dispatch('saved');
    } catch (err) {
      logger('Save failed:', err.message);
      error = err.message;
    } finally { saving = false; }
  }
</script>

<div class="ed">
  <div class="ed-hdr">
    <button class="back-btn" on:click={() => dispatch('cancel')}>← Back</button>
    <div class="ed-name">{displayName}</div>
  </div>

  <div class="ed-body">

    <div class="sec">
      <div class="sec-lbl">ELEMENT TYPE</div>
      <div class="type-grid">
        {#each ELEMENT_TYPE_OPTIONS as opt}
          <button class="type-btn" class:on={form.element_type === opt.value}
                  on:click={() => { form.element_type = opt.value; handleTypeChange(); }}>
            <span class="t-icon">{opt.icon}</span>
            <span class="t-lbl">{opt.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="sec">
      <div class="sec-lbl">IDENTIFICATION</div>
      <div class="fields">
        <div class="field">
          <label class="fl" for="ea-id">Asset ID</label>
          <input id="ea-id" class="fi" bind:value={form.asset_id} placeholder="e.g. DR-001" />
        </div>
        <div class="field">
          <label class="fl" for="ea-lbl">Label</label>
          <input id="ea-lbl" class="fi" bind:value={form.label} placeholder="e.g. Main Entrance" />
        </div>
        <div class="field">
          <label class="fl" for="ea-sub">Subtype</label>
          <select id="ea-sub" class="fs" bind:value={form.subtype}>
            <option value="">— None —</option>
            {#each subtypeOptions as sub}<option value={sub}>{sub}</option>{/each}
          </select>
        </div>
        <div class="field">
          <label class="fl" for="ea-st">Status</label>
          <select id="ea-st" class="fs" bind:value={form.status}>
            {#each ELEMENT_STATUS_OPTIONS as opt}<option value={opt.value}>{opt.label}</option>{/each}
          </select>
        </div>
      </div>
    </div>

    {#if isLight}
      <div class="sec">
        <div class="sec-lbl">LIGHT ATTRIBUTES</div>
        <div class="fields">
          <div class="field">
            <label class="fl" for="ea-bat">Battery</label>
            <select id="ea-bat" class="fs" bind:value={form.battery}>
              <option value={null}>— Not set —</option>
              {#each BATTERY_OPTIONS as opt}<option value={opt.value}>{opt.label}</option>{/each}
            </select>
          </div>
          <div class="field">
            <label class="fl" for="ea-w">Wattage (W)</label>
            <input id="ea-w" class="fi" type="number" min="0" bind:value={form.wattage} placeholder="e.g. 18" />
          </div>
        </div>
        <div class="toggles">
          <label class="tog"><input type="checkbox" bind:checked={form.emergency} /><span class="track"></span><span class="tl">Emergency</span></label>
          <label class="tog"><input type="checkbox" bind:checked={form.movement_sensor} /><span class="track"></span><span class="tl">Movement Sensor</span></label>
          <label class="tog"><input type="checkbox" bind:checked={form.light_sensor} /><span class="track"></span><span class="tl">Light Sensor</span></label>
        </div>
      </div>
    {/if}

    {#if isDoor}
      <div class="sec">
        <div class="sec-lbl">DOOR ATTRIBUTES</div>
        <div class="fields">
          <div class="field">
            <label class="fl" for="ea-sec">Security</label>
            <select id="ea-sec" class="fs" bind:value={form.security}>
              <option value={null}>— Not set —</option>
              {#each SECURITY_OPTIONS as opt}<option value={opt.value}>{opt.label}</option>{/each}
            </select>
          </div>
        </div>
        <div class="toggles">
          <label class="tog"><input type="checkbox" bind:checked={form.retained} /><span class="track"></span><span class="tl">Retained</span></label>
        </div>
      </div>
    {/if}

    <div class="sec">
      <div class="sec-lbl">NOTES</div>
      <textarea class="fta" bind:value={form.notes} placeholder="Any notes about this element…" rows="4"></textarea>
    </div>

    {#if error}<div class="err-box">⚠ {error}</div>{/if}

    <button class="save-btn" on:click={handleSave} disabled={saving}>
      {saving ? 'SAVING…' : 'SAVE CHANGES'}
    </button>
  </div>
</div>

<style>
  .ed {
    display: flex; flex-direction: column; flex: 1;
    background: #0d0d14; color: #f0f0f0;
    font-family: 'DM Mono', 'Courier New', monospace;
    overflow-y: auto; padding-bottom: 2rem;
  }
  .ed-hdr {
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
  .ed-name { font-size: 0.95rem; color: #f0f0f0; font-weight: 700; letter-spacing: 0.04em; }

  .ed-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 1.5rem; }

  .sec     { display: flex; flex-direction: column; gap: 0.75rem; }
  .sec-lbl { font-size: 0.62rem; letter-spacing: 0.2em; color: #fb923c; font-weight: 700; }

  .type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .type-btn {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.75rem 0.875rem; background: #1a1a2e; border: 2px solid #2e2e48;
    border-radius: 8px; font-family: inherit; cursor: pointer; transition: all 0.15s;
  }
  .type-btn.on { border-color: #fb923c; background: #2a1800; }
  .t-icon { font-size: 1.1rem; }
  .t-lbl  { font-size: 0.72rem; color: #ccc; }
  .type-btn.on .t-lbl { color: #fb923c; font-weight: 700; }

  .fields { display: flex; flex-direction: column; gap: 0.625rem; }
  .field  { display: flex; flex-direction: column; gap: 0.3rem; }
  .fl     { font-size: 0.62rem; letter-spacing: 0.12em; color: #ccc; }

  .fi, .fs, .fta {
    background: #1a1a2e; border: 2px solid #2e2e48; border-radius: 8px;
    color: #f0f0f0; font-family: inherit; font-size: 0.875rem;
    padding: 0.875rem 1rem; width: 100%; box-sizing: border-box;
  }
  .fi:focus, .fs:focus, .fta:focus { outline: none; border-color: #fb923c; }
  .fi::placeholder, .fta::placeholder { color: #777; }
  .fs { appearance: none; cursor: pointer; }
  .fta { resize: none; }

  .toggles { display: flex; flex-direction: column; gap: 0.625rem; }
  .tog {
    display: flex; align-items: center; gap: 0.75rem; cursor: pointer;
    padding: 0.75rem 1rem; background: #1a1a2e; border: 2px solid #2e2e48;
    border-radius: 8px; transition: border-color 0.15s;
  }
  .tog:has(input:checked) { border-color: #fb923c; }
  .tog input { display: none; }
  .track {
    width: 36px; height: 20px; background: #2a2a4a; border-radius: 10px;
    flex-shrink: 0; position: relative; transition: background 0.2s;
  }
  .track::after {
    content: ''; position: absolute; width: 14px; height: 14px;
    background: #888; border-radius: 50%; top: 3px; left: 3px; transition: all 0.2s;
  }
  .tog:has(input:checked) .track { background: #fb923c; }
  .tog:has(input:checked) .track::after { left: 19px; background: #fff; }
  .tl { font-size: 0.825rem; color: #ddd; }
  .tog:has(input:checked) .tl { color: #f0f0f0; }

  .err-box {
    font-size: 0.825rem; color: #fca5a5; padding: 0.875rem 1rem;
    background: #2a0000; border: 2px solid #ef4444; border-radius: 8px;
  }
  .save-btn {
    padding: 1.25rem; background: #fb923c; border: none; border-radius: 10px;
    color: #0a0a0f; font-family: inherit; font-size: 0.9rem; font-weight: 800;
    letter-spacing: 0.2em; cursor: pointer; transition: background 0.15s;
  }
  .save-btn:hover:not(:disabled) { background: #f97316; }
  .save-btn:disabled { opacity: 0.35; cursor: not-allowed; }
</style>
