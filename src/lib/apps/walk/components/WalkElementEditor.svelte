<!-- src/lib/apps/walk/components/WalkElementEditor.svelte -->
<!-- Mobile-optimised form to edit all fields of an element during a walk -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { walkStore } from '../stores/walkStore.js';
  import {
    ELEMENT_TYPE_OPTIONS,
    ELEMENT_STATUS_OPTIONS,
    BATTERY_OPTIONS,
    SECURITY_OPTIONS,
    getSubtypesForType,
    getElementDisplayName
  } from '$lib/utils/planConstants';

  const logger = getLogger('WalkElementEditor');
  const dispatch = createEventDispatcher();

  export let element;
  export let floorLevel;

  // Clone element into local form
  let form = { ...element };
  let saving = false;
  let error  = null;

  $: subtypeOptions    = getSubtypesForType(form.element_type);
  $: isLight           = form.element_type === 'light';
  $: isDoor            = form.element_type === 'communal_door' || form.element_type === 'apartment_door';
  $: displayName       = getElementDisplayName({ asset_id: form.asset_id, element_type: form.element_type }, floorLevel);

  // When type changes, reset subtype to first available
  function handleTypeChange() {
    const defaults = {
      communal_door:  'Fire Door',
      apartment_door: 'Fire Door',
      light:          'Bulkhead',
      fire_control:   'Sensor'
    };
    form.subtype = defaults[form.element_type] ?? '';
    // Reset type-specific attributes
    form.emergency       = false;
    form.battery         = 'none';
    form.movement_sensor = false;
    form.light_sensor    = false;
    form.wattage         = null;
    form.security        = 'none';
    form.retained        = false;
  }

  async function handleSave() {
    saving = true;
    error  = null;
    try {
      const updates = {
        element_type:    form.element_type,
        label:           form.label?.trim() || null,
        subtype:         form.subtype       || null,
        asset_id:        form.asset_id?.trim() || null,
        status:          form.status,
        notes:           form.notes         || null,
        // Light attributes
        emergency:       form.emergency       ?? false,
        battery:         form.battery         || null,
        movement_sensor: form.movement_sensor ?? false,
        light_sensor:    form.light_sensor    ?? false,
        wattage:         form.wattage         ? Number(form.wattage) : null,
        // Door attributes
        security:        form.security        || null,
        retained:        form.retained        ?? false
      };
      await walkStore.updateElement(element.id, updates);
      dispatch('saved');
    } catch (err) {
      logger('❌ Save element failed:', err.message);
      error = err.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="editor">

  <div class="editor-header">
    <button class="back-btn" on:click={() => dispatch('cancel')}>← Back</button>
    <div class="editor-name">{displayName}</div>
  </div>

  <div class="editor-body">

    <!-- Type -->
    <div class="section-block">
      <div class="block-title">ELEMENT TYPE</div>
      <div class="type-grid">
        {#each ELEMENT_TYPE_OPTIONS as opt}
          <button
            class="type-btn"
            class:selected={form.element_type === opt.value}
            on:click={() => { form.element_type = opt.value; handleTypeChange(); }}
          >
            <span class="type-icon">{opt.icon}</span>
            <span class="type-label">{opt.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Core fields -->
    <div class="section-block">
      <div class="block-title">IDENTIFICATION</div>
      <div class="fields">
        <div class="field">
          <label class="field-label" for="f-asset">Asset ID</label>
          <input id="f-asset" class="field-input" bind:value={form.asset_id} placeholder="e.g. DR-001" />
        </div>
        <div class="field">
          <label class="field-label" for="f-label">Label</label>
          <input id="f-label" class="field-input" bind:value={form.label} placeholder="e.g. Main Entrance" />
        </div>
        <div class="field">
          <label class="field-label" for="f-subtype">Subtype</label>
          <select id="f-subtype" class="field-select" bind:value={form.subtype}>
            <option value="">— None —</option>
            {#each subtypeOptions as sub}
              <option value={sub}>{sub}</option>
            {/each}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="f-status">Status</label>
          <select id="f-status" class="field-select" bind:value={form.status}>
            {#each ELEMENT_STATUS_OPTIONS as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>
      </div>
    </div>

    <!-- Light attributes -->
    {#if isLight}
      <div class="section-block">
        <div class="block-title">LIGHT ATTRIBUTES</div>
        <div class="fields">
          <div class="field">
            <label class="field-label" for="f-battery">Battery</label>
            <select id="f-battery" class="field-select" bind:value={form.battery}>
              <option value={null}>— Not set —</option>
              {#each BATTERY_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="f-wattage">Wattage (W)</label>
            <input
              id="f-wattage"
              class="field-input"
              type="number"
              min="0"
              bind:value={form.wattage}
              placeholder="e.g. 18"
            />
          </div>
        </div>
        <div class="toggles">
          <label class="toggle">
            <input type="checkbox" bind:checked={form.emergency} />
            <span class="toggle-track"></span>
            <span class="toggle-label">Emergency</span>
          </label>
          <label class="toggle">
            <input type="checkbox" bind:checked={form.movement_sensor} />
            <span class="toggle-track"></span>
            <span class="toggle-label">Movement Sensor</span>
          </label>
          <label class="toggle">
            <input type="checkbox" bind:checked={form.light_sensor} />
            <span class="toggle-track"></span>
            <span class="toggle-label">Light Sensor</span>
          </label>
        </div>
      </div>
    {/if}

    <!-- Door attributes -->
    {#if isDoor}
      <div class="section-block">
        <div class="block-title">DOOR ATTRIBUTES</div>
        <div class="fields">
          <div class="field">
            <label class="field-label" for="f-security">Security</label>
            <select id="f-security" class="field-select" bind:value={form.security}>
              <option value={null}>— Not set —</option>
              {#each SECURITY_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>
        </div>
        <div class="toggles">
          <label class="toggle">
            <input type="checkbox" bind:checked={form.retained} />
            <span class="toggle-track"></span>
            <span class="toggle-label">Retained</span>
          </label>
        </div>
      </div>
    {/if}

    <!-- Notes -->
    <div class="section-block">
      <div class="block-title">NOTES</div>
      <textarea
        class="notes-area"
        bind:value={form.notes}
        placeholder="Any notes about this element…"
        rows="4"
      ></textarea>
    </div>

    {#if error}
      <div class="error-msg">⚠ {error}</div>
    {/if}

    <button class="save-btn" on:click={handleSave} disabled={saving}>
      {saving ? 'SAVING…' : 'SAVE CHANGES'}
    </button>

  </div>
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    padding-bottom: 2rem;
  }

  .editor-header {
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

  .editor-name {
    font-size: 0.9rem;
    color: #e8e8e0;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .editor-body {
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

  /* ── Type grid ───────────────────────────────────────────────────────── */
  .type-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .type-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 0.875rem;
    background: #111118;
    border: 1px solid #1e1e2a;
    border-radius: 8px;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s;
  }

  .type-btn.selected { border-color: #f97316; background: #1a0f00; }
  .type-icon  { font-size: 1.1rem; }
  .type-label { font-size: 0.7rem; color: #aaa; }
  .type-btn.selected .type-label { color: #f97316; }

  /* ── Fields ──────────────────────────────────────────────────────────── */
  .fields { display: flex; flex-direction: column; gap: 0.625rem; }

  .field { display: flex; flex-direction: column; gap: 0.3rem; }

  .field-label {
    font-size: 0.6rem;
    letter-spacing: 0.12em;
    color: #555;
  }

  .field-input,
  .field-select {
    background: #111118;
    border: 1px solid #1e1e2a;
    border-radius: 8px;
    color: #e8e8e0;
    font-family: inherit;
    font-size: 0.875rem;
    padding: 0.875rem 1rem;
    width: 100%;
    box-sizing: border-box;
  }

  .field-input:focus,
  .field-select:focus {
    outline: none;
    border-color: #f97316;
  }

  .field-select { appearance: none; cursor: pointer; }

  /* ── Toggles ─────────────────────────────────────────────────────────── */
  .toggles { display: flex; flex-direction: column; gap: 0.625rem; }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    padding: 0.75rem 1rem;
    background: #111118;
    border: 1px solid #1e1e2a;
    border-radius: 8px;
    transition: border-color 0.15s;
  }

  .toggle:has(input:checked) { border-color: #f97316; }

  .toggle input { display: none; }

  .toggle-track {
    width: 36px;
    height: 20px;
    background: #2a2a3a;
    border-radius: 10px;
    flex-shrink: 0;
    position: relative;
    transition: background 0.2s;
  }

  .toggle-track::after {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    background: #555;
    border-radius: 50%;
    top: 3px;
    left: 3px;
    transition: all 0.2s;
  }

  .toggle:has(input:checked) .toggle-track {
    background: #f97316;
  }

  .toggle:has(input:checked) .toggle-track::after {
    left: 19px;
    background: #fff;
  }

  .toggle-label { font-size: 0.825rem; color: #aaa; }
  .toggle:has(input:checked) .toggle-label { color: #e8e8e0; }

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
    background: #f97316;
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

  .save-btn:hover:not(:disabled) { background: #ea6a0a; }
  .save-btn:disabled { opacity: 0.35; cursor: not-allowed; }
</style>
