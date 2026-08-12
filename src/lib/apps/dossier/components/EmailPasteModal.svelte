<!-- src/lib/apps/dossier/components/EmailPasteModal.svelte -->
<!-- Paste an email thread; get one correspondence row per message.

     The preview is the point. Header parsing is a guess — a thread from an
     unusual client can split badly — so the author sees exactly what will be
     added, and can drop any row, BEFORE anything is written. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import { parsePastedEmails, describePasteResult } from '../utils/emailPaste.js';
  import { fieldsFor } from '../utils/datasetTemplates.js';

  export let show = false;

  const dispatch = createEventDispatcher();
  const fields = fieldsFor('correspondence');

  let text     = '';
  let result   = null;      // null = not read yet
  let dropped  = {};        // row index -> true
  let saving   = false;
  let error    = '';

  $: kept = result ? result.rows.filter((_, i) => !dropped[i]) : [];

  function read() {
    error   = '';
    dropped = {};
    result  = parsePastedEmails(text);
  }

  function reset() {
    text = ''; result = null; dropped = {}; error = ''; saving = false;
  }

  // The parent owns the write, and reports back through done()/fail() — the
  // same contract as DocFormModal, so the modal never touches the store.
  export function done() { reset(); show = false; }
  export function fail(message) { error = message; saving = false; }

  function add() {
    if (!kept.length) return;
    saving = true; error = '';
    dispatch('add', { rows: kept });
  }

  /** Enough of a row to recognise it, without rebuilding the table here. */
  const preview = (row) => row.summary.replace(/\s+/g, ' ').slice(0, 160);
</script>

<Modal bind:show title="Paste emails" size="xlarge"
       on:close={() => { reset(); dispatch('close'); }}>
  <div class="space-y-3">
    {#if error}
      <ErrorDisplay message={error} onDismiss={() => error = ''} />
    {/if}

    {#if !result}
      <p class="text-sm text-slate-400">
        Paste an email, or a whole thread, from Outlook or Gmail. Each message
        becomes one entry — oldest first.
      </p>
      <textarea
        bind:value={text}
        rows="14"
        placeholder="Paste here…"
        class="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2
               text-sm text-slate-200 font-mono leading-relaxed
               focus:outline-none focus:border-purple-500"
      ></textarea>
      <p class="text-xs text-slate-500">
        Nothing is saved until you have looked at what was found.
      </p>
    {:else}
      <div class="flex items-center gap-3">
        <p class="text-sm text-slate-300">{describePasteResult(result)}</p>
        <div class="flex-1"></div>
        <Button variant="secondary" size="small" on:click={() => (result = null)}>
          ← Back to the text
        </Button>
      </div>

      {#if result.rows.length}
        <div class="border border-slate-700 rounded overflow-hidden">
          <table class="w-full text-xs table-fixed">
            <thead class="bg-slate-800">
              <tr>
                <th class="w-8"></th>
                {#each fields.filter(f => f.key !== 'summary') as field (field.key)}
                  <th class="text-left font-medium text-slate-400 px-2 py-1.5"
                      style={field.width ? `width:${field.width}` : ''}>{field.label}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each result.rows as row, i (i)}
                <tr class="border-t border-slate-800 align-top"
                    class:opacity-40={dropped[i]}>
                  <td class="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={!dropped[i]}
                      title="Include this message"
                      aria-label="Include this message"
                      on:change={() => (dropped = { ...dropped, [i]: !dropped[i] })}
                      class="accent-purple-500"
                    />
                  </td>
                  {#each fields.filter(f => f.key !== 'summary') as field (field.key)}
                    <td class="px-2 py-1.5 text-slate-300 break-words">
                      {row[field.key] || '—'}
                    </td>
                  {/each}
                </tr>
                {#if row.summary}
                  <tr class:opacity-40={dropped[i]}>
                    <td></td>
                    <td colspan={fields.length - 1}
                        class="px-2 pb-2 text-slate-500 break-words">
                      {preview(row)}{row.summary.length > 160 ? '…' : ''}
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>

        <p class="text-xs text-slate-500">
          The full message text goes into the Summary column, where you can
          shorten it. Nothing is thrown away here.
        </p>
      {/if}
    {/if}
  </div>

  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" disabled={saving}
            on:click={() => { reset(); show = false; dispatch('close'); }}>
      Cancel
    </Button>
    {#if !result}
      <Button variant="primary" disabled={!text.trim()} on:click={read}>
        Read emails
      </Button>
    {:else}
      <Button variant="primary" disabled={!kept.length || saving} on:click={add}>
        {saving ? 'Adding…' : `Add ${kept.length} ${kept.length === 1 ? 'entry' : 'entries'}`}
      </Button>
    {/if}
  </div>
</Modal>
