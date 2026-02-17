<!-- src/lib/apps/plans/PlansApp.svelte -->
<!-- Main Plans App - Interactive floor plan management -->
<script>
  import { onMount } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { auth } from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { plansStore } from './stores/plansStore';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import PlansList from './components/PlansList.svelte';
  import PlanViewer from './components/PlanViewer.svelte';
  import PlanUploader from './components/PlanUploader.svelte';

  const logger = getLogger('PlansApp');

  // Read from permissions store - same pattern as IssuesTrackerApp
  $: isAdmin   = $permissions.isAdmin;

  let showUploader = false;
  let selectedPlanId = null;
  let loading = true;
  
  $: plans = $plansStore.plans;
  $: selectedPlan = plans.find(p => p.id === selectedPlanId);
  
  onMount(async () => {
    logger('Plans app mounted');
    if ($auth.user) {
      await permissions.init($auth.user.id, 'plans');
    }
    await loadPlans();
  });
  
  async function loadPlans() {
    loading = true;
    try {
      await plansStore.loadPlans();
      logger('✅ Plans loaded');
    } catch (error) {
      logger('❌ Error loading plans:', error.message);
    } finally {
      loading = false;
    }
  }
  
  function handlePlanSelect(event) {
    selectedPlanId = event.detail.planId;
    logger('Plan selected:', selectedPlanId);
  }
  
  function handleBackToList() {
    selectedPlanId = null;
    logger('Back to plans list');
  }
  
  function handlePlanCreated(event) {
    showUploader = false;
    selectedPlanId = event.detail.planId;
    logger('Plan created, navigating to viewer');
  }
  
  function handleNewPlan() {
    showUploader = true;
    logger('Opening plan uploader');
  }
  
  function handlePlanUpdated() {
    logger('Plan updated, reloading plans');
    loadPlans();
  }
  
  function handlePlanDeleted() {
    logger('Plan deleted, returning to list');
    selectedPlanId = null;
    loadPlans();
  }
  
  function handlePlanCopied(event) {
    logger('Plan copied, navigating to new plan:', event.detail.planId);
    selectedPlanId = event.detail.planId;
    loadPlans();
  }
</script>

<div>
  <!-- Page Header -->
  <div class="flex items-center justify-between mb-6">
    <div class="flex items-center gap-3">
      {#if selectedPlan}
        <Button
          variant="secondary"
          size="small"
          icon="arrow-left"
          on:click={handleBackToList}
        >
          Back
        </Button>
      {/if}
      <div>
        <h2 class="text-2xl font-bold">
          {selectedPlan ? selectedPlan.name : 'Floor Plans'}
        </h2>
        {#if selectedPlan}
          <p class="text-sm text-gray-400">
            {selectedPlan.building}
            {#if selectedPlan.floor_level !== null && selectedPlan.floor_level !== undefined}
              · Floor {selectedPlan.floor_level}
            {/if}
          </p>
        {:else if plans.length > 0}
          <p class="text-sm text-gray-400">
            {plans.length} {plans.length === 1 ? 'plan' : 'plans'} available
          </p>
        {/if}
      </div>
    </div>

    {#if !selectedPlan && isAdmin}
      <Button
        variant="primary"
        size="medium"
        icon="plus"
        on:click={handleNewPlan}
      >
        New Floor Plan
      </Button>
    {/if}
  </div>

  <!-- Main Content -->
  <div>
    {#if loading}
      <div class="text-center py-12">
        <Icon name="loading" size={12} className="animate-spin mx-auto mb-4 text-purple-400" />
        <p class="text-gray-400">Loading floor plans...</p>
      </div>
    {:else if selectedPlan}
      <PlanViewer 
        plan={selectedPlan}
        on:planUpdated={handlePlanUpdated}
        on:planDeleted={handlePlanDeleted}
        on:planCopied={handlePlanCopied}
      />
    {:else}
      <PlansList {plans} on:selectPlan={handlePlanSelect} />
    {/if}
  </div>
</div>

<!-- Upload Modal -->
{#if showUploader}
  <PlanUploader
    on:close={() => showUploader = false}
    on:created={handlePlanCreated}
  />
{/if}
