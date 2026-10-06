<!-- src/lib/apps/parking/components/PermitTemplatePanel.svelte -->
<!-- The parking permit's look (admin only, migration 236): the words above the
     details, the first permit number, and the two images — a background
     behind the top two-thirds and a FIXED image filling the bottom third,
     which nothing is written over. The building's name and address come from
     Admin → Other Config → Building & business, not from here. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { permitStore, TEMPLATE_IMAGES } from '../stores/permitStore.js';
  import { errMessage } from '#lib/utils/errors.js';
  import Button       from '#lib/components/common/Button.svelte';
  import FormInput    from '#lib/components/common/FormInput.svelte';
  import FormTextarea from '#lib/components/common/FormTextarea.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';

  /** @type {{ name: string, address?: string|null }} */
  export let building;

  const dispatch = createEventDispatcher();

  let open = false;
  let form = null;
  let loadedFor = null;
  // Key off the template's id and update time (a primitive), never the object.
  $: key = $permitStore.template ? `${$permitStore.template.id}:${$permitStore.template.updated_at}` : null;
  $: if (open && key && key !== loadedFor) {
    loadedFor = key;
    const t = $permitStore.template;
    if (t) form = { title: t.title ?? '', location: t.location ?? '', conditions: t.conditions ?? '', first_number: t.first_number ?? 100 };
  }

  let saving = false;
  let error = '';
  let note = '';
  async function save() {
    saving = true; error = ''; note = '';
    try { await permitStore.saveTemplate(form); note = 'Saved.'; }
    catch (/** @type {any} */ err) { error = errMessage(err, 'The template could not be saved.'); }
    finally { saving = false; }
  }

  let busyImage = null;
  async function pick(which, event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    busyImage = which; error = ''; note = '';
    try { note = (await permitStore.setImage(which, file)) ?? 'Image saved.'; }
    catch (/** @type {any} */ err) { error = errMessage(err, 'The image could not be saved.'); }
    finally { busyImage = null; }
  }
  async function clear(which) {
    busyImage = which; error = ''; note = '';
    try { note = (await permitStore.clearImage(which)) ?? 'Image removed.'; }
    catch (/** @type {any} */ err) { error = errMessage(err, 'The image could not be removed.'); }
    finally { busyImage = null; }
  }
</script>

<section class="mt-6 bg-slate-800/40 border border-slate-700 rounded-xl">
  <button type="button" class="w-full text-left px-4 py-3 text-slate-200 font-semibold flex justify-between"
    on:click={() => open = !open} aria-expanded={open}>
    <span>Permit template <span class="text-xs font-normal text-slate-400">— admin</span></span>
    <span class="text-slate-400">{open ? '▾' : '▸'}</span>
  </button>

  {#if open && form}
    <div class="px-4 pb-4 grid gap-4 lg:grid-cols-2">
      <div class="space-y-3">
        <p class="text-sm text-slate-400">
          The permit heads with <strong class="text-slate-200">{building.name}</strong>{#if building.address}, {building.address}{/if}
          — change those in Admin → Other Config → Building &amp; business.
        </p>
        <FormInput label="Title" bind:value={form.title} placeholder="Parking Permit" />
        <FormInput label="Where it is valid (optional)" bind:value={form.location}
          placeholder="e.g. Side road at the rear of the building" />
        <FormTextarea label="Small print (optional)" bind:value={form.conditions} rows={3}
          helpText="Printed small, just above the bottom image; two lines at most." />
        <FormInput label="First permit number" type="number" min="1" step="1" bind:value={form.first_number}
          helpText="Numbering continues from the highest permit issued, and never goes below this." />
        <div class="flex gap-2">
          <Button on:click={save} loading={saving} disabled={saving}>Save template</Button>
          <Button variant="secondary" on:click={() => dispatch('preview')}>⬇ Preview (sample PDF)</Button>
        </div>
      </div>

      <div class="space-y-3">
        {#each Object.entries(TEMPLATE_IMAGES) as [which, info]}
          <div class="border border-slate-700 rounded-lg p-3">
            <p class="text-sm text-slate-200 mb-2">{info.label}</p>
            {#if $permitStore.imageUrls[which]}
              <img src={$permitStore.imageUrls[which]} alt={info.label} class="max-h-40 rounded border border-slate-700 mb-2" />
            {:else}
              <p class="text-xs text-amber-400 mb-2">None set — the permit is plain white here.</p>
            {/if}
            <div class="flex items-center gap-2">
              <label class="px-3 py-1.5 text-sm rounded border border-slate-600 text-slate-200 hover:bg-slate-700 cursor-pointer">
                {busyImage === which ? 'Saving…' : $permitStore.imageUrls[which] ? 'Replace…' : 'Choose image…'}
                <input type="file" accept="image/png,image/jpeg" class="hidden" disabled={!!busyImage}
                  on:change={(e) => pick(which, e)} />
              </label>
              {#if $permitStore.imageUrls[which]}
                <Button size="small" variant="secondary" disabled={!!busyImage} on:click={() => clear(which)}>Remove</Button>
              {/if}
            </div>
          </div>
        {/each}
        <p class="text-xs text-slate-500">
          PNG or JPEG. The permit is A4 portrait: the background fills the top two-thirds (2480 × 2339 px is
          an exact fit) and the fixed image fits inside the bottom third (2480 × 1169 px).
        </p>
      </div>
    </div>
    {#if error}<div class="px-4 pb-4"><ErrorDisplay message={error} /></div>{/if}
    {#if note}<p class="px-4 pb-4 text-sm text-green-400">{note}</p>{/if}
  {/if}
</section>
