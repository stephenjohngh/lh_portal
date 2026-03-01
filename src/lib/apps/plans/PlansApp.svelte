<!-- src/lib/apps/plans/PlansApp.svelte -->
<!-- UPDATED: Added Building Overview handler -->
<script>
  import { onMount }          from 'svelte';
  import { getLogger }        from '$lib/utils/logger';
  import Button               from '$lib/components/common/Button.svelte';
  import Icon                 from '$lib/components/icons/Icon.svelte';
  import PlansList            from './components/PlansList.svelte';
  import PlanViewer           from './components/PlanViewer.svelte';
  import BuildingOverview     from './components/BuildingOverview.svelte';
  import PlanUploader         from './components/PlanUploader.svelte';
  import PlansReport          from './components/reports/PlansReport.svelte';
  import WalkInspectionsTab   from './components/WalkInspectionsTab.svelte';
  import { plansStore }       from './stores/plansStore';
  import { permissions }      from '$lib/stores/permissions';
  import { auth }             from '$lib/stores/auth';

  const logger = getLogger('PlansApp');

  $: isAdmin = $permissions.isAdmin;
  $: canEdit = $permissions.isAdmin || $permissions.canModify;

  let activeTab = 'plans';
  let showUploader       = false;
  let showPlanReport     = false;
  let selectedPlanId     = null;
  let showBuildingOverview = false;  // NEW
  let loading            = true;

  $: plans        = $plansStore.plans;
  $: selectedPlan = plans.find(p => p.id === selectedPlanId);

  onMount(async () => {
    logger('Plans app mounted');
    if ($auth.user) await permissions.init($auth.user.id, 'plans');
    await loadPlans();
  });

  async function loadPlans() {
    loading = true;
    try {
      await plansStore.loadPlans();
      logger('✅ Plans loaded');
    } catch (err) {
      logger('❌ Error loading plans:', err.message);
    } finally { loading = false; }
  }

  function handlePlanSelect(e) {
    if (e.detail.isBuildingOverview) {
      // NEW: Handle Building Overview selection
      showBuildingOverview = true;
      selectedPlanId = null;
    } else {
      selectedPlanId = e.detail.planId;
      showBuildingOverview = false;
    }
  }
  
  function handleBackToList() {
    selectedPlanId = null;
    showBuildingOverview = false;
  }
  
  function handlePlanCreated(e)  { showUploader = false; selectedPlanId = e.detail.planId; showBuildingOverview = false; loadPlans(); }
  function handlePlanUpdated()   { loadPlans(); }
  function handlePlanDeleted()   { selectedPlanId = null; showBuildingOverview = false; loadPlans(); }
  function handlePlanCopied(e)   { selectedPlanId = e.detail.planId; showBuildingOverview = false; loadPlans(); }

  function switchTab(tab) {
    activeTab = tab;
    if (tab !== 'plans') {
      selectedPlanId = null;
      showBuildingOverview = false;
    }
  }
</script>

<div class="text-white">

  <div class="mb-6">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        {#if selectedPlan || showBuildingOverview}
          <Button variant="secondary" size="small" icon="arrow-left" on:click={handleBackToList}>
            Back
          </Button>
        {/if}
        <Icon name="map" size={8} className="text-blue-400" />
        <div>
          <h1 class="text-2xl font-bold">
            {#if showBuildingOverview}
              Building Overview
            {:else if selectedPlan}
              {selectedPlan.name}
            {:else}
              Floor Plans
            {/if}
          </h1>
          {#if selectedPlan}
            <p class="text-sm text-gray-400">
              {selectedPlan.building}
              {#if selectedPlan.floor_level !== null && selectedPlan.floor_level !== undefined}
                · Floor {selectedPlan.floor_level}
              {/if}
            </p>
          {:else if showBuildingOverview}
            <p class="text-sm text-gray-400">All floors combined</p>
          {:else if activeTab === 'plans' && plans.length > 0}
            <p class="text-sm text-gray-400">{plans.length} {plans.length === 1 ? 'plan' : 'plans'} available</p>
          {/if}
        </div>
      </div>

      {#if activeTab === 'plans' && plans.length > 0 && !loading}
        <div class="flex items-center gap-2">
          <Button variant="secondary" size="medium" icon="download"
                  on:click={() => showPlanReport = true}
                  disabled={plans.length === 0}>
            Floor Plan Report
          </Button>
          {#if isAdmin && !selectedPlan && !showBuildingOverview}
            <Button variant="primary" size="medium" icon="plus" on:click={() => showUploader = true}>
              New Floor Plan
            </Button>
          {/if}
        </div>
      {/if}
    </div>

    {#if !selectedPlan && !showBuildingOverview}
      <div class="flex space-x-2 border-b border-slate-600">
        <button
          class="px-4 py-2 transition-colors {activeTab === 'plans'
            ? 'border-b-2 border-purple-500 text-white font-semibold'
            : 'text-gray-400 hover:text-white'}"
          on:click={() => switchTab('plans')}
        >
          <span class="flex items-center space-x-2">
            <span>🗺</span>
            <span>Plans</span>
            <span class="text-xs text-gray-500">({plans.length})</span>
          </span>
        </button>

        <button
          class="px-4 py-2 transition-colors {activeTab === 'inspections'
            ? 'border-b-2 border-purple-500 text-white font-semibold'
            : 'text-gray-400 hover:text-white'}"
          on:click={() => switchTab('inspections')}
        >
          <span class="flex items-center space-x-2">
            <span>✓</span>
            <span>Inspections</span>
          </span>
        </button>
      </div>
    {/if}
  </div>

  {#if activeTab === 'plans'}
    {#if loading}
      <div class="text-center py-12">
        <Icon name="loading" size={12} className="animate-spin mx-auto mb-4 text-purple-400" />
        <p class="text-gray-400">Loading floor plans…</p>
      </div>

    {:else if showBuildingOverview}
      <BuildingOverview
        {plans}
        on:planUpdated={handlePlanUpdated}
      />

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

  {:else if activeTab === 'inspections'}
    <WalkInspectionsTab {isAdmin} />
  {/if}

</div>

{#if showUploader}
  <PlanUploader
    on:close={() => showUploader = false}
    on:created={handlePlanCreated}
  />
{/if}

{#if showPlanReport && plans.length > 0}
  <PlansReport
    {plans}
    contextSource="building"
    contextPlanId={null}
    initialFilters={null}
    on:close={() => showPlanReport = false}
  />
{/if}
