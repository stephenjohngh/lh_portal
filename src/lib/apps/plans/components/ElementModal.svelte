<!-- src/lib/apps/plans/components/ElementModal.svelte -->
<!-- Modal for adding or editing floor plan elements -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ConfirmDialog  from '$lib/components/common/ConfirmDialog.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import FormInput      from '$lib/components/common/FormInput.svelte';
  import FormSelect     from '$lib/components/common/FormSelect.svelte';
  import FormTextarea   from '$lib/components/common/FormTextarea.svelte';
  import Checkbox       from '$lib/components/common/Checkbox.svelte';
  import { formatDateTime } from '$lib/utils/dates';
  import { permissions } from '$lib/stores/permissions';
  import {
    ELEMENT_TYPE_OPTIONS,
    ELEMENT_STATUS_OPTIONS,
    BATTERY_OPTIONS,
    SECURITY_OPTIONS,
    getSubtypesForType,
    getElementDisplayName,
    blankAttributes
  } from '$lib/utils/planConstants';
  import {
    loadPersistedTemplate,
    saveTemplate
  } from '../utils/elementTemplatePersistence';
  import { walkStore } from '$lib/apps/walk/stores/walkStore.js';
  import { resultLabel } from '$lib/apps/walk/utils/walkHelpers.js';

  const logger = getLogger('ElementModal');
  const dispatch = createEventDispatcher();

  export let element  = null;
  export let position = null;
  export let plan;

  // Initialize formData - if creating new, try to load persisted template
  let formData = element ? { ...element } : (() => {
    const template = loadPersistedTemplate();
    
    if (template) {
      // Use persisted template values
      logger('📋 Loaded persisted template:', template.element_type, template.subtype);
      return {
        element_type:    template.element_type,
        label:           '',
        subtype:         template.subtype,
        asset_id:        '',
        status:          template.status,
        notes:           '',
        x_position:      position?.x || 0,
        y_position:      position?.y || 0,
        // Light attributes
        emergency:       template.emergency,
        battery:         template.battery,
        movement_sensor: template.movement_sensor,
        light_sensor:    template.light_sensor,
        wattage:         template.wattage,
        // Door attributes
        security:        template.security,
        retained:        template.retained
      };
    } else {
      // Use hardcoded defaults
      return {
        element_type:    'communal_door',
        label:           '',
        subtype:         'Fire Door',
        asset_id:        '',
        status:          'active',
        notes:           '',
        x_position:      position?.x || 0,
        y_position:      position?.y || 0,
        // Light attributes
        emergency:       false,
        battery:         'none',
        movement_sensor: false,
        light_sensor:    false,
        wattage:         null,
        // Door attributes
        security:        'none',
        retained:        false
      };
    }
  })();

  let showDeleteConfirm = false;
  let errors  = {};
  let saving  = false;

  // Inspection history — only loaded for existing elements
  let history        = [];
  let historyLoading = false;

  onMount(async () => {
    if (!isNew && element?.id) {
      historyLoading = true;
      history = await walkStore.loadElementInspectionHistory(element.id);
      historyLoading = false;
    }
  });

  $: isNew             = !element;
  $: editable          = isNew ? true : ($permissions.isAdmin || $permissions.canModify);
  $: subtypeOptions    = getSubtypesForType(formData.element_type);
  $: selectedTypeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === formData.element_type);
  $: modalTitle        = isNew ? 'Add Element' : 'Edit Element';
  $: derivedName       = getElementDisplayName(
    { asset_id: formData.asset_id, element_type: formData.element_type },
    plan?.floor_level
  );
  $: isLight          = formData.element_type === 'light';
  $: isCommunalDoor   = formData.element_type === 'communal_door';

  function validate() {
    errors = {};
    if (!formData.element_type) errors.element_type = 'Element type is required';
    return Object.keys(errors).length === 0;
  }

  async function handleSave() {
    if (!validate()) { logger('❌ Validation failed:', errors); return; }
    saving = true;
    try {
      const elementData = {
        ...formData,
        label:    formData.label?.trim()    || null,
        subtype:  formData.subtype          || null,
        asset_id: formData.asset_id?.trim() || null,
        notes:    formData.notes            || null
      };

      // If creating a new element, save the template for next time
      if (isNew) {
        saveTemplate(elementData);
        logger('✅ Saved template for next element creation');
      }

      dispatch('save', {
        element: elementData,
        isNew
      });
    } catch (error) {
      logger('❌ Error:', error);
    } finally {
      saving = false;
    }
  }

  function handleDelete()  { showDeleteConfirm = true; }
  function confirmDelete() {
    logger('Deleting element:', element.id);
    dispatch('delete', { elementId: element.id, planId: plan.id });
    showDeleteConfirm = false;
  }
  function handleClose() { dispatch('close'); }

  function handleTypeChange() {
    const subtypeDefaults = {
      communal_door:  'Fire Door',
      apartment_door: 'Fire Door',
      light:          'Bulkhead',
      fire_control:   'Sensor',
      other:          'Sprinkler'
    };
    formData.subtype = subtypeDefaults[formData.element_type] ?? '';
    Object.assign(formData, blankAttributes());
  }

  function formatPosition(pos) {
    if (!pos) return 'N/A';
    return `(${(pos.x * 100).toFixed(1)}%, ${(pos.y * 100).toFixed(1)}%)`;
  }
