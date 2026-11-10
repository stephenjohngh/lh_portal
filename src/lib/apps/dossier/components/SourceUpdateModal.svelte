<!-- src/lib/apps/dossier/components/SourceUpdateModal.svelte
     "Update from issue" (2026-11-10): brings what is new on the Management issue a
     pack was made from into the pack, WITHOUT LOSING anything written in it. It
     shows what it will do before it does it. Rules: utils/packUpdate.js.
     Rolling back is the page's own History: every page replaced is saved there
     first, as "Before update from Issue N". -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal from '#lib/components/common/Modal.svelte';
  import Button from '#lib/components/common/Button.svelte';
  import Checkbox from '#lib/components/common/Checkbox.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';
  import { dossierStore } from '../stores/dossierStore.js';
  import { auth } from '#lib/stores/auth.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { planUpdate, describeUpdate } from '../utils/packUpdate.js';
  import { makeHtmlToNodes } from '../utils/planBlocks.js';
  import { pathLabel } from '../utils/packPlan.js';

  /** @type {any} */
  export let pack;
  export let show = false;

  const dispatch = createEventDispatcher();

  let loading = false;
  let applying = false;
  let error = '';
  /** @type {any} */ let plan = null;
  /** @type {any} */ let report = null;
  /** @type {any[]} */ let items = [];
  /** @type {Set<string>} */ let chosen = new Set();
  /** @type {any} */ let done = null;
  let readFor = null;

  $: label = plan?.source?.label ?? 'the issue';

  $: if (show && pack?.id && pack.id !== readFor) read(pack.id);
  $: if (!show) readFor = null;

  async function read(packId) {
    readFor = packId;
    loading = true; error = ''; report = null; plan = null; done = null; chosen = new Set();
    try {
      const { planFromIssue } = await import('../../management/public.js');
      const [fresh, recorded] = await Promise.all([
        planFromIssue(pack.source_id).catch((err) => {
          throw new Error(`The issue could not be read (${errMessage(err)}). It may have been deleted, or you may not have access to Management.`);
        }),
        dossierStore.loadSourceItems(packId),
      ]);
      if (readFor !== packId) return;
      plan = fresh; items = recorded;
      const s = /** @type {any} */ ($dossierStore);
      report = planUpdate(plan, { items, docs: s.docs, datasets: s.datasets, records: s.records, files: s.files });
    } catch (err) {
      error = errMessage(err);
    } finally {
      loading = false;
    }
  }

  function toggle(key, on) {
    const next = new Set(chosen);
    if (on) next.add(key); else next.delete(key);
    chosen = next;
  }

  async function apply() {
    const target = pack;
    applying = true; error = '';
    try {
      done = await dossierStore.updatePackFromSource(target, plan, report, chosen,
        { items, htmlToNodes: makeHtmlToNodes(), label }, $auth.user?.id);
      dispatch('updated', done);
    } catch (err) {
      error = errMessage(err);
    } finally {
      applying = false;
    }
  }

  $: lines = report ? describeUpdate(report) : [];
  $: replacing = report ? report.refresh.length + report.choose.filter(c => chosen.has(c.page.key)).length : 0;
  $: canApply = report && !done && (!report.nothing || chosen.size > 0);
</script>

