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
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import AttrField    from '../AttrField.svelte';
  import { WORKS_ACTIONS, actionDef } from '../../utils/worksSchedule.js';
  import { attrPairsText, componentAttrPairs } from '../../utils/attrDisplay.js';

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

  const dispatch = createEventDispatcher();

  let action = 'replace';
  let targetType = '';
  let spec = '';
  let notes = '';
  /** { [type_attribute_id]: value } — only what the author has set. */
  let targetAttrs = {};
  let saving = false;

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

  function save() {
    saving = true;
    dispatch('save', {
      action,
      target_type_code: fitsSomething ? (targetType || null) : null,
      target_attributes: fitsSomething && Object.keys(targetAttrs).length ? targetAttrs : null,
      spec: spec.trim() || null,
      notes: notes.trim() || null,
    });
  }

  function close() { loadedFor = null; saving = false; show = false; dispatch('close'); }
</script>

<Modal bind:show title="What should happen to {componentRef}" size="large" on:close={close}>
  <div class="space-y-4">

    <!-- What is there now -->
    <div class="p-3 rounded border border-slate-700 bg-slate-800/40">
      <p class="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Now</p>
      <p class="text-sm text-slate-200">
        {currentType?.name ?? item?.component?.type_code ?? '—'}
        <span class="text-xs text-slate-500">· {item?.component?.status ?? '—'}</span>
      </p>
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

    <FormInput label="Specification (optional)" bind:value={spec}
               placeholder="e.g. LED batten, 4000K, 3h emergency" />
    <FormTextarea label="Notes for this item (optional)" bind:value={notes} rows={2} />
  </div>

  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" disabled={saving} on:click={close}>Cancel</Button>
    <Button variant="primary" disabled={saving} on:click={save}>
      {saving ? 'Saving…' : 'Save line'}
    </Button>
  </div>
</Modal>
