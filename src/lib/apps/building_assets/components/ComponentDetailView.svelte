<!-- src/lib/apps/building_assets/components/ComponentDetailView.svelte -->
<!-- Read-only detail panel for a single component.
     Shows all the same sections as ComponentDetailPanel but rendered as
     static text — no form inputs, no save/delete actions.
     Used wherever the current user has read-only access to Building Assets. -->

<script>
  import { createEventDispatcher }   from 'svelte';
  import { typeByCode, floorById }   from '../lookups.js';
  import ComponentLinks              from './ComponentLinks.svelte';
  import ComponentInspectionHistory  from './ComponentInspectionHistory.svelte';
  import { sec, STATUSES }           from '../ui.js';

  export let component;         // components row
  export let types       = [];
  export let floors      = [];
  export let facilities  = [];
  export let plans       = [];
  export let attrDefs    = {};  // { typeId: effective attrs[] }
  export let attrOptions = {};  // { attrDefId: options[] } — for option label lookup
  export let attrs       = [];  // component_attributes[] for this component
  export let components  = [];  // all components[] — for ComponentLinks datalist

  const dispatch = createEventDispatcher();

  // ── Derived ──────────────────────────────────────────────────────────
  $: type        = typeByCode(types, component.type_code);
  $: floor       = floorById(floors, component.floor_id);
  $: plan        = plans.find(p => p.id === component.plan_id) ?? null;
  $: typeId      = type?.id ?? null;
  $: defs        = typeId ? (attrDefs[typeId] ?? []) : [];
  $: standardDefs = defs.filter(d => !d.checkable);
  $: walkDefs     = defs.filter(d =>  d.checkable);
  $: primaryDef   = defs.find(d => d.is_primary) ?? null;

  // Build a { defId → value } map from the loaded attrs array
  $: attrMap = Object.fromEntries(attrs.map(a => [a.type_attribute_id, a.value]));

  // Status config lookup
  const STATUS_CFG = Object.fromEntries(STATUSES.map(s => [s.value, s]));

  // Resolve a human-readable display value for an attribute
  function attrDisplayValue(def, value) {
    if (value == null || value === '') return '—';
    if (def.display_type === 'checkbox') return value === 'true' ? '✓ Yes' : '✗ No';
    return value;
  }

  function fmt(dt) {
    if (!dt) return '—';
    return new Date(dt).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // Walk-checklist section toggle
  let showWalkAttrs = false;
</script>

<!-- Outer container — matches ComponentDetailPanel sizing -->
<div class="bg-slate-800 rounded-xl border border-slate-700 flex flex-col max-h-[90vh]">

  <!-- ── Sticky header ───────────────────────────────────────────────── -->
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
          {floor?.short_name ?? '?'}/{type?.initial ?? '?'}/{component.asset_id ?? '?'}
        </span>
        {#if component.label}
          <span class="text-slate-300 text-base leading-tight">{component.label}</span>
        {/if}
        <!-- Read-only badge -->
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-500 border border-slate-600 uppercase tracking-wide">
          view only
        </span>
      </div>
      <p class="text-sm text-slate-500 mt-0.5">{type?.name ?? component.type_code}</p>
    </div>

    <button
      on:click={() => dispatch('close')}
      class="text-slate-500 hover:text-white transition-colors text-xl leading-none shrink-0"
      title="Close"
    >✕</button>
  </div>

  <!-- ── Scrollable body ─────────────────────────────────────────────── -->
  <div class="flex-1 overflow-y-auto p-5 space-y-6">

    <!-- ── Location ─────────────────────────────────────────────────── -->
    <section>
      <p class={sec}>Location</p>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 mt-2">
        <div>
          <dt class="text-xs text-slate-500 mb-0.5">Floor</dt>
          <dd class="text-sm text-slate-200">
            {#if floor}
              {floor.name}
              <span class="font-mono text-slate-400 text-xs ml-1">({floor.short_name})</span>
            {:else}
              <span class="text-slate-600">—</span>
            {/if}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-slate-500 mb-0.5">Plan</dt>
          <dd class="text-sm text-slate-200">
            {plan?.name ?? (component.plan_id ? 'Placed' : 'Not placed')}
          </dd>
        </div>
        {#if component.plan_id}
          <div>
            <dt class="text-xs text-slate-500 mb-0.5">X Position</dt>
            <dd class="text-sm font-mono text-slate-300">{component.x_position?.toFixed(3) ?? '—'}</dd>
          </div>
          <div>
            <dt class="text-xs text-slate-500 mb-0.5">Y Position</dt>
            <dd class="text-sm font-mono text-slate-300">{component.y_position?.toFixed(3) ?? '—'}</dd>
          </div>
        {/if}
      </dl>
    </section>

    <!-- ── Identity ──────────────────────────────────────────────────── -->
    <section>
      <p class={sec}>Identity</p>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 mt-2">
        <div class="col-span-2">
          <dt class="text-xs text-slate-500 mb-0.5">Component Type</dt>
          <dd class="text-sm text-slate-200">{type?.name ?? component.type_code}</dd>
        </div>
        <div>
          <dt class="text-xs text-slate-500 mb-0.5">Label</dt>
          <dd class="text-sm text-slate-200">
            {#if component.label}{component.label}{:else}<span class="text-slate-600">—</span>{/if}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-slate-500 mb-0.5">Asset ID</dt>
          <dd class="text-sm font-mono text-slate-200">
            {#if component.asset_id}{component.asset_id}{:else}<span class="text-slate-600">—</span>{/if}
          </dd>
        </div>
        {#if component.primary_attribute}
          <div class="col-span-2">
            <dt class="text-xs text-slate-500 mb-0.5">Primary Attribute</dt>
            <dd class="text-sm font-semibold text-yellow-300">★ {component.primary_attribute}</dd>
          </div>
        {/if}
      </dl>
    </section>

    <!-- ── Status ────────────────────────────────────────────────────── -->
    <section>
      <p class={sec}>Status</p>
      {@const cfg = STATUS_CFG[(component.status ?? 'ok').toLowerCase()] ?? STATUS_CFG.ok}
      <div class="mt-2">
        <span class="inline-block px-3 py-1.5 rounded text-sm font-semibold text-white {cfg.bg}">
          {cfg.label}
        </span>
      </div>
    </section>

    <!-- ── Attributes ─────────────────────────────────────────────────── -->
    {#if standardDefs.length > 0 || walkDefs.length > 0}
      <section>
        <div class="flex items-center justify-between gap-2 mb-2">
          <p class={sec}>
            {type?.name ?? 'Type'} Attributes
          </p>
          {#if walkDefs.length > 0}
            <button
              on:click={() => showWalkAttrs = !showWalkAttrs}
              class="text-xs px-2 py-0.5 rounded border transition-colors shrink-0
                     {showWalkAttrs
                       ? 'bg-purple-600/30 border-purple-500/50 text-purple-300'
                       : 'bg-slate-700 border-slate-600 text-slate-400 hover:text-slate-300'}"
            >Walk checklist ({walkDefs.length})</button>
          {/if}
        </div>

        <!-- Standard attributes -->
        {#if standardDefs.length > 0}
          <dl class="space-y-2">
            {#each standardDefs as def (def.id)}
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

        <!-- Walk checklist attributes (collapsed by default) -->
        {#if showWalkAttrs && walkDefs.length > 0}
          <div class="mt-3 pt-3 border-t border-slate-700/60">
            <p class="text-xs text-purple-400/60 mb-2">Walk checklist attributes</p>
            <dl class="space-y-2">
              {#each walkDefs as def (def.id)}
                {@const val = attrMap[def.id] ?? def.default_value ?? null}
                <div class="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
                  <dt class="text-xs text-slate-500 shrink-0 w-32 truncate" title={def.name}>
                    {def.name}
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
          </div>
        {/if}
      </section>
    {:else if typeId}
      <p class="text-xs text-slate-600 italic">No attribute definitions for this type.</p>
    {/if}

    <!-- ── Notes ──────────────────────────────────────────────────────── -->
    {#if component.notes}
      <section>
        <p class={sec}>Notes</p>
        <p class="mt-2 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed
                   px-3 py-2.5 rounded-lg bg-slate-700/40 border border-slate-700/60">
          {component.notes}
        </p>
      </section>
    {/if}

    <!-- ── Linked components (read-only) ─────────────────────────────── -->
    <ComponentLinks
      componentId={component.id}
      {components}
      {floors}
      {facilities}
      {types}
      readOnly={true}
    />

    <!-- ── Inspection history ─────────────────────────────────────────── -->
    <ComponentInspectionHistory componentId={component.id} />

    <!-- ── Metadata ───────────────────────────────────────────────────── -->
    <section class="text-xs text-slate-600 space-y-0.5 pb-1">
      <p>ID <span class="font-mono text-slate-500">{component.id}</span></p>
      <p>Created <span class="text-slate-500">{fmt(component.created_at)}</span></p>
      {#if component.updated_at}
        <p>Updated <span class="text-slate-500">{fmt(component.updated_at)}</span></p>
      {/if}
    </section>

  </div><!-- end scrollable body -->

  <!-- ── Footer: close only ────────────────────────────────────────────── -->
  <div class="p-5 pt-4 border-t border-slate-700 shrink-0 flex justify-end">
    <button
      on:click={() => dispatch('close')}
      class="px-4 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
    >Close</button>
  </div>

</div>
