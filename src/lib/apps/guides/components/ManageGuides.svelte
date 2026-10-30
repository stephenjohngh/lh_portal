<!-- src/lib/apps/guides/components/ManageGuides.svelte -->
<!-- The Manage tab (admins): every guide with its state, and the editor for the open one. -->
<script>
  import { onMount } from 'svelte';
  import Button from '#lib/components/common/Button.svelte';
  import GuideEditor from './GuideEditor.svelte';
  import { guidesStore } from '../stores/guidesStore.js';
  import { errMessage } from '#lib/utils/errors.js';

  /** Open this guide straight away (the reader's "Edit this guide"). @type {string|null} */
  export let initialId = null;
  /** @type {any} */
  let open = null;
  let error = '';
  let busy = false;
  let notice = '';

  $: s = $guidesStore;

  onMount(async () => {
    try {
      await guidesStore.ensureDefaultCategories();
      const added = await guidesStore.ensureStarterGuides();
      if (added) notice = `${added} starter guide${added === 1 ? ' was' : 's were'} added as drafts. They were written without seeing this building: walk through each on site and correct it before publishing.`;
    } catch (e) { error = errMessage(e); }
    if (initialId) open = $guidesStore.guides.find((g) => g.id === initialId) ?? null;
  });

  async function create() {
    busy = true; error = '';
    try { open = await guidesStore.createGuide(); }
    catch (e) { error = errMessage(e); }
    finally { busy = false; }
  }
</script>

{#if open}
  {#key open.id}
    <GuideEditor guide={open} on:close={() => (open = null)} on:deleted={() => (open = null)} />
  {/key}
{:else}
  <div class="space-y-3">
    {#if error}<p class="text-red-400 text-sm" role="alert">{error}</p>{/if}
    {#if notice}<p class="text-amber-300 text-sm" role="status" data-testid="starter-notice">{notice}</p>{/if}
    <Button disabled={busy} testid="new-guide" on:click={create}>+ New guide</Button>
    {#if s.guides.length === 0}
      <p class="text-sm text-slate-400">No guides yet. Start one — it stays a draft until you publish it.</p>
    {:else}
      <ul class="space-y-2" data-testid="manage-list">
        {#each s.guides as g (g.id)}
          <li class="rounded-lg border border-slate-700 bg-slate-800/60 p-3 flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-white font-medium truncate">{g.title}</p>
              <p class="text-xs text-slate-400">{g.status}{g.version > 0 ? ` · v${g.version}` : ''}{(g.targets ?? []).length ? ` · for ${g.targets.join(', ')}` : ''}</p>
            </div>
            <Button variant="secondary" size="xs" on:click={() => (open = g)}>Edit</Button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
