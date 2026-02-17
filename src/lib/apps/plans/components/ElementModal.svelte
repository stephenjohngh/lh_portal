<!-- src/lib/apps/plans/components/ElementModal.svelte -->
<!-- Modal for adding or editing floor plan elements -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import { formatDateTime } from '$lib/utils/dates';
  import { 
    ELEMENT_TYPE_OPTIONS, 
    ELEMENT_STATUS_OPTIONS,
    getSubtypesForType 
  } from '$lib/utils/planConstants';
  
  const logger = getLogger('ElementModal');
  const dispatch = createEventDispatcher();
  
  export let element = null; // Existing element or null for new
  export let position = null; // { x, y } for new element (normalized 0-1)
  export let plan;
  
  let formData = element ? { ...element } : {
    element_type: 'door',
    name: '',
    subtype: '',
    asset_id: '',
    status: 'active',
    notes: '',
    x_position: position?.x || 0,
    y_position: position?.y || 0
  };
  
  let showDeleteConfirm = false;
  let errors = {};
  let saving = false;
  
  $: isNew = !element;
  $: subtypeOptions = getSubtypesForType(formData.element_type);
  $: modalTitle = isNew ? 'Add Element' : 'Edit Element';
  $: selectedTypeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === formData.element_type);
  
  function validate() {
    errors = {};
    
    if (!formData.element_type) {
      errors.element_type = 'Element type is required';
    }
    
    if (!formData.name || formData.name.trim() === '') {
      errors.name = 'Name is required';
    }
    
    return Object.keys(errors).length === 0;
  }
  
  async function handleSave() {
    if (!validate()) {
      logger('❌ Validation failed:', errors);
      return;
    }
    
    saving = true;
    logger('Saving element:', formData);
    
    try {
      dispatch('save', {
        element: {
          ...formData,
          name: formData.name.trim(),
          subtype: formData.subtype || null,
          asset_id: formData.asset_id || null,
          notes: formData.notes || null
        },
        isNew
      });
    } catch (error) {
      logger('❌ Error:', error);
    } finally {
      saving = false;
    }
  }
  
  function handleDelete() {
    showDeleteConfirm = true;
  }
  
  function confirmDelete() {
    logger('Deleting element:', element.id);
    dispatch('delete', { 
      elementId: element.id,
      planId: plan.id
    });
    showDeleteConfirm = false;
  }
  
  function handleClose() {
    dispatch('close');
  }
  
  // Update subtype when element type changes
  function handleTypeChange() {
    formData.subtype = '';
  }
  
  // Format position for display
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
  </h3>
  
  <div class="section-spacing">
    {#if position}
      <div class="text-sm text-gray-400 bg-slate-700/50 rounded p-2">
        📍 Position: {formatPosition(position)}
      </div>
    {/if}
    
    <!-- Element Type -->
    <div>
      <label for="element-type" class="block text-sm font-medium mb-2">
        Element Type <span class="text-red-400">*</span>
      </label>
      <select
        id="element-type"
        bind:value={formData.element_type}
        on:change={handleTypeChange}
        class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        class:border-red-500={errors.element_type}
      >
        {#each ELEMENT_TYPE_OPTIONS as option}
          <option value={option.value}>
            {option.icon} {option.label}
          </option>
        {/each}
      </select>
      {#if errors.element_type}
        <p class="text-red-400 text-sm mt-1">{errors.element_type}</p>
      {/if}
      {#if selectedTypeConfig}
        <p class="text-xs text-gray-400 mt-1">{selectedTypeConfig.description}</p>
      {/if}
    </div>
    
    <!-- Name -->
    <div>
      <label for="element-name" class="block text-sm font-medium mb-2">
        Name / Label <span class="text-red-400">*</span>
      </label>
      <input
        id="element-name"
        type="text"
        bind:value={formData.name}
        placeholder="e.g., Main Entrance Door"
        class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        class:border-red-500={errors.name}
      />
      {#if errors.name}
        <p class="text-red-400 text-sm mt-1">{errors.name}</p>
      {/if}
    </div>
    
    <!-- Subtype -->
    <div>
      <label for="element-subtype" class="block text-sm font-medium mb-2">
        Subtype
      </label>
      <select
        id="element-subtype"
        bind:value={formData.subtype}
        class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
      >
        <option value="">-- Select subtype --</option>
        {#each subtypeOptions as subtype}
          <option value={subtype}>{subtype}</option>
        {/each}
      </select>
    </div>
    
    <!-- Asset ID -->
    <div>
      <label for="asset-id" class="block text-sm font-medium mb-2">
        Asset ID / Number
      </label>
      <input
        id="asset-id"
        type="text"
        bind:value={formData.asset_id}
        placeholder="e.g., DR-001-GF"
        class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
    </div>
    
    <!-- Status -->
    <div>
      <label for="element-status" class="block text-sm font-medium mb-2">
        Status
      </label>
      <select
        id="element-status"
        bind:value={formData.status}
        class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
      >
        {#each ELEMENT_STATUS_OPTIONS as status}
          <option value={status.value}>{status.label}</option>
        {/each}
      </select>
    </div>
    
    <!-- Notes -->
    <div>
      <label for="notes" class="block text-sm font-medium mb-2">
        Notes
      </label>
      <textarea
        id="notes"
        bind:value={formData.notes}
        placeholder="Additional information..."
        rows="3"
        class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
      ></textarea>
    </div>
    
    {#if !isNew && element}
      <!-- Metadata -->
      <div class="text-sm text-gray-400 border-t border-slate-700 pt-3 space-y-1">
        <p>
          <span class="font-medium">Created:</span>
          {formatDateTime(element.created_at, element.created_by_profile?.full_name)}
        </p>
        {#if element.updated_at && element.updated_at !== element.created_at}
          <p>
            <span class="font-medium">Modified:</span>
            {formatDateTime(element.updated_at, element.updated_by_profile?.full_name)}
          </p>
        {/if}
      </div>
    {/if}
  </div>
  
  <div slot="footer" class="flex items-center justify-between">
    <div>
      {#if !isNew}
        <Button
          variant="danger"
          size="medium"
          icon="delete"
          on:click={handleDelete}
        >
          Delete
        </Button>
      {/if}
    </div>
    
    <div class="btn-group">
      <Button
        variant="secondary"
        size="medium"
        on:click={handleClose}
        disabled={saving}
      >
        Cancel
      </Button>
      <Button
        variant="primary"
        size="medium"
        icon="check"
        on:click={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : isNew ? 'Add Element' : 'Save Changes'}
      </Button>
    </div>
  </div>
</Modal>

<!-- Delete Confirmation -->
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
