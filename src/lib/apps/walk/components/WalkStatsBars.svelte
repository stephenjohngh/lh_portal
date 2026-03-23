<!-- src/lib/apps/walk/components/WalkStatsBars.svelte -->
<!-- Shared two-row stats display used by WalkSession (live) and WalkSessionSummary (closed). -->
<!-- Row 1: TOTAL / INSPECTED / REMAINING in light blue.                                     -->
<!-- Row 2: PASS / FAIL / PROBLEM (orange box) / INACTIVE always all four.                   -->
<script>
  export let total      = 0;
  export let inspected  = 0;
  export let passCount  = 0;
  export let failCount  = 0;
  export let problemCount = 0;
  export let inactiveCount = 0;

  $: remaining = Math.max(0, total - inspected);
</script>

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
</div>

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

  /* Blue row */
  .stat-blue .stat-v { color: #93c5fd; }
  .stat-blue .stat-k { color: #60a5fa; }

  /* Result row */
  .stat-pass .stat-v { color: #4ade80; }
  .stat-pass .stat-k { color: #86efac; }
  .stat-fail .stat-v { color: #fb7171; }
  .stat-fail .stat-k { color: #fda5a5; }
  .stat-na   .stat-v { color: #aaa; }
  .stat-na   .stat-k { color: #888; }

  .stat-repair .stat-v { color: #fb923c; }
  .stat-repair .stat-k { color: #fdba74; }

  .stat-div { width: 1px; height: 2.5rem; background: #2e2e42; flex-shrink: 0; }
</style>