</script>

<Modal show={true} size="medium" on:close={handleClose}>
  <h3 slot="header" class="text-xl font-bold flex items-center gap-2">
    {#if selectedTypeConfig}
      <span class="text-2xl">{selectedTypeConfig.icon}</span>
    {/if}
    {modalTitle}
    {#if !isNew && !$permissions.isAdmin && !$permissions.canModify}
      <span class="text-xs font-normal bg-amber-600/20 text-amber-400 border border-amber-600/30 rounded px-2 py-0.5 ml-2">
        Read Only
      </span>
    {/if}
  </h3>

  <div class="section-spacing">
    {#if position}
      <div class="text-sm text-gray-400 bg-slate-700/50 rounded p-2">
        📍 Position: {formatPosition(position)}
      </div>
    {/if}

    <!-- Template indicator for new elements -->
    {#if isNew && loadPersistedTemplate()}
      <div class="text-xs text-purple-400 bg-purple-900/20 border border-purple-500/30 rounded p-2 flex items-center gap-2">
        <span>📋</span>
        <span>Using settings from last created element</span>
      </div>
    {/if}

    <!-- Derived Name Display -->
    <div class="bg-slate-700/30 border border-slate-600 rounded p-3">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-xs text-gray-400 uppercase tracking-wide">Element Name</span>
          <div class="text-lg font-bold font-mono mt-0.5 text-white">{derivedName}</div>
        </div>
        <div class="text-xs text-gray-500 text-right">
          <span>Floor/Type/ID</span><br/>
          <span class="italic">(auto-generated)</span>
        </div>
      </div>
    </div>

    <!-- Type | Subtype -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <FormSelect
          label="Element Type *"
          bind:value={formData.element_type}
          options={ELEMENT_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.icon + ' ' + o.label }))}
          disabled={!editable}
          error={errors.element_type || ''}
          on:change={handleTypeChange}
        />
      </div>
      <div>
        <FormSelect
          label="Subtype"
          bind:value={formData.subtype}
          options={subtypeOptions}
          disabled={!editable}
        />
      </div>
    </div>

    <!-- Asset ID | Label -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <FormInput
          label="Asset ID"
          bind:value={formData.asset_id}
          placeholder="e.g., 001"
          helpText="Used in the Floor/Type/ID display name"
          disabled={!editable}
        />
      </div>
      <div>
        <FormInput
          label="Label (optional)"
          bind:value={formData.label}
          placeholder="e.g., Attached Number"
          disabled={!editable}
        />
      </div>
    </div>

    <!-- Light Attributes -->
    {#if isLight}
      <div class="attr-panel">
        <h4 class="attr-panel-title text-yellow-400">💡 Light Attributes</h4>
        <div class="grid grid-cols-2 gap-4 mb-3">
          <div>
            <FormSelect
              label="Battery"
              bind:value={formData.battery}
              options={BATTERY_OPTIONS}
              disabled={!editable}
            />
          </div>
          <div>
            <FormInput
              label="Wattage (W)"
              type="number"
              bind:value={formData.wattage}
              placeholder="e.g., 18"
              disabled={!editable}
            />
          </div>
        </div>
        <div class="flex flex-wrap gap-4">
          {#each [
            { key: 'emergency',       label: 'Emergency' },
            { key: 'movement_sensor', label: 'Movement Sensor' },
            { key: 'light_sensor',    label: 'Light Sensor' }
          ] as flag}
            <Checkbox
              bind:checked={formData[flag.key]}
              label={flag.label}
              disabled={!editable}
            />
          {/each}
        </div>
      </div>
    {/if}

    <!-- Communal Door Attributes -->
    {#if isCommunalDoor}
      <div class="attr-panel">
        <h4 class="attr-panel-title text-orange-700">Door Attributes</h4>
        <div class="mb-3">
          <FormSelect
            label="Security"
            bind:value={formData.security}
            options={SECURITY_OPTIONS}
            disabled={!editable}
          />
        </div>
        <Checkbox
          bind:checked={formData.retained}
          label="Retained"
          disabled={!editable}
        />
      </div>
    {/if}

    <!-- Status -->
    <div>
      <FormSelect
        label="Status"
        bind:value={formData.status}
        options={ELEMENT_STATUS_OPTIONS.map(s => ({ value: s.value, label: s.label }))}
        disabled={!editable}
      />
    </div>

    <!-- Notes -->
    <div>
      <FormTextarea
        label="Notes{isLight && formData.subtype === 'Exit' ? ' — include exit direction (Left / Right / No Direction)' : ''}"
        bind:value={formData.notes}
        placeholder="Additional information…"
        rows={2}
        disabled={!editable}
      />
    </div>

    {#if !isNew && element}
      <!-- Inspection History -->
      <div>
        <div class="hist-header">
          <span class="text-sm font-medium">Inspection History</span>
          {#if history.length > 0}
            <span class="hist-count">{history.length} record{history.length !== 1 ? 's' : ''}</span>
          {/if}
        </div>

        {#if historyLoading}
          <LoadingSpinner size="small" centered={false} />
        {:else if history.length === 0}
          <div class="hist-empty">No inspections recorded for this element.</div>
        {:else}
          <div class="hist-list">
            {#each history.slice(0, 3) as rec}
              {@const res = rec.inspection_result}
              <div class="hist-row hist-{res}">
                <span class="hist-result hist-result-{res}">{resultLabel(res)}</span>
                <span class="hist-date">{formatDateTime(rec.inspected_at)}</span>
                {#if rec.inspector?.full_name}
                  <span class="hist-who">{rec.inspector.full_name}</span>
                {/if}
                {#if rec.inspector_notes}
                  <div class="hist-notes">{rec.inspector_notes}</div>
                {/if}
              </div>
            {/each}
            {#if history.length > 3}
              <div class="hist-more">+ {history.length - 3} older record{history.length - 3 !== 1 ? 's' : ''}</div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="meta-row">
        <span><span class="font-medium">Created:</span> {formatDateTime(element.created_at)}</span>
        {#if element.updated_at && element.updated_at !== element.created_at}
          <span><span class="font-medium">Modified:</span> {formatDateTime(element.updated_at)}</span>
        {/if}
      </div>
    {/if}
  </div>

  <div slot="footer" class="flex items-center justify-between">
    <div>
      {#if !isNew && editable}
        <Button variant="danger" size="medium" icon="delete" on:click={handleDelete}>Delete</Button>
      {/if}
    </div>
    <div class="btn-group">
      <Button variant="secondary" size="medium" on:click={handleClose} disabled={saving}>
        {editable ? 'Cancel' : 'Close'}
      </Button>
      {#if editable}
        <Button variant="primary" size="medium" icon="check" on:click={handleSave} disabled={saving}>
          {saving ? 'Saving...' : isNew ? 'Add Element' : 'Save Changes'}
        </Button>
      {/if}
    </div>
  </div>
</Modal>

<ConfirmDialog
  show={showDeleteConfirm}
  title="Delete Element"
  message="Are you sure you want to delete this element? This action cannot be undone."
  confirmText="Delete"
  cancelText="Cancel"
  danger={true}
  on:confirm={confirmDelete}
  on:cancel={() => showDeleteConfirm = false}
/>

<style>
  /* ── Inspection History ───────────────────────────────────────────────────*/
  .hist-header {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .hist-count  { font-size: 0.72rem; color: rgb(107 114 128); }
  .hist-empty  { font-size: 0.8rem; color: rgb(107 114 128); font-style: italic; padding: 0.5rem 0; }

  .hist-list {
    display: flex; flex-direction: column; gap: 0.375rem;
    max-height: 11rem; overflow-y: auto;
    border: 1px solid rgb(71 85 105); border-radius: 6px; padding: 0.375rem;
  }

  .hist-row {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.375rem;
    padding: 0.5rem 0.625rem; border-radius: 4px; border-left: 3px solid transparent;
    background: rgb(51 65 85 / 0.3);
  }
  .hist-pass   { border-left-color: rgb(22 163 74); }
  .hist-fail   { border-left-color: rgb(220 38 38); }
  .hist-repair { border-left-color: rgb(234 88 12); }
  .hist-na     { border-left-color: rgb(71 85 105); }

  .hist-result      { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; flex-shrink: 0; }
  .hist-result-pass   { color: rgb(74 222 128); }
  .hist-result-fail   { color: rgb(248 113 113); }
  .hist-result-repair { color: rgb(251 146 60); }
  .hist-result-na     { color: rgb(156 163 175); }

  .hist-date { font-size: 0.72rem; color: rgb(107 114 128); flex-shrink: 0; }
  .hist-who  { font-size: 0.72rem; color: rgb(167 139 250); margin-left: auto; }
  .hist-notes {
    width: 100%; font-size: 0.72rem; color: rgb(209 213 219);
    font-style: italic; padding-top: 0.2rem; margin-top: 0.1rem;
    border-top: 1px solid rgb(51 65 85);
  }

  .hist-more {
    font-size: 0.7rem; color: rgb(107 114 128); text-align: center;
    padding: 0.3rem 0; font-style: italic;
  }
</style>
