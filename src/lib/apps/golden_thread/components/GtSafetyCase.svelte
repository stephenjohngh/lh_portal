<!-- src/lib/apps/golden_thread/components/GtSafetyCase.svelte -->
<!--
  Safety Case summary — on-screen view of the buildSafetyCaseModel() shape,
  mirrored by the Word export (/api/golden-thread/safety-case). Presentational:
  the parent builds the model and handles the 'export' event.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Badge  from '$lib/components/common/Badge.svelte';
  import { REVIEW_BAND_LABEL, REVIEW_BAND_BADGE } from '$lib/apps/golden_thread/utils/gtConstants.js';
  import { fmtDate, fmtDateTime } from '$lib/utils/dates';

  /** @type {any} */
  export let model;
  export let exporting = false;
  export let exportError = '';

  const dispatch = createEventDispatcher();

  $: s = model?.summary ?? {};
  $: tiles = [
    { label: 'Current documents', value: s.current ?? 0 },
    { label: 'Safety-critical',   value: s.safetyCritical ?? 0 },
    { label: 'Reviews due soon',  value: s.dueSoon ?? 0, tone: (s.dueSoon ?? 0) > 0 ? 'amber' : '' },
    { label: 'Reviews overdue',   value: s.overdue ?? 0, tone: (s.overdue ?? 0) > 0 ? 'red' : '' },
    { label: 'Categories satisfied', value: `${s.categoriesSatisfied ?? 0} / ${s.categoriesApplicable ?? 0}` },
    { label: 'Occurrences',       value: s.occurrences ?? 0 },
  ];
</script>

<div class="space-y-6">
  <!-- Header + export -->
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 class="text-lg font-semibold text-white">Safety Case summary</h2>
      <p class="text-xs text-slate-500 mt-0.5">
        A governance snapshot of the register — completeness, review status and occurrences.
        {#if model?.generatedAt}· as at {fmtDateTime(model.generatedAt)}{/if}
      </p>
    </div>
    <div class="flex flex-col items-end gap-1">
      <Button variant="secondary" loading={exporting} disabled={exporting} on:click={() => dispatch('export')}>
        ⬇ Word document
      </Button>
      {#if exportError}<p class="text-xs text-red-400 max-w-xs text-right">{exportError}</p>{/if}
    </div>
  </div>

  <!-- Overview tiles -->
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
    {#each tiles as t (t.label)}
      <div class="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2.5">
        <p class="text-xl font-bold {t.tone === 'red' ? 'text-red-400' : t.tone === 'amber' ? 'text-amber-400' : 'text-slate-100'}">{t.value}</p>
        <p class="text-[11px] text-slate-400 leading-tight mt-0.5">{t.label}</p>
      </div>
    {/each}
  </div>

  <!-- Completeness -->
  <section>
    <h3 class="text-sm font-semibold text-slate-300 mb-2">Schedule-1 completeness</h3>
    <div class="grid gap-2 sm:grid-cols-2">
      {#each model?.completeness ?? [] as cat (cat.code)}
        <div class="flex items-center justify-between rounded-lg border border-slate-700 px-3 py-2">
          <div class="min-w-0">
            <p class="text-xs text-slate-500">Category {cat.code}</p>
            <p class="text-sm text-white truncate">{cat.name}</p>
          </div>
          <Badge color={cat.satisfied ? 'bg-green-600' : 'bg-red-700'}>
            {cat.satisfied ? `${cat.currentCount} current` : 'Missing'}
          </Badge>
        </div>
      {/each}
    </div>
  </section>

  <!-- Controlled documents by category -->
  <section>
    <h3 class="text-sm font-semibold text-slate-300 mb-2">Controlled documents by category</h3>
    {#if (model?.byCategory ?? []).length === 0}
      <p class="text-sm text-slate-500 italic">No current documents in the register.</p>
    {:else}
      <div class="space-y-4">
        {#each model.byCategory as g (g.code)}
          <div>
            <p class="text-xs font-semibold text-slate-400 mb-1">{g.code} — {g.name}</p>
            <div class="overflow-x-auto rounded-lg border border-slate-700">
              <table class="w-full text-sm">
                <thead class="bg-slate-800 text-slate-300">
                  <tr>
                    <th class="text-left font-medium px-3 py-1.5">Reference</th>
                    <th class="text-left font-medium px-3 py-1.5">Title</th>
                    <th class="text-left font-medium px-3 py-1.5">Type</th>
                    <th class="text-left font-medium px-3 py-1.5">Review due</th>
                  </tr>
                </thead>
                <tbody>
                  {#each g.documents as d (d.reference)}
                    <tr class="border-t border-slate-700">
                      <td class="px-3 py-1.5 font-mono text-xs text-slate-300">{d.reference}</td>
                      <td class="px-3 py-1.5 text-white">{d.title}</td>
                      <td class="px-3 py-1.5 text-slate-400">{d.document_type}</td>
                      <td class="px-3 py-1.5 text-slate-400">
                        <span class="inline-flex items-center gap-2">
                          {d.review_due ? fmtDate(d.review_due) : '—'}
                          {#if d.review_band}<Badge color={REVIEW_BAND_BADGE[d.review_band]}>{REVIEW_BAND_LABEL[d.review_band]}</Badge>{/if}
                        </span>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Safety-critical -->
  <section>
    <h3 class="text-sm font-semibold text-slate-300 mb-2">Safety-critical documents</h3>
    {#if (model?.safetyCritical ?? []).length === 0}
      <p class="text-sm text-slate-500 italic">None recorded.</p>
    {:else}
      <ul class="space-y-1">
        {#each model.safetyCritical as d (d.reference)}
          <li class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-mono text-xs text-slate-400">{d.reference}</span>
            <span class="text-white">{d.title}</span>
            {#if d.review_band}<Badge color={REVIEW_BAND_BADGE[d.review_band]}>{REVIEW_BAND_LABEL[d.review_band]}</Badge>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Occurrences -->
  <section>
    <h3 class="text-sm font-semibold text-slate-300 mb-2">Mandatory occurrence reporting</h3>
    {#if (model?.occurrences?.total ?? 0) === 0}
      <p class="text-sm text-slate-500 italic">No occurrence reports recorded.</p>
    {:else}
      <p class="text-sm text-slate-300 mb-2">{model.occurrences.total} occurrence report(s) recorded.</p>
      <div class="flex flex-wrap gap-2">
        {#each model.occurrences.byStatus as b (b.status)}
          <span class="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300">{b.status}: {b.count}</span>
        {/each}
      </div>
    {/if}
  </section>
</div>
