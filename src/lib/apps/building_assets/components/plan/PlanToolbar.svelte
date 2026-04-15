<!-- plan/PlanToolbar.svelte -->
<!-- Floor / plan pickers, mode toggle, scale indicator, stats.
     All state is owned by PlanViewTab; this component is purely presentational.
     Search has moved to FilterSidebar. -->
<script>
  import { createEventDispatcher } from 'svelte';

  export let floors             = [];
  export let plansForFloor      = [];
  export let selectedFloorId    = '';
  export let selectedPlanId     = '';
  // drawingMode: 'off' | 'component' | 'space' | 'scale' | 'annotation'
  export let drawingMode        = 'off';
  export let planComponents     = [];
  export let visibleComponents  = [];
  export let planSpaces         = [];
  export let unplacedComponents = [];
  export let hasScale           = false;
  export let metresPerUnit      = null;
  export let showPlanAdmin      = false;  // true when current user is admin
  export let hasPlan            = false;  // true when a plan is currently selected
  export let readOnly           = false;

  const dispatch = createEventDispatcher();

  // Plan admin dropdown
  let adminOpen = false;
  function adminAction(mode) { adminOpen = false; dispatch('planadmin', { mode }); }

  const MODES = [
    { mode: 'off',        label: '👁 View',        title: 'View only',                           activeClass: 'bg-slate-600'  },
    { mode: 'component',  label: '✏️ Edit',         title: 'Place and reposition components',     activeClass: 'bg-amber-600'  },
    { mode: 'space',      label: '⬡ Spaces',       title: 'Draw space polygons',                 activeClass: 'bg-purple-700' },
    { mode: 'scale',      label: '📏 Scale',        title: 'Set scale reference for measurement', activeClass: 'bg-teal-700'   },
    { mode: 'annotation', label: '🏷 Annotate',      title: 'Place text annotations on the plan',  activeClass: 'bg-sky-700'    },
  ];

</script>

<!-- ── Row 1: Navigation + modes + stats ───────────────────────────── -->
<div class="flex items-center gap-3 flex-wrap">

  <!-- Floor picker -->
  <div class="flex items-center gap-2">
    <span class="text-sm text-slate-400">Floor:</span>
    <select
      value={selectedFloorId}
      on:change={e => dispatch('floorchange', { floorId: e.target.value })}
      class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
             focus:outline-none focus:border-purple-500 min-w-[9rem]"
    >
      <option value="">Select floor…</option>
      {#each floors as f (f.id)}
        <option value={f.id}>{f.name} ({f.short_name})</option>
      {/each}
    </select>
  </div>

  <!-- Plan picker (only when >1 plan for this floor) -->
  {#if plansForFloor.length > 1}
    <div class="flex items-center gap-2">
      <span class="text-sm text-slate-400">Plan:</span>
      <select
        value={selectedPlanId}
        on:change={e => dispatch('planchange', { planId: e.target.value })}
        class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
               focus:outline-none focus:border-purple-500"
      >
        {#each plansForFloor as p (p.id)}
          <option value={p.id}>{p.name ?? p.building}</option>
        {/each}
      </select>
    </div>
  {/if}

  <!-- 4-way mode toggle -->
  <div class="flex rounded-lg overflow-hidden border border-slate-600 text-sm shrink-0">
    {#each (readOnly ? MODES.filter(m => m.mode === 'off') : MODES) as btn, i (btn.mode)}
      <button
        on:click={() => dispatch('modechange', { mode: btn.mode })}
        title={btn.title}
        class="px-3 py-1.5 transition-colors
               {i > 0 ? 'border-l border-slate-600' : ''}
               {drawingMode === btn.mode
                 ? btn.activeClass + ' text-white font-medium'
                 : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}"
      >{btn.label}</button>
    {/each}
  </div>

  <!-- Scale indicator -->
  {#if hasScale && metresPerUnit}
    <div
      class="flex items-center gap-1.5 text-xs text-teal-400/80 shrink-0"
      title="Scale calibrated — space measurements available"
    >
      <span>📏</span>
      <span class="font-mono">{(1 / metresPerUnit).toFixed(2)} u/m</span>
      <button
        on:click={() => dispatch('clearscale')}
        class="text-teal-700 hover:text-teal-500 transition-colors ml-0.5"
        title="Remove scale calibration"
      >✕</button>
    </div>
  {/if}

  <!-- Plan Admin dropdown (admin-only) -->
  {#if showPlanAdmin}
    <div class="relative shrink-0">
      <button
        on:click={() => adminOpen = !adminOpen}
        class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg
               bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600
               transition-colors"
      >
        ⚙ Plan Admin
        <span class="text-slate-500 text-[10px]">{adminOpen ? '▲' : '▼'}</span>
      </button>

      {#if adminOpen}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="absolute left-0 top-full mt-1 z-50 min-w-[10rem]
                 bg-slate-800 border border-slate-600 rounded-lg shadow-xl
                 flex flex-col py-1 text-xs"
          on:mouseleave={() => adminOpen = false}
        >
          <button
            on:click={() => adminAction('new')}
            class="flex items-center gap-2 px-3 py-2 text-left text-slate-300
                   hover:bg-slate-700 transition-colors"
          >
            <span class="w-4 text-center">⊕</span> New Plan
          </button>
          {#if hasPlan}
            <button
              on:click={() => adminAction('edit')}
              class="flex items-center gap-2 px-3 py-2 text-left text-slate-300
                     hover:bg-slate-700 transition-colors"
            >
              <span class="w-4 text-center">✎</span> Edit Info / Image
            </button>
            <button
              on:click={() => adminAction('copy')}
              class="flex items-center gap-2 px-3 py-2 text-left text-slate-300
                     hover:bg-slate-700 transition-colors"
            >
              <span class="w-4 text-center">⎘</span> Copy Plan
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Stats (right-aligned) -->
  <div class="ml-auto flex items-center gap-3 text-xs text-slate-500">
    {#if planComponents.length > 0}
      <span>
        {visibleComponents.length}{#if visibleComponents.length !== planComponents.length}
          <span class="text-slate-600"> / {planComponents.length}</span>
        {/if}
        {' '}components
      </span>
    {/if}
    {#if planSpaces.length > 0}
      <span class="text-purple-400">
        {planSpaces.length} space{planSpaces.length !== 1 ? 's' : ''}
      </span>
    {/if}
    {#if unplacedComponents.length > 0}
      <span class="text-amber-400 font-medium">{unplacedComponents.length} unplaced</span>
    {/if}
  </div>

</div>


