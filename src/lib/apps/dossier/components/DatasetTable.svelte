<!-- src/lib/apps/dossier/components/DatasetTable.svelte -->
<!-- The editor for one dataset — a chronology, correspondence log or document
     index. Columns come from the template in utils/datasetTemplates.js, never
     from the database, so there is no schema editor to build or maintain.

     Rows save on blur rather than on every keystroke: a table is a lot of small
     fields, and a per-character autosave would be a write per letter. -->
<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import Button        from '$lib/components/common/Button.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import {
    templateFor, sortRecords, emptyRecordFields, isBlankRecord,
  } from '../utils/datasetTemplates.js';
  import { unindexedFiles, describeShelfAddition } from '../utils/documentIndex.js';
  import { needsFolding } from '../utils/datasetRender.js';

  export let dataset;
  export let records = [];
  export let canEdit = true;
  /** The pack's pages and shelf, for resolving what a row points at. */
  export let docs  = [];
  export let files = [];

  const dispatch = createEventDispatcher();

  // A document index whose files are all already on the shelf should not have
  // to be retyped. Derived here so the button can say how many it would add.
  $: shelfPending = dataset.key === 'document_index'
    ? unindexedFiles(files, records)
    : [];

  let error = '';
  /** The blank row at the bottom, committed once something is typed into it. */
  let draft = emptyRecordFields(dataset?.key);
  /**
   * Which dataset the draft belongs to, tracked by ID.
   *
   * Guarding on `dataset` itself does not work: Svelte's safe_not_equal treats
   * ANY object as changed, so an object prop is dirty on every parent update
   * even when it is the identical reference. A reset keyed on the object reran
   * constantly and wiped each character as it was typed.
   */
  let draftFor = dataset?.id ?? null;

  $: template = templateFor(dataset?.key);
  $: ordered  = sortRecords(dataset?.key, records);
  // Resolved once per render rather than per cell — and {@const} is not allowed
  // inside a <td>, only as the immediate child of a block.
  $: linkTargets = new Map(records.map(r => [r.id, linkTargetOf(r, docs, files)]));
  // A new dataset resets the draft, or the previous table's values bleed in.
  $: if (dataset && dataset.id !== draftFor) {
    draftFor = dataset.id;
    draft = emptyRecordFields(dataset.key);
  }

  /** What a row's reference points at, or null. */
  function linkTargetOf(record, docList, fileList) {
    if (record.doc_id) {
      const doc = docList.find(d => d.id === record.doc_id);
      return { kind: 'doc', label: doc?.title ?? 'a deleted page', missing: !doc };
    }
    if (record.document_id) {
      const file = fileList.find(f => f.id === record.document_id);
      return {
        kind: 'file',
        label: file?.display_name || file?.filename || 'a removed file',
        missing: !file,
      };
    }
    return null;
  }

  /**
   * How tall a cell may grow before it scrolls instead.
   *
   * A pasted email body is not three lines, it is forty — and an uncapped
   * textarea made one correspondence row taller than the screen. Past the cap
   * the cell scrolls; nothing is lost, and the read view folds the full text
   * into a row of its own.
   */
  const MAX_CELL_PX = 180;

  /**
   * Which capped cells the author has chosen to open, keyed `<row>:<field>`.
   *
   * The read view folds a long body into a row of its own; this table cannot do
   * that, because every cell is an input. So the cell expands in place instead
   * — the same promise (the whole text is reachable) by the means this surface
   * allows.
   */
  let expanded = new Set();

  const cellKey = (record, field) => `${record.id}:${field.key}`;

  function toggleExpanded(record, field) {
    const key = cellKey(record, field);
    // Reassigned, not mutated: Svelte does not track Set mutation.
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    expanded = next;
  }

  /**
   * A textarea that grows with its content, as a Svelte action so the initial
   * size is right too — a cell loaded with three lines of notes should show
   * three lines, not one with the rest hidden.
   */
  function grows(node, open = false) {
    let uncapped = open;
    const resize = () => {
      node.style.height = 'auto';
      const wanted = node.scrollHeight;
      const height = uncapped ? wanted : Math.min(wanted, MAX_CELL_PX);
      node.style.height = `${height}px`;
      node.style.overflowY = !uncapped && wanted > MAX_CELL_PX ? 'auto' : 'hidden';
    };
    resize();
    node.addEventListener('input', resize);
    return {
      update(next) { uncapped = next; resize(); },
      destroy: () => node.removeEventListener('input', resize),
    };
  }

  function commitCell(record, field, value) {
    if (String(record.fields?.[field.key] ?? '') === String(value)) return;
    dispatch('updateRecord', {
      id: record.id, fields: { ...record.fields, [field.key]: value },
    });
  }

  // ── Committing the draft row ──────────────────────────────────────────────
  // The boundary is LEAVING THE ROW, not leaving a field. Committing per field
  // meant tabbing from Date to Event saved a row holding only a date — which
  // then sorted itself away underneath the author, who was still typing it.

  /** The draft <tr>, so focusout can tell "moved a cell" from "left the row". */
  let draftRowEl;
  /** Draft cell elements by column index, so Enter can return to the first. */
  let draftInputs = [];
  /** How long a newly added row stays highlighted. */
  const FLASH_MS = 3000;
  /** Pending focusout check — see handleDraftFocusOut for why it is deferred. */
  let focusOutTimer = null;
  /** Briefly highlights a newly added row so the eye can follow it as it sorts. */
  let flashId = null;
  let flashTimer = null;
  let knownIds = new Set();

  function commitDraft() {
    if (!dataset || isBlankRecord(dataset.key, draft)) return false;
    dispatch('createRecord', { fields: { ...draft } });
    draft = emptyRecordFields(dataset.key);
    return true;
  }

  function handleDraftFocusOut() {
    // Do NOT trust event.relatedTarget. It is null whenever the browser will
    // not say where focus went — and opening a native DATE PICKER is exactly
    // that case, so `contains(null)` read as "left the row" and committed a
    // half-typed entry the moment the author picked a date. Defer a tick and
    // ask what actually holds focus instead.
    clearTimeout(focusOutTimer);
    focusOutTimer = setTimeout(() => {
      if (draftRowEl?.contains(document.activeElement)) return;
      commitDraft();
    }, 0);
  }

  function handleDraftKeydown(event) {
    if (event.key !== 'Enter') return;
    // In a multi-line cell Enter is a newline, which is the whole point of the
    // column. Leave the row or Tab onward to commit.
    if (event.target?.tagName === 'TEXTAREA') return;
    event.preventDefault();          // a bare Enter would submit nothing useful
    clearTimeout(focusOutTimer);     // this commit supersedes any deferred one
    if (commitDraft()) draftInputs[0]?.focus();
  }

  /**
   * Flash whichever row has just appeared. A chronology re-sorts on save, so
   * without this an entry can leap several rows and leave the author hunting
   * for it.
   */
  function trackNewRows(list) {
    const seen = knownIds;
    let added = null;
    for (const record of list) {
      if (!seen.has(record.id)) {
        if (seen.size) added = record.id;   // not the first load
        seen.add(record.id);
      }
    }
    if (!added) return;
    flashId = added;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashId = null; }, FLASH_MS);
  }

  $: trackNewRows(records);

  onDestroy(() => { clearTimeout(flashTimer); clearTimeout(focusOutTimer); });
