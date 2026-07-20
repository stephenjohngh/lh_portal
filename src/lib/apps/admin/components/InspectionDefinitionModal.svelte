<!-- src/lib/apps/admin/components/InspectionDefinitionModal.svelte -->
<!-- Create / edit an inspection_definitions row. Composes the shared ScopeEditor
     and shows a live "matches N" count via applyInspectionScope. Rotating mode
     shows a live next-trigger + linked-set preview (buildRotatingWalk — the
     same derivation the mobile app runs). checklist_mode ('explicit' narrows
     each component's checks to the selected attrs) and pass_fail_rule
     ('all_checks_pass' makes the derived result binding) are editable. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import Checkbox     from '$lib/components/common/Checkbox.svelte';
  import ScopeEditor  from '$lib/apps/building_assets/components/inspections/ScopeEditor.svelte';
  import { applyInspectionScope } from '$lib/apps/building_assets/utils/inspectionScope.js';
  import { buildRotatingWalk } from '$lib/apps/inspection/utils/inspectionRotation.js';
  import { applyChecklistMode } from '$lib/apps/inspection/utils/checklistRules.js';
  import { lastDefinitionInspections } from '$lib/apps/inspection/public.js';
  import { buildComponentRef } from '$lib/utils/componentRef.js';

  /**
   * @typedef {import('$lib/database.types').Tables<'inspection_definitions'>} InspectionDefinition
   * @typedef {import('$lib/database.types').Tables<'type_attributes'>} TypeAttribute
   */
  /** @type {InspectionDefinition|null} */
  export let definition = null;   // row or null (create)
  /** @type {import('$lib/database.types').Tables<'component_types'>[]} */
  export let types    = [];
  export let systems  = [];
  export let floors   = [];
  /** @type {Record<string, TypeAttribute[]>} */
  export let attrDefs = {};
  /** @type {Record<string, import('$lib/database.types').Tables<'type_attribute_options'>[]>} */
  export let attrOptions = {};
  /** @type {import('$lib/database.types').Tables<'components'>[]} */
  export let components     = [];
  export let componentAttrs = {};
  export let componentLinks = {};
  export let inspections    = {};
  /** Existing definitions — only used to default a NEW one's display order to
   *  the end of the list (same (n+1)*10 convention as the attribute/option panels). */
  export let definitions    = [];
  export let saving = false;

  const dispatch = createEventDispatcher();
  const isEdit = !!definition;

  // Form state
  let name        = definition?.name ?? '';
  let description = definition?.description ?? '';
  let active      = definition?.active ?? true;
  let mode        = definition?.mode ?? 'standard';
  /** @typedef {{ typeCodes?: string[], systemIds?: string[], floorIds?: string[], statuses?: string[], fixedAttrFilters?: any[], conditionAttrFilters?: any[] }} ScopeShape */
  let scope = /** @type {ScopeShape} */ (definition?.scope ? structuredClone(definition.scope) : {});
  let frequencyDays = definition?.frequency_days ?? null;
  let linkSource    = definition?.link_source ?? 'component_links';
  let linkTypeFilter = definition?.link_type_filter ?? '';
  let checklistMode    = definition?.checklist_mode ?? 'type_driven';
  let checklistAttrIds = new Set(definition?.checklist_attr_ids ?? []);
  let passFailRule     = definition?.pass_fail_rule ?? 'manual';
  // Statutory provenance (G3) — descriptive metadata, not logic.
  let statutoryRef     = definition?.statutory_ref ?? '';
  let testType         = definition?.test_type ?? '';
  // Display order. A new definition goes to the END of the list rather than
  // defaulting to 0 — previously every new definition landed on 0, so they all
  // tied and their order was whatever the DB happened to return.
  let presentationOrder = definition?.presentation_order
    ?? (definitions.length + 1) * 10;

  const FREQ_PRESETS = [
    { label: 'Weekly',    days: 7 },
    { label: 'Monthly',   days: 30 },
    { label: 'Quarterly', days: 90 },
    { label: 'Annual',    days: 365 },
  ];

  // Live match count against the current component set.
  $: ctx = { types, attrDefs, componentAttrs, inspections };
  $: matchCount = applyInspectionScope(components, scope, ctx).length;

  function onScopeChange(e) { scope = e.detail; }

  // -- Rotating preview: next trigger + linked set (same derivation as the walk).
  // The last-test map only exists for a saved definition; a new one has no
  // sessions yet, so {} (every pool member "never tested") is exact.
  let rotLastTested = null;   // null = not loaded yet
  $: if (mode === 'rotating' && rotLastTested === null) {
    rotLastTested = {};
    if (definition?.id) {
      lastDefinitionInspections(definition.id)
        .then((map) => { rotLastTested = map; })
        .catch(() => {});
    }
  }
  $: rotWalk = mode === 'rotating'
    ? buildRotatingWalk(
        { scope, link_source: linkSource, link_type_filter: linkTypeFilter.trim() || null },
        { components, floors, componentLinks, ctx, lastTested: rotLastTested ?? {} },
      )
    : null;

  // Types the scope actually covers — the explicit checklist only makes sense
  // for these, since a component is walked only if it matches the scope, and a
  // checklist attr on any other type would never apply. typeCodes wins; else the
  // types in the selected systems; else null = no restriction (all types).
  $: scopeTypeCodes = (() => {
    const codes = new Set(scope.typeCodes ?? []);
    if (codes.size > 0) return codes;
    const sysIds = new Set(scope.systemIds ?? []);
    if (sysIds.size > 0) return new Set(types.filter(t => sysIds.has(t.building_system_id)).map(t => t.code));
    return null;
  })();
  $: checklistScoped = scopeTypeCodes != null;
  $: scopedTypes = scopeTypeCodes ? types.filter(t => scopeTypeCodes.has(t.code)) : types;

  // Checkable attrs grouped by type — the pick list for checklist_mode='explicit',
  // scoped to the types this inspection covers.
  $: attrGroups = scopedTypes
    .map(t => ({ type: t, defs: (attrDefs[t.id] ?? []).filter(d => d.checkable) }))
    .filter(g => g.defs.length > 0);

  function toggleChecklistAttr(id) {
    const next = new Set(checklistAttrIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    checklistAttrIds = next;
  }

  // The definition-as-edited, for previews that must match the walk's derivation.
  $: previewDef = { checklist_mode: checklistMode, checklist_attr_ids: [...checklistAttrIds] };

  // Condition attributes a linked component will be checked against — its own
  // type's checkable attrs, narrowed by the checklist mode being edited.
  function condAttrNames(comp, def) {
    const type = types.find(t => t.code === comp.type_code);
    const checkable = (type ? (attrDefs[type.id] ?? []) : []).filter(d => d.checkable);
    return applyChecklistMode(checkable, def).map(d => d.name);
  }

  $: nameValid = name.trim().length > 0;

  function save() {
    if (!nameValid || saving) return;
    dispatch('save', {
      id: definition?.id ?? null,
      data: {
        name, description, active, mode, scope,
        frequency_days: frequencyDays,
        link_source: linkSource,
        link_type_filter: linkTypeFilter,
        checklist_mode: checklistMode,
        checklist_attr_ids: [...checklistAttrIds],
        pass_fail_rule: passFailRule,
        presentation_order: Number(presentationOrder) || 0,
        statutory_ref: statutoryRef.trim() || null,
        test_type:     testType.trim() || null,
      },
    });
  }
</script>

<Modal show={true} title={isEdit ? 'Edit inspection' : 'New inspection'} size="large" on:close={() => dispatch('close')}>
  <div class="def-form">
    <FormInput label="Name" bind:value={name} placeholder="e.g. Fire Doors" required />
    <FormTextarea label="Description" bind:value={description} rows={2} placeholder="What this inspection covers" />

    <div class="active-row">
      <Checkbox bind:checked={active} label="Active (shown in the mobile app and due list)" />
      <label class="order-fld">
        Display order
        <input type="number" step="10" bind:value={presentationOrder} />
      </label>
    </div>
    <p class="order-hint">
      Lowest first. Orders this admin list and the Building Assets Inspection
      filter. The Upcoming/Due panel and the mobile start list ignore it — they
      sort by what is due soonest.
    </p>

    <!-- Frequency -->
    <div class="block">
      <p class="block-lbl">Frequency</p>
      <div class="freq-row">
        {#each FREQ_PRESETS as p (p.days)}
          <button type="button" class="freq-chip" class:on={frequencyDays === p.days} on:click={() => frequencyDays = p.days}>{p.label}</button>
        {/each}
        <button type="button" class="freq-chip" class:on={frequencyDays == null} on:click={() => frequencyDays = null}>On demand</button>
        <label class="freq-custom">
          every
          <input type="number" min="1" value={frequencyDays ?? ''} placeholder="—"
                 on:input={(e) => frequencyDays = e.currentTarget.value ? Number(e.currentTarget.value) : null} />
          days
        </label>
      </div>
      {#if frequencyDays == null}
        <p class="hint">On-demand inspections never appear as “due” — available to run any time.</p>
      {/if}

      <!-- Statutory provenance: why this frequency, and which kind of test.
           Shown on the report and carried into the Golden Thread registration. -->
      <div class="stat-row">
        <label class="stat-fld">
          Standard / clause
          <input bind:value={statutoryRef} placeholder="e.g. BS 5266-1 §12.2" />
        </label>
        <label class="stat-fld">
          Test type
          <input bind:value={testType} placeholder="e.g. Monthly function test" />
        </label>
      </div>
      <p class="hint">Optional. Records the compliance basis — appears on the inspection report and the Golden Thread entry.</p>
    </div>

    <!-- Mode -->
    <div class="block">
      <p class="block-lbl">Type of inspection</p>
      <div class="mode-row">
        <button type="button" class="mode-chip" class:on={mode === 'standard'} on:click={() => mode = 'standard'}>
          Standard <span class="mode-sub">check all matched components</span>
        </button>
        <button type="button" class="mode-chip" class:on={mode === 'rotating'} on:click={() => mode = 'rotating'}>
          Rotating / trigger <span class="mode-sub">one trigger per period + its linked components</span>
        </button>
      </div>
    </div>

    {#if mode === 'rotating'}
      <div class="block rot">
        <p class="block-lbl">Linked components</p>
        <label class="rot-row"><input type="radio" bind:group={linkSource} value="component_links" /> The trigger’s linked components (component_links)</label>
        <label class="rot-row"><input type="radio" bind:group={linkSource} value="self_only" /> Only the trigger itself</label>
        <FormInput label="Restrict to link_type (optional)" bind:value={linkTypeFilter} placeholder="e.g. fire_trigger" />

        <!-- Live preview: pool → next trigger → linked set -->
        {#if rotWalk}
          <div class="rot-preview">
            <p class="rp-head">Preview — the scope below is the <strong>trigger pool</strong> ({rotWalk.pool.length} component{rotWalk.pool.length === 1 ? '' : 's'}, cycled one per period)</p>
            {#if !rotWalk.trigger}
              <p class="rp-warn">No component matches the scope — the rotation has nothing to trigger.</p>
            {:else}
              <p class="rp-line">Next trigger: <strong>{buildComponentRef(rotWalk.trigger, floors, types)}</strong>{rotWalk.trigger.label ? ` — ${rotWalk.trigger.label}` : ''}</p>
              {#if linkSource === 'self_only'}
                <p class="rp-line">Checks the trigger only.</p>
              {:else if rotWalk.linked.length === 0}
                <p class="rp-warn">⚠ 0 linked components — this trigger has no {linkTypeFilter.trim() ? `'${linkTypeFilter.trim()}' ` : ''}component_links. Add links in Building Assets or the walk will only check the trigger.</p>
              {:else}
                <p class="rp-line">Checks {rotWalk.linked.length} linked component{rotWalk.linked.length === 1 ? '' : 's'}:</p>
                <ul class="rp-list">
                  {#each rotWalk.linked as comp (comp.id)}
                    {@const checks = condAttrNames(comp, previewDef)}
                    <li>
                      <span class="rp-ref">{buildComponentRef(comp, floors, types)}</span>
                      {#if checks.length > 0}<span class="rp-checks">{checks.join(' · ')}</span>
                      {:else}<span class="rp-checks rp-none">no condition attributes</span>{/if}
                    </li>
                  {/each}
                </ul>
              {/if}
              {#if rotWalk.unresolved.length > 0}
                <p class="rp-warn">⚠ Unresolved link refs (renamed floor/asset?): {rotWalk.unresolved.join(', ')}</p>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Scope -->
    <div class="block">
      <p class="block-lbl">What is inspected</p>
      <ScopeEditor
        {scope} {types} {systems} {floors} {attrDefs} {attrOptions}
        matchCount={matchCount} totalCount={components.length}
        on:change={onScopeChange}
      />
    </div>

    <!-- Checklist mode -->
    <div class="block">
      <p class="block-lbl">Checklist</p>
      <label class="rule-row">
        <input type="radio" bind:group={checklistMode} value="type_driven" />
        Type-driven — each component checks all of its type’s condition attributes
      </label>
      <label class="rule-row">
        <input type="radio" bind:group={checklistMode} value="explicit" />
        Explicit — only the checks selected below
      </label>
      {#if checklistMode === 'explicit'}
        {#if attrGroups.length === 0}
          <p class="hint">
            {checklistScoped
              ? 'The types in this inspection’s scope have no condition attributes to check.'
              : 'No condition attributes exist yet — add checkable attributes to component types first.'}
          </p>
        {:else}
          {#if checklistScoped}
            <p class="hint">Showing condition attributes for the types in this inspection’s scope.</p>
          {/if}
          <div class="attr-pick">
            {#each attrGroups as g (g.type.id)}
              <p class="attr-type">{g.type.name}</p>
              {#each g.defs as d (d.id)}
                <label class="attr-row">
                  <input type="checkbox" checked={checklistAttrIds.has(d.id)} on:change={() => toggleChecklistAttr(d.id)} />
                  {d.name}
                </label>
              {/each}
            {/each}
          </div>
          {#if checklistAttrIds.size === 0}
            <p class="hint warn-hint">⚠ No checks selected — every component in this inspection will have an empty checklist.</p>
          {/if}
        {/if}
      {/if}
    </div>

    <!-- Pass / fail rule -->
    <div class="block">
      <p class="block-lbl">Pass / fail</p>
      <label class="rule-row">
        <input type="radio" bind:group={passFailRule} value="manual" />
        Manual — the inspector sets the result (checks suggest it)
      </label>
      <label class="rule-row">
        <input type="radio" bind:group={passFailRule} value="all_checks_pass" />
        All checks pass — the result is set from the checks (any fail → FAIL, all pass → PASS)
      </label>
      {#if passFailRule === 'all_checks_pass'}
        <p class="hint">Components with no pass/fail checks fall back to a manual result.</p>
      {/if}
    </div>
  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" on:click={() => dispatch('close')}>Cancel</Button>
    <Button variant="primary" disabled={!nameValid || saving} on:click={save}>
      {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create')}
    </Button>
  </svelte:fragment>
</Modal>

<style>
  .def-form { display: flex; flex-direction: column; gap: 1rem; }
  .active-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: rgb(203 213 225); cursor: pointer; flex-wrap: wrap; }
  .order-fld  { display: flex; align-items: center; gap: 0.4rem; margin-left: auto; font-size: 0.8rem; color: rgb(148 163 184); cursor: pointer; }
  .order-fld input { width: 5rem; padding: 0.3rem 0.5rem; background: rgb(15 23 42); border: 1px solid rgb(71 85 105); border-radius: 6px; color: rgb(226 232 240); font-size: 0.85rem; }
  .order-fld input:focus { outline: none; border-color: rgb(60 150 131); }
  .order-hint { font-size: 0.72rem; color: rgb(100 116 139); line-height: 1.5; margin-top: -0.25rem; }
  .block-lbl { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: rgb(100 116 139); font-weight: 600; margin-bottom: 0.5rem; }
  .hint { font-size: 0.75rem; color: rgb(100 116 139); margin-top: 0.4rem; }

  .freq-row { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .freq-chip, .mode-chip {
    font-size: 0.8rem; padding: 0.3rem 0.7rem; border-radius: 999px; cursor: pointer;
    background: rgb(30 41 59 / 0.6); border: 1px solid rgb(71 85 105 / 0.7); color: rgb(203 213 225);
  }
  .freq-chip.on { background: rgb(var(--lh-accent-rgb) / 0.22); border-color: var(--lh-accent); color: rgb(226 232 240); }
  .freq-custom { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; color: rgb(148 163 184); }
  .freq-custom input { width: 4rem; font-size: 0.8rem; padding: 0.2rem 0.4rem; border-radius: 6px; background: rgb(15 23 42 / 0.6); border: 1px solid rgb(71 85 105 / 0.7); color: rgb(226 232 240); }

  .stat-row { display: flex; gap: 0.75rem; margin-top: 0.75rem; flex-wrap: wrap; }
  .stat-fld { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; min-width: 12rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgb(148 163 184); }
  .stat-fld input { text-transform: none; letter-spacing: normal; padding: 0.4rem 0.55rem; background: rgb(15 23 42); border: 1px solid rgb(71 85 105); border-radius: 6px; color: rgb(226 232 240); font-size: 0.85rem; }
  .stat-fld input:focus { outline: none; border-color: rgb(60 150 131); }

  .mode-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .mode-chip { border-radius: 8px; display: flex; flex-direction: column; align-items: flex-start; }
  .mode-chip.on { background: rgb(var(--lh-accent-rgb) / 0.22); border-color: var(--lh-accent); color: rgb(226 232 240); }
  .mode-chip:disabled { opacity: 0.5; cursor: not-allowed; }
  .mode-sub { font-size: 0.65rem; color: rgb(100 116 139); margin-top: 0.15rem; }

  .rot { border-left: 2px solid rgb(251 146 60 / 0.5); padding-left: 0.75rem; }
  .rot-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: rgb(203 213 225); margin-bottom: 0.3rem; cursor: pointer; }
  .rot-preview { margin-top: 0.6rem; padding: 0.6rem 0.75rem; border-radius: 6px; background: rgb(15 23 42 / 0.5); border: 1px solid rgb(71 85 105 / 0.5); display: flex; flex-direction: column; gap: 0.3rem; }
  .rp-head  { font-size: 0.72rem; color: rgb(148 163 184); }
  .rp-line  { font-size: 0.78rem; color: rgb(203 213 225); }
  .rp-warn  { font-size: 0.75rem; color: rgb(251 191 36); }
  .rp-list  { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.15rem; }
  .rp-list li { font-size: 0.75rem; color: rgb(203 213 225); }
  .rp-ref   { font-family: ui-monospace, monospace; color: rgb(226 232 240); }
  .rp-checks { color: rgb(148 163 184); margin-left: 0.4rem; }
  .rp-none  { font-style: italic; }

  .rule-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: rgb(203 213 225); margin-bottom: 0.3rem; cursor: pointer; }
  .attr-pick { margin-top: 0.5rem; padding: 0.6rem 0.75rem; border-radius: 6px; background: rgb(15 23 42 / 0.5); border: 1px solid rgb(71 85 105 / 0.5); max-height: 14rem; overflow-y: auto; }
  .attr-type { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgb(100 116 139); font-weight: 600; margin: 0.4rem 0 0.2rem; }
  .attr-type:first-child { margin-top: 0; }
  .attr-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: rgb(203 213 225); padding: 0.15rem 0; cursor: pointer; }
  .warn-hint { color: rgb(251 191 36); }
</style>
