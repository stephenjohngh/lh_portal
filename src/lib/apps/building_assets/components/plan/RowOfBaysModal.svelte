<!-- plan/RowOfBaysModal.svelte -->
<!-- Split a four-cornered outline into a row of numbered Parking bays.
     Draw the whole row once, then say how many bays, which way, the numbers
     and the size. All the bays are created in one insert (all or none), each
     a Parking bay of that size numbered in order along the row; the outline
     is then removed unless kept. docs/requirements/app_designs/Parking_App_Design.md §7. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { buildingAssetsStore } from '../../stores/buildingAssetsStore.js';
  import { splitQuad, longSide, bayNumbers, numberClashes, validateRow } from '../../utils/bayRow.js';
  import { typesForKind } from '../../utils/spaceTypeOptions.js';
  import { measureSides, fmt1 } from './planMeasure.js';
  import { buildSpaceRef } from '#lib/utils/spaceRef.js';
  import Modal        from '#lib/components/common/Modal.svelte';
  import Button       from '#lib/components/common/Button.svelte';
  import FormInput    from '#lib/components/common/FormInput.svelte';
  import FormSelect   from '#lib/components/common/FormSelect.svelte';
  import Checkbox     from '#lib/components/common/Checkbox.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';

  export let show = false;
  export let space = null;          // the outline being split
  export let floors = [];
  export let planAR = 1;
  export let metresPerUnit = null;

  const dispatch = createEventDispatcher();

  let form = {};
  let openedFor = null;
  let saving = false;
  let error = '';

  $: sizes = typesForKind($buildingAssetsStore.spaceTypes, 'slot');
  $: poly = space?.polygon ?? [];
  $: long = poly.length === 4 ? longSide(poly, planAR || 1) : 0;

  // Reset when opened for a different outline (a primitive key).
  $: key = show && space ? space.id : null;
  $: if (key && key !== openedFor) {
    openedFor = key;
    form = { count: '4', along: 'long', start: '1', step: '1', prefix: '', size: sizes[1] ?? sizes[0] ?? '', keepOutline: false };
    error = '';
  }
  $: if (!show) openedFor = null;

  $: side = form.along === 'long' ? long : 1 - long;
  $: problem = poly.length ? validateRow(poly, form) : null;
  $: bays = !problem ? splitQuad(poly, Number(form.count), side) : [];
  $: numbers = !problem ? bayNumbers(Number(form.count), form.start, form.step, form.prefix.trim()) : [];
  $: clashes = space ? numberClashes(numbers, $buildingAssetsStore.spaces, space.floor_id, space.id) : [];
  $: sidesM = bays.length && metresPerUnit ? measureSides(bays[0], planAR || 1, metresPerUnit) : [];

  // Preview: the outline's bounding box scaled into a fixed frame. The x axis
  // is stretched by the plan's aspect ratio so the bays look as they do on it.
  $: box = (() => {
    if (poly.length !== 4) return null;
    const xs = poly.map(p => p.x * (planAR || 1)), ys = poly.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(...xs) - minX || 1e-6, h = Math.max(...ys) - minY || 1e-6;
    const s = Math.min(460 / w, 200 / h);
    return { pt: (p) => `${(p.x * (planAR || 1) - minX) * s + 10},${(p.y - minY) * s + 10}`,
      W: w * s + 20, H: h * s + 20, s, minX, minY };
  })();
  const centre = (b) => ({ x: b.reduce((t, p) => t + p.x, 0) / 4, y: b.reduce((t, p) => t + p.y, 0) / 4 });

  async function create() {
    const outline = space;              // captured before any await
    if (problem) { error = problem; return; }
    if (!form.size) { error = 'Choose the bay size.'; return; }
    if (clashes.length) { error = `Already used on this floor: ${clashes.join(', ')}.`; return; }
    saving = true; error = '';
    let created = [];
    try {
      created = await buildingAssetsStore.createSpaces(bays.map((polygon, i) => ({
        plan_id: outline.plan_id, floor_id: outline.floor_id, polygon,
        kind: 'slot', type: form.size, assigned_id: numbers[i], label: numbers[i],
        colour: outline.colour, show_label: true,
      })));
    } catch (/** @type {any} */ err) {
      error = `No bays were created: ${err.message}`;
      saving = false;
      return;
    }
    let outlineRemoved = false;
    if (!form.keepOutline) {
      try { await buildingAssetsStore.deleteSpace(outline.id); outlineRemoved = true; }
      catch (/** @type {any} */ err) {
        // The bays exist; only the outline is left. Say so plainly.
        error = `${created.length} bays were created, but the outline could not be removed (${err.message}). Delete it yourself.`;
      }
    }
    saving = false;
    if (!error) dispatch('done', { created: created.length, outlineRemoved });
  }
