<!-- src/lib/apps/maintenance/components/StatsBar.svelte -->
<!-- Summary counts bar: Overdue / Due Soon / Scheduled / Completed -->
<script>
  export let jobs = [];

  $: overdue   = jobs.filter(j => j.rag === 'overdue').length;
  $: dueSoon   = jobs.filter(j => j.rag === 'due_soon').length;
  $: scheduled = jobs.filter(j => j.rag === 'scheduled' || j.rag === 'in_progress').length;
  $: completed = jobs.filter(j => j.rag === 'completed').length;
</script>

<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">

  <div class="stat-card border-red-800/40 bg-red-900/10">
    <div class="stat-dot bg-red-500"></div>
    <div>
      <div class="stat-num text-red-300">{overdue}</div>
      <div class="stat-label">Overdue</div>
    </div>
  </div>

  <div class="stat-card border-amber-800/40 bg-amber-900/10">
    <div class="stat-dot bg-amber-400"></div>
    <div>
      <div class="stat-num text-amber-300">{dueSoon}</div>
      <div class="stat-label">Due within 30 days</div>
    </div>
  </div>

  <div class="stat-card border-green-800/40 bg-green-900/10">
    <div class="stat-dot bg-green-500"></div>
    <div>
      <div class="stat-num text-green-300">{scheduled}</div>
      <div class="stat-label">Scheduled</div>
    </div>
  </div>

  <div class="stat-card border-slate-700 bg-slate-800/30">
    <div class="stat-dot bg-slate-400"></div>
    <div>
      <div class="stat-num text-slate-300">{completed}</div>
      <div class="stat-label">Completed</div>
    </div>
  </div>

</div>

<style>
  .stat-card {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.875rem 1rem; border-radius: 10px;
    border: 1px solid;
  }
  .stat-dot   { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .stat-num   { font-size: 1.5rem; font-weight: 700; line-height: 1; }
  .stat-label { font-size: 0.7rem; color: rgb(148 163 184); margin-top: 0.2rem; }
</style>
