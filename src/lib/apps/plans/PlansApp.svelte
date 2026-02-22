<!-- src/lib/apps/plans/PlansApp.svelte -->
<!-- Main Plans App - Interactive floor plan management -->
<script>
  import { onMount }            from 'svelte';
  import { getLogger }          from '$lib/utils/logger';
  import Button                 from '$lib/components/common/Button.svelte';
  import Icon                   from '$lib/components/icons/Icon.svelte';
  import Badge                  from '$lib/components/common/Badge.svelte';
  import PlansList              from './components/PlansList.svelte';
  import PlanViewer             from './components/PlanViewer.svelte';
  import PlanUploader           from './components/PlanUploader.svelte';
  import BuildingReport         from './components/BuildingReport.svelte';
  import WalkInspectionsModal   from './components/WalkInspectionsModal.svelte';
  import { plansStore }         from './stores/plansStore';
  import { permissions }        from '$lib/stores/permissions';
  import { auth }               from '$lib/stores/auth';

  const logger = getLogger('PlansApp');

  $: isAdmin = $permissions.isAdmin;
  $: canEdit = $permissions.isAdmin || $permissions.canModify;

  let showUploader          = false;
  let showBuildingReport    = false;
  let showWalkInspections   = false;
  let selectedPlanId        = null;
  let loading               = true;

  $: plans        = $plansStore.plans;
  $: selectedPlan = plans.find(p => p.id === selectedPlanId);

  $: buildingGroups = groupByBuilding(plans);
  $: buildingNames  = Object.keys(buildingGroups).sort();

  function groupByBuilding(ps) {
    return ps.reduce((acc, p) => {
      const b = p.building ?? 'Unknown';
      if (!acc[b]) acc[b] = [];
      acc[b].push(p);
      return acc;
    }, {});
  }

  let reportBuilding = null;

  function openBuildingReport(buildingName) {
    reportBuilding     = buildingName;
    showBuildingReport = true;
    logger('Opening building report for:', buildingName);
  }

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

  function handlePlanSelect(event)   { selectedPlanId = event.detail.planId; }
  function handleBackToList()        { selectedPlanId = null; }
  function handlePlanCreated(event)  { showUploader = false; selectedPlanId = event.detail.planId; loadPlans(); }
  function handleNewPlan()           { showUploader = true; }
  function handlePlanUpdated()       { loadPlans(); }
  function handlePlanDeleted()       { selectedPlanId = null; loadPlans(); }
  function handlePlanCopied(event)   { selectedPlanId = event.detail.planId; loadPlans(); }
</script>

<div class="text-white">

  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <div class="mb-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        {#if selectedPlan}
          <Button variant="secondary" size="small" icon="arrow-left" on:click={handleBackToList}>
            Back
          </Button>
        {/if}

        <Icon name="map" size={8} className="text-blue-400" />

        <div>
          <h1 class="text-2xl font-bold">
            {selectedPlan ? selectedPlan.name : 'Floor Plans'}
          </h1>
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

      <!-- List-level action buttons -->
      {#if !selectedPlan}
        <div class="flex items-center gap-2">

          <!-- Walk Inspections button — always shown at list level -->
          <Button
            variant="secondary"
            size="medium"
            icon="clipboard"
            on:click={() => showWalkInspections = true}
            disabled={loading}
          >
            Inspections
          </Button>

          <!-- Building report shortcut for single-building setup -->
          {#if buildingNames.length === 1}
            <Button
              variant="secondary"
              size="medium"
              icon="download"
              on:click={() => openBuildingReport(buildingNames[0])}
              disabled={loading || plans.length === 0}
            >
              Building Report
            </Button>
          {/if}

          {#if isAdmin}
            <Button variant="primary" size="medium" icon="plus" on:click={handleNewPlan}>
              New Floor Plan
            </Button>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- ── Main content ─────────────────────────────────────────────────────── -->
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
      {#if buildingNames.length > 1}
        {#each buildingNames as buildingName}
          <div class="mb-8">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-lg font-semibold text-gray-200">{buildingName}</h2>
              <Button
                variant="secondary"
                size="small"
                icon="download"
                on:click={() => openBuildingReport(buildingName)}
              >
                Building Report
              </Button>
            </div>
            <PlansList
              plans={buildingGroups[buildingName]}
              on:selectPlan={handlePlanSelect}
            />
          </div>
        {/each}
      {:else}
        <PlansList {plans} on:selectPlan={handlePlanSelect} />
      {/if}
    {/if}
  </div>

</div>

<!-- ── Modals ─────────────────────────────────────────────────────────────── -->

{#if showUploader}
  <PlanUploader
    on:close={() => showUploader = false}
    on:created={handlePlanCreated}
  />
{/if}

{#if showBuildingReport && reportBuilding}
  <BuildingReport
    building={reportBuilding}
    plans={buildingGroups[reportBuilding]}
    on:close={() => { showBuildingReport = false; reportBuilding = null; }}
  />
{/if}

{#if showWalkInspections}
  <WalkInspectionsModal
    show={showWalkInspections}
    on:close={() => showWalkInspections = false}
  />
{/if}
