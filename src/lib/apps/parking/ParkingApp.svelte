<!-- src/lib/apps/parking/ParkingApp.svelte -->
<!-- Parking — the basement bays and, from P1, who holds them.
     Design: docs/requirements/unbuilt/Parking_App_Design.md.

     P0 (this): the bay register. Every Parking bay drawn in Building Assets,
     on its plan, coloured by state, with the facts the drawing cannot hold:
     how the bay is held, whether it is in use, accessible, tandem, residents
     only, headroom. NO PERSONAL DATA yet — holders, agreements, vehicles and
     the waiting list are P1–P3.

     Granted per user on Admin → Users. Admins bypass grants. Every parking
     table's RLS is gated on the grant too, so the gate below is the screen's
     courtesy, not the control. -->
<script>
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { parkingStore } from './stores/parkingStore.js';
  import { filterBays, baySummary, BAY_STATES } from './utils/bayModel.js';
  import { PARKING_BAY_TYPES } from '$lib/apps/building_assets/utils/spaceTypeOptions.js';

  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import ErrorDisplay   from '$lib/components/common/ErrorDisplay.svelte';
  import BayMap   from './components/BayMap.svelte';
  import BayList  from './components/BayList.svelte';
  import BayPanel from './components/BayPanel.svelte';

  $: state = $parkingStore;
  $: isAdmin = $permissions.isAdmin;
  $: hasAccess = isAdmin || !!$permissions.appPermissions?.parking?.hasAccess;
  $: canEdit = isAdmin || $permissions.canModify;

  // Nothing is decided until the check has run, or an admin sees "no access"
  // for a moment on every open — the flash fixed in ComplianceApp (0bafc45).
  let permissionsChecked = false;
  let loaded = false;

  let floorId = '';          // the level shown on the map; '' until chosen
  let size = '';
  let bayState = '';
  let q = '';
  let selectedSpaceId = null;

  // Levels that have bays, in building order — the map only offers these.
  $: levels = state.floors.filter(f => state.bays.some(b => b.floor_id === f.id));
  $: if (!floorId && levels.length) floorId = levels[0].id;

  $: onLevel = state.bays.filter(b => b.floor_id === floorId);
  $: shown = filterBays(onLevel, { size, state: bayState, q });
  $: summary = baySummary(onLevel);
  $: plan = (() => {
    const ids = new Set(onLevel.map(b => b.plan_id));
    return state.plans.find(p => ids.has(p.id)) ?? state.plans.find(p => p.floor_id === floorId) ?? null;
  })();
  $: selected = state.bays.find(b => b.space_id === selectedSpaceId) ?? null;

  onMount(async () => {
    try {
      if ($auth.user) await permissions.init($auth.user.id, 'parking');
    } finally {
      permissionsChecked = true;
    }
    // Read the store itself, not the `hasAccess` derivation: straight after
    // an await, a $: statement may not have caught up yet.
    if ($permissions.isAdmin || $permissions.appPermissions?.parking?.hasAccess) {
      try { await parkingStore.load(); } catch { /* shown from state.error */ }
      loaded = true;
    }
  });

  function select(e) { selectedSpaceId = e.detail; }
  function chooseLevel(id) { floorId = id; selectedSpaceId = null; }
</script>

<div class="space-y-4">
  <div>
    <h2 class="heading-page">Parking</h2>
    <p class="text-muted">The basement bays: where they are, what size they are, and whether each can be allocated.</p>
  </div>

  {#if !hasAccess && !permissionsChecked}
    <LoadingSpinner />
  {:else if !hasAccess}
    <p class="text-sm text-slate-400">You do not have access to Parking. An administrator can grant it under Admin → Users.</p>
  {:else if state.loading && !loaded}
    <LoadingSpinner />
  {:else}
    {#if state.error}<ErrorDisplay message={state.error} />{/if}

    {#if state.bays.length === 0 && loaded}
      <div class="bg-slate-800/60 border border-slate-700 rounded-xl p-4 text-sm text-slate-300">
        No parking bays are drawn yet. Draw each bay in <strong>Building Assets → Plan View</strong>
        as a <strong>Parking bay</strong>, give it a number and a size, and it appears here.
      </div>
    {:else}
      <!-- Level -->
      <div class="flex flex-wrap items-center gap-2">
        {#each levels as f (f.id)}
          <button
            class="px-3 py-1.5 rounded text-sm border transition-colors
                   {f.id === floorId ? 'bg-purple-600 border-purple-500 text-white' : 'border-slate-600 text-slate-300 hover:bg-slate-700'}"
            on:click={() => chooseLevel(f.id)}
          >{f.name} <span class="opacity-70">({state.bays.filter(b => b.floor_id === f.id).length})</span></button>
        {/each}
      </div>

      <!-- Summary: what is on this level, and the two setup gaps -->
      <p class="text-sm text-slate-400" data-testid="bay-summary">
        {summary.total} {summary.total === 1 ? 'bay' : 'bays'}
        {#each BAY_STATES as s}{#if summary.byState[s.value]} · {summary.byState[s.value]} {s.label.toLowerCase()}{/if}{/each}
        {#if summary.unsized}<span class="text-amber-400"> · {summary.unsized} without a size</span>{/if}
        {#if summary.unnumbered}<span class="text-amber-400"> · {summary.unnumbered} without a number</span>{/if}
      </p>

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-2">
        <input bind:value={q} placeholder="Search bay, flat, note…"
          class="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 w-56" />
        <select bind:value={size} class="px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200">
          <option value="">Any size</option>
          {#each PARKING_BAY_TYPES as t}<option value={t}>{t}</option>{/each}
          <option value="__none">Size not set</option>
        </select>
        <select bind:value={bayState} class="px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200">
          <option value="">Any state</option>
          {#each BAY_STATES as s}<option value={s.value}>{s.label}</option>{/each}
        </select>
      </div>

      <div class="grid gap-4 {selected ? 'lg:grid-cols-[1fr_22rem]' : ''}">
        <div class="space-y-4 min-w-0">
          <BayMap {plan} bays={shown} {selectedSpaceId} on:select={select} />
          <!-- Legend -->
          <div class="flex flex-wrap gap-3 text-xs text-slate-400">
            {#each BAY_STATES as s}
              <span class="inline-flex items-center gap-1.5">
                <span class="w-3 h-3 rounded-sm" style="background:{s.colour}"></span>{s.label}
              </span>
            {/each}
          </div>
          <BayList bays={shown} {selectedSpaceId} on:select={select} />
        </div>
        {#if selected}
          <BayPanel bay={selected} {canEdit} on:close={() => selectedSpaceId = null} />
        {/if}
      </div>
    {/if}
  {/if}
</div>
