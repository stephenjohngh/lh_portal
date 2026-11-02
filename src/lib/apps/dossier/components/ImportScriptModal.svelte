<!-- src/lib/apps/dossier/components/ImportScriptModal.svelte -->
<!-- Build a whole pack from a script (utils/packScript.js) and the files it names.
     The script runs here, in the browser, as the signed-in user: nothing new is
     allowed that the Dossier screens do not already allow. Private working pack only —
     nothing is published. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal from '#lib/components/common/Modal.svelte';
  import Button from '#lib/components/common/Button.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import DocAttachInput from '#lib/components/common/DocAttachInput.svelte';
  import { parsePackScript } from '../utils/packScript.js';
  import {
    planProblems, fillTextFiles, textFilesNeeded, uploadsNeeded, describePlan,
  } from '../utils/packPlan.js';
  import { makeHtmlToNodes } from '../utils/planBlocks.js';
  import { dossierStore } from '../stores/dossierStore.js';
  import { currentUserId } from '#lib/utils/currentUser.js';
  import { errMessage } from '#lib/utils/errors.js';

  export let show = false;
  /** The pack folder the new pack is filed in, or null. */
  export let folderId = null;

  const dispatch = createEventDispatcher();

  const EXAMPLE = `PACK "Flat 14 — water ingress" DESC "Briefing for the surveyor"
FOLDER Evidence/Photos
FILE "leak.jpg" IN Evidence/Photos
PAGE Background
HEADING 2 "What happened"
TEXT "Water came through **the bedroom ceiling** on 3 June."
IMAGE "leak.jpg" MEDIUM
CALLOUT warning "Not for publication."
TABLE chronology "Chronology"
ROW date=2026-06-03 event="Leak reported" significance="Start of the claim"
PAGE Summary
EMBED TABLE "Chronology"
`;

  let script = '';
  let scriptFile = null;
  /** @type {File[]} */
  let files = [];
  /** @type {Record<string, string>} text-file name → contents */
  let texts = {};
  let busy = false;
  let error = '';
  /** @type {null | { pack: any, counts: any, skipped: any[] }} */
  let result = null;

  // A script opened from a file replaces the box.
  $: if (scriptFile) { readScript(scriptFile); }
  async function readScript(f) { script = await f.text(); scriptFile = null; }

  $: parsed = parsePackScript(script);
  $: needsText = textFilesNeeded(parsed.plan);
  $: suppliedNames = new Set(files.map(f => f.name.toLowerCase()));
  $: filled = fillTextFiles(parsed.plan, texts);
  $: needsUpload = uploadsNeeded(filled);
  $: missingFiles = [...needsText, ...needsUpload].filter(n => !suppliedNames.has(n.toLowerCase()));
  // Plan problems that are only "a text file has not been supplied" are shown as missing files instead.
  $: problems = planProblems(filled).filter(p => !/has not been supplied/.test(p));
  $: counts = describePlan(filled);
  $: ready = script.trim() && !parsed.errors.length && !problems.length && !missingFiles.length && !busy;

  // Read any supplied file the script wants as words.
  let readKey = '';
  $: refreshTexts(files, needsText);
  async function refreshTexts(list, names) {
    const key = names.join('|') + '#' + list.map(f => f.name + f.size).join('|');
    if (key === readKey) return;
    readKey = key;
    const next = {};
    for (const n of names) {
      const f = list.find(x => x.name.toLowerCase() === n.toLowerCase());
      if (f) next[n] = await f.text();
    }
    texts = next;
  }

  async function create() {
    busy = true; error = '';
    try {
      const uploads = {};
      for (const n of needsUpload) uploads[n] = files.find(f => f.name.toLowerCase() === n.toLowerCase());
      const userId = await currentUserId();
      result = await dossierStore.createPackFromPlan(filled, { folderId, uploads, htmlToNodes: makeHtmlToNodes() }, userId);
    } catch (/** @type {any} */ err) {
      error = errMessage(err);
    } finally {
      busy = false;
    }
  }

  function reset() { script = ''; files = []; texts = {}; result = null; error = ''; readKey = ''; }
  function close() { show = false; dispatch('close'); if (result) reset(); }
  function openMade() { const p = result?.pack; close(); if (p) dispatch('open', p); }
</script>

