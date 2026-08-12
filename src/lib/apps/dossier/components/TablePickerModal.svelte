<!-- src/lib/apps/dossier/components/TablePickerModal.svelte -->
<!-- Choose one of the pack's tables to show inside a page. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal  from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import { templateFor } from '../utils/datasetTemplates.js';

  export let show     = false;
  export let datasets = [];
  export let records  = [];

  const dispatch = createEventDispatcher();

  const countFor = (id) => records.filter(r => r.dataset_id === id).length;
</script>

<Modal bind:show title="Show a table here" size="medium" on:close={() => dispatch('close')}>
  <div class="space-y-3">
    {#if datasets.length === 0}
      <div class="py-10 text-center">
        <p class="text-sm text-slate-400">This pack has no tables yet.</p>
        <p class="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
          Add one from the <span class="text-slate-400">Tables</span> section of
          the sidebar — a chronology is usually the first.
        </p>
      </div>
    {:else}
      <div class="space-y-1">
        {#each datasets as dataset (dataset.id)}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="flex items-center gap-3 p-2 rounded cursor-pointer
                   hover:bg-slate-700 transition-colors"
            on:click={() => { dispatch('pick', dataset); show = false; }}
          >
            <span class="text-slate-500 shrink-0 text-xs">▦</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-slate-200 truncate">{dataset.title}</p>
              <p class="text-xs text-slate-500 truncate">
                {templateFor(dataset.key)?.blurb ?? ''}
              </p>
            </div>
            <span class="text-xs text-slate-500 shrink-0">
              {countFor(dataset.id)} {countFor(dataset.id) === 1 ? 'entry' : 'entries'}
            </span>
          </div>
        {/each}
      </div>

      <p class="text-xs text-slate-500">
        The table stays live: entries added later appear here too.
      </p>
    {/if}
  </div>

  <div slot="footer" class="flex justify-end">
    <Button variant="secondary" on:click={() => { show = false; dispatch('close'); }}>
      Cancel
    </Button>
  </div>
</Modal>