</script>

<div class="flex flex-col h-full min-h-0">

  <!-- Header -->
  <div class="flex items-center gap-3 px-6 py-2 border-b border-slate-700/50 shrink-0">
    <h2 class="text-sm font-semibold text-white truncate">{dataset.title}</h2>
    <span class="text-xs text-slate-600 truncate hidden md:inline">{template?.blurb}</span>
    <div class="flex-1"></div>
    <span class="text-xs text-slate-500 shrink-0">
      {records.length} {records.length === 1 ? 'entry' : 'entries'}
    </span>
    {#if canEdit}
      {#if dataset.key === 'document_index' && shelfPending.length}
        <ProtectedButton requireAdmin={false} variant="secondary" size="small"
                         title="Add every file on the pack-s shelf that is not indexed yet"
                         on:click={() => dispatch('addFromShelf')}>
          {describeShelfAddition(shelfPending)}
        </ProtectedButton>
      {/if}
      {#if dataset.key === 'correspondence'}
        <ProtectedButton requireAdmin={false} variant="secondary" size="small"
                         title="Paste an email or a thread to add entries"
                         on:click={() => dispatch('pasteEmails')}>
          Paste emails
        </ProtectedButton>
      {/if}
      <ProtectedButton requireAdmin={false} variant="secondary" size="small"
                       on:click={() => dispatch('deleteDataset')}>
        Delete table
      </ProtectedButton>
    {/if}
  </div>

  {#if error}
    <div class="px-6 pt-3 shrink-0">
      <ErrorDisplay message={error} onDismiss={() => error = ''} />
    </div>
  {/if}

  <!-- Table -->
  <div class="flex-1 min-h-0 overflow-auto px-6 py-4">
    <!-- table-fixed is load-bearing: with the default auto layout a column's
         CONTENT sets its width, so one long filename in Detail stole the space
         Notes needed and the declared widths were ignored. Fixed layout honours
         them and gives the remainder to the columns that declare none. -->
    <table class="w-full text-sm border-collapse table-fixed">
      <thead>
        <tr class="text-left">
          {#each template?.fields ?? [] as field}
            <th class="text-xs font-semibold text-slate-400 uppercase tracking-wide
                       pb-2 pr-3 align-bottom"
                style={field.width ? `width:${field.width}` : ''}>{field.label}</th>
          {/each}
          <th class="text-xs font-semibold text-slate-400 uppercase tracking-wide
                     pb-2 pr-3 align-bottom w-32">Detail</th>
          <th class="w-8"></th>
        </tr>
      </thead>

      <tbody>
        {#each ordered as record (record.id)}
          <tr class="group border-t border-slate-800 align-top transition-colors
                     {flashId === record.id ? 'bg-slate-700/40' : ''}">
            {#each template.fields as field}
              <td class="py-1 pr-3">
                {#if !canEdit}
                  <span class="text-slate-300">{record.fields?.[field.key] || '—'}</span>
                {:else if field.type === 'select'}
                  <select
                    class="w-full bg-transparent text-slate-200 text-sm rounded px-1 py-1
                           border border-transparent hover:border-slate-700
                           focus:border-slate-600 focus:bg-slate-800 outline-none"
                    value={record.fields?.[field.key] ?? ''}
                    on:change={(e) => commitCell(record, field, e.currentTarget.value)}
                  >
                    <option value=""></option>
                    {#each field.options ?? [] as option}
                      <option value={option}>{option}</option>
                    {/each}
                  </select>
                {:else if field.type === 'longtext'}
                  <textarea
                    rows="1"
                    use:grows={expanded.has(cellKey(record, field))}
                    class="w-full bg-transparent text-slate-200 text-sm rounded px-1 py-1
                           border border-transparent hover:border-slate-700
                           focus:border-slate-600 focus:bg-slate-800 outline-none
                           resize-none leading-snug"
                    value={record.fields?.[field.key] ?? ''}
                    on:blur={(e) => commitCell(record, field, e.currentTarget.value)}
                  ></textarea>
                  {#if needsFolding(record.fields?.[field.key])}
                    <!-- A pasted email body is forty lines. The cell caps at a
                         readable height; this is how the rest is reached. -->
                    <button
                      type="button"
                      class="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                      on:click={() => toggleExpanded(record, field)}
                    >{expanded.has(cellKey(record, field))
                        ? '▾ show less'
                        : '▸ show full text'}</button>
                  {/if}
                {:else}
                  <input
                    type={field.type === 'date' ? 'date' : 'text'}
                    class="w-full bg-transparent text-slate-200 text-sm rounded px-1 py-1
                           border border-transparent hover:border-slate-700
                           focus:border-slate-600 focus:bg-slate-800 outline-none"
                    value={record.fields?.[field.key] ?? ''}
                    on:blur={(e) => commitCell(record, field, e.currentTarget.value)}
                  />
                {/if}
              </td>
            {/each}
            <!-- Where the fuller story lives: a page, or a file on the shelf.
                 A reference, so the link graph and the P3 publish walk follow it. -->
            <td class="py-1 pr-3 text-xs min-w-0">
              {#if linkTargets.get(record.id)}
                <span class="flex items-center gap-1 min-w-0">
                  <span class="shrink-0 text-slate-600">
                    {linkTargets.get(record.id).kind === 'doc' ? '¶' : '📎'}
                  </span>
                  <button
                    class="truncate underline underline-offset-2
                           {linkTargets.get(record.id).missing
                             ? 'text-amber-400' : 'text-slate-300 hover:text-white'}"
                    title={linkTargets.get(record.id).missing
                      ? 'What this pointed at is gone'
                      : `Go to ${linkTargets.get(record.id).label}`}
                    on:click={() => dispatch('openTarget', record)}
                  >{linkTargets.get(record.id).label}</button>
                  {#if canEdit}
                    <button class="shrink-0 text-slate-600 hover:text-red-400"
                            title="Remove this link"
                            on:click={() => dispatch('clearLink', record)}>×</button>
                  {/if}
                </span>
              {:else if canEdit}
                <span class="flex items-center gap-2 opacity-0 group-hover:opacity-100
                             focus-within:opacity-100 transition-opacity">
                  <button class="text-slate-500 hover:text-white"
                          title="Link this entry to a page"
                          on:click={() => dispatch('linkPage', record)}>¶ Page</button>
                  <button class="text-slate-500 hover:text-white"
                          title="Link this entry to a file"
                          on:click={() => dispatch('linkFile', record)}>📎 File</button>
                </span>
              {/if}
            </td>
            <td class="py-1">
              {#if canEdit}
                <button
                  class="w-6 h-6 rounded text-slate-600 hover:text-red-400 text-xs
                         opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  title="Delete this entry"
                  aria-label="Delete this entry"
                  on:click={() => dispatch('deleteRecord', record)}
                >×</button>
              {/if}
            </td>
          </tr>
        {/each}

        <!-- The always-present blank row: an empty table with no way in teaches
             nothing, and "Add row" is one click more than typing. -->
        {#if canEdit}
          <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
          <tr class="border-t border-slate-800 align-top"
              bind:this={draftRowEl}
              on:focusout={handleDraftFocusOut}
              on:keydown={handleDraftKeydown}>
            {#each template?.fields ?? [] as field, i}
              <td class="py-1 pr-3">
                {#if field.type === 'select'}
                  <select
                    class="w-full bg-transparent text-slate-300 text-sm rounded px-1 py-1
                           border border-dashed border-slate-800 focus:border-slate-600
                           focus:bg-slate-800 outline-none"
                    bind:value={draft[field.key]}
                    bind:this={draftInputs[i]}
                  >
                    <option value=""></option>
                    {#each field.options ?? [] as option}
                      <option value={option}>{option}</option>
                    {/each}
                  </select>
                {:else if field.type === 'longtext'}
                  <textarea
                    rows="1"
                    use:grows
                    class="w-full bg-transparent text-slate-300 text-sm rounded px-1 py-1
                           border border-dashed border-slate-800 focus:border-slate-600
                           focus:bg-slate-800 outline-none placeholder:text-slate-600
                           resize-none overflow-hidden leading-snug"
                    placeholder={field.placeholder ?? field.label}
                    bind:value={draft[field.key]}
                    bind:this={draftInputs[i]}
                  ></textarea>
                {:else}
                  <input
                    type={field.type === 'date' ? 'date' : 'text'}
                    class="w-full bg-transparent text-slate-300 text-sm rounded px-1 py-1
                           border border-dashed border-slate-800 focus:border-slate-600
                           focus:bg-slate-800 outline-none placeholder:text-slate-600"
                    placeholder={field.placeholder ?? field.label}
                    bind:value={draft[field.key]}
                    bind:this={draftInputs[i]}
                  />
                {/if}
              </td>
            {/each}
            <td class="text-xs text-slate-600 pr-3">—</td>
            <td></td>
          </tr>
        {/if}
      </tbody>
    </table>

    {#if records.length === 0}
      <p class="text-xs text-slate-500 mt-4 max-w-md">
        {template?.blurb} Type in the row above to add the first entry — there is
        no “save”, each cell is stored when you leave it.
      </p>
    {/if}
  </div>
</div>
