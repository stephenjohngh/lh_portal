<!-- src/lib/apps/building_assets/components/works/WorksLineModal.svelte -->
<!-- One line of a schedule: what is there now, and what should be there after.

     Replacement attributes were tried as inline inputs in the table and were
     wrong — a wattage box 16px wide, with no room for the attribute's name and
     no way to render a dropdown as a dropdown. Specifying a replacement is a
     considered act on one asset, so it gets a form.

     Laid out as before/after deliberately. The question being answered is not
     "what are the new values" in the abstract; it is "what changes", and that
     is only readable with the current values beside them. -->
<script>
  import { createEventDispatcher, tick } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import AttrField    from '../AttrField.svelte';
  import { WORKS_ACTIONS, actionDef, specSuggestions, countMatchingLines }
    from '../../utils/worksSchedule.js';
  import { attrPairsText, componentAttrPairs } from '../../utils/attrDisplay.js';
  import { drawComponentOnPlan } from '$lib/utils/planMarker.js';

  export let show = false;
  /** The works_schedule_items row, with .component joined. */
  export let item = null;
  /** All component_types. */
  export let types = [];
  /** attrDefs map, keyed by component_type_id. */
  export let attrDefs = {};
  /** type_attribute_options, keyed by ATTRIBUTE id — not by type. */
  export let attrOptions = {};
  /** The component's current attribute values, by type_attribute_id. */
  export let currentValues = {};
  export let componentRef = '';
  /** plans[] — the location panel finds this component's by plan_id. */
  export let plans = [];
  /** [{ spec, target_type_code }] used before — the suggestion list. */
  export let specs = [];
  /** Every line on this schedule — for counting the ones like this. */
  export let siblings = [];

  const dispatch = createEventDispatcher();

  let action = 'replace';
  let targetType = '';
  let spec = '';
  let notes = '';
  /** { [type_attribute_id]: value } — only what the author has set. */
  let targetAttrs = {};
  let saving = false;
  /** Write this line's answer to every line doing the same thing. */
  let applyToAll = false;

  // Guard on a primitive: `item` is an object prop, and safe_not_equal marks
  // every object dirty, so keying off it would wipe what is being typed.
  let loadedFor = null;
  $: if (show && item?.id && item.id !== loadedFor) {
    loadedFor   = item.id;
    action      = item.action ?? 'replace';
    targetType  = item.target_type_code ?? '';
    spec        = item.spec ?? '';
    notes       = item.notes ?? '';
    targetAttrs = { ...(item.target_attributes ?? {}) };
    saving      = false;
    showPlan    = false;
    applyToAll  = false;
  }

  $: currentType = types.find(t => t.code === item?.component?.type_code) ?? null;

  /**
   * Types offered as a replacement: those in the SAME system.
   *
   * A light is replaced by a light. Offering every type in the building invites
   * a mis-click that would re-type an asset into another discipline entirely,
   * and the apply step would carry it straight through to the register.
   */
  $: replacementTypes = currentType
    ? types.filter(t => t.building_system_id === currentType.building_system_id)
    : types;

  /** Attribute definitions of the type being FITTED — its values, not the old one's. */
  $: targetDefs = (() => {
    const t = types.find(x => x.code === targetType);
    return t ? (attrDefs[t.id] ?? []).filter(d => d.visible !== false && !d.checkable) : [];
  })();

  /** Definitions of what is there now, for the before column. */
  $: currentDefs = currentType
    ? (attrDefs[currentType.id] ?? []).filter(d => d.visible !== false && !d.checkable)
    : [];

  $: currentText = attrPairsText(componentAttrPairs(currentDefs, currentValues));

  $: fitsSomething = actionDef(action)?.applies?.retype === true;

  $: specOptions = specSuggestions(specs, targetType);

  $: matchingCount = countMatchingLines(siblings,
       { action, target_type_code: fitsSomething ? (targetType || null) : null });

  function setAttr(defId, value) {
    const next = { ...targetAttrs };
    if (value === '' || value === null) delete next[defId];
    else next[defId] = String(value);
    targetAttrs = next;
  }

  /** Start from what is there now — most replacements keep most values. */
  function copyCurrent() {
    const next = { ...targetAttrs };
    for (const def of targetDefs) {
      const match = currentDefs.find(d => d.name === def.name);
      const value = match ? currentValues[match.id] : null;
      if (value != null && value !== '') next[def.id] = String(value);
    }
    targetAttrs = next;
  }

  // ── Where is it? ──────────────────────────────────────────────────────────
  // Shown INSIDE this form rather than as a second modal. Every Modal in the
  // portal is z-50, so one opened from another lands underneath it and appears
  // to do nothing — which is exactly what happened. It also belongs here: the
  // question "where is that one?" is part of deciding replace-versus-remove,
  // not a separate errand.
  let showPlan = false;
  let planCanvas;
  let planError = '';
  let planPlaced = true;

  $: plan = item?.component?.plan_id
    ? (plans.find(p => p.id === item.component.plan_id) ?? null)
    : null;

  // Redrawn when the panel opens or the line changes; guarded on primitives so
  // an unrelated parent update does not reload the image.
  let drawnFor = null;
  $: if (showPlan && item?.id && item.id !== drawnFor) {
    drawnFor = item.id;
    drawPlan();
  }
  $: if (!showPlan) drawnFor = null;

  async function drawPlan() {
    planError = ''; planPlaced = true;
    await tick();                       // the canvas does not exist until now
    try {
      const result = await drawComponentOnPlan(planCanvas, {
        imageUrl: plan?.image_url,
        x: item.component?.x_position,
        y: item.component?.y_position,
      });
      planPlaced = result.placed;
    } catch (err) {
      planError = err instanceof Error ? err.message : String(err);
    }
  }

  function save() {
    saving = true;
    dispatch('save', {
      fields: {
        action,
        target_type_code: fitsSomething ? (targetType || null) : null,
        target_attributes: fitsSomething && Object.keys(targetAttrs).length ? targetAttrs : null,
        spec: spec.trim() || null,
        notes: notes.trim() || null,
      },
      applyToAll,
    });
  }

  function close() { loadedFor = null; saving = false; show = false; dispatch('close'); }
