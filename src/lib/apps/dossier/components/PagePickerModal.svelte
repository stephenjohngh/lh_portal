<!-- src/lib/apps/dossier/components/PagePickerModal.svelte -->
<!-- Choose another page in this pack to link the selected text to. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal     from '$lib/components/common/Modal.svelte';
  import Button    from '$lib/components/common/Button.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';

  export let show    = false;
  export let docs    = [];
  /** The page being edited — you cannot link a page to itself. */
  export let currentDocId = null;

  const dispatch = createEventDispatcher();

  let search = '';
  $: if (!show) search = '';

  $: candidates = docs.filter(d => d.id !== currentDocId);
  $: visible = candidates.filter(d => {
    const q = search.trim().toLowerCase();
    return !q || `${d.title} ${d.slug}`.toLowerCase().includes(q);
  });

  function choose(doc) {
    dispatch('pick', doc);
    show = false;
  }
</script>

<Modal bind:show title="Link to a page" size="medium" on:close={() => dispatch('close')}>
  <div class="space-y-3">
    {#if candidates.length === 0}
      <div class="py-10 text-center">
        <p class="text-sm text-slate-400">There is no other page to link to yet.</p>
        <p class="text-xs text-slate-500 mt-2">Add a second page and try again.</p>
      </div>
    {:else}
      <FormInput label="" bind:value={search} placeholder="Search pages…" />

      <div class="max-h-80 overflow-y-auto space-y-1">
        {#each visible as doc (doc.id)}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="flex items-center gap-3 p-2 rounded cursor-pointer
                   hover:bg-slate-700 transition-colors"
            on:click={() => choose(doc)}
          >
            <span class="text-slate-500 shrink-0 text-xs">🔗</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-slate-200 truncate">{doc.title}</p>
              <p class="text-xs text-slate-500 font-mono truncate">{doc.slug}</p>
            </div>
          </div>
        {/each}

        {#if visible.length === 0}
          <p class="text-xs text-slate-500 text-center py-6">No pages match “{search}”.</p>
        {/if}
      </div>
    {/if}
  </div>

  <div slot="footer" class="flex justify-end">
    <Button variant="secondary" on:click={() => { show = false; dispatch('close'); }}>
      Cancel
    </Button>
  </div>
</Modal>