</script>

<Modal {show} title="Split into a row of parking bays" size="large" on:close={() => dispatch('close')}>
  {#if space}
    <div class="space-y-4">
      <p class="text-sm text-slate-400">
        The outline <span class="font-mono text-slate-200">{buildSpaceRef(space, floors)}</span> becomes a row of
        Parking bays, cut across its {form.along === 'long' ? 'long' : 'short'} side and numbered from one end.
      </p>

      <div class="grid grid-cols-3 gap-3">
        <FormInput label="How many bays" bind:value={form.count} />
        <FormSelect label="Split along" bind:value={form.along} placeholder=""
          options={[{ value: 'long', label: 'The long side' }, { value: 'short', label: 'The short side' }]} />
        <FormSelect label="Bay size" bind:value={form.size} options={sizes} placeholder="-- Choose --" />
      </div>
      <div class="grid grid-cols-3 gap-3">
        <FormInput label="First number" bind:value={form.start} />
        <FormInput label="Step" bind:value={form.step} helpText="2 gives 2, 4, 6… for one side of an aisle" />
        <FormInput label="Prefix (optional)" bind:value={form.prefix} placeholder="e.g. B for bikes" />
      </div>

      {#if box && bays.length}
        <div class="rounded-lg border border-slate-700 bg-slate-900 p-2">
          <svg viewBox="0 0 {box.W} {box.H}" class="w-full h-auto max-h-60" data-testid="row-preview">
            <polygon points={poly.map(box.pt).join(' ')} fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 4" />
            {#each bays as b, i}
              {@const c = centre(b)}
              <polygon points={b.map(box.pt).join(' ')} fill="#22c55e" fill-opacity="0.25" stroke="#22c55e" stroke-width="1.5" />
              <text x={(c.x * (planAR || 1) - box.minX) * box.s + 10} y={(c.y - box.minY) * box.s + 10}
                text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="12" font-weight="700">{numbers[i]}</text>
            {/each}
          </svg>
          <p class="text-xs text-slate-400 mt-1">
            {bays.length} bays, {numbers[0]} to {numbers[numbers.length - 1]}.
            {#if sidesM.length}Each about {fmt1(sidesM[0])} × {fmt1(sidesM[sidesM.length - 1])} m.
            {:else}The schematic has no scale, so their size cannot be shown.{/if}
          </p>
        </div>
      {/if}

      {#if clashes.length}
        <p class="text-xs text-amber-300">Already used by a bay on this floor: {clashes.join(', ')}. Change the first number or add a prefix.</p>
      {/if}

      <Checkbox bind:checked={form.keepOutline} label="Keep the outline as well" />
      {#if error || problem}<ErrorDisplay message={error || problem} />{/if}
    </div>
  {/if}
  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" on:click={() => dispatch('close')}>Cancel</Button>
    <Button variant="primary" loading={saving} disabled={saving || !!problem || clashes.length > 0}
      on:click={create}>Create {bays.length || ''} bays</Button>
  </div>
</Modal>
