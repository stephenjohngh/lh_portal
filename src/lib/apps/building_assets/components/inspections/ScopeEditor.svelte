<!-- src/lib/apps/building_assets/components/inspections/ScopeEditor.svelte -->
<!-- Builds an inspection_definitions.scope object: multi-select chips for
     type / system / floor / status, plus attribute-filter rows (fixed +
     condition). Attribute filters target by defName + checkable class so a
     scope is cross-type (see findFilterDef in attrFilters.js). Emits 'change'
     with the updated scope on every edit; parent owns the authoritative value
     and computes the live match count. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { availableFixedDefs, availableConditionDefs, defaultFilterFor, OP_SYMBOL } from '../../utils/attrFilters.js';

  export let scope    = {};
  export let types    = [];
  export let systems  = [];
  export let floors   = [];
  export let attrDefs = {};
  export let matchCount = null;   // computed by parent (applyInspectionScope)
  export let totalCount = null;

  const dispatch = createEventDispatcher();

  const STATUSES = ['ok', 'problem', 'failed', 'inactive'];

  // Working copies (arrays) — normalise from the incoming scope once.
  let typeCodes = [...(scope.typeCodes ?? [])];
  let systemIds = [...(scope.systemIds ?? [])];
  let floorIds  = [...(scope.floorIds  ?? [])];
  let statuses  = [...(scope.statuses  ?? [])];
  let fixedAttrFilters     = [...(scope.fixedAttrFilters     ?? [])];
  let conditionAttrFilters = [...(scope.conditionAttrFilters ?? [])];

  function emit() {
    const next = {};
    if (typeCodes.length) next.typeCodes = typeCodes;
    if (systemIds.length) next.systemIds = systemIds;
    if (floorIds.length)  next.floorIds  = floorIds;
    if (statuses.length)  next.statuses  = statuses;
    if (fixedAttrFilters.length)     next.fixedAttrFilters     = fixedAttrFilters;
    if (conditionAttrFilters.length) next.conditionAttrFilters = conditionAttrFilters;
    dispatch('change', next);
  }

  function toggle(list, val) {
    const i = list.indexOf(val);
    if (i >= 0) list.splice(i, 1); else list.push(val);
    return list;
  }
  function toggleType(code)   { typeCodes = toggle(typeCodes, code); emit(); }
  function toggleSystem(id)   { systemIds = toggle(systemIds, id);   emit(); }
  function toggleFloor(id)    { floorIds  = toggle(floorIds, id);    emit(); }
  function toggleStatus(s)    { statuses  = toggle(statuses, s);     emit(); }

  // Available attribute defs, de-duplicated by name+class (a name may be owned
  // by several types → several def rows; we offer it once and match by name).
  $: filterTypeCodes = new Set(typeCodes);
  $: availFixed = dedupeByName(availableFixedDefs(types, systems, attrDefs, filterTypeCodes));
  $: availCond  = dedupeByName(availableConditionDefs(types, systems, attrDefs, filterTypeCodes));
  function dedupeByName(defs) {
    const seen = new Map();
    for (const d of defs) if (!seen.has(d.name)) seen.set(d.name, d);
    return [...seen.values()];
  }

  // Attribute filter row model: { defName, checkable, op, values, includeUnset }
  function addAttrFilter(def, checkable) {
    const base = defaultFilterFor(def);
    const row = { defName: def.name, checkable, op: base.op, values: base.values, includeUnset: base.includeUnset };
    if (checkable) conditionAttrFilters = [...conditionAttrFilters, row];
    else           fixedAttrFilters     = [...fixedAttrFilters, row];
    emit();
  }
  function removeAttrFilter(checkable, i) {
    if (checkable) conditionAttrFilters = conditionAttrFilters.filter((_, j) => j !== i);
    else           fixedAttrFilters     = fixedAttrFilters.filter((_, j) => j !== i);
    emit();
  }
  function updateFilterValue(checkable, i, patch) {
    const arr = checkable ? [...conditionAttrFilters] : [...fixedAttrFilters];
    arr[i] = { ...arr[i], ...patch };
    if (checkable) conditionAttrFilters = arr; else fixedAttrFilters = arr;
    emit();
  }

  // Operators offered per display_type (mirrors defaultFilterFor's classes).
  function opsFor(def) {
    switch (def?.display_type) {
      case 'checkbox':          return ['is_true', 'is_false'];
      case 'dropdown':
      case 'radio':             return ['in'];
      case 'number':            return ['eq', 'lt', 'lte', 'gte', 'gt'];
      default:                  return ['contains', 'starts', 'eq_text'];
    }
  }
  const defByName = (list, name) => list.find(d => d.name === name) ?? null;

  let addFixedName = '';
  let addCondName  = '';
