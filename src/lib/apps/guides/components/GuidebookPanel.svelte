<!-- src/lib/apps/guides/components/GuidebookPanel.svelte -->
<!-- Pick some targets (weekend cleaner, holiday cleaner, …) and download one PDF
     guidebook of the published guides that carry them. Built on this device from the
     guides' frozen published versions; the pages are pictures (not searchable). -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import ToggleChip from '#lib/components/common/ToggleChip.svelte';
  import { guidesStore } from '../stores/guidesStore.js';
  import { allTargets, selectGuides } from '../utils/guidebook.js';
  import { buildGuidebookPdf } from '../utils/guidebookRender.js';
  import { downloadBlob } from '#lib/utils/download.js';
  import { fmtGenerated } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';

  let open = false;
  /** @type {string[]} */ let chosen = [];
  let busy = false;
  let error = '';
  let notice = '';

  $: s = $guidesStore;
  $: targets = allTargets(s.guides);
  $: picked = selectGuides(s.guides, chosen, s.categories.map((c) => c.key));

  const toggle = (/** @type {string} */ t) => { chosen = chosen.includes(t) ? chosen.filter((x) => x !== t) : [...chosen, t]; };

  async function download() {
    busy = true; error = ''; notice = '';
    try {
      const guides = [];
      for (const g of picked) {
        const v = await guidesStore.readVersion(g.id, g.version);
        if (!v) throw new Error(`"${g.title}" has no published copy to print.`);
        const snap = v.snapshot ?? {};
        guides.push({
          title: g.title, summary: g.summary, youNeed: snap.you_need ?? g.you_need, minutes: snap.minutes ?? g.minutes,
          steps: [...(snap.steps ?? [])].sort((a, b) => a.position - b.position),
        });
      }
      const title = `Guidebook — ${chosen.join(', ')}`;
      const { blob, missingPhotos } = await buildGuidebookPdf(guides, { title, targets: chosen, generated: fmtGenerated() });
      downloadBlob(blob, `Guidebook_${chosen.join('_').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 60)}.pdf`);
      notice = `Downloaded ${guides.length} guide${guides.length === 1 ? '' : 's'}.${missingPhotos ? ` ${missingPhotos} photo${missingPhotos === 1 ? '' : 's'} could not be loaded and ${missingPhotos === 1 ? 'is' : 'are'} left out.` : ''}`;
    } catch (e) {
      error = errMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if targets.length}
  <section class="rounded-lg border border-slate-700 bg-slate-800/40 p-3 space-y-2" data-testid="guidebook">
    <Button variant="tertiary" size="xs" on:click={() => (open = !open)}>{open ? '▾' : '▸'} Download a guidebook (PDF)</Button>
    {#if open}
      <p class="text-sm text-slate-300">Choose who it is for. You get one PDF of every published guide for any of them.</p>
      <div class="flex flex-wrap gap-2">
        {#each targets as t (t.target)}
          <ToggleChip active={chosen.includes(t.target)} on:click={() => toggle(t.target)}>{t.target} ({t.count})</ToggleChip>
        {/each}
      </div>
      {#if chosen.length}
        <p class="text-xs text-slate-400" data-testid="guidebook-count">{picked.length} guide{picked.length === 1 ? '' : 's'} will be in it.</p>
      {/if}
      <Button disabled={!picked.length || busy} testid="guidebook-download" on:click={download}>{busy ? 'Building the PDF…' : 'Download guidebook'}</Button>
      {#if error}<p class="text-red-400 text-sm" role="alert">{error}</p>{/if}
      {#if notice}<p class="text-emerald-400 text-sm" role="status">{notice}</p>{/if}
    {/if}
  </section>
{/if}
