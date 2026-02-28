<!-- src/lib/apps/plans/components/CopyPlanModal.svelte -->
<!-- UPDATED: Copy plan WITH label and notes -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import { plansStore } from '../stores/plansStore';
  import { FLOOR_LEVELS } from '$lib/utils/planConstants';

  const logger = getLogger('CopyPlanModal');
  const dispatch = createEventDispatcher();

  export let plan;
  export let elements = [];

  let formData = {
    name:        `${plan.name} (Copy)`,
    building:    plan.building,
    floor_level: plan.floor_level,
    description: plan.description ? `${plan.description} (Copy)` : ''
  };

  let errors   = {};
  let copying  = false;
  let progress = { current: 0, total: 0, status: '' };

  function validate() {
    errors = {};
    if (!formData.name.trim())     errors.name     = 'Plan name is required';
    if (!formData.building.trim()) errors.building = 'Building name is required';
    return Object.keys(errors).length === 0;
  }

  async function handleCopy() {
    if (!validate()) { logger('❌ Validation failed:', errors); return; }
    copying  = true;
    progress = { current: 0, total: elements.length + 1, status: 'Creating plan...' };
    logger('Starting copy for plan:', plan.id);

    try {
      const newPlan = await plansStore.createPlan({
        name:         formData.name.trim(),
        building:     formData.building.trim(),
        floor_level:  formData.floor_level,
        description:  formData.description.trim() || null,
        image_url:    plan.image_url,
        image_width:  plan.image_width,
        image_height: plan.image_height
      });
      logger('✅ New plan created:', newPlan.id);

      progress = { current: 1, total: elements.length + 1, status: 'Copying elements...' };
      let copiedCount = 0;

      for (const el of elements) {
        // UPDATED: Copy all fields INCLUDING label and notes
        await plansStore.createElement(newPlan.id, {
          element_type:    el.element_type,
          asset_id:        el.asset_id,
          label:           el.label || null,           // CHANGED: Copy label
          subtype:         el.subtype,
          x_position:      el.x_position,
          y_position:      el.y_position,
          status:          el.status,
          notes:           el.notes || null,           // CHANGED: Copy notes
          // Light attributes
          emergency:       el.emergency       ?? false,
          battery:         el.battery         ?? 'none',
          movement_sensor: el.movement_sensor ?? false,
          light_sensor:    el.light_sensor    ?? false,
          wattage:         el.wattage         ?? null,
          // Door attributes
          security:        el.security        ?? 'none',
          retained:        el.retained        ?? false
        });
        copiedCount++;
        progress = {
          current: copiedCount + 1,
          total:   elements.length + 1,
          status:  `Copied ${copiedCount}/${elements.length} elements`
        };
      }

      logger('✅ Copy complete:', { planId: newPlan.id, elementsCopied: copiedCount });
      dispatch('copied', { planId: newPlan.id });
      dispatch('close');

    } catch (error) {
      logger('❌ Error copying plan:', error.message);
      alert('Failed to copy plan: ' + error.message);
    } finally {
      copying = false;
    }
  }

  function handleClose() { if (!copying) dispatch('close'); }
</script>

<Modal show={true} size="medium" on:close={handleClose}>
  <h3 slot="header" class="text-xl font-bold flex items-center gap-2">
    <Icon name="copy" size={6} className="text-purple-400" />
    Copy Floor Plan
  </h3>

  <div class="section-spacing">
    <div class="card-info">
      <h4 class="font-semibold mb-2">Source Plan</h4>
      <div class="text-sm space-y-1 text-gray-300">
        <p><strong>Name:</strong> {plan.name}</p>
        <p><strong>Building:</strong> {plan.building}</p>
        <p><strong>Floor:</strong> {plan.floor_level}</p>
        <p><strong>Elements:</strong> {elements.length}</p>
      </div>
    </div>

    {#if !copying}
      <div>
        <h4 class="font-semibold mb-3">New Plan Details</h4>
        <div class="section-spacing">
          <div>
            <label for="copy-plan-name" class="block text-sm font-medium mb-2">
              Plan Name <span class="text-red-400">*</span>
            </label>
            <input id="copy-plan-name" type="text" bind:value={formData.name}
              placeholder="e.g., Ground Floor (Copy)"
              class="input" class:error={errors.name} />
            {#if errors.name}<p class="field-error">{errors.name}</p>{/if}
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="copy-building" class="block text-sm font-medium mb-2">
                Building <span class="text-red-400">*</span>
              </label>
              <input id="copy-building" type="text" bind:value={formData.building}
                placeholder="e.g., Building A"
                class="input" class:error={errors.building} />
              {#if errors.building}<p class="field-error">{errors.building}</p>{/if}
            </div>
            <div>
              <label for="copy-floor" class="block text-sm font-medium mb-2">Floor Level</label>
              <select id="copy-floor" bind:value={formData.floor_level} class="select w-full">
                {#each FLOOR_LEVELS as level}
                  <option value={level.value}>{level.label}</option>
                {/each}
              </select>
            </div>
          </div>

          <div>
            <label for="copy-description" class="block text-sm font-medium mb-2">Description</label>
            <textarea id="copy-description" bind:value={formData.description}
              placeholder="Optional description..." rows="2"
              class="textarea"></textarea>
          </div>
        </div>
      </div>

      <div class="bg-slate-700/50 rounded p-3 text-sm text-gray-400 space-y-1">
        <h4 class="font-semibold text-white mb-2">What will be copied</h4>
        <p>✓ Floor plan image ({plan.image_width} × {plan.image_height})</p>
        <p>✓ All {elements.length} elements with positions, types, subtypes, attributes, status</p>
        <p>✓ Asset IDs, labels, and notes preserved</p>
      </div>

    {:else}
      <div class="bg-slate-700/50 rounded p-4">
        <h4 class="font-semibold mb-3 flex items-center gap-2">
          <Icon name="loading" size={5} className="animate-spin text-purple-400" />
          Copying Floor Plan...
        </h4>
        <div class="w-full bg-slate-600 rounded-full h-3 mb-3">
          <div
            class="bg-purple-600 h-3 rounded-full transition-all duration-300"
            style="width: {(progress.current / progress.total) * 100}%"
          ></div>
        </div>
        <p class="text-sm text-gray-300">{progress.status}</p>
        <p class="text-sm text-gray-400">{progress.current} of {progress.total} steps completed</p>
      </div>
    {/if}
  </div>

  <div slot="footer" class="btn-group justify-end">
    <Button variant="secondary" size="large" on:click={handleClose} disabled={copying}>Cancel</Button>
    <Button variant="primary"   size="large" icon="copy"  on:click={handleCopy}  disabled={copying}>
      {copying ? 'Copying...' : 'Copy Floor Plan'}
    </Button>
  </div>
</Modal>
