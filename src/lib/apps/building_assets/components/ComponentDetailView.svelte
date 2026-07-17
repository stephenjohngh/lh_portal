<!-- src/lib/apps/building_assets/components/ComponentDetailView.svelte -->
<!-- Read-only detail panel for a single component.
     Shows all the same sections as ComponentDetailPanel but rendered as
     static text — no form inputs, no save/delete actions.
     Used wherever the current user has read-only access to Building Assets. -->

<script>
  import { createEventDispatcher }   from 'svelte';
  import { buildingAssetsStore }     from '../stores/buildingAssetsStore.js';
  import { typeByCode, conditionChecklistDisplay } from '../lookups.js';
  import { buildSpaceRef }             from '$lib/utils/spaceRef.js';
  import { buildComponentRef }         from '$lib/utils/componentRef.js';
  import { spacesForComponent }        from '../utils/spaceMembership.js';
  import ComponentLinks              from './ComponentLinks.svelte';
  import ComponentInspectionHistory  from './ComponentInspectionHistory.svelte';
  import ComponentMaintenanceHistory from './ComponentMaintenanceHistory.svelte';
  import ConditionChecklistChips     from './ConditionChecklistChips.svelte';
  import { sec, STATUSES }           from '../ui.js';
  import { fmtDate, fmtDateTime }    from '$lib/utils/dates.js';

  export let component;         // components row
  export let types       = [];
  export let floors      = [];
  export let attrDefs    = {};  // { typeId: effective attrs[] }
  export let attrs       = [];  // component_attributes[] for this component
  export let components  = [];  // all components[] — for ComponentLinks datalist

  // Latest inspection comes from the store (always loaded with the component data)
  $: latestInspection = component?.id
    ? $buildingAssetsStore.inspections?.[component.id] ?? null
    : null;

  const dispatch = createEventDispatcher();

  // -- Derived ----------------------------------------------------------
  $: type        = typeByCode(types, component.type_code);
  $: typeId      = type?.id ?? null;
  $: defs        = typeId ? (attrDefs[typeId] ?? []) : [];
  $: fixedDefs = defs.filter(d => !d.checkable);
  $: conditionDefs     = defs.filter(d =>  d.checkable);
  $: primaryDef   = defs.find(d => d.is_primary) ?? null;

  // Build a { defId → value } map from the loaded attrs array
  $: attrMap = Object.fromEntries(attrs.map(a => [a.type_attribute_id, a.value]));

  // Spaces this component falls within (derive-at-read reverse lookup, §4.3),
  // including manual pins. Plans/AR come from the store.
  $: componentSpaces = component
    ? spacesForComponent(component, $buildingAssetsStore.spaces ?? [], $buildingAssetsStore.spaceOverrides ?? [], {
        AR: ($buildingAssetsStore.plans ?? []).find(p => p.id === component.plan_id)?.image_aspect_ratio ?? 1,
      })
    : [];

  // Status config lookup
  const STATUS_CFG = Object.fromEntries(STATUSES.map(s => [s.value, s]));

  // Resolve a human-readable display value for an attribute
  function attrDisplayValue(def, value) {
    if (value == null || value === '') return '—';
    if (def.display_type === 'checkbox') return value === 'true' ? '✓ Yes' : '✗ No';
    return value;
  }

  const fmt = fmtDateTime;

  // Status config for current component
  $: statusCfg = STATUS_CFG[(component.status ?? 'ok').toLowerCase()] ?? STATUS_CFG.ok;

  // Condition-attribute section toggle
  let showConditionAttrs = false;
</script>