<Modal {show} title="Build a pack from a script" size="xlarge" on:close={close}>
  {#if result}
    <div class="space-y-3" data-testid="script-made">
      <p class="text-slate-200">Made <strong>{result.pack.title}</strong>: {result.counts.pages} pages, {result.counts.files} files, {result.counts.tables} tables.</p>
      {#if result.skipped.length}
        <div class="rounded border border-amber-700/50 bg-amber-900/20 p-2 text-sm text-amber-200">
          <p class="font-medium">These files could not be stored:</p>
          <ul class="list-disc pl-5">{#each result.skipped as s}<li>{s.name} — {s.reason}</li>{/each}</ul>
        </div>
      {/if}
      <div class="flex justify-end gap-2">
        <Button variant="secondary" on:click={close}>Close</Button>
        <Button variant="primary" on:click={openMade}>Open the pack</Button>
      </div>
    </div>
  {:else}
    <div class="grid gap-4 md:grid-cols-2">
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-xs text-slate-400">Script</p>
          <Button variant="tertiary" size="xs" on:click={() => (script = EXAMPLE)}>Insert an example</Button>
        </div>
        <textarea
          class="w-full h-80 rounded border border-slate-600 bg-slate-900 p-2 font-mono text-xs text-slate-100"
          aria-label="Pack script" spellcheck="false" bind:value={script}
          placeholder={'PACK "Title"\nPAGE Background\nTEXT "Some words."'}></textarea>
        <details class="text-xs text-slate-400">
          <summary class="cursor-pointer">The commands</summary>
          <pre class="mt-1 whitespace-pre-wrap leading-snug">PACK "Title" DESC "…"
FOLDER Evidence/Photos
FILE "name.jpg" [AS alias] [IN folder] [DESC "…"]
PAGE Parent/Child        (parents are made for you)
HEADING 1|2|3 "text"
TEXT "markdown"  |  TEXT &lt;&lt;&lt; … &gt;&gt;&gt;  |  TEXT FROM "file.md"
HTML &lt;&lt;&lt; … &gt;&gt;&gt;
IMAGE name [small|medium|large|full]   ATTACH name
CALLOUT info|warning|success "text"
TOGGLE "heading" "body" [CLOSED]
EMBED PAGE path [full|summary|link_card]   EMBED TABLE "title"
TABLE chronology|correspondence|document_index "Title"
ROW column=value … [FILE name] [PAGE path]
# comment</pre>
        </details>
      </div>

      <div class="space-y-3">
        <div>
          <p class="text-xs text-slate-400 mb-1">Open a script from a file</p>
          <DocAttachInput bind:file={scriptFile} accept=".txt,.md,.script" />
        </div>
        <div>
          <p class="text-xs text-slate-400 mb-1">Files the script names (pictures, documents, text files)</p>
          <DocAttachInput multiple bind:files />
        </div>

        <div class="rounded border border-slate-700 p-2 text-sm" data-testid="script-status">
          {#if parsed.errors.length}
            <p class="font-medium text-red-300">The script has {parsed.errors.length} error{parsed.errors.length === 1 ? '' : 's'}:</p>
            <ul class="list-disc pl-5 text-red-200">
              {#each parsed.errors.slice(0, 8) as e}<li>Line {e.line}: {e.message}</li>{/each}
            </ul>
          {:else if problems.length}
            <p class="font-medium text-red-300">It cannot be built yet:</p>
            <ul class="list-disc pl-5 text-red-200">{#each problems.slice(0, 8) as p}<li>{p}</li>{/each}</ul>
          {:else if script.trim()}
            <p class="text-emerald-300">The script is valid.</p>
          {:else}
            <p class="text-slate-400">Write or open a script.</p>
          {/if}
          {#if missingFiles.length}
            <p class="mt-2 font-medium text-amber-300">Still to supply:</p>
            <ul class="list-disc pl-5 text-amber-200">{#each missingFiles as n}<li>{n}</li>{/each}</ul>
          {/if}
          {#if script.trim() && !parsed.errors.length}
            <p class="mt-2 text-slate-400">It will make {counts.pages} pages ({counts.blocks} blocks), {counts.folders} folders, {counts.files} files, {counts.tables} tables with {counts.rows} entries.</p>
          {/if}
        </div>

        <ErrorDisplay message={error} />
        <p class="text-xs text-slate-500">The pack is private to you. Nothing is published.</p>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" on:click={close}>Cancel</Button>
          <Button variant="primary" disabled={!ready} on:click={create}>{busy ? 'Building…' : 'Build the pack'}</Button>
        </div>
      </div>
    </div>
  {/if}
</Modal>
