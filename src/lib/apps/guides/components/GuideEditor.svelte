<!-- src/lib/apps/guides/components/GuideEditor.svelte -->
<!-- Writing ONE guide (admins). The guide is a DRAFT working copy: every field is saved
     as you leave it, so a half-written guide is never lost, and nothing a reader sees
     changes until Publish freezes a new version (guide_publish).

     Short steps are the rule: a title, up to 600 characters of plain text and up to four
     photos. No door or alarm codes and no passwords — a guide is readable by every
     signed-in user. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import Button from '#lib/components/common/Button.svelte';
  import FormInput from '#lib/components/common/FormInput.svelte';
  import FormTextarea from '#lib/components/common/FormTextarea.svelte';
  import FormSelect from '#lib/components/common/FormSelect.svelte';
  import Checkbox from '#lib/components/common/Checkbox.svelte';
  import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';
  import { guidesStore } from '../stores/guidesStore.js';
  import { STEP_KINDS, KIND_LABEL, AUDIENCES, LIMITS, publishProblems, stepProblems, hasUnpublishedChanges } from '../utils/guideModel.js';
  import { normalisePhotoUrl } from '#lib/utils/driveUtils.js';
  import { errMessage } from '#lib/utils/errors.js';

  /** @type {any} */
  export let guide;

  const dispatch = createEventDispatcher();

  let loading = true;
  let error = '';
  let notice = '';
  /** @type {any[]} */ let steps = [];
  /** @type {Record<string, any[]>} */ let photos = {};
  /** @type {any[]} */ let versions = [];
  let busy = false;
  /** @type {any} */ let pendingDeleteStep = null;
  let pendingDeleteGuide = false;
  let pendingRetire = false;
  let tagsText = '';

  $: s = $guidesStore;
  $: categoryOptions = s.categories.filter((c) => !c.retired).map((c) => ({ value: c.key, label: c.name }));
  $: latest = versions[0] ?? null;
  $: withPhotos = steps.map((st) => ({ ...st, photos: photos[st.id] ?? [] }));
  $: problems = publishProblems(guide, withPhotos);
  $: unpublished = hasUnpublishedChanges(guide, latest);
  $: canPublish = problems.length === 0 && guide.status !== 'retired' && unpublished;

  async function reloadAll() {
    steps = await guidesStore.listSteps(guide.id);
    photos = await guidesStore.photosByStep(steps.map((x) => x.id));
    versions = guide.version > 0 ? await guidesStore.listVersions(guide.id) : [];
    const fresh = $guidesStore.guides.find((g) => g.id === guide.id);
    if (fresh) guide = fresh;
  }

  onMount(async () => {
    tagsText = (guide.tags ?? []).join(', ');
    try { await reloadAll(); } catch (e) { error = errMessage(e); } finally { loading = false; }
  });

  /** Run one action; show its failure rather than losing it. */
  async function run(fn, done = '') {
    error = ''; notice = '';
    busy = true;
    try { await fn(); if (done) notice = done; }
    catch (e) { error = errMessage(e); }
    finally { busy = false; }
  }

  const saveField = (patch) => run(async () => { await guidesStore.updateGuide(guide.id, patch); await reloadAll(); });
  const saveTags = () => saveField({ tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean) });
  const saveMinutes = (e) => {
    const v = e.target.value === '' ? null : Number(e.target.value);
    return saveField({ minutes: v });
  };

  const addStep = (kind = 'step') => run(async () => { await guidesStore.addStep(guide.id, { kind }); await reloadAll(); });
  const saveStep = (st, patch) => run(async () => { await guidesStore.updateStep(st.id, patch); await reloadAll(); });

  function move(index, by) {
    const ids = steps.map((x) => x.id);
    const to = index + by;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    return run(async () => { await guidesStore.reorderSteps(guide.id, ids); await reloadAll(); });
  }

  async function confirmDeleteStep() {
    const st = pendingDeleteStep;
    pendingDeleteStep = null;
    if (st) await run(async () => { await guidesStore.deleteStep(st.id); await reloadAll(); });
  }

  async function addPhotos(st, e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    for (const f of files) {
      await run(async () => {
        await guidesStore.addPhoto(guide, st.id, f, (photos[st.id] ?? []).length);
        photos = await guidesStore.photosByStep(steps.map((x) => x.id));
      });
      if (error) break;
    }
    await reloadAll();
  }

  const removePhoto = (p) => run(async () => { await guidesStore.removePhoto(guide, p); await reloadAll(); });

  const publish = () => run(async () => { const v = await guidesStore.publish(guide.id); await reloadAll(); notice = `Published as version ${v}.`; });
  const retire = () => run(async () => { pendingRetire = false; await guidesStore.retireGuide(guide.id); await reloadAll(); }, 'Retired.');

  async function deleteGuide() {
    pendingDeleteGuide = false;
    await run(async () => { await guidesStore.deleteGuide(guide.id); dispatch('deleted'); });
  }
