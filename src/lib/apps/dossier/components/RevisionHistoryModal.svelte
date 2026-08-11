<!-- src/lib/apps/dossier/components/RevisionHistoryModal.svelte -->
<!-- Version history for one doc: pick a snapshot, preview it through the SHARED
     renderer (so the preview looks exactly like the page will), and restore.

     A revision holds a PRIOR state — the live doc is the current one. Restoring
     snapshots the current content first, so a restore is itself undoable. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal          from '$lib/components/common/Modal.svelte';
  import Button         from '$lib/components/common/Button.svelte';
  import ErrorDisplay   from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import { fmtDateTime } from '$lib/utils/dates';
  import BlockContent   from './BlockContent.svelte';
  import { blocksToText } from '../utils/blockRender.js';
  import { REVISION_CAP } from '../stores/dossierStore.js';

  export let show      = false;
  export let doc       = null;
  export let revisions = [];
  export let loading   = false;
  export let canEdit   = true;
  export let docs      = [];
  export let files     = [];

  const dispatch = createEventDispatcher();

  let selected  = null;
  let restoring = false;
  let error     = '';

  // Default to the newest snapshot whenever the list (re)loads.
  $: if (show && revisions.length && !revisions.some(r => r.id === selected?.id)) {
    selected = revisions[0];
  }
  $: if (!show) { selected = null; error = ''; }

  async function handleRestore() {
    if (!selected) return;
    restoring = true; error = '';
    dispatch('restore', selected);
  }

  export function done() { restoring = false; }
  export function fail(message) { error = message; restoring = false; }

  function handleClose() { show = false; dispatch('close'); }
</script>

<Modal bind:show title="Version history" size="large" on:close={handleClose}>
  <div class="space-y-3">
    <ErrorDisplay message={error} onDismiss={() => error = ''} />

    {#if loading}
      <div class="flex justify-center py-12"><LoadingSpinner size="large" /></div>

    {:else if revisions.length === 0}
      <div class="py-10 text-center">
        <p class="text-sm text-slate-400">No earlier versions of this page yet.</p>
        <p class="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
          A version is kept automatically as you work, and whenever you choose
          “Save version”. The most recent {REVISION_CAP} are kept.
        </p>
      </div>

    {:else}
      <div class="flex gap-4 min-h-0" style="max-height:60vh">

        <!-- Version list -->
        <div class="w-60 shrink-0 overflow-y-auto border-r border-slate-700 pr-2">
          {#each revisions as rev, i (rev.id)}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <div
              class="p-2 rounded cursor-pointer mb-1 transition-colors
                     {selected?.id === rev.id ? 'bg-slate-700' : 'hover:bg-slate-700/50'}"
              on:click={() => selected = rev}
            >
              <p class="text-xs font-medium text-slate-200">
                {i === 0 ? 'Most recent' : `Version ${revisions.length - i}`}
              </p>
              <p class="text-xs text-slate-500 mt-0.5">{fmtDateTime(rev.created_at)}</p>
              {#if rev.summary}
                <p class="text-xs text-slate-400 mt-1 line-clamp-2">{rev.summary}</p>
              {:else}
                <p class="text-xs text-slate-600 mt-1 line-clamp-2 italic">
                  {blocksToText(rev.blocks, 60) || 'Empty page'}
                </p>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Preview, through the same renderer the page itself uses -->
        <div class="flex-1 min-w-0 overflow-y-auto pr-1">
          {#if selected}
            <p class="text-xs text-slate-500 mb-3">
              Saved {fmtDateTime(selected.created_at)}
              {#if selected.title && selected.title !== doc?.title}
                · titled “{selected.title}” at the time
              {/if}
            </p>
            <BlockContent blocks={selected.blocks} mode="read" {docs} {files} />
          {:else}
            <p class="text-sm text-slate-500">Select a version to preview it.</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <div slot="footer" class="flex items-center gap-3">
    <p class="text-xs text-slate-500 flex-1">
      Restoring keeps a version of the current page first, so you can undo it.
    </p>
    <Button variant="secondary" on:click={handleClose} disabled={restoring}>Close</Button>
    {#if canEdit}
      <Button variant="primary" on:click={handleRestore}
              loading={restoring} disabled={restoring || !selected}>
        Restore this version
      </Button>
    {/if}
  </div>
</Modal>
