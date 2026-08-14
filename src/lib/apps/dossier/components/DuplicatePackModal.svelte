<!-- src/lib/apps/dossier/components/DuplicatePackModal.svelte -->
<!-- Copying a pack — the template workflow.

     Two questions, and both defaults say NO. Structure is what a template is
     for; a pack's table entries and its files belong to the matter it was built
     for, and carrying them into the next one by default is how a previous
     client's chronology ends up in a solicitor's briefing.

     Worded throughout as what the COPY will contain, not what will be copied:
     the author's real question is what a recipient of the new pack would see. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import { describePackCopy } from '../utils/packCopy.js';

  export let show = false;
  /** The pack being copied. */
  export let pack = null;
  /** { docs, datasets, records, files } — loaded by the parent when opened. */
  export let contents = null;
  export let loading = false;
  /** Suggested title, from copyTitle(). */
  export let suggestedTitle = '';

  const dispatch = createEventDispatcher();

  let title = '';
  let includeRecords = false;
  let includeFiles   = false;
  let working = false;
  let error   = '';

  // Guard on a PRIMITIVE: `pack` is an object prop, and safe_not_equal marks
  // every object dirty, so keying off `pack` itself would reset the title the
  // author is typing on every parent render.
  let seededFor = null;
  $: if (show && pack?.id && pack.id !== seededFor) {
    seededFor = pack.id;
    title = suggestedTitle;
    includeRecords = false;
    includeFiles = false;
    error = '';
  }

  $: summary = contents
    ? describePackCopy(contents, { includeRecords, includeFiles })
    : '';

  export function fail(message) { error = message; working = false; }

  function close() {
    if (working) return;
    seededFor = null; working = false; error = '';
    show = false;
    dispatch('close');
  }

  function submit() {
    working = true; error = '';
    dispatch('duplicate', {
      title: title.trim() || suggestedTitle,
      includeRecords, includeFiles,
    });
  }
</script>

<Modal bind:show title="Duplicate pack" size="medium" on:close={close}>
  {#if error}
    <div class="mb-3"><ErrorDisplay message={error} onDismiss={() => error = ''} /></div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-10">
      <LoadingSpinner size="large" />
    </div>
  {:else}
    <div class="space-y-4">
      <p class="text-sm text-slate-300">
        A copy of <span class="text-white">{pack?.title ?? 'this pack'}</span>,
        independent of it. Editing or deleting the original afterwards will not
        touch the copy.
      </p>

      <FormInput label="Title of the copy" bind:value={title} />

      <div class="space-y-2 border-t border-slate-700 pt-3">
        <label class="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" bind:checked={includeRecords}
                 class="mt-0.5 accent-purple-500" />
          <span class="text-xs text-slate-400">
            Copy the table entries too
            <span class="block text-slate-500">
              The tables themselves always come across. Their entries belong to
              the matter this pack was built for — left off, the copy starts
              with empty tables.
            </span>
          </span>
        </label>

        <label class="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" bind:checked={includeFiles}
                 class="mt-0.5 accent-purple-500" />
          <span class="text-xs text-slate-400">
            Copy the files on the shelf
            <span class="block text-slate-500">
              Each file is duplicated, so the copy has its own. Worth having for
              a logo or a letterhead; anything a page refers to and you do not
              copy will show as a gap.
            </span>
          </span>
        </label>
      </div>

      {#if summary}
        <p class="text-xs text-slate-500 border-t border-slate-700 pt-3">{summary}</p>
      {/if}

      <p class="text-[11px] text-slate-600">
        The copy has no published links and no page history — both belong to the
        pack they were made for.
      </p>
    </div>
  {/if}

  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" disabled={working} on:click={close}>Cancel</Button>
    <Button variant="primary" disabled={working || loading || !contents}
            on:click={submit}>
      {working ? 'Copying…' : 'Duplicate'}
    </Button>
  </div>
</Modal>