</script>

{#if loading}
  <LoadingSpinner text="Loading the guide…" />
{:else}
  <div class="space-y-4" data-testid="guide-editor">
    <div class="flex flex-wrap items-center gap-2">
      <Button variant="tertiary" size="xs" on:click={() => dispatch('close')}>‹ All guides</Button>
      <span class="text-xs rounded px-2 py-0.5 bg-slate-700 text-slate-200" data-testid="guide-status">
        {guide.status}{guide.version > 0 ? ` · v${guide.version}` : ''}
      </span>
      {#if guide.version > 0 && unpublished && guide.status === 'published'}
        <span class="text-xs text-amber-300" data-testid="unpublished">Unpublished changes</span>
      {/if}
    </div>

    {#if error}<p class="text-red-400 text-sm" role="alert">{error}</p>{/if}
    {#if notice}<p class="text-emerald-400 text-sm" role="status">{notice}</p>{/if}

    <p class="text-xs text-slate-400">
      Never put door or alarm codes, keys' locations or passwords in a guide — every signed-in person can read it.
    </p>

    <section class="rounded-lg border border-slate-700 bg-slate-800/60 p-3 space-y-3">
      <FormInput label="Title" bind:value={guide.title} maxlength={120}
        on:blur={() => saveField({ title: guide.title })} />
      <FormTextarea label="What it is, in a sentence or two" rows={2} bind:value={guide.summary}
        on:blur={() => saveField({ summary: guide.summary || null })} />
      <div class="grid gap-3 sm:grid-cols-3">
        <FormSelect label="Category" placeholder="— none —" options={categoryOptions} bind:value={guide.category_key}
          on:change={() => saveField({ category_key: guide.category_key || null })} />
        <FormSelect label="For" options={AUDIENCES.map((a) => ({ value: a, label: a }))} bind:value={guide.audience}
          on:change={() => saveField({ audience: guide.audience })} />
        <FormInput label="Takes about (minutes)" type="number" min={1} max={LIMITS.minutesMax}
          value={guide.minutes ?? ''} on:change={saveMinutes} />
      </div>
      <FormInput label="You will need (one line)" bind:value={guide.you_need} placeholder="e.g. gloves, the bin-store key"
        on:blur={() => saveField({ you_need: guide.you_need || null })} />
      <FormInput label="Tags (comma separated)" bind:value={tagsText} on:blur={saveTags} />
      <Checkbox label="Staff only — hide from contractor accounts" checked={guide.staff_only}
        on:change={(e) => saveField({ staff_only: e.target.checked })} />
    </section>

    <section class="space-y-3" aria-label="Steps">
      {#each steps as st, i (st.id)}
        {@const own = stepProblems({ ...st, photos: photos[st.id] ?? [] })}
        <article class="rounded-lg border border-slate-700 bg-slate-800/60 p-3 space-y-2" data-testid="step-card">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold text-white">{i + 1}.</span>
            <select class="rounded bg-slate-900 border border-slate-600 text-sm text-white px-2 py-1" aria-label="Kind of step"
              value={st.kind} on:change={(e) => saveStep(st, { kind: e.target.value })}>
              {#each STEP_KINDS as k}<option value={k}>{KIND_LABEL[k]}</option>{/each}
            </select>
            <span class="flex-1"></span>
            <Button variant="tertiary" size="xs" ariaLabel="Move step up" disabled={i === 0 || busy} on:click={() => move(i, -1)}>↑</Button>
            <Button variant="tertiary" size="xs" ariaLabel="Move step down" disabled={i === steps.length - 1 || busy} on:click={() => move(i, 1)}>↓</Button>
            <Button variant="danger" size="xs" on:click={() => (pendingDeleteStep = st)}>Delete step</Button>
          </div>
          <FormInput label="Title" bind:value={st.title} maxlength={LIMITS.titleChars}
            on:blur={() => saveStep(st, { title: st.title })} />
          <FormTextarea label="What to do (plain text, short)" rows={3} maxlength={LIMITS.bodyChars} bind:value={st.body}
            on:blur={() => saveStep(st, { body: st.body || null })} />
          <div class="flex flex-wrap gap-2 items-start">
            {#each photos[st.id] ?? [] as p (p.id)}
              <div class="relative">
                <img src={normalisePhotoUrl(p.storage_url)} alt="" class="h-20 w-28 object-cover rounded border border-slate-600" />
                <Button variant="danger" size="xs" className="absolute top-0 right-0" ariaLabel="Remove photo" on:click={() => removePhoto(p)}>✕</Button>
              </div>
            {/each}
            {#if (photos[st.id] ?? []).length < LIMITS.photosPerStep}
              <label class="inline-flex items-center gap-2 text-sm text-teal-300 cursor-pointer rounded border border-dashed border-slate-600 px-3 py-2">
                <input type="file" accept="image/*" multiple class="sr-only" on:change={(e) => addPhotos(st, e)} />
                + Add photo
              </label>
            {/if}
          </div>
          {#each own as p}<p class="text-xs text-amber-300">{p}</p>{/each}
        </article>
      {/each}
      <Button variant="secondary" disabled={busy} on:click={() => addStep('step')}>+ Add a step</Button>
    </section>

    <section class="rounded-lg border border-slate-700 bg-slate-800/60 p-3 space-y-2">
      {#if problems.length}
        <p class="text-sm text-slate-300">Before it can be published:</p>
        <ul class="list-disc pl-5 text-sm text-amber-300" data-testid="publish-problems">
          {#each problems as p}<li>{p}</li>{/each}
        </ul>
      {/if}
      <div class="flex flex-wrap gap-2">
        <Button disabled={!canPublish || busy} testid="publish" on:click={publish}>
          {guide.version > 0 ? 'Publish changes' : 'Publish'}
        </Button>
        {#if guide.status === 'published'}
          <Button variant="secondary" disabled={busy} on:click={() => (pendingRetire = true)}>Retire</Button>
        {/if}
        {#if guide.version === 0}
          <Button variant="danger" disabled={busy} on:click={() => (pendingDeleteGuide = true)}>Delete draft</Button>
        {/if}
      </div>
      {#if versions.length}
        <p class="text-xs text-slate-400">Versions: {versions.map((v) => `v${v.version}`).join(' · ')}</p>
      {/if}
    </section>
  </div>
{/if}

<ConfirmDialog show={!!pendingDeleteStep} danger title="Delete this step?"
  message="The step and its photos are deleted from the draft. Published versions keep their own copy."
  confirmText="Delete step" on:confirm={confirmDeleteStep} on:cancel={() => (pendingDeleteStep = null)} />
<ConfirmDialog show={pendingDeleteGuide} danger title="Delete this draft?"
  message="The guide, its steps and their photos are deleted. A guide that was never published can be deleted; a published one is retired instead."
  confirmText="Delete draft" on:confirm={deleteGuide} on:cancel={() => (pendingDeleteGuide = false)} />
<ConfirmDialog show={pendingRetire} title="Retire this guide?"
  message="It stops being offered to readers and walks. Its history is kept."
  confirmText="Retire" on:confirm={retire} on:cancel={() => (pendingRetire = false)} />
