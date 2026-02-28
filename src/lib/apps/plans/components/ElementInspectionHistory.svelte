<!-- src/lib/apps/plans/components/ElementInspectionHistory.svelte -->
<!-- NEW: Inspection history tab for ElementModal -->
<script>
  import { onMount } from 'svelte';
  import { walkStore } from '$lib/apps/walk/stores/walkStore';
  import { formatDateTime, formatRelativeTime } from '$lib/utils/dates';
  
  export let elementId;
  
  let history = [];
  let loading = true;
  let error = null;
  
  onMount(async () => {
    try {
      history = await walkStore.loadElementInspectionHistory(elementId);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });
  
  function getResultClass(result) {
    return result === 'pass' ? 'pass' : result === 'fail' ? 'fail' : 'na';
  }
  
  function getResultLabel(result) {
    return result === 'pass' ? '✓ PASS' : result === 'fail' ? '✗ FAIL' : '— N/A';
  }
</script>

<div class="inspection-history">
  <div class="history-header">
    <h3>📋 Inspection History</h3>
  </div>
  
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Loading inspection history...</span>
    </div>
  {:else if error}
    <div class="error-state">
      <span>⚠ Error loading history: {error}</span>
    </div>
  {:else if history.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <p>No inspections recorded yet</p>
      <p class="empty-hint">This element will appear here after its first walk inspection</p>
    </div>
  {:else}
    <div class="history-list">
      {#each history as insp, i}
        <div class="history-item" class:failed={insp.inspection_result === 'fail'}>
          <div class="insp-header">
            <div class="insp-date-row">
              <span class="insp-date">{formatDateTime(insp.inspected_at)}</span>
              <span class="insp-relative">({formatRelativeTime(insp.inspected_at)})</span>
            </div>
            <span class="insp-result {getResultClass(insp.inspection_result)}">
              {getResultLabel(insp.inspection_result)}
            </span>
          </div>
          
          <div class="insp-body">
            <div class="insp-inspector">
              <span class="label">Inspector:</span>
              <span class="value">{insp.inspector?.full_name || 'Unknown'}</span>
            </div>
            
            {#if insp.session}
              <div class="insp-session">
                <span class="label">Session:</span>
                <span class="value">{insp.session.session_name || insp.session.building_name || 'Walk Session'}</span>
              </div>
            {/if}
            
            {#if insp.inspector_notes}
              <div class="insp-notes">
                <span class="label">Notes:</span>
                <div class="notes-text">{insp.inspector_notes}</div>
              </div>
            {/if}
            
            {#if insp.photo_url}
              <div class="insp-photo">
                <img src={insp.photo_url} alt="Inspection photo" />
              </div>
            {/if}
          </div>
        </div>
        
        {#if i < history.length - 1}
          <div class="history-divider"></div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .inspection-history {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }
  
  .history-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #f0f0f0;
  }
  
  .loading-state, .error-state, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.5rem;
    text-align: center;
    color: #999;
  }
  
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #2e2e42;
    border-top-color: #fb923c;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 1rem;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .error-state { color: #fca5a5; }
  
  .empty-icon { font-size: 3rem; margin-bottom: 1rem; opacity: 0.5; }
  .empty-hint { font-size: 0.85rem; color: #666; margin-top: 0.5rem; }
  
  .history-list {
    display: flex;
    flex-direction: column;
  }
  
  .history-item {
    background: #1a1a2e;
    border: 2px solid #2e2e48;
    border-radius: 10px;
    padding: 1rem;
    transition: border-color 0.15s;
  }
  
  .history-item.failed {
    border-color: #ef4444;
    background: #2a0000;
  }
  
  .history-divider {
    height: 1px;
    background: #2e2e42;
    margin: 0.75rem 0;
  }
  
  .insp-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.75rem;
  }
  
  .insp-date-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .insp-date {
    font-size: 0.9rem;
    font-weight: 600;
    color: #f0f0f0;
  }
  
  .insp-relative {
    font-size: 0.75rem;
    color: #999;
  }
  
  .insp-result {
    font-size: 0.85rem;
    font-weight: 700;
    padding: 0.4rem 0.75rem;
    border-radius: 6px;
  }
  
  .insp-result.pass {
    background: #0f1f14;
    color: #22c55e;
  }
  
  .insp-result.fail {
    background: #2a0000;
    color: #ef4444;
  }
  
  .insp-result.na {
    background: #1a1a2e;
    color: #999;
  }
  
  .insp-body {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  
  .insp-inspector, .insp-session {
    display: flex;
    gap: 0.5rem;
    font-size: 0.85rem;
  }
  
  .label {
    color: #999;
    font-weight: 600;
  }
  
  .value {
    color: #f0f0f0;
  }
  
  .insp-notes {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  
  .notes-text {
    background: #111122;
    padding: 0.75rem;
    border-radius: 6px;
    color: #ccc;
    font-size: 0.85rem;
    line-height: 1.5;
  }
  
  .insp-photo {
    margin-top: 0.5rem;
  }
  
  .insp-photo img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    border: 2px solid #2e2e42;
  }
</style>