<!-- Outer container — matches ComponentDetailPanel sizing -->
<div class="bg-slate-800 rounded-xl border border-slate-700 flex flex-col max-h-[90vh]">

  <!-- -- Sticky header ------------------------------------------------- -->
  <div class="flex items-start gap-3 p-5 pb-4 border-b border-slate-700 shrink-0">
    <!-- Type colour badge -->
    {#if type}
      <div
        class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg shrink-0"
        style="background-color: #{type.colour}"
        title={type.name}
      >{type.initial}</div>
    {:else}
      <div class="w-10 h-10 rounded-lg bg-slate-600 flex items-center justify-center text-slate-400 shrink-0 text-lg font-bold">?</div>
    {/if}

    <div class="flex-1 min-w-0">
      <div class="flex items-baseline gap-2 flex-wrap">
        <span class="font-bold font-mono text-white text-base leading-tight tracking-wide">
          {buildComponentRef(component, floors, types)}
        </span>
        {#if component.label}
          <span class="text-slate-300 text-base leading-tight">{component.label}</span>
        {/if}
      </div>
      <p class="font-semibold text-slate-400 text-base mt-0.5">{type?.name ?? component.type_code}</p>
    </div>

    <button
      on:click={() => dispatch('close')}
      class="text-slate-500 hover:text-white transition-colors text-xl leading-none shrink-0"
      title="Close"
    >✕</button>
  </div>

  <!-- -- Scrollable body ----------------------------------------------- -->
  <div class="flex-1 overflow-y-auto p-5 space-y-6">

    <!-- -- Spaces (derived membership) --------------------------------- -->
    {#if component.plan_id || componentSpaces.length > 0}
      <section>
        <p class={sec}>Spaces</p>
        {#if componentSpaces.length > 0}
          <div class="flex flex-wrap gap-1.5">
            {#each componentSpaces as sp (sp.id)}
              <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-700/50 border border-slate-600/50 text-xs">
                <span class="w-2.5 h-2.5 rounded-sm shrink-0 {sp.colour && sp.colour !== 'none' ? '' : 'border border-slate-500'}"
                  style={sp.colour && sp.colour !== 'none' ? `background-color:#${sp.colour}` : ''}></span>
                <span class="font-mono text-slate-400">{buildSpaceRef(sp, floors)}</span>
                <span class="text-slate-300">{sp.name}</span>
              </span>
            {/each}
          </div>
        {:else}
          <p class="text-xs text-slate-600 italic">Not within any drawn space on this plan.</p>
        {/if}
      </section>
    {/if}

    <!-- -- Status ------------------------------------------------------ -->
    <section>
      <p class={sec}>Status</p>
      <div class="mt-2">
        <span class="inline-block px-3 py-1.5 rounded text-sm font-semibold text-white {statusCfg.bg}">
          {statusCfg.label}
        </span>
      </div>
    </section>

    <!-- -- Attributes --------------------------------------------------- -->
    {#if fixedDefs.length > 0 || conditionDefs.length > 0}
      <section>
        <div class="flex items-center justify-between gap-2 mb-2">
          <p class={sec}>
            {type?.name ?? 'Type'} Attributes
          </p>
          {#if conditionDefs.length > 0}
            <button
              on:click={() => showConditionAttrs = !showConditionAttrs}
              class="text-xs px-2 py-0.5 rounded border transition-colors shrink-0
                     {showConditionAttrs
                       ? 'bg-purple-600/30 border-purple-500/50 text-purple-300'
                       : 'bg-slate-700 border-slate-600 text-slate-400 hover:text-slate-300'}"
            >Condition attrs ({conditionDefs.length})</button>
          {/if}
        </div>

        <!-- Standard attributes -->
        {#if fixedDefs.length > 0}
          <dl class="space-y-2">
            {#each fixedDefs as def (def.id)}
              {@const val = attrMap[def.id] ?? def.default_value ?? null}
              <div class="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
                <dt class="text-xs text-slate-500 shrink-0 w-32 truncate" title={def.name}>
                  {def.name}
                  {#if def.is_primary}<span class="text-yellow-400 ml-0.5">★</span>{/if}
                  {#if def._scope === 'system'}<span class="text-blue-400/50 ml-0.5" title="System attribute">↑</span>{/if}
                </dt>
                <dd class="text-sm text-slate-200 flex-1">
                  {#if val == null || val === ''}
                    <span class="text-slate-600">—</span>
                  {:else if def.display_type === 'checkbox'}
                    <span class="{val === 'true' ? 'text-green-400' : 'text-slate-500'}">
                      {val === 'true' ? '✓ Yes' : '✗ No'}
                    </span>
                  {:else}
                    {val}
                  {/if}
                </dd>
              </div>
            {/each}
          </dl>
        {:else}
          <p class="text-xs text-slate-600 italic">No standard attributes for this type.</p>
        {/if}

        <!-- Condition attributes (collapsed by default).
             Read-only: values come from the LATEST inspection's
             checklist_results, not from component_attributes. -->
        {#if showConditionAttrs && conditionDefs.length > 0}
          <div class="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
            <div class="flex items-baseline gap-2 flex-wrap">
              <p class="text-xs text-purple-400/60">Condition attributes</p>
              {#if latestInspection?.inspected_at}
                <p class="text-xs text-slate-600">
                  as of {fmtDate(latestInspection.inspected_at)}
                </p>
              {:else}
                <p class="text-xs text-slate-600 italic">never inspected</p>
              {/if}
            </div>
            <ConditionChecklistChips
              items={conditionChecklistDisplay(latestInspection, defs)}
            />
          </div>
        {/if}
      </section>
    {:else if typeId}
      <p class="text-xs text-slate-600 italic">No attribute definitions for this type.</p>
    {/if}

    <!-- -- Notes -------------------------------------------------------- -->
    {#if component.notes}
      <section>
        <p class={sec}>Notes</p>
        <p class="mt-2 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed
                   px-3 py-2.5 rounded-lg bg-slate-700/40 border border-slate-700/60">
          {component.notes}
        </p>
      </section>
    {/if}

    <!-- -- Linked components (read-only) ------------------------------- -->
    <ComponentLinks
      componentId={component.id}
      {components}
      {floors}
      {types}
      readOnly={true}
    />

    <!-- -- Inspection history ------------------------------------------- -->
    <ComponentInspectionHistory componentId={component.id} typeCode={component.type_code} />

    <!-- -- Maintenance history ------------------------------------------ -->
    <ComponentMaintenanceHistory componentId={component.id} />

    <!-- -- Metadata ----------------------------------------------------- -->
    <section class="text-xs text-slate-600 space-y-0.5 pb-1">
      <p>ID <span class="font-mono text-slate-500">{component.id}</span></p>
      <p>Created <span class="text-slate-500">{fmt(component.created_at)}</span></p>
      {#if component.updated_at}
        <p>Updated <span class="text-slate-500">{fmt(component.updated_at)}</span></p>
      {/if}
    </section>

  </div><!-- end scrollable body -->

  <!-- -- Footer: close only ---------------------------------------------- -->
  <div class="p-5 pt-4 border-t border-slate-700 shrink-0 flex justify-end">
    <button
      on:click={() => dispatch('close')}
      class="px-4 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
    >Close</button>
  </div>

</div>
