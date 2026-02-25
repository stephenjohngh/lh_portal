<!-- src/lib/apps/plans/components/ElementModal.svelte -->
<!-- Modal for adding or editing floor plan elements -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
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
        <label for="element-type" class="block text-sm font-medium mb-2">
          Element Type <span class="text-red-400">*</span>
        </label>
        <select
          id="element-type"
          bind:value={formData.element_type}
          on:change={handleTypeChange}
          disabled={!editable}
          class="select w-full"
          class:error={errors.element_type}
        >
          {#each ELEMENT_TYPE_OPTIONS as opt}
            <option value={opt.value}>{opt.icon} {opt.label}</option>
          {/each}
        </select>
        {#if errors.element_type}
          <p class="field-error">{errors.element_type}</p>
        {/if}
      </div>
      <div>
        <label for="element-subtype" class="block text-sm font-medium mb-2">Subtype</label>
        <select
          id="element-subtype"
          bind:value={formData.subtype}
          disabled={!editable}
          class="select w-full"
        >
          {#each subtypeOptions as subtype}
            <option value={subtype}>{subtype}</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- Asset ID | Label -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="asset-id" class="block text-sm font-medium mb-2">
          Asset ID <span class="text-gray-500 text-xs font-normal ml-1">— used in name</span>
        </label>
        <input
          id="asset-id"
          type="text"
          bind:value={formData.asset_id}
          placeholder="e.g., 001"
          disabled={!editable}
          class="input"
        />
      </div>
      <div>
        <label for="element-label" class="block text-sm font-medium mb-2">
          Label <span class="text-gray-500 text-xs font-normal">(optional)</span>
        </label>
        <input
          id="element-label"
          type="text"
          bind:value={formData.label}
          placeholder="e.g., Attached Number"
          disabled={!editable}
          class="input"
        />
      </div>
    </div>

    <!-- Light Attributes -->
    {#if isLight}
      <div class="attr-panel">
        <h4 class="attr-panel-title text-yellow-400">💡 Light Attributes</h4>
        <div class="grid grid-cols-2 gap-4 mb-3">
          <div>
            <label for="light-battery" class="block text-sm font-medium mb-2">Battery</label>
            <select id="light-battery" bind:value={formData.battery} disabled={!editable} class="select w-full">
              {#each BATTERY_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="light-wattage" class="block text-sm font-medium mb-2">Wattage (W)</label>
            <input
              id="light-wattage"
              type="number"
              min="1"
              bind:value={formData.wattage}
              placeholder="e.g., 18"
              disabled={!editable}
              class="input"
            />
          </div>
        </div>
        <div class="flex flex-wrap gap-6">
          {#each [
            { key: 'emergency',       label: 'Emergency' },
            { key: 'movement_sensor', label: 'Movement Sensor' },
            { key: 'light_sensor',    label: 'Light Sensor' }
          ] as flag}
            <label class="flex items-center gap-2 cursor-pointer" class:opacity-50={!editable} class:cursor-not-allowed={!editable}>
              <input type="checkbox" bind:checked={formData[flag.key]} disabled={!editable} class="checkbox" />
              <span class="text-sm">{flag.label}</span>
            </label>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Communal Door Attributes -->
    {#if isCommunalDoor}
      <div class="attr-panel">
        <h4 class="attr-panel-title text-orange-700">Door Attributes</h4>
        <div class="mb-3">
          <label for="door-security" class="block text-sm font-medium mb-2">Security</label>
          <select id="door-security" bind:value={formData.security} disabled={!editable} class="select w-full">
            {#each SECURITY_OPTIONS as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>
        <label class="flex items-center gap-2 cursor-pointer" class:opacity-50={!editable} class:cursor-not-allowed={!editable}>
          <input type="checkbox" bind:checked={formData.retained} disabled={!editable} class="checkbox" />
          <span class="text-sm">Retained</span>
        </label>
      </div>
    {/if}

    <!-- Status -->
    <div>
      <label for="element-status" class="block text-sm font-medium mb-2">Status</label>
      <select id="element-status" bind:value={formData.status} disabled={!editable} class="select w-full">
        {#each ELEMENT_STATUS_OPTIONS as status}
          <option value={status.value}>{status.label}</option>
        {/each}
      </select>
    </div>

    <!-- Notes -->
    <div>
      <label for="notes" class="block text-sm font-medium mb-2">
        Notes
        {#if isLight && formData.subtype === 'Exit'}
          <span class="text-gray-500 text-xs font-normal ml-1">— include exit direction (Left / Right / No Direction)</span>
        {/if}
      </label>
      <textarea
        id="notes"
        bind:value={formData.notes}
        placeholder="Additional information..."
        rows="2"
        disabled={!editable}
        class="textarea"
      ></textarea>
    </div>

    {#if !isNew && element}
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
