<!-- src/lib/apps/building_assets/components/works/WorksSpecsModal.svelte -->
<!-- The specifications the field suggests, and how to correct one.

     A wrong suggestion is not a list problem — the list is only a view of what
     the lines say, so a mistyped wording is mistyped on a real schedule, in the
     document a contractor is holding. Correcting it here corrects the lines,
     which is why the primary action rewrites and only the fallback hides.

     Withdrawing exists for the case correction must not touch: a wording that
     appears on an issued or completed schedule. Rewriting those would leave the
     register disagreeing with the paper that went out. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal         from '$lib/components/common/Modal.svelte';
  import Button        from '$lib/components/common/Button.svelte';
  import FormInput     from '$lib/components/common/FormInput.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import { specUsage } from '../../utils/worksSchedule.js';

  export let show = false;
  /** Raw spec rows — one per line. */
  export let specs = [];
  /** All schedules, for status and title. */
  export let schedules = [];
  /** Wordings currently withdrawn. */
  export let hidden = [];
  export let busy = false;

  const dispatch = createEventDispatcher();

  $: usage = specUsage(specs, schedules, hidden);

  /** The wording being corrected, and what it is becoming. */
  let editing = null;
  let draft = '';
  /** The wording being withdrawn, held for the confirmation. */
  let pendingHide = null;

  function startEdit(row) { editing = row.spec; draft = row.spec; }
  function cancelEdit()   { editing = null; draft = ''; }

  function saveEdit() {
    const from = editing;                   // capture before the store write
    const to = draft.trim();
    if (!from || to === from) { cancelEdit(); return; }
    dispatch('rename', { from, to });
    cancelEdit();
  }

  function confirmHide() {
    const spec = pendingHide;
    pendingHide = null;
    dispatch('hide', { spec, hidden: true });
  }

  function close() { cancelEdit(); show = false; dispatch('close'); }
</script>

<Modal bind:show title="Specifications used" size="large" on:close={close}>
  <p class="text-xs text-slate-400 mb-3">
    Every wording written on a schedule line, most used first — this is what the
    specification field offers. Correcting one here corrects it on the lines
    themselves.
  </p>

  {#if !usage.length}
    <p class="text-sm text-slate-500 py-6 text-center">
      Nothing specified yet. Wordings appear here as they are written on lines.
    </p>
  {:else}
    <div class="space-y-1.5 max-h-[26rem] overflow-y-auto pr-1">
      {#each usage as row (row.spec)}
        <div class="p-2.5 rounded border border-slate-700 bg-slate-800/40">
          {#if editing === row.spec}
            <FormInput label="Wording" bind:value={draft} />
            <p class="text-[11px] text-slate-500 mt-1">
              Changes {row.count} line{row.count === 1 ? '' : 's'} on
              {row.schedules.length} draft schedule{row.schedules.length === 1 ? '' : 's'}.
              Leave it empty to clear the specification on those lines.
            </p>
            <div class="flex gap-2 mt-2">
              <Button variant="primary" size="small" disabled={busy} on:click={saveEdit}>
                {busy ? 'Saving…' : 'Correct everywhere'}
              </Button>
              <Button variant="secondary" size="small" on:click={cancelEdit}>Cancel</Button>
            </div>
          {:else}
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm text-slate-200 break-words"
                   class:line-through={row.hidden}
                   class:text-slate-500={row.hidden}>{row.spec}</p>
                <p class="text-[11px] text-slate-500 mt-0.5">
                  {row.count} line{row.count === 1 ? '' : 's'} ·
                  {row.schedules.map(x => x.title).join(', ') || 'schedule not loaded'}
                  {#if row.hidden}· <span class="text-amber-500">not suggested</span>{/if}
                </p>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                {#if row.hidden}
                  <Button variant="secondary" size="small" disabled={busy}
                          on:click={() => dispatch('hide', { spec: row.spec, hidden: false })}>
                    Suggest again
                  </Button>
                {:else}
                  {#if row.renameable}
                    <Button variant="secondary" size="small" disabled={busy}
                            on:click={() => startEdit(row)}>Correct</Button>
                  {/if}
                  <Button variant="secondary" size="small" disabled={busy}
                          title={row.renameable
                            ? 'Stop offering this wording, leaving the lines as they are'
                            : 'Used on a schedule already issued, so it cannot be rewritten — only withdrawn'}
                          on:click={() => pendingHide = row.spec}>
                    Stop suggesting
                  </Button>
                {/if}
              </div>
            </div>

            {#if !row.renameable && !row.hidden}
              <p class="text-[11px] text-slate-600 mt-1">
                On a schedule already issued — the wording a contractor was
                given, so it is not rewritten from here.
              </p>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <div slot="footer" class="flex justify-end">
    <Button variant="secondary" on:click={close}>Close</Button>
  </div>
</Modal>

<ConfirmDialog
  show={!!pendingHide}
  title="Stop suggesting this wording?"
  message={'“' + (pendingHide ?? '') + '” stays on the lines that use it — it '
         + 'is only withdrawn from the suggestion list. You can put it back.'}
  confirmText="Stop suggesting"
  danger={false}
  on:confirm={confirmHide}
  on:cancel={() => pendingHide = null}
/>
