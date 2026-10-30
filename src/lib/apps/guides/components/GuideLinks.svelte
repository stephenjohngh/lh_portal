<!-- src/lib/apps/guides/components/GuideLinks.svelte -->
<!-- Where a guide is offered (admins). A link names a planned obligation, a type of
     component, or both: a guide linked to both shows only on that type's components
     inside that walk; a guide linked to the obligation alone shows for the whole walk.
     The most specific guide is offered first. The pickers read the owning apps only
     through their public interfaces / shared reference data; a link stores ids only. -->
<script>
  import { onMount } from 'svelte';
  import Button from '#lib/components/common/Button.svelte';
  import Checkbox from '#lib/components/common/Checkbox.svelte';
  import FormInput from '#lib/components/common/FormInput.svelte';
  import FormSelect from '#lib/components/common/FormSelect.svelte';
  import { api } from '#lib/utils/api.js';
  import { listPlannedObligations } from '#lib/apps/compliance/public.js';
  import { listPlannerEventsForPicker } from '#lib/apps/planner/public.js';
  import { buildSpaceRef } from '#lib/utils/spaceRef.js';
  import { guidesStore } from '../stores/guidesStore.js';
  import { specificity } from '../utils/guideModel.js';
  import { buildComponentRef } from '#lib/utils/componentRef.js';
  import { matchesSearch } from '#lib/utils/textSearch.js';
  import { errMessage } from '#lib/utils/errors.js';

  /** @type {string} */
  export let guideId;

  /** @type {any[]} */ let links = [];
  /** @type {any[]} */ let obligations = [];
  /** @type {any[]} */ let types = [];
  /** @type {any[]} */ let attributes = [];
  /** @type {any[]} */ let components = [];
  /** @type {any[]} */ let floors = [];
  /** @type {any[]} */ let spaces = [];
  /** @type {any[]} */ let events = [];
  let spaceId = '';
  let eventId = '';
  let onlyOnFail = false;
  let obligationId = '';
  let typeId = '';
  let attributeId = '';
  let componentId = '';
  let componentSearch = '';
  let error = '';
  let busy = false;
  let loaded = false;

  $: obName = (/** @type {string} */ id) => obligations.find((o) => o.id === id)?.name ?? 'a planned obligation that is no longer there';
  $: tyName = (/** @type {string} */ id) => types.find((t) => t.id === id)?.name ?? 'a type that is no longer there';
  $: refOf = (/** @type {string} */ id) => {
    const c = components.find((x) => x.id === id);
    return c ? buildComponentRef(c, floors, types) : 'a component that is no longer there';
  };
  $: spaceName = (/** @type {string} */ id) => {
    const sp = spaces.find((x) => x.id === id);
    return sp ? `${buildSpaceRef(sp, floors)}${sp.name ? ` — ${sp.name}` : ''}` : 'a space that is no longer there';
  };
  $: eventName = (/** @type {string} */ id) => events.find((e) => e.id === id)?.title ?? 'an event that is no longer there';
  $: attrName = (/** @type {string} */ id) => attributes.find((a) => a.id === id)?.name ?? 'a check that is no longer there';
  // A check belongs to a type, so it is chosen from the chosen type's condition checks.
  $: typeAttributes = typeId ? attributes.filter((a) => a.component_type_id === typeId && a.checkable) : [];
  $: if (attributeId && !typeAttributes.some((a) => a.id === attributeId)) attributeId = '';
  $: componentMatches = componentSearch.trim().length >= 2
    ? components.filter((c) => matchesSearch([buildComponentRef(c, floors, types), c.label, c.asset_id], componentSearch)).slice(0, 15)
    : [];
  $: describe = (/** @type {any} */ l) => [
      l.obligation_id && `walk: ${obName(l.obligation_id)}`,
      l.component_type_id && `type: ${tyName(l.component_type_id)}`,
      l.type_attribute_id && `check: ${attrName(l.type_attribute_id)}`,
      l.component_id && `component: ${refOf(l.component_id)}`,
      l.space_id && `space: ${spaceName(l.space_id)}`,
      l.planner_series_id && `Planner event: ${eventName(l.planner_series_id)}`,
    ]
    .filter(Boolean).join(' · ') || 'somewhere else (set by another screen)';

  onMount(async () => {
    try {
      [links, obligations, types, attributes, components, floors, spaces, events] = await Promise.all([
        guidesStore.listLinks(guideId),
        listPlannedObligations(),
        api.getAll('component_types', { orderBy: 'name' }),
        api.getAll('type_attributes', { orderBy: 'presentation_order' }),
        api.getAll('components', { select: 'id, type_code, asset_id, label, floor_id' }),
        api.getAll('floors', { orderBy: 'id' }),
        api.getAll('spaces', { select: 'id, name, kind, assigned_id, floor_id' }),
        listPlannerEventsForPicker(),
      ]);
    } catch (e) { error = errMessage(e); }
    finally { loaded = true; }
  });

  async function add() {
    if (!obligationId && !typeId && !attributeId && !componentId && !spaceId && !eventId) return;
    busy = true; error = '';
    try {
      const l = await guidesStore.addLink(guideId, {
        obligation_id: obligationId || null, component_type_id: typeId || null,
        type_attribute_id: attributeId || null, component_id: componentId || null,
        space_id: spaceId || null, planner_series_id: eventId || null,
        show_on: onlyOnFail ? 'fail' : 'always',
      });
      links = [...links, l]; obligationId = ''; typeId = ''; attributeId = ''; componentId = ''; componentSearch = ''; spaceId = ''; eventId = ''; onlyOnFail = false;
    } catch (e) { error = errMessage(e); }
    finally { busy = false; }
  }

  async function remove(/** @type {any} */ l) {
    busy = true; error = '';
    try { await guidesStore.deleteLink(guideId, l.id); links = links.filter((x) => x.id !== l.id); }
    catch (e) { error = errMessage(e); }
    finally { busy = false; }
  }
