<!-- src/lib/apps/walk/components/FloorNavigator.svelte -->
<!-- NEW: Quick floor navigation for building-wide sessions -->
<script>
  import { walkStore } from '../stores/walkStore';
  import { getFloorLevelLabel } from '$lib/utils/planConstants';
  
  export let show = false;
  
  $: buildingPlans = $walkStore.buildingPlans;
  $: floorProgress = $walkStore.floorProgress;
  $: currentFloor = $walkStore.currentFloor;
  
  function handleFloorSelect(floorLevel) {
    walkStore.goToFloor(floorLevel);
    show = false;
  }
</script>

{#if show}
  <div class="overlay" on:click={() => show = false}></div>
  <div class="floor-navigator">
    <div class="nav-header">
      <span class="nav-title">FLOOR NAVIGATION</span>
      <button class="close-btn" on:click={() => show = false}>✕</button>
    </div>
    
    <div class="floor-list">
      {#each buildingPlans as plan}
        {@const progress = floorProgress[plan.floor_level]}
        {@const percentage = progress.total > 0 ? Math.round((progress.inspected / progress.total) * 100) : 0}
        {@const isComplete = progress.inspected === progress.total && progress.total > 0}
        {@const isCurrent = currentFloor === plan.floor_level}
        
        <button 
          class="floor-item"
          class:current={isCurrent}
          class:complete={isComplete}
          on:click={() => handleFloorSelect(plan.floor_level)}>
          <div class="floor-info">
            <span class="floor-label">{getFloorLevelLabel(plan.floor_level)}</span>
            <span class="floor-count">({progress.inspected}/{progress.total})</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: {percentage}%"
                 class:complete={isComplete}></div>
          </div>
          <div class="floor-status">
            {#if isComplete}
              <span class="complete-badge">✓</span>
            {:else if isCurrent}
              <span class="current-badge">▶</span>
            {:else}
              <span class="percent-badge">{percentage}%</span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 1000;
  }
  
  .floor-navigator {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #111122;
    border: 2px solid #2e2e42;
    border-radius: 12px;
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    z-index: 1001;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  }
  
  .nav-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #2e2e42;
  }
  
  .nav-title {
    font-size: 0.7rem;
    letter-spacing: 0.25em;
    color: #fb923c;
    font-weight: 700;
  }
  
  .close-btn {
    background: none;
    border: none;
    color: #ccc;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .close-btn:hover { color: #fff; }
  
  .floor-list {
    padding: 1rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .floor-item {
    background: #1a1a2e;
    border: 2px solid #2e2e48;
    border-radius: 10px;
    padding: 1rem;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: all 0.15s;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .floor-item:hover { border-color: #4e4e78; background: #1e1e38; }
  .floor-item.current { border-color: #fb923c; background: #2a1800; }
  .floor-item.complete { border-color: #22c55e; }
  
  .floor-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .floor-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: #f0f0f0;
  }
  
  .floor-count {
    font-size: 0.8rem;
    color: #ccc;
  }
  
  .progress-bar {
    height: 6px;
    background: #2e2e48;
    border-radius: 3px;
    overflow: hidden;
  }
  
  .progress-fill {
    height: 100%;
    background: #fb923c;
    transition: width 0.3s ease;
  }
  .progress-fill.complete { background: #22c55e; }
  
  .floor-status {
    display: flex;
    justify-content: flex-end;
  }
  
  .complete-badge {
    color: #22c55e;
    font-size: 1.2rem;
    font-weight: 700;
  }
  
  .current-badge {
    color: #fb923c;
    font-size: 1rem;
  }
  
  .percent-badge {
    font-size: 0.75rem;
    color: #999;
  }
</style>
