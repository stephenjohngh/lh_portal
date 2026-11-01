<!-- src/lib/apps/dossier/components/PagePickerModal.svelte -->
<!-- Choose another page in this pack to link the selected text to. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal     from '#lib/components/common/Modal.svelte';
  import Button    from '#lib/components/common/Button.svelte';
  import FormInput from '#lib/components/common/FormInput.svelte';
  import PageTreeList from './PageTreeList.svelte';
  import { EMBED_MODES, EMBED_MODE_LABEL } from '../utils/embedGuard.js';

  export let show    = false;
  export let docs    = [];
  /** The page being edited — you cannot link a page to itself. */
  export let currentDocId = null;
  /** 'link' | 'embed' — an embed also chooses how much of the page to show. */
  export let purpose = 'link';

  const dispatch = createEventDispatcher();

  let search = '';
  let mode = 'full';
  $: if (!show) search = '';

  $: candidates = docs.filter(d => d.id !== currentDocId);

  function choose(doc) {
    dispatch('pick', { doc, mode });
    show = false;
  }
</script>

<Modal bind:show
       title={purpose === 'embed' ? 'Show another page here' : 'Link to a page'}
       size="medium" on:close={() => dispatch('close')}>
  <div class="space-y-3">
    {#if candidates.length === 0}
      <div class="py-10 text-center">
        <p class="text-sm text-slate-400">There is no other page to link to yet.</p>
        <p class="text-xs text-slate-500 mt-2">Add a second page and try again.</p>
      </div>
    {:else}
      {#if purpose === 'embed'}
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-400 shrink-0">Show</span>
          {#each EMBED_MODES as m}
            <button
              class="text-xs px-2 py-1 rounded transition-colors
                     {mode === m ? 'bg-slate-600 text-white' : 'text-slate-400 hover:bg-slate-700'}"
              on:click={() => mode = m}
            >{EMBED_MODE_LABEL[m]}</button>
          {/each}
        </div>
      {/if}

      <FormInput label="" bind:value={search} placeholder="Search pages…" />

      <PageTreeList {docs} excludeId={currentDocId} {search} on:pick={(e) => choose(e.detail)} />
    {/if}
  </div>

  <div slot="footer" class="flex justify-end">
    <Button variant="secondary" on:click={() => { show = false; dispatch('close'); }}>
      Cancel
    </Button>
  </div>
</Modal>
