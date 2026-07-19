<!-- src/lib/apps/inspection/components/common/WalkStatsBars.svelte -->
<!-- Row 1: TOTAL / INSPECTED / REMAINING in light blue. -->
<!-- Row 2: PASS / FAIL / PROBLEM / INACTIVE always all four on one line. -->
<!-- compact: both rows collapse to a single short line — for the walk card, -->
<!-- where the component itself must win the screen. The review screens (close -->
<!-- sheet, session summary) keep the full-size stats. -->
<script>
  export let total        = 0;
  export let inspected    = 0;
  export let passCount    = 0;
  export let failCount    = 0;
  export let problemCount = 0;
  export let inactiveCount = 0;
  export let noAccessCount = 0;
  export let compact      = false;

  $: remaining = Math.max(0, total - inspected);
  // Compact (walk card) is already tight at phone width — only spend a column on
  // no-access once there is one. The full bars always show it.
  $: showNoAccess = !compact || noAccessCount > 0;
</script>

{#if compact}
  <div class="stats-bar stats-compact">
    <div class="stat stat-blue">
      <span class="stat-v">{inspected}</span><span class="stat-k">DONE</span>
    </div>
    <div class="stat stat-blue">
      <span class="stat-v">{remaining}</span><span class="stat-k">LEFT</span>
    </div>
    <div class="stat-div"></div>
    <div class="stat stat-pass">
      <span class="stat-v">{passCount}</span><span class="stat-k">PASS</span>
    </div>
    <div class="stat stat-fail">
      <span class="stat-v">{failCount}</span><span class="stat-k">FAIL</span>
    </div>
    <div class="stat stat-repair">
      <span class="stat-v">{problemCount}</span><span class="stat-k">PROB</span>
    </div>
    <div class="stat stat-na">
      <span class="stat-v">{inactiveCount}</span><span class="stat-k">N/A</span>
    </div>
    {#if showNoAccess}
      <div class="stat stat-noacc">
        <span class="stat-v">{noAccessCount}</span><span class="stat-k">NO ACC</span>
      </div>
    {/if}
  </div>
{:else}
  <!-- Row 1: totals in light blue -->
  <div class="stats-bar stats-totals">
    <div class="stat stat-blue">
      <div class="stat-v">{total}</div>
      <div class="stat-k">TOTAL</div>
    </div>
    <div class="stat-div"></div>
    <div class="stat stat-blue">
      <div class="stat-v">{inspected}</div>
      <div class="stat-k">INSPECTED</div>
    </div>
    <div class="stat-div"></div>
    <div class="stat stat-blue">
      <div class="stat-v">{remaining}</div>
      <div class="stat-k">REMAINING</div>
    </div>
  </div>

  <!-- Row 2: result counts — always all four on one line -->
  <div class="stats-bar stats-results">
    <div class="stat stat-pass">
      <div class="stat-v">{passCount}</div>
      <div class="stat-k">PASS</div>
    </div>
    <div class="stat-div"></div>
    <div class="stat stat-fail">
      <div class="stat-v">{failCount}</div>
      <div class="stat-k">FAIL</div>
    </div>
    <div class="stat-div"></div>
    <div class="stat stat-repair">
      <div class="stat-v">{problemCount}</div>
      <div class="stat-k">PROBLEM</div>
    </div>
    <div class="stat-div"></div>
    <div class="stat stat-na">
      <div class="stat-v">{inactiveCount}</div>
      <div class="stat-k">INACTIVE</div>
    </div>
    <div class="stat-div"></div>
    <div class="stat stat-noacc">
      <div class="stat-v">{noAccessCount}</div>
      <div class="stat-k">NO ACCESS</div>
    </div>
  </div>
{/if}

<style>
  .stats-bar {
    display: flex; align-items: center;
    padding: 0.875rem 1.25rem; background: #111122;
  }
  .stats-totals  { border-bottom: 1px solid #1e2a3a; }
  .stats-results { border-bottom: 1px solid #2e2e42; }

  .stat { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.2rem; }
  .stat-v { font-size: 1.85rem; font-weight: 800; line-height: 1; }
  .stat-k { font-size: 0.55rem; letter-spacing: 0.15em; }

  /* -- Compact (walk card): one line, value and label side by side ---------- */
  .stats-compact { padding: 0.4rem 0.75rem; gap: 0.1rem; border-bottom: 1px solid #2e2e42; }
  .stats-compact .stat   { flex-direction: row; align-items: baseline; gap: 0.2rem; }
  .stats-compact .stat-v { font-size: 0.95rem; font-weight: 800; }
  .stats-compact .stat-k { font-size: 0.5rem; letter-spacing: 0.08em; }
  .stats-compact .stat-div { height: 1rem; }

  .stat-blue .stat-v { color: #93c5fd; }
  .stat-blue .stat-k { color: #60a5fa; }

  .stat-pass   .stat-v { color: #4ade80; }
  .stat-pass   .stat-k { color: #86efac; }
  .stat-fail   .stat-v { color: #f87171; }
  .stat-fail   .stat-k { color: #fca5a5; }
  .stat-repair .stat-v { color: #fb923c; }
  .stat-repair .stat-k { color: #fdba74; }
  .stat-na     .stat-v { color: #aaa; }
  .stat-na     .stat-k { color: #888; }
  .stat-noacc  .stat-v { color: #c4b5fd; }
  .stat-noacc  .stat-k { color: #a78bfa; }

  .stat-div { width: 1px; height: 2.5rem; background: #2e2e42; flex-shrink: 0; }
</style>
