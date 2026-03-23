<!-- src/lib/apps/plans/components/WalkInspectionDetailModal.svelte -->
<!-- Modal showing full inspection details - similar to ElementModal -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import { ELEMENT_TYPE_OPTIONS, getElementDisplayName } from '$lib/utils/planConstants';
  import { fmtDateTime } from '$lib/utils/dates';
  
  const dispatch = createEventDispatcher();
  
  export let inspection;  // Inspection record with element data
  export let floorLevel;  // For display name generation
  
  $: typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === inspection.element_type);
  $: displayName = getElementDisplayName(inspection, floorLevel);
  $: resultClass = inspection.result === 'OK'   ? 'text-green-400' 
                 : inspection.result === 'failed'   ? 'text-red-400' 
                 : inspection.result === 'problem' ? 'text-orange-400'
                 : 'text-gray-400';
</script>

<Modal show={true} size="medium" on:close={() => dispatch('close')}>
  <div slot="header" class="flex items-center gap-3">
    <span class="text-2xl">{typeConfig?.icon || '📦'}</span>
    <div>
      <h3 class="text-xl font-bold">{displayName}</h3>
      {#if inspection.label}
        <p class="text-sm text-gray-400 mt-0.5">{inspection.label}</p>
      {/if}
    </div>
  </div>

  <div class="space-y-6">
    <!-- Inspection Result -->
    <div class="bg-slate-700/40 rounded-lg p-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <div class="text-xs text-gray-400 uppercase tracking-wide mb-1">Result</div>
          <div class="text-2xl font-bold {resultClass}">
            {#if inspection.result === 'OK'}
              PASS
            {:else if inspection.result === 'failed'}
              FAIL
            {:else if inspection.result === 'problem'}
              PROBLEM
            {:else}
              INACTIVE
            {/if}
          </div>
        </div>
        <div>
          <div class="text-xs text-gray-400 uppercase tracking-wide mb-1">Inspected</div>
          <div class="text-sm">{fmtDateTime(inspection.inspected_at)}</div>
        </div>
      </div>
    </div>

    <!-- Element Details -->
    <div>
      <h4 class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Element Details</h4>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <div class="text-xs text-gray-400 mb-1">Element ID</div>
          <div class="text-sm font-mono font-semibold">{displayName}</div>
        </div>
        <div>
          <div class="text-xs text-gray-400 mb-1">Type</div>
          <div class="text-sm">{typeConfig?.label || inspection.element_type}</div>
        </div>
        {#if inspection.label}
          <div>
            <div class="text-xs text-gray-400 mb-1">Label</div>
            <div class="text-sm">{inspection.label}</div>
          </div>
        {/if}
        {#if inspection.subtype}
          <div>
            <div class="text-xs text-gray-400 mb-1">Subtype</div>
            <div class="text-sm">{inspection.subtype}</div>
          </div>
        {/if}
        {#if inspection.asset_id}
          <div>
            <div class="text-xs text-gray-400 mb-1">Asset ID</div>
            <div class="text-sm font-mono">{inspection.asset_id}</div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Inspector Notes - Always show if present -->
    {#if inspection.inspector_notes || inspection.notes}
      <div>
        <h4 class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Inspector Notes</h4>
        <div class="bg-slate-700/40 rounded-lg p-4 text-sm whitespace-pre-wrap">
          {inspection.inspector_notes || inspection.notes}
        </div>
      </div>
    {/if}

    <!-- Photo -->
    {#if inspection.photo_url}
      <div>
        <h4 class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Photo</h4>
        <div class="bg-slate-700/40 rounded-lg p-2">
          <img 
            src={inspection.photo_url} 
            alt="Inspection photo" 
            class="w-full h-auto rounded"
            on:error={(e) => {
              e.target.style.display = 'none';
              e.target.nextElementSibling.style.display = 'block';
            }}
          />
          <div class="text-center text-gray-500 italic py-8" style="display: none;">
            Photo unavailable
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div slot="footer" class="flex justify-end">
    <Button variant="secondary" on:click={() => dispatch('close')}>
      Close
    </Button>
  </div>
</Modal>

<style>
  /* Any additional styles if needed */
</style>
