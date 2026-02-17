<!-- src/lib/apps/plans/components/CopyPlanModal.svelte -->
<!-- Modal for copying a floor plan with its elements -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import { plansStore } from '../stores/plansStore';
  
  const logger = getLogger('CopyPlanModal');
  const dispatch = createEventDispatcher();
  
  export let plan;
  export let elements = [];
  
  let formData = {
    name: `${plan.name} (Copy)`,
    building: plan.building,
    floor_level: plan.floor_level,
    description: plan.description ? `${plan.description} (Copy)` : ''
  };
  
  let errors = {};
  let copying = false;
  let progress = { current: 0, total: 0, status: '' };
  
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
  
  async function handleCopy() {
    if (!validate()) {
      logger('❌ Validation failed:', errors);
      return;
    }
    
    copying = true;
    progress = { current: 0, total: elements.length + 1, status: 'Creating plan...' };
    logger('Starting copy operation for plan:', plan.id);
    
    try {
      // Step 1: Create the new plan
      logger('Creating new plan...');
      const newPlan = await plansStore.createPlan({
        name: formData.name.trim(),
        building: formData.building.trim(),
        floor_level: formData.floor_level,
        description: formData.description.trim() || null,
        image_url: plan.image_url,
        image_width: plan.image_width,
        image_height: plan.image_height
      });
      
      logger('✅ New plan created:', newPlan.id);
      progress = { current: 1, total: elements.length + 1, status: 'Copying elements...' };
      
      // Step 2: Copy all elements
      let copiedCount = 0;
      for (const element of elements) {
        logger(`Copying element ${copiedCount + 1}/${elements.length}:`, element.name);
        
        // Create new element with same properties but null name and asset_id
        const newElement = {
          element_type: element.element_type,
          name: element.name, // Keep the name from original
          subtype: element.subtype,
          asset_id: null, // Set to null as requested
          x_position: element.x_position,
          y_position: element.y_position,
          status: element.status,
          notes: element.notes
        };
        
        await plansStore.createElement(newPlan.id, newElement);
        copiedCount++;
        
        progress = { 
          current: copiedCount + 1, 
          total: elements.length + 1, 
          status: `Copied ${copiedCount}/${elements.length} elements` 
        };
      }
      
      logger('✅ Copy complete:', {
        planId: newPlan.id,
        elementsCopied: copiedCount
      });
      
      // Dispatch success
      dispatch('copied', { planId: newPlan.id });
      dispatch('close');
      
    } catch (error) {
      logger('❌ Error copying plan:', error.message);
      alert('Failed to copy plan: ' + error.message);
    } finally {
      copying = false;
    }
  }
  
  function handleClose() {
    if (!copying) {
      dispatch('close');
    }
  }
</script>

<Modal show={true} size="medium" on:close={handleClose}>
  <h3 slot="header" class="text-xl font-bold flex items-center gap-2">
    <Icon name="copy" size={6} className="text-purple-400" />
    Copy Floor Plan
  </h3>
  
  <div class="section-spacing">
    <!-- Source Plan Info -->
    <div class="card-info">
      <h4 class="font-semibold mb-2">Source Plan</h4>
      <div class="text-sm space-y-1">
        <p><strong>Name:</strong> {plan.name}</p>
        <p><strong>Building:</strong> {plan.building}</p>
        <p><strong>Floor:</strong> Level {plan.floor_level}</p>
        <p><strong>Elements:</strong> {elements.length}</p>
      </div>
    </div>
    
    {#if !copying}
      <!-- New Plan Details -->
      <div>
        <h4 class="font-semibold mb-3">New Plan Details</h4>
        
        <!-- Plan Name -->
        <div class="mb-4">
          <label for="plan-name" class="block text-sm font-medium mb-2">
            Plan Name <span class="text-red-400">*</span>
          </label>
          <input
            id="plan-name"
            type="text"
            bind:value={formData.name}
            placeholder="e.g., Ground Floor (Copy)"
            class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            class:border-red-500={errors.name}
          />
          {#if errors.name}
            <p class="text-red-400 text-sm mt-1">{errors.name}</p>
          {/if}
        </div>
        
        <!-- Building & Floor Level -->
        <div class="grid grid-cols-2 gap-4 mb-4">
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
            <input
              id="floor-level"
              type="number"
              bind:value={formData.floor_level}
              placeholder="0"
              class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
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
      </div>
      
      <!-- Copy Info -->
      <div class="bg-slate-700/50 rounded p-3">
        <h4 class="text-sm font-semibold mb-2">What will be copied:</h4>
        <ul class="text-sm text-gray-400 space-y-1">
          <li>✓ Floor plan image ({plan.image_width} × {plan.image_height})</li>
          <li>✓ All {elements.length} elements with their positions</li>
          <li>✓ Element types, subtypes, names, and status</li>
          <li>✓ Element notes</li>
          <li class="text-amber-400">⚠ Asset IDs will be set to null (you can assign new IDs later)</li>
        </ul>
      </div>
    {:else}
      <!-- Progress Display -->
      <div class="bg-slate-700/50 rounded p-4">
        <h4 class="font-semibold mb-3 flex items-center gap-2">
          <Icon name="loading" size={5} className="animate-spin text-purple-400" />
          Copying Floor Plan...
        </h4>
        
        <!-- Progress Bar -->
        <div class="w-full bg-slate-600 rounded-full h-3 mb-3">
          <div
            class="bg-purple-600 h-3 rounded-full transition-all duration-300"
            style="width: {(progress.current / progress.total) * 100}%"
          />
        </div>
        
        <!-- Status Text -->
        <div class="text-sm space-y-1">
          <p class="text-gray-300">
            {progress.status}
          </p>
          <p class="text-gray-400">
            {progress.current} of {progress.total} steps completed
          </p>
        </div>
      </div>
    {/if}
  </div>
  
  <div slot="footer" class="btn-group justify-end">
    <Button
      variant="secondary"
      size="large"
      on:click={handleClose}
      disabled={copying}
    >
      Cancel
    </Button>
    <Button
      variant="primary"
      size="large"
      icon="copy"
      on:click={handleCopy}
      disabled={copying}
    >
      {copying ? 'Copying...' : 'Copy Floor Plan'}
    </Button>
  </div>
</Modal>
