<!-- src/lib/apps/guides/components/GuideReader.svelte -->
<!-- Reading one guide: an intro (what you will need, how long), then ONE STEP PER SCREEN —
     photos above the text, a big Next — and a closing screen. Works with one hand on a
     phone: large buttons, swipe left/right, arrow keys. Shows the guide's frozen published
     version (never the draft). An administrator also sees "Edit this guide".

     ⛔ A guide says how; it is not a record that anything was done. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import Button from '#lib/components/common/Button.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';
  import { guidesStore } from '../stores/guidesStore.js';
  import { readerScreens, stepBy, swipeDirection, KIND_LABEL } from '../utils/guideModel.js';
  import { normalisePhotoUrl } from '#lib/utils/driveUtils.js';
  import { fmtDateOnly } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';

  /** @type {any} */
  export let guide;
  export let isAdmin = false;

  const dispatch = createEventDispatcher();

  let loading = true;
  let error = '';
  /** @type {any} */ let snapshot = null;
  let at = 0;
  let touchX = 0, touchY = 0;

  $: screens = readerScreens(snapshot);
  $: screen = screens[at];
  $: total = screens.filter((s) => s.type === 'step').length;
  $: kindTone = (k) => ({ caution: 'amber', stop: 'red', good: 'green', bad: 'red' }[k] ?? 'teal');

  onMount(async () => {
    try {
      const v = await guidesStore.readVersion(guide.id, guide.version);
      if (!v) throw new Error('This guide has no published copy to read.');
      snapshot = v.snapshot;
    } catch (e) { error = errMessage(e); }
    finally { loading = false; }
  });

  const go = (/** @type {number} */ by) => { at = stepBy(at, by, screens.length); };
  function onKey(/** @type {KeyboardEvent} */ e) {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  }
  function onTouchStart(/** @type {TouchEvent} */ e) { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }
  function onTouchEnd(/** @type {TouchEvent} */ e) {
    const d = swipeDirection(e.changedTouches[0].clientX - touchX, e.changedTouches[0].clientY - touchY);
    if (d) go(d);
  }
</script>

<svelte:window on:keydown={onKey} />

<div class="max-w-xl mx-auto space-y-3" role="region" aria-label="Guide" data-testid="guide-reader"
  on:touchstart={onTouchStart} on:touchend={onTouchEnd}>
  <div class="flex items-center gap-2">
    <Button variant="tertiary" size="xs" on:click={() => dispatch('close')}>‹ All guides</Button>
    <span class="flex-1"></span>
    {#if isAdmin}<Button variant="secondary" size="xs" admin on:click={() => dispatch('edit', guide)}>Edit this guide</Button>{/if}
  </div>

  {#if loading}
    <LoadingSpinner text="Opening the guide…" />
  {:else if error}
    <p class="text-red-400 text-sm" role="alert">{error}</p>
  {:else}
    <h2 class="text-xl font-semibold text-white">{guide.title}</h2>

    {#if screen.type === 'intro'}
      <section class="space-y-3" data-testid="reader-intro">
        {#if guide.summary}<p class="text-slate-200">{guide.summary}</p>{/if}
        {#if snapshot?.minutes ?? guide.minutes}<p class="text-slate-300">About {snapshot?.minutes ?? guide.minutes} minutes</p>{/if}
        {#if snapshot?.you_need ?? guide.you_need}
          <p class="rounded-lg border border-slate-600 bg-slate-800/60 p-3 text-slate-100">
            <span class="block text-xs uppercase tracking-wide text-slate-400">You will need</span>
            {snapshot?.you_need ?? guide.you_need}
          </p>
        {/if}
        <p class="text-sm text-slate-400">{total} step{total === 1 ? '' : 's'}</p>
        {#if guide.reviewed_at}<p class="text-xs text-slate-500">Last reviewed {fmtDateOnly(guide.reviewed_at)}</p>{/if}
      </section>
    {:else if screen.type === 'step'}
      {@const st = screen.step}
      <section class="rounded-lg border-l-4 p-3 space-y-3 bg-slate-800/60 tone-{kindTone(st.kind)}" data-testid="reader-step">
        <p class="text-sm text-slate-400">Step {screen.index + 1} of {total}</p>
        {#if st.kind !== 'step'}<p class="text-xs font-bold tracking-wide kind">{KIND_LABEL[st.kind]?.toUpperCase()}</p>{/if}
        {#each st.photos ?? [] as p (p.id)}
          <img src={normalisePhotoUrl(p.url)} alt={st.title} class="w-full rounded-lg border border-slate-600" loading="lazy" />
        {/each}
        <h3 class="text-lg font-semibold text-white">{st.title}</h3>
        {#if st.body}<p class="text-slate-100 whitespace-pre-wrap">{st.body}</p>{/if}
      </section>
    {:else}
      <section class="space-y-2" data-testid="reader-done">
        <p class="text-lg text-white">That is the end of the guide.</p>
        <p class="text-sm text-slate-400">A guide shows how a job is done. It is not a record that it was done.</p>
        <Button variant="secondary" on:click={() => dispatch('close')}>Back to all guides</Button>
      </section>
    {/if}

    <div class="flex gap-2 pt-1">
      <Button variant="secondary" size="large" className="flex-1" disabled={at === 0} on:click={() => go(-1)}>◀ Back</Button>
      <Button size="large" className="flex-1" disabled={at === screens.length - 1} testid="reader-next" on:click={() => go(1)}>
        {at === 0 ? 'Start ▶' : 'Next ▶'}
      </Button>
    </div>
    <div class="h-1.5 rounded bg-slate-700" aria-hidden="true">
      <div class="h-1.5 rounded bg-teal-500" style="width:{(at / Math.max(1, screens.length - 1)) * 100}%"></div>
    </div>
  {/if}
</div>

<style>
  .tone-teal { border-color: #14b8a6; }
  .tone-amber { border-color: #f59e0b; }
  .tone-red { border-color: #ef4444; }
  .tone-green { border-color: #22c55e; }
  .tone-amber .kind { color: #fbbf24; }
  .tone-red .kind { color: #f87171; }
  .tone-green .kind { color: #4ade80; }
</style>
