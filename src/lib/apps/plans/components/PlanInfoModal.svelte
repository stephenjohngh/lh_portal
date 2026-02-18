<!-- src/lib/apps/plans/components/PlanInfoModal.svelte -->
<!-- Modal for editing floor plan metadata -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import { plansStore } from '../stores/plansStore';
  import { formatDateTime } from '$lib/utils/dates';
  import { FLOOR_LEVELS } from '$lib/utils/planConstants';
  
  const logger = getLogger('PlanInfoModal');
  const dispatch = createEventDispatcher();
  
  export let plan;
  export let elementCount = 0;
  
  let formData = {
    name: plan.name,
    building: plan.building,
    floor_level: plan.floor_level,
    description: plan.description || ''
  };
  
  let errors = {};
  let saving = false;
  let showDeleteConfirm = false;
  
  function validate() {
    errors = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Plan name is required';
    }
    
    if (!formData.building.trim()) {
      errors.building = 'Building name is required';
    }
    
    return Object.keys(errors).length === 0;
  }
  
  async function handleSave() {
    if (!validate()) {
      logger('❌ Validation failed:', errors);
      return;
    }
    
    saving = true;
    logger('Updating plan:', plan.id);
    
    try {
      await plansStore.updatePlan(plan.id, {
        name: formData.name.trim(),
        building: formData.building.trim(),
        floor_level: formData.floor_level,
        description: formData.description.trim() || null
      });
      
      logger('✅ Plan updated successfully');
      dispatch('updated');
      dispatch('close');
      
    } catch (error) {
      logger('❌ Error updating plan:', error.message);
      alert('Failed to update plan: ' + error.message);
    } finally {
      saving = false;
    }
  }
  
  function handleDelete() {
    showDeleteConfirm = true;
  }
  
  async function confirmDelete() {
    logger('Deleting plan:', plan.id);
    
    try {
      await plansStore.deletePlan(plan.id);
      logger('✅ Plan deleted successfully');
      
      showDeleteConfirm = false;
      dispatch('deleted');
      dispatch('close');
      
    } catch (error) {
      logger('❌ Error deleting plan:', error.message);
      alert('Failed to delete plan: ' + error.message);
      showDeleteConfirm = false;
    }
  }
  
  function handleClose() {
    dispatch('close');
  }
</script>

<Modal show={true} size="medium" on:close={handleClose}>
  <h3 slot="header" class="text-xl font-bold">Edit Floor Plan Info</h3>
  
  <div class="section-spacing">
    <!-- Plan Name -->
    <div>
      <label for="plan-name" class="block text-sm font-medium mb-2">
        Plan Name <span class="text-red-400">*</span>
      </label>
      <input
        id="plan-name"
        type="text"
        bind:value={formData.name}
        placeholder="e.g., Ground Floor"
        class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        class:border-red-500={errors.name}
      />
      {#if errors.name}
        <p class="text-red-400 text-sm mt-1">{errors.name}</p>
      {/if}
    </div>
    
    <!-- Building & Floor Level -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="building" class="block text-sm font-medium mb-2">
          Building <span class="text-red-400">*</span>
        </label>
        <input
          id="building"
          type="text"
          bind:value={formData.building}
          placeholder="e.g., Building A"
          class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          class:border-red-500={errors.building}
        />
        {#if errors.building}
          <p class="text-red-400 text-sm mt-1">{errors.building}</p>
        {/if}
      </div>
      
      <div>
        <label for="floor-level" class="block text-sm font-medium mb-2">
          Floor Level
        </label>
        <select
          id="floor-level"
          bind:value={formData.floor_level}
          class="select w-full"
        >
          {#each FLOOR_LEVELS as level}
            <option value={level.value}>{level.label}</option>
          {/each}
        </select>
      </div>
    </div>
    
    <!-- Description -->
    <div>
      <label for="description" class="block text-sm font-medium mb-2">
        Description
      </label>
      <textarea
        id="description"
        bind:value={formData.description}
        placeholder="Optional description..."
        rows="3"
        class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
      ></textarea>
    </div>
    
    <!-- Image Info (Read-only) -->
    <div class="bg-slate-700/50 rounded p-3">
      <h4 class="text-sm font-semibold mb-2">Image Information</h4>
      <div class="text-sm space-y-1 text-gray-400">
        <p><strong>Dimensions:</strong> {plan.image_width} × {plan.image_height} pixels</p>
        <p><strong>URL:</strong> <span class="text-xs break-all">{plan.image_url}</span></p>
      </div>
    </div>
    
    <!-- Metadata -->
    <div class="text-sm text-gray-400 border-t border-slate-700 pt-3 space-y-1">
      <p>
        <span class="font-medium">Created:</span>
        {formatDateTime(plan.created_at, plan.created_by_profile?.full_name)}
      </p>
      {#if plan.updated_at && plan.updated_at !== plan.created_at}
        <p>
          <span class="font-medium">Modified:</span>
          {formatDateTime(plan.updated_at, plan.updated_by_profile?.full_name)}
        </p>
      {/if}
    </div>
  </div>
  
  <div slot="footer" class="flex items-center justify-between">
    <div>
      <Button
        variant="danger"
        size="medium"
        icon="delete"
        on:click={handleDelete}
      >
        Delete Plan
      </Button>
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
        {saving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  </div>
</Modal>

<!-- Delete Confirmation -->
<ConfirmDialog
  show={showDeleteConfirm}
  title="Delete Floor Plan"
  message="Are you sure you want to delete this floor plan? This will also delete all {elementCount} elements on this plan. This action cannot be undone."
  confirmText="Delete Plan"
  cancelText="Cancel"
  danger={true}
  on:confirm={confirmDelete}
  on:cancel={() => showDeleteConfirm = false}
/>