</script>

<Modal bind:show title="What should happen to {componentRef}" size="large" on:close={close}>
  <div class="space-y-4">

    <!-- What is there now -->
    <div class="p-3 rounded border border-slate-700 bg-slate-800/40">
      <p class="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Now</p>
      <div class="flex items-center gap-2">
        <p class="text-sm text-slate-200">
          {currentType?.name ?? item?.component?.type_code ?? '—'}
          <span class="text-xs text-slate-500">· {item?.component?.status ?? '—'}</span>
        </p>
        <div class="flex-1"></div>
        {#if item?.component?.plan_id}
          <button
            class="text-xs text-slate-400 hover:text-purple-300 transition-colors"
            on:click={() => showPlan = !showPlan}
          >&#9678; {showPlan ? 'Hide plan' : 'Show on plan'}</button>
        {/if}
      </div>

      {#if showPlan}
        <div class="mt-2">
          {#if planError}
            <p class="text-xs text-red-300">&#9888; {planError}</p>
          {:else}
            <div class="flex justify-center">
              <canvas bind:this={planCanvas}
                      class="max-w-full rounded border border-slate-700 bg-slate-900"></canvas>
            </div>
            {#if !planPlaced}
              <p class="text-xs text-amber-300 mt-1">
                On this plan, but without a position set.
              </p>
            {/if}
          {/if}
        </div>
      {/if}
      {#if currentText}
        <p class="text-xs text-slate-400 mt-1">{currentText}</p>
      {/if}
    </div>

    <FormSelect label="Action" bind:value={action}
                options={WORKS_ACTIONS.map(a => ({ value: a.value, label: a.label }))} />
    <p class="text-xs text-slate-500 -mt-2">{actionDef(action)?.describe}</p>

    {#if fitsSomething}
      <div class="p-3 rounded border border-purple-500/30 bg-purple-500/5 space-y-3">
        <p class="text-[11px] uppercase tracking-wide text-purple-300">After</p>

        <FormSelect label="Replace with" bind:value={targetType}
          options={[{ value: '', label: 'Same type' },
                    ...replacementTypes.map(t => ({ value: t.code, label: t.name }))]} />
        <p class="text-xs text-slate-500 -mt-2">
          Types in the same system as the one being replaced.
        </p>

        {#if targetDefs.length}
          <div>
            <div class="flex items-center gap-2 mb-1.5">
              <p class="text-xs text-slate-400">Attributes of the new fitting</p>
              <button class="text-[11px] text-slate-500 hover:text-slate-300 underline
                             underline-offset-2"
                      on:click={copyCurrent}>Copy what is there now</button>
            </div>
            <!-- AttrField is the app's own attribute control — the one the
                 component form and the detail panel use. Hand-rolling these was
                 the bug: it guessed `def.options`, but the options live in the
                 store's `attrOptions` map keyed by attribute id, so every
                 dropdown came up empty. Reusing the component also gets radio,
                 checkbox and number right for free. -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              {#each targetDefs as def (def.id)}
                {@const currentMatch = currentDefs.find(d => d.name === def.name)}
                {@const was = currentMatch ? (currentValues[currentMatch.id] ?? '') : ''}
                <div>
                  <AttrField
                    {def}
                    options={attrOptions[def.id] ?? []}
                    value={targetAttrs[def.id] ?? ''}
                    on:change={(e) => setAttr(e.detail.attrDefId, e.detail.value)}
                  />
                  {#if was}
                    <!-- The current value beside the box, because the question
                         is what CHANGES, not what the new value is. -->
                    <p class="text-[10px] text-slate-600 mt-0.5">now {was}</p>
                  {/if}
                </div>
              {/each}
            </div>
            <p class="text-[11px] text-slate-600 mt-1.5">
              Leave one blank to keep whatever the asset already records.
            </p>
          </div>
        {/if}
      </div>
    {/if}

    <div>
      <FormInput label="Specification (optional)" bind:value={spec}
                 list="works-spec-suggestions"
                 placeholder="e.g. LED batten, 4000K, 3h emergency" />
      <!-- A native combobox: still free text, but anything specified before is
           one keystroke away. Fed from what this building's schedules have
           actually said, so it needs no curating and cannot go stale. -->
      <datalist id="works-spec-suggestions">
        {#each specOptions as option}<option value={option}></option>{/each}
      </datalist>
      {#if specOptions.length}
        <p class="text-[11px] text-slate-600 mt-0.5">
          Start typing to reuse one of {specOptions.length} specification{specOptions.length === 1 ? '' : 's'}
          written before.
        </p>
      {/if}
    </div>
    <FormTextarea label="Notes for this item (optional)" bind:value={notes} rows={2} />
  </div>

  {#if matchingCount > 1}
    <!-- The real saving: forty identical fittings get specified once. Matched
         on action AND replacement type, because that is the set a
         specification actually describes. -->
    <label class="flex items-start gap-2 cursor-pointer mt-4 p-2 rounded
                  border border-slate-700 bg-slate-800/40">
      <input type="checkbox" bind:checked={applyToAll} class="mt-0.5 accent-purple-500" />
      <span class="text-xs text-slate-400">
        Use this specification for all {matchingCount} lines doing the same thing
        <span class="block text-slate-500">
          Same action and same replacement type. The specification and the new
          fitting's attributes are copied; notes stay with their own line, and
          work already carried out is left alone.
        </span>
      </span>
    </label>
  {/if}

  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" disabled={saving} on:click={close}>Cancel</Button>
    <Button variant="primary" disabled={saving} on:click={save}>
      {saving ? 'Saving…' : 'Save line'}
    </Button>
  </div>
</Modal>