<Modal {show} title="Update from {label}" size="large" on:close={() => dispatch('close')}>
  <div class="space-y-4 text-sm text-slate-300" data-testid="source-update">
    {#if error}<ErrorDisplay message={error} onDismiss={() => error = ''} />{/if}

    {#if loading}
      <div class="flex justify-center py-8"><LoadingSpinner text="Reading the issue…" /></div>
    {:else if done}
      <p class="text-green-300">
        Updated: {done.counts.pages} new page{done.counts.pages === 1 ? '' : 's'},
        {done.counts.rows} new row{done.counts.rows === 1 ? '' : 's'},
        {done.counts.files} new file{done.counts.files === 1 ? '' : 's'},
        {done.counts.replaced} page{done.counts.replaced === 1 ? '' : 's'} replaced.
      </p>
      {#if done.counts.replaced}
        <p class="text-slate-400">To undo a replaced page, open it and use <span class="text-white">History</span>: the version before this update is saved there as “Before update from {label}”.</p>
      {/if}
      {#if done.skipped.length}
        <p class="text-amber-300">Not copied: {done.skipped.map(s => `${s.name} (${s.reason})`).join('; ')}</p>
      {/if}
    {:else if report}
      <p class="text-slate-400">
        Brings what is new on {label} into this pack. Nothing in the pack is deleted, and a page is replaced only as listed below —
        its current version is saved to the page’s History first.
      </p>

      {#if report.nothing}
        <p class="text-white">This pack is up to date with the issue.</p>
      {:else}
        <div>
          <p class="font-semibold text-white mb-1">Will be added or refreshed</p>
          {#if lines.length}
            <ul class="list-disc pl-5 space-y-0.5">
              {#each lines as line}<li>{line}</li>{/each}
            </ul>
          {:else}
            <p class="text-slate-500">Nothing new — only the choices below.</p>
          {/if}
          {#if report.addPages.length}
            <details class="mt-1">
              <summary class="cursor-pointer text-slate-400">New pages</summary>
              <ul class="pl-5 mt-1 space-y-0.5">{#each report.addPages as p}<li>{pathLabel(p.path)}</li>{/each}</ul>
            </details>
          {/if}
          {#if report.refresh.length}
            <p class="text-slate-400 mt-1">
              Refreshed because the issue has moved on and nobody has edited them here:
              {report.refresh.map(r => r.doc.title).join(', ')}.
            </p>
          {/if}
        </div>
      {/if}

      {#if report.choose.length}
        <div>
          <p class="font-semibold text-white mb-1">Your choice — tick to replace with the issue’s version</p>
          <div class="space-y-2">
            {#each report.choose as c (c.page.key)}
              <div class="flex items-start gap-2">
                <Checkbox checked={chosen.has(c.page.key)} on:change={(e) => toggle(c.page.key, /** @type {HTMLInputElement} */ (e.currentTarget).checked)} />
                <div class="min-w-0">
                  <p class="text-white">{c.doc.title}</p>
                  <p class="text-xs text-slate-400">
                    {#if c.why === 'edited'}
                      Changed on the issue, and edited here — replacing it loses your edits from the page (they stay in History).
                    {:else if c.editedHere}
                      Changed on the issue since it was copied, and also edited here — replacing it loses your edits from the page (they stay in History).
                    {:else}
                      Changed on the issue since it was copied.
                    {/if}
                  </p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if report.removed.length}
        <details>
          <summary class="cursor-pointer text-slate-400">No longer on the issue — left in the pack ({report.removed.length})</summary>
          <ul class="pl-5 mt-1 space-y-0.5 text-slate-400">{#each report.removed as r}<li>{r.label}</li>{/each}</ul>
        </details>
      {/if}
      {#if report.removedHere.length}
        <details>
          <summary class="cursor-pointer text-slate-400">Removed from this pack — not added back ({report.removedHere.length})</summary>
          <ul class="pl-5 mt-1 space-y-0.5 text-slate-400">{#each report.removedHere as r}<li>{r.label}</li>{/each}</ul>
        </details>
      {/if}
    {/if}
  </div>

  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" on:click={() => dispatch('close')}>{done ? 'Close' : 'Cancel'}</Button>
    {#if !done}
      <Button variant="primary" disabled={!canApply || applying} testid="source-update-apply" on:click={apply}>
        {applying ? 'Updating…' : replacing ? `Update pack (${replacing} page${replacing === 1 ? '' : 's'} replaced)` : 'Update pack'}
      </Button>
    {/if}
  </div>
</Modal>
