<!-- src/lib/apps/dossier/components/DatasetTable.svelte -->
<!-- The editor for one dataset — a chronology, correspondence log or document
     index. Columns come from the template in utils/datasetTemplates.js, never
     from the database, so there is no schema editor to build or maintain.

     Rows save on blur rather than on every keystroke: a table is a lot of small
     fields, and a per-character autosave would be a write per letter. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button        from '$lib/components/common/Button.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import {
    templateFor, sortRecords, emptyRecordFields, isBlankRecord,
  } from '../utils/datasetTemplates.js';

  export let dataset;
  export let records = [];
  export let canEdit = true;

  const dispatch = createEventDispatcher();

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
  // A new dataset resets the draft, or the previous table's values bleed in.
  $: if (dataset && dataset.id !== draftFor) {
    draftFor = dataset.id;
    draft = emptyRecordFields(dataset.key);
  }

  function commitCell(record, field, value) {
    if (String(record.fields?.[field.key] ?? '') === String(value)) return;
    dispatch('updateRecord', {
      id: record.id, fields: { ...record.fields, [field.key]: value },
    });
  }

  function commitDraft() {
    if (isBlankRecord(dataset.key, draft)) return;
    dispatch('createRecord', { fields: { ...draft } });
    draft = emptyRecordFields(dataset.key);
  }
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
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="text-left">
          {#each template?.fields ?? [] as field}
            <th class="text-xs font-semibold text-slate-400 uppercase tracking-wide
                       pb-2 pr-3 align-bottom"
                style={field.width ? `width:${field.width}` : ''}>{field.label}</th>
          {/each}
          <th class="w-8"></th>
        </tr>
      </thead>

      <tbody>
        {#each ordered as record (record.id)}
          <tr class="group border-t border-slate-800 align-top">
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
                {:else}
                  <input
                    type={field.type === 'date' ? 'date' : 'text'}
                    class="w-full bg-transparent text-slate-200 text-sm rounded px-1 py-1
                           border border-transparent hover:border-slate-700
                           focus:border-slate-600 focus:bg-slate-800 outline-none
                           placeholder:text-slate-600"
                    placeholder={field.placeholder ?? ''}
                    value={record.fields?.[field.key] ?? ''}
                    on:blur={(e) => commitCell(record, field, e.currentTarget.value)}
                  />
                {/if}
              </td>
            {/each}
            <td class="py-1">
              {#if canEdit}
                <button
                  class="w-6 h-6 rounded text-slate-600 hover:text-red-400 text-xs
                         opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  title="Delete this entry"
                  aria-label="Delete this entry"
                  on:click={() => dispatch('deleteRecord', record.id)}
                >×</button>
              {/if}
            </td>
          </tr>
        {/each}

        <!-- The always-present blank row: an empty table with no way in teaches
             nothing, and "Add row" is one click more than typing. -->
        {#if canEdit}
          <tr class="border-t border-slate-800 align-top">
            {#each template?.fields ?? [] as field}
              <td class="py-1 pr-3">
                {#if field.type === 'select'}
                  <select
                    class="w-full bg-transparent text-slate-300 text-sm rounded px-1 py-1
                           border border-dashed border-slate-800 focus:border-slate-600
                           focus:bg-slate-800 outline-none"
                    bind:value={draft[field.key]}
                    on:change={commitDraft}
                  >
                    <option value=""></option>
                    {#each field.options ?? [] as option}
                      <option value={option}>{option}</option>
                    {/each}
                  </select>
                {:else}
                  <input
                    type={field.type === 'date' ? 'date' : 'text'}
                    class="w-full bg-transparent text-slate-300 text-sm rounded px-1 py-1
                           border border-dashed border-slate-800 focus:border-slate-600
                           focus:bg-slate-800 outline-none placeholder:text-slate-600"
                    placeholder={field.placeholder ?? field.label}
                    bind:value={draft[field.key]}
                    on:blur={commitDraft}
                  />
                {/if}
              </td>
            {/each}
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
