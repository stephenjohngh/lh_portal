<!-- src/lib/apps/plans/components/FailedElementsWidget.svelte -->
<!-- NEW: Dashboard widget showing failed elements from walk inspections -->
<script>
  import { onMount } from 'svelte';
  import { walkStore } from '$lib/apps/walk/stores/walkStore';
  import { formatRelativeTime } from '$lib/utils/dates';
  import { getElementTypeIcon } from '$lib/utils/planConstants';
  
  export let building = null; // Optional: filter by building
  
  let failedElements = [];
  let loading = true;
  
  onMount(async () => {
    failedElements = await walkStore.getFailedElements(building);
    loading = false;
  });
  
  $: highPriority = failedElements.filter(el => 
    el.element_type === 'light' && (el.subtype === 'Exit' || el.emergency) ||
    el.element_type === 'fire_control'
  );
  
  $: mediumPriority = failedElements.filter(el => !highPriority.includes(el));
  
  function viewElement(elementId) {
    // Navigate to Plans app and open element modal
    window.location.href = `/app?view=plans&element=${elementId}`;
  }
  
  function scheduleReInspection() {
    // Navigate to Walk app to start new session
    window.location.href = `/app?view=walk&action=start`;
  }
</script>

<div class="widget failed-elements">
  <div class="widget-header">
    <h3>⚠️ Failed Elements</h3>
    {#if !loading}
      <span class="count-badge">{failedElements.length}</span>
    {/if}
  </div>
  
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading...</span>
    </div>
  {:else if failedElements.length === 0}
    <div class="success-state">
      <div class="success-icon">✓</div>
      <p>All elements passing inspections</p>
    </div>
  {:else}
    <div class="failed-sections">
      {#if highPriority.length > 0}
        <div class="priority-section">
          <div class="section-header high">
            <span class="priority-label">HIGH PRIORITY</span>
            <span class="priority-count">({highPriority.length})</span>
          </div>
          <div class="element-list">
            {#each highPriority.slice(0, 3) as el}
              <button class="failed-item high" on:click={() => viewElement(el.id)}>
                <div class="element-icon">{getElementTypeIcon(el.element_type)}</div>
                <div class="element-info">
                  <div class="element-name">{el.floor_level}/{el.asset_id}</div>
                  <div class="element-issue">{el.inspector_notes || 'No details provided'}</div>
                  <div class="element-meta">
                    <span class="building">{el.building}</span>
                    <span class="separator">•</span>
                    <span class="age">{formatRelativeTime(el.status_set_at)}</span>
                  </div>
                </div>
              </button>
            {/each}
            {#if highPriority.length > 3}
              <div class="more-count">+ {highPriority.length - 3} more high priority</div>
            {/if}
          </div>
        </div>
      {/if}
      
      {#if mediumPriority.length > 0}
        <div class="priority-section">
          <div class="section-header medium">
            <span class="priority-label">MEDIUM PRIORITY</span>
            <span class="priority-count">({mediumPriority.length})</span>
          </div>
          <div class="element-list">
            {#each mediumPriority.slice(0, 3) as el}
              <button class="failed-item medium" on:click={() => viewElement(el.id)}>
                <div class="element-icon">{getElementTypeIcon(el.element_type)}</div>
                <div class="element-info">
                  <div class="element-name">{el.floor_level}/{el.asset_id}</div>
                  <div class="element-issue">{el.inspector_notes || 'Requires attention'}</div>
                  <div class="element-meta">
                    <span class="building">{el.building}</span>
                    <span class="separator">•</span>
                    <span class="age">{formatRelativeTime(el.status_set_at)}</span>
                  </div>
                </div>
              </button>
            {/each}
            {#if mediumPriority.length > 3}
              <div class="more-count">+ {mediumPriority.length - 3} more medium priority</div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
    
    <button class="action-btn" on:click={scheduleReInspection}>
      📋 Schedule Re-Inspection
    </button>
  {/if}
</div>

<style>
  .widget {
    background: #1a1a2e;
    border: 2px solid #2e2e48;
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .widget-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .widget-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #f0f0f0;
  }
  
  .count-badge {
    background: #ef4444;
    color: #fff;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.85rem;
    font-weight: 700;
  }
  
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 2rem;
    color: #999;
  }
  
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #2e2e42;
    border-top-color: #fb923c;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .success-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem;
    text-align: center;
  }
  
  .success-icon {
    font-size: 3rem;
    color: #22c55e;
    margin-bottom: 0.75rem;
  }
  
  .success-state p {
    color: #22c55e;
    font-size: 0.9rem;
    margin: 0;
  }
  
  .failed-sections {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  
  .priority-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid;
  }
  
  .section-header.high {
    border-color: #ef4444;
  }
  
  .section-header.medium {
    border-color: #f97316;
  }
  
  .priority-label {
    font-size: 0.7rem;
    letter-spacing: 0.15em;
    font-weight: 700;
  }
  
  .section-header.high .priority-label {
    color: #ef4444;
  }
  
  .section-header.medium .priority-label {
    color: #f97316;
  }
  
  .priority-count {
    font-size: 0.75rem;
    color: #999;
  }
  
  .element-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .failed-item {
    display: flex;
    gap: 0.75rem;
    padding: 0.875rem;
    background: #111122;
    border: 2px solid;
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: all 0.15s;
  }
  
  .failed-item.high {
    border-color: #ef4444;
  }
  
  .failed-item.medium {
    border-color: #f97316;
  }
  
  .failed-item:hover {
    background: #1e1e38;
    transform: translateX(4px);
  }
  
  .element-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }
  
  .element-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  
  .element-name {
    font-size: 0.9rem;
    font-weight: 700;
    color: #f0f0f0;
  }
  
  .element-issue {
    font-size: 0.8rem;
    color: #ccc;
    line-height: 1.4;
  }
  
  .element-meta {
    display: flex;
    gap: 0.5rem;
    font-size: 0.72rem;
    color: #999;
  }
  
  .separator {
    color: #666;
  }
  
  .more-count {
    text-align: center;
    font-size: 0.8rem;
    color: #999;
    padding: 0.5rem;
  }
  
  .action-btn {
    padding: 0.875rem 1.25rem;
    background: #fb923c;
    border: none;
    border-radius: 8px;
    color: #0a0a0a;
    font-family: inherit;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
    margin-top: 0.5rem;
  }
  
  .action-btn:hover {
    background: #f97316;
  }
</style>