</script>

<div class="scope-editor">
  <!-- Match count -->
  {#if matchCount != null}
    <div class="match-count" class:zero={matchCount === 0}>
      Matches <strong>{matchCount}</strong>{#if totalCount != null} of {totalCount}{/if} component{matchCount === 1 ? '' : 's'}
      {#if matchCount === 0}<span class="warn">— this scope selects nothing</span>{/if}
    </div>
  {/if}

  <!-- Types -->
  <div class="dim">
    <p class="dim-lbl">Types</p>
    <div class="chips">
      {#each types as t (t.code)}
        <button type="button" class="chip" class:on={typeCodes.includes(t.code)} on:click={() => toggleType(t.code)}>
          <span class="dot" style="background:#{t.colour};"></span>{t.name}
        </button>
      {/each}
    </div>
  </div>

  <!-- Systems -->
  <div class="dim">
    <p class="dim-lbl">Systems</p>
    <div class="chips">
      {#each systems as s (s.id)}
        <button type="button" class="chip" class:on={systemIds.includes(s.id)} on:click={() => toggleSystem(s.id)}>{s.name}</button>
      {/each}
    </div>
  </div>

  <!-- Floors -->
  <div class="dim">
    <p class="dim-lbl">Floors</p>
    <div class="chips">
      {#each floors as f (f.id)}
        <button type="button" class="chip" class:on={floorIds.includes(f.id)} on:click={() => toggleFloor(f.id)}>{f.short_name}</button>
      {/each}
    </div>
  </div>

  <!-- Status -->
  <div class="dim">
    <p class="dim-lbl">Status</p>
    <div class="chips">
      {#each STATUSES as s (s)}
        <button type="button" class="chip" class:on={statuses.includes(s)} on:click={() => toggleStatus(s)}>{s}</button>
      {/each}
    </div>
  </div>

  <!-- Attribute filters -->
  <div class="dim">
    <p class="dim-lbl">Attribute filters</p>

    {#each fixedAttrFilters as f, i (i)}
      {@const def = defByName(availFixed, f.defName)}
      <div class="attr-row">
        <span class="attr-name">{f.defName} <em class="cls">fixed</em></span>
        <select class="attr-op" value={f.op} on:change={(e) => updateFilterValue(false, i, { op: e.currentTarget.value })}>
          {#each opsFor(def) as op (op)}<option value={op}>{OP_SYMBOL[op] ?? op}</option>{/each}
        </select>
        {#if f.op !== 'is_true' && f.op !== 'is_false'}
          <input class="attr-val" value={Array.isArray(f.values) ? f.values.join(', ') : f.values}
                 placeholder={def?.display_type === 'dropdown' ? 'value, value…' : 'value'}
                 on:input={(e) => updateFilterValue(false, i, { values: def?.display_type === 'dropdown' ? e.currentTarget.value.split(',').map(v => v.trim()).filter(Boolean) : e.currentTarget.value })} />
        {/if}
        <button type="button" class="attr-del" title="Remove" on:click={() => removeAttrFilter(false, i)}>✕</button>
      </div>
    {/each}

    {#each conditionAttrFilters as f, i (i)}
      {@const def = defByName(availCond, f.defName)}
      <div class="attr-row">
        <span class="attr-name">{f.defName} <em class="cls cond">condition</em></span>
        <select class="attr-op" value={f.op} on:change={(e) => updateFilterValue(true, i, { op: e.currentTarget.value })}>
          {#each opsFor(def) as op (op)}<option value={op}>{OP_SYMBOL[op] ?? op}</option>{/each}
        </select>
        {#if f.op !== 'is_true' && f.op !== 'is_false'}
          <input class="attr-val" value={Array.isArray(f.values) ? f.values.join(', ') : f.values}
                 on:input={(e) => updateFilterValue(true, i, { values: e.currentTarget.value })} />
        {/if}
        <button type="button" class="attr-del" title="Remove" on:click={() => removeAttrFilter(true, i)}>✕</button>
      </div>
    {/each}

    <div class="attr-add">
      <select bind:value={addFixedName}>
        <option value="">+ fixed attribute…</option>
        {#each availFixed as d (d.id)}<option value={d.name}>{d.name}</option>{/each}
      </select>
      <button type="button" class="add-btn" disabled={!addFixedName}
              on:click={() => { const d = defByName(availFixed, addFixedName); if (d) addAttrFilter(d, false); addFixedName = ''; }}>Add</button>

      <select bind:value={addCondName}>
        <option value="">+ condition attribute…</option>
        {#each availCond as d (d.id)}<option value={d.name}>{d.name}</option>{/each}
      </select>
      <button type="button" class="add-btn" disabled={!addCondName}
              on:click={() => { const d = defByName(availCond, addCondName); if (d) addAttrFilter(d, true); addCondName = ''; }}>Add</button>
    </div>
  </div>
</div>

<style>
  .scope-editor { display: flex; flex-direction: column; gap: 0.9rem; }
  .match-count  { font-size: 0.85rem; color: rgb(148 163 184); }
  .match-count strong { color: rgb(226 232 240); }
  .match-count.zero .warn { color: rgb(248 113 113); margin-left: 0.25rem; }
  .dim-lbl { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: rgb(100 116 139); font-weight: 600; margin-bottom: 0.4rem; }
  .chips   { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.35rem;
    font-size: 0.78rem; padding: 0.25rem 0.6rem; border-radius: 999px;
    background: rgb(30 41 59 / 0.6); border: 1px solid rgb(71 85 105 / 0.7);
    color: rgb(203 213 225); cursor: pointer; transition: all 0.12s;
  }
  .chip:hover { border-color: rgb(148 163 184); }
  .chip.on { background: rgb(var(--lh-accent-rgb) / 0.22); border-color: var(--lh-accent); color: rgb(226 232 240); }
  .dot { width: 0.7rem; height: 0.7rem; border-radius: 50%; flex-shrink: 0; }

  .attr-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; flex-wrap: wrap; }
  .attr-name { font-size: 0.82rem; color: rgb(226 232 240); }
  .cls  { font-style: normal; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgb(100 116 139); border: 1px solid rgb(71 85 105 / 0.6); border-radius: 4px; padding: 0 0.3rem; margin-left: 0.3rem; }
  .cls.cond { color: rgb(251 146 60); border-color: rgb(251 146 60 / 0.4); }
  .attr-op, .attr-val, .attr-add select {
    font-size: 0.8rem; padding: 0.25rem 0.5rem; border-radius: 6px;
    background: rgb(15 23 42 / 0.6); border: 1px solid rgb(71 85 105 / 0.7); color: rgb(226 232 240);
  }
  .attr-val { min-width: 8rem; }
  .attr-del { background: none; border: none; color: rgb(148 163 184); cursor: pointer; font-size: 0.85rem; }
  .attr-del:hover { color: rgb(248 113 113); }
  .attr-add { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.3rem; }
  .add-btn {
    font-size: 0.78rem; padding: 0.25rem 0.7rem; border-radius: 6px; cursor: pointer;
    background: rgb(var(--lh-accent-rgb) / 0.15); border: 1px solid var(--lh-accent); color: rgb(226 232 240);
  }
  .add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
