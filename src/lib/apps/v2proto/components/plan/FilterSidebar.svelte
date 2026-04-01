<!-- plan/FilterSidebar.svelte -->
<!-- Default sidebar when no component/space is selected.
     Contains the search bar, system → type filter tree, status filter, and unplaced list.

     Filter model:
       hiddenTypes      — Set of type_codes to hide (exclusive)
       selectedStatuses — Set of statuses to SHOW (inclusive: empty = show all)
       searchQuery      — free-text match on label / asset_id / notes

     All state is owned by PlanViewTab; this component dispatches replacement
     values so PlanViewTab can assign them and trigger Svelte reactivity.       -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { typeByCode, systemById } from '../../lookups.js';
  import { STATUSES } from '../../ui.js';

  export let planComponents     = [];
  export let unplacedComponents = [];
  export let planSpaces         = [];
  export let types              = [];
  export let systems            = [];
  export let hiddenTypes        = new Set();
  // inclusive: empty = show all; non-empty = show only these statuses
  export let selectedStatuses   = new Set();
  export let searchQuery        = '';
  export let showSpaces         = true;
  export let selectedFloor      = null;
  export let drawingMode        = 'off';

  const dispatch = createEventDispatcher();

  // ── System → type groups (only types present on this plan) ────────
  $: systemGroups = (() => {
    const codesOnPlan = [...new Set(planComponents.map(c => c.type_code))];
    const typeObjs    = codesOnPlan
      .map(code => typeByCode(types, code))
      .filter(Boolean);

    const map = new Map();
    for (const t of typeObjs) {
      const sid = t.building_system_id ?? '__none__';
      if (!map.has(sid)) {
        map.set(sid, { system: systemById(systems, sid), types: [] });
      }
      map.get(sid).types.push(t);
    }

    return [...map.values()].sort((a, b) => {
      if (!a.system && !b.system) return 0;
      if (!a.system) return 1;
      if (!b.system) return -1;
      return (a.system.name ?? '').localeCompare(b.system.name ?? '');
    });
  })();

  function countForType(code) {
    return planComponents.filter(c => c.type_code === code).length;
  }

  // Count per status (of ALL on-plan components, ignoring current filters)
  // Normalise to lowercase so legacy 'OK' rows count correctly under the 'ok' bucket
  $: statusCounts = STATUSES.reduce((acc, s) => {
    acc[s.value] = planComponents.filter(c => (c.status || 'ok').toLowerCase() === s.value).length;
    return acc;
  }, {});

  // Recompute system checked/partial state whenever hiddenTypes changes.
  // Keyed by system id (or '__none__').
  $: systemStates = new Map(
    systemGroups.map(g => {
      const id          = g.system?.id ?? '__none__';
      const hiddenCount = g.types.filter(t => hiddenTypes.has(t.code)).length;
      return [id, {
        isChecked: hiddenCount === 0,
        isPartial: hiddenCount > 0 && hiddenCount < g.types.length,
      }];
    })
  );

  // ── Toggle helpers ────────────────────────────────────────────────
  // System: if all children visible → hide all; otherwise → show all.
  function toggleSystem(group) {
    const allVisible = group.types.every(t => !hiddenTypes.has(t.code));
    const newHidden  = new Set(hiddenTypes);
    for (const t of group.types) {
      if (allVisible) newHidden.add(t.code);
      else            newHidden.delete(t.code);
    }
    dispatch('changetypes', { hidden: newHidden });
  }

  // Type: toggle this type; system checkbox derives automatically from children.
  function toggleType(code) {
    const newHidden = new Set(hiddenTypes);
    if (newHidden.has(code)) newHidden.delete(code);
    else                     newHidden.add(code);
    dispatch('changetypes', { hidden: newHidden });
  }

  // Status: inclusive toggle — clicking a status adds/removes from the
  // "show only these" set. All empty = show everything.
  function toggleStatus(value) {
    const next = new Set(selectedStatuses);
    if (next.has(value)) next.delete(value);
    else                 next.add(value);
    dispatch('changestatuses', { selected: next });
  }

  function clearAll() {
    // Hide every type on the plan (all checkboxes off → nothing showing)
    const allCodes = systemGroups.flatMap(g => g.types.map(t => t.code));
    dispatch('changetypes',      { hidden: new Set(allCodes) });
    dispatch('changestatuses',   { selected: new Set() });
    dispatch('searchchange',     { query: '' });
    dispatch('changeshowspaces', { show: true });
  }
</script>