</script>

<section class="rounded-lg border border-slate-700 bg-slate-800/60 p-3 space-y-2" data-testid="guide-links">
  <h3 class="text-sm font-semibold text-white">Where it is offered</h3>
  <p class="text-xs text-slate-400">
    In an inspection walk, on a space, or on a Planner event. Choose a planned obligation (the whole walk), a type of component, a single check of that type, or one component — or combine them: the guide is offered only where everything you choose matches.
   
  </p>
  {#if error}<p class="text-red-400 text-sm" role="alert">{error}</p>{/if}
  {#if !loaded}
    <p class="text-sm text-slate-400">Loading…</p>
  {:else}
    {#if links.length === 0}
      <p class="text-sm text-slate-400" data-testid="no-links">Not offered anywhere yet.</p>
    {/if}
    <ul class="space-y-1">
      {#each links as l (l.id)}
        <li class="flex items-center gap-2 text-sm text-slate-200">
          <span class="flex-1">{describe(l)}{#if l.show_on === 'fail'} <span class="text-xs text-amber-300">· only when a check fails</span>{/if} <span class="text-xs text-slate-500">({specificity(l) === 2 ? 'specific' : 'general'})</span></span>
          <Button variant="danger" size="xs" disabled={busy} on:click={() => remove(l)}>Remove</Button>
        </li>
      {/each}
    </ul>
    <div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
      <FormSelect label="Planned obligation" placeholder="— any —" bind:value={obligationId}
        options={obligations.map((o) => ({ value: o.id, label: o.name }))} />
      <FormSelect label="Type of component" placeholder="— any —" bind:value={typeId}
        options={types.map((t) => ({ value: t.id, label: t.name }))} />
    </div>
    <div class="grid gap-2 sm:grid-cols-2 items-end">
      <FormSelect label="A check of that type" placeholder={typeId ? '— any —' : 'choose a type first'} bind:value={attributeId}
        disabled={!typeId} options={typeAttributes.map((a) => ({ value: a.id, label: a.name }))} />
      <div>
        <FormInput label="One component (type 2+ letters of its ref)" bind:value={componentSearch} placeholder="e.g. 7/E/12" />
        {#if componentMatches.length}
          <ul class="mt-1 max-h-40 overflow-y-auto rounded border border-slate-600 bg-slate-900">
            {#each componentMatches as c (c.id)}
              <li><Button variant="plain" size="xs" className="w-full !justify-start" on:click={() => { componentId = c.id; componentSearch = buildComponentRef(c, floors, types); }}>
                {buildComponentRef(c, floors, types)}{c.label ? ` — ${c.label}` : ''}</Button></li>
            {/each}
          </ul>
        {/if}
        {#if componentId}<p class="text-xs text-teal-300 mt-1">Chosen: {refOf(componentId)}</p>{/if}
      </div>
    </div>
    <div class="grid gap-2 sm:grid-cols-2 items-end">
      <FormSelect label="A space (e.g. the bin store)" placeholder="— none —" bind:value={spaceId}
        options={spaces.map((sp) => ({ value: sp.id, label: spaceName(sp.id) }))} />
      <FormSelect label="A Planner event (e.g. bin day)" placeholder="— none —" bind:value={eventId}
        options={events.map((e) => ({ value: e.id, label: e.title }))} />
    </div>
    <Checkbox label="Only offer this when a check fails (a “what to do if this fails” guide)" bind:checked={onlyOnFail} />
    <Button variant="secondary" disabled={busy || (!obligationId && !typeId && !attributeId && !componentId && !spaceId && !eventId)} on:click={add}>Add link</Button>
  {/if}
</section>
