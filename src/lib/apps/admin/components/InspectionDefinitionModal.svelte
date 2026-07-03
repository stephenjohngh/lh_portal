<!-- src/lib/apps/admin/components/InspectionDefinitionModal.svelte -->
<!-- Create / edit an inspection_definitions row. Composes the shared ScopeEditor
     and shows a live "matches N" count via applyInspectionScope. Phase 1 is
     standard mode only (rotating is scaffolded but disabled). checklist_mode and
     pass_fail_rule are fixed to their Phase-1 defaults (shown, disabled). -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import Checkbox     from '$lib/components/common/Checkbox.svelte';
  import ScopeEditor  from '$lib/apps/building_assets/components/inspections/ScopeEditor.svelte';
  import { applyInspectionScope } from '$lib/apps/building_assets/utils/inspectionScope.js';

  export let definition = null;   // row or null (create)
  export let types    = [];
  export let systems  = [];
  export let floors   = [];
  export let attrDefs = {};
  export let components     = [];
  export let componentAttrs = {};
  export let inspections    = {};
  export let saving = false;

  const dispatch = createEventDispatcher();
  const isEdit = !!definition;

  // Form state
  let name        = definition?.name ?? '';
  let description = definition?.description ?? '';
  let active      = definition?.active ?? true;
  let mode        = definition?.mode ?? 'standard';
  let scope       = definition?.scope ? structuredClone(definition.scope) : {};
  let frequencyDays = definition?.frequency_days ?? null;
  let linkSource    = definition?.link_source ?? 'component_links';
  let linkTypeFilter = definition?.link_type_filter ?? '';

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
        presentation_order: definition?.presentation_order ?? 0,
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
    </div>

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
    </div>

    <!-- Mode (rotating scaffolded, disabled in Phase 1) -->
    <div class="block">
      <p class="block-lbl">Type of inspection</p>
      <div class="mode-row">
        <button type="button" class="mode-chip" class:on={mode === 'standard'} on:click={() => mode = 'standard'}>
          Standard <span class="mode-sub">check all matched components</span>
        </button>
        <button type="button" class="mode-chip" class:on={mode === 'rotating'} disabled title="Coming in Phase 2">
          Rotating / trigger <span class="mode-sub">Phase 2</span>
        </button>
      </div>
    </div>

    {#if mode === 'rotating'}
      <div class="block rot">
        <p class="block-lbl">Linked components</p>
        <label class="rot-row"><input type="radio" bind:group={linkSource} value="component_links" /> The trigger’s linked components (component_links)</label>
        <label class="rot-row"><input type="radio" bind:group={linkSource} value="self_only" /> Only the trigger itself</label>
        <FormInput label="Restrict to link_type (optional)" bind:value={linkTypeFilter} placeholder="e.g. fire_trigger" />
      </div>
    {/if}

    <!-- Scope -->
    <div class="block">
      <p class="block-lbl">What is inspected</p>
      <ScopeEditor
        {scope} {types} {systems} {floors} {attrDefs}
        matchCount={matchCount} totalCount={components.length}
        on:change={onScopeChange}
      />
    </div>

    <!-- Phase-1 fixed settings (shown for transparency) -->
    <details class="advanced">
      <summary>Advanced (Phase 1 defaults)</summary>
      <p class="hint">Checklist: <strong>type-driven</strong> — each component checks its own type’s condition attributes. Pass/fail: <strong>manual</strong> — the inspector sets the result. Configurable in a later phase.</p>
    </details>
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
  .active-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: rgb(203 213 225); cursor: pointer; }
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

  .mode-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .mode-chip { border-radius: 8px; display: flex; flex-direction: column; align-items: flex-start; }
  .mode-chip.on { background: rgb(var(--lh-accent-rgb) / 0.22); border-color: var(--lh-accent); color: rgb(226 232 240); }
  .mode-chip:disabled { opacity: 0.5; cursor: not-allowed; }
  .mode-sub { font-size: 0.65rem; color: rgb(100 116 139); margin-top: 0.15rem; }

  .rot { border-left: 2px solid rgb(251 146 60 / 0.5); padding-left: 0.75rem; }
  .rot-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: rgb(203 213 225); margin-bottom: 0.3rem; cursor: pointer; }

  .advanced { font-size: 0.8rem; color: rgb(148 163 184); }
  .advanced summary { cursor: pointer; color: rgb(100 116 139); }
</style>