<div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">

  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700">
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Filters</p>
    <button
      on:click={clearAll}
      class="text-xs text-purple-400 hover:text-purple-300 transition-colors"
    >Clear all</button>
  </div>

  <div class="p-3 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">

    <!-- ── Search ─────────────────────────────────────────────────── -->
    <div class="relative">
      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm
                   select-none pointer-events-none">🔍</span>
      <input
        type="search"
        placeholder="label / asset / notes…"
        value={searchQuery}
        on:input={e => dispatch('searchchange', { query: e.target.value })}
        class="w-full pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded
               text-sm text-white placeholder-slate-500
               focus:outline-none focus:border-purple-500"
      />
    </div>

    <!-- ── System / Type tree ─────────────────────────────────────── -->
    {#if systemGroups.length === 0}
      <p class="text-xs text-slate-600 italic px-1">No components on this plan yet.</p>
    {:else}
      <div class="flex flex-col gap-2">
        {#each systemGroups as group (group.system?.id ?? '__none__')}
          {@const { isChecked, isPartial } = systemStates.get(group.system?.id ?? '__none__') ?? { isChecked: true, isPartial: false }}
          {@const sysCount  = group.types.reduce((n, t) => n + countForType(t.code), 0)}

          <!-- System row -->
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="flex items-center gap-2 cursor-pointer group/sys select-none"
            on:click={() => toggleSystem(group)}
          >
            <!-- Checkbox: checked=all visible, dash=partial, empty=all hidden -->
            <div class="w-4 h-4 rounded border flex items-center justify-center shrink-0
                        transition-colors
                        {isChecked  ? 'bg-purple-600 border-purple-500' :
                         isPartial  ? 'bg-purple-700 border-purple-500' :
                                      'bg-slate-700 border-slate-500'}">
              {#if isChecked}
                <svg class="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="currentColor" stroke-width="1.5"
                        stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {:else if isPartial}
                <div class="w-2 h-0.5 bg-white rounded"></div>
              {/if}
            </div>

            {#if group.system?.colour}
              <div class="w-2.5 h-2.5 rounded-full shrink-0"
                   style:background-color="#{group.system.colour}"></div>
            {/if}
            <span class="text-sm font-medium flex-1 truncate transition-colors
                         {!isChecked && !isPartial ? 'text-slate-600 line-through' : 'text-slate-200'}
                         group-hover/sys:text-white">
              {group.system?.name ?? 'Other'}
            </span>
            <span class="text-xs shrink-0
                         {!isChecked && !isPartial ? 'text-slate-700' : 'text-slate-500'}">{sysCount}</span>
          </div>

          <!-- Type rows (indented) -->
          <div class="ml-5 flex flex-col gap-1">
            {#each group.types as t (t.code)}
              {@const cnt        = countForType(t.code)}
              {@const typeHidden = hiddenTypes.has(t.code)}
              <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
              <div
                class="flex items-center gap-2 cursor-pointer group/type select-none"
                on:click|stopPropagation={() => toggleType(t.code)}
              >
                <div class="w-3.5 h-3.5 rounded border flex items-center justify-center
                            shrink-0 transition-colors
                            {typeHidden ? 'bg-slate-700 border-slate-500'
                                        : 'bg-purple-600 border-purple-500'}">
                  {#if !typeHidden}
                    <svg class="w-2 h-2 text-white" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="currentColor" stroke-width="1.5"
                            stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  {/if}
                </div>

                <div class="w-4 h-4 flex items-center justify-center text-white text-[10px]
                            font-bold shrink-0
                            {t.marker_shape === 'circle' ? 'rounded-full' : 'rounded'}"
                     style:background-color="#{t.colour}"
                     style:opacity={typeHidden ? '0.3' : '1'}
                >{t.initial}</div>

                <span class="text-xs flex-1 truncate transition-colors
                             {typeHidden ? 'text-slate-600 line-through'
                                        : 'text-slate-300 group-hover/type:text-white'}"
                >{t.name}</span>

                <span class="text-xs shrink-0
                             {typeHidden ? 'text-slate-700' : 'text-slate-500'}">{cnt}</span>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/if}

    <!-- ── Status filter ──────────────────────────────────────────── -->
    <!-- Always shows all 4 statuses. Inclusive model:
         empty selectedStatuses = show all; non-empty = show only those checked. -->
    {#if planComponents.length > 0}
      <div>
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Status
          {#if selectedStatuses.size > 0}
            <span class="text-purple-400 normal-case font-normal ml-1">
              (showing {selectedStatuses.size} of 4)
            </span>
          {/if}
        </p>
        <div class="flex flex-col gap-1">
          {#each STATUSES as s (s.value)}
            {@const isSelected = selectedStatuses.has(s.value)}
            {@const count      = statusCounts[s.value] ?? 0}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <div
              class="flex items-center gap-2 cursor-pointer group/status select-none"
              on:click={() => toggleStatus(s.value)}
            >
              <!-- Checkbox: filled = actively selected; empty = not filtered -->
              <div class="w-3.5 h-3.5 rounded border flex items-center justify-center
                          shrink-0 transition-colors
                          {isSelected
                            ? 'bg-purple-600 border-purple-500'
                            : 'bg-slate-700 border-slate-500'}">
                {#if isSelected}
                  <svg class="w-2 h-2 text-white" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="currentColor" stroke-width="1.5"
                          stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {/if}
              </div>

              <div class="w-2.5 h-2.5 rounded-full shrink-0 {s.dot}
                          {selectedStatuses.size > 0 && !isSelected ? 'opacity-30' : ''}"></div>

              <span class="text-xs flex-1 transition-colors
                           {selectedStatuses.size > 0 && !isSelected
                             ? 'text-slate-600'
                             : 'text-slate-300 group-hover/status:text-white'}"
              >{s.label}</span>

              <span class="text-xs shrink-0
                           {selectedStatuses.size > 0 && !isSelected
                             ? 'text-slate-700' : 'text-slate-500'}">{count}</span>
            </div>
          {/each}
        </div>
        {#if selectedStatuses.size === 0}
          <p class="text-[10px] text-slate-600 mt-1.5 italic">
            All statuses shown — tick one or more to filter
          </p>
        {/if}
      </div>
    {/if}

    <!-- ── Spaces visibility ──────────────────────────────────────── -->
    {#if planSpaces.length > 0}
      <div>
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Spaces</p>
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div
          class="flex items-center gap-2 cursor-pointer group/spaces select-none"
          on:click={() => dispatch('changeshowspaces', { show: !showSpaces })}
        >
          <div class="w-3.5 h-3.5 rounded border flex items-center justify-center
                      shrink-0 transition-colors
                      {showSpaces ? 'bg-purple-600 border-purple-500' : 'bg-slate-700 border-slate-500'}">
            {#if showSpaces}
              <svg class="w-2 h-2 text-white" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l3 3 5-6" stroke="currentColor" stroke-width="1.5"
                      stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            {/if}
          </div>
          <span class="text-xs flex-1 transition-colors
                       {showSpaces ? 'text-slate-300 group-hover/spaces:text-white' : 'text-slate-600'}">
            Show space overlays
          </span>
          <span class="text-xs shrink-0 {showSpaces ? 'text-slate-500' : 'text-slate-700'}">
            {planSpaces.length}
          </span>
        </div>
      </div>
    {/if}

    <!-- ── Unplaced components ─────────────────────────────────────── -->
    {#if unplacedComponents.length > 0}
      <div class="border-t border-slate-700 pt-3">
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Unplaced on {selectedFloor?.name ?? 'this floor'}
        </p>
        <p class="text-xs text-slate-500 mb-2">
          {#if drawingMode === 'component'}
            Click a row to open its detail and assign a plan position.
          {:else}
            Switch to <strong class="text-slate-300">Components</strong> mode to place these.
          {/if}
        </p>
        <div class="flex flex-col gap-1.5">
          {#each unplacedComponents as c (c.id)}
            {@const t = types.find(tt => tt.code === c.type_code)}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <div
              class="flex items-center gap-2 p-2 rounded-lg bg-slate-700/50
                     border border-slate-600 hover:border-slate-500 cursor-pointer
                     transition-colors"
              on:click={() => dispatch('selectcomponent', { component: c })}
            >
              {#if t}
                <div class="w-5 h-5 flex items-center justify-center text-white text-[10px]
                            font-bold shrink-0
                            {t.marker_shape === 'circle' ? 'rounded-full' : 'rounded'}"
                     style:background-color="#{t.colour}">{t.initial}</div>
              {:else}
                <div class="w-5 h-5 rounded bg-slate-600 shrink-0"></div>
              {/if}
              <div class="flex-1 min-w-0">
                <p class="text-xs text-white truncate">
                  {c.label || c.asset_id || t?.name || c.type_code}
                </p>
                <p class="text-[10px] text-slate-500 truncate">{t?.name ?? c.type_code}</p>
              </div>
              <span class="text-slate-600 text-xs shrink-0">→</span>
            </div>
          {/each}
        </div>
      </div>
    {:else if selectedFloor && planComponents.length > 0}
      <p class="text-xs text-slate-600 italic border-t border-slate-700 pt-3">
        All {selectedFloor.name} components are placed ✓
      </p>
    {/if}

  </div>
</div>
