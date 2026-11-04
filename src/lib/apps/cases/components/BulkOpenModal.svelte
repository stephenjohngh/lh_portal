<!-- src/lib/apps/cases/components/BulkOpenModal.svelte -->
<!-- Open one case each for several failed components (2026-11-04). Reads the failed
     and problem components through Building Assets' public.js. A component with an
     open case in this process is shown and cannot be ticked. One failure does not
     stop the rest; the result says what opened and what did not. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { listComponentsByStatus } from '#lib/apps/building_assets/public.js';
  import { getPref, setPref } from '#lib/utils/prefs.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { statusLabel } from '#lib/utils/resultConstants.js';
  import Modal from '#lib/components/common/Modal.svelte';
  import Button from '#lib/components/common/Button.svelte';
  import Checkbox from '#lib/components/common/Checkbox.svelte';
  import FormInput from '#lib/components/common/FormInput.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';
  import { bulkCandidates, bulkTitle, BULK_STATUSES, BULK_TITLE_DEFAULT } from '../utils/bulkOpen.js';
  import { casesStore } from '../stores/casesStore.js';

  export let show = false;
  /** @type {{ key: string, label: string, options?: string[] }} */ export let field;
  /** @type {any} */ export let workflow = null;
  /** @type {any[]} */ export let steps = [];
  /** @type {any[]} */ export let items = [];
  /** @type {any[]} */ export let cases = [];
  /** @type {any} */ export let links = { component: [] };

  const dispatch = createEventDispatcher();

  /** @type {any[]} */ let components = [];
  let loading = false;
  let error = '';
  let busy = false;
  /** @type {null | { opened: string[], failed: Array<{ text: string, error: string }> }} */
  let result = null;
  let chosen = new Set();
  let template = BULK_TITLE_DEFAULT;

  // Read each time it is opened, so a door failed since is there.
  let openFor = false;
  $: if (show !== openFor) { openFor = show; if (show) start(); }
  async function start() {
    chosen = new Set(); result = null; error = '';
    template = getPref(`cases.bulkTitle.${workflow?.key ?? ''}`, BULK_TITLE_DEFAULT) || BULK_TITLE_DEFAULT;
    loading = true;
    try { components = await listComponentsByStatus([...BULK_STATUSES]); }
    catch (/** @type {any} */ err) { error = errMessage(err, 'The failed components could not be read.'); }
    finally { loading = false; }
  }

  $: rows = bulkCandidates({ components, field, items, cases, steps, links: links?.component ?? [] });
  $: free = rows.filter((r) => !r.openCase);
  $: firstTitle = rows.find((r) => chosen.has(r.id));

  function toggle(/** @type {string} */ id) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id); else next.add(id);
    chosen = next;
  }

  async function open() {
    const picked = rows.filter((r) => chosen.has(r.id));
    const words = template.trim();
    busy = true; error = '';
    try {
      setPref(`cases.bulkTitle.${workflow?.key ?? ''}`, words);
      result = await casesStore.createMany(picked.map((r) => ({
        text: r.text, title: bulkTitle(words, r.label), fields: { [field.key]: r.id } })));
      chosen = new Set();
      dispatch('opened');
    } catch (/** @type {any} */ err) { error = errMessage(err, 'The cases could not be opened.'); }
    finally { busy = false; }
  }
</script>

<Modal {show} title={`Open cases for failed components — ${workflow?.name ?? ''}`} size="medium" on:close={() => dispatch('close')}>
  <div class="space-y-3 text-sm" data-testid="bulk-open">
    {#if loading}<LoadingSpinner text="Reading the failed components…" />
    {:else if result}
      {#if result.opened.length}<p class="text-green-400" role="status">Opened {result.opened.length}: {result.opened.join(', ')}.</p>{/if}
      {#each result.failed as f (f.text)}<p class="text-red-400" role="alert">{f.text}: {f.error}</p>{/each}
      <div class="flex justify-end"><Button variant="primary" on:click={() => dispatch('close')}>Close</Button></div>
    {:else}
      {#if error}<p class="text-red-400" role="alert">{error}</p>{/if}
      {#if rows.length === 0 && !error}
        <p class="text-slate-400">Nothing this process covers is failed or has a problem.</p>
        <div class="flex justify-end"><Button variant="secondary" on:click={() => dispatch('close')}>Close</Button></div>
      {:else if rows.length}
        <FormInput label="Title for each case" bind:value={template} />
        <p class="text-xs text-slate-500">{'{label}'} becomes each one’s label.{firstTitle ? ` For example: ${bulkTitle(template, firstTitle.label)}` : ''}</p>
        <div class="flex gap-2">
          <Button variant="tertiary" size="xs" disabled={!free.length} on:click={() => (chosen = new Set(free.map((r) => r.id)))}>Tick all {free.length}</Button>
          <Button variant="tertiary" size="xs" disabled={!chosen.size} on:click={() => (chosen = new Set())}>Clear</Button>
        </div>
        <ul class="max-h-80 overflow-y-auto space-y-1">
          {#each rows as r (r.id)}
            <li class="flex items-center gap-2" data-testid="bulk-row">
              {#if r.openCase}
                <span class="text-slate-500">{r.text} · {statusLabel(r.status)} · already has {r.openCase}</span>
              {:else}
                <Checkbox checked={chosen.has(r.id)} label={`${r.text} · ${statusLabel(r.status)}`} on:change={() => toggle(r.id)} />
              {/if}
            </li>
          {/each}
        </ul>
        <div class="flex gap-2 justify-end">
          <Button variant="secondary" on:click={() => dispatch('close')}>Cancel</Button>
          <Button variant="primary" disabled={!chosen.size || !template.trim() || busy} loading={busy} on:click={open}>Open {chosen.size} {chosen.size === 1 ? 'case' : 'cases'}</Button>
        </div>
      {/if}
    {/if}
  </div>
</Modal>
