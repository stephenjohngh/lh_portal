<!-- src/lib/apps/cases/components/CasePanel.svelte -->
<!-- One case of a Cases process (migration 253): its title, description and
     the process's fields (editable by whoever can edit Cases), who it is with,
     its deadline, the moves from its step — each held back with the reason
     when it cannot be made yet, the needed fields among them — its history,
     its documents and its printable record. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { casesStore } from '../stores/casesStore.js';
  import FieldInput from './FieldInput.svelte';
  import AttachedDocuments from '#lib/components/common/documents/AttachedDocuments.svelte';
  import Button from '#lib/components/common/Button.svelte';
  import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import WorkflowItemControls from '#lib/workflow/WorkflowItemControls.svelte';
  import { fieldText, fieldsForSave } from '../utils/caseFields.js';
  import { DOC_FOLDERS, entityFolderPath } from '#lib/utils/documentUtils.js';
  import { fmtDateTime, today } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';

  /** @type {any} */ export let c;
  /** @type {any} */ export let item = null;
  /** @type {any} */ export let workflow = null;
  /** @type {any[]} */ export let steps = [];
  /** @type {any[]} */ export let moves = [];
  /** @type {any[]} */ export let fields = [];
  /** @type {any} */ export let links = { component: [], space: [], person: [] };
  /** @type {Array<{ id: string, full_name: string|null }>} */ export let assignees = [];
  /** @type {Record<string, string>} */ export let nameById = {};
  /** @type {string|null} */ export let me = null;
  export let isAdmin = false;
  export let canEdit = false;

  const dispatch = createEventDispatcher();

  let error = '';
  let done = '';
  let busy = '';
  // The draft: read once per case (keyed on its id, never the object).
  let draftFor = '';
  let title = '';
  let description = '';
  /** @type {Record<string, any>} */
  let values = {};
  $: if (c && c.id !== draftFor) { draftFor = c.id; resetDraft(); }
  function resetDraft() {
    title = c.title ?? ''; description = c.description ?? '';
    values = Object.fromEntries(fields.map((f) => [f.key, c.fields?.[f.key] ?? '']));
    done = ''; error = '';
  }

  $: saved = fieldsForSave(fields, c?.fields ?? {}, c?.fields ?? {});
  $: draft = fieldsForSave(fields, values, c?.fields ?? {});
  $: dirty = !!c && (title.trim() !== (c.title ?? '') || description.trim() !== (c.description ?? '')
    || JSON.stringify(draft) !== JSON.stringify(saved));

  async function saveDraft() {
    const theCase = c;                               // captured before the await
    busy = 'save'; error = ''; done = '';
    try { await casesStore.save(theCase, { title, description, fields: draft }); done = `${theCase.reference}: saved.`; }
    catch (/** @type {any} */ err) { error = errMessage(err, 'It could not be saved.'); }
    finally { busy = ''; }
  }
  // The item's controls make the change through the store (its audit line, its reload).
  const onMove = (/** @type {any} */ m, /** @type {string} */ note) => casesStore.move(c, m.to_key, note);
  const onAssign = (/** @type {string|null} */ uid) => casesStore.assign(c, uid);
  const extraRefusal = () => (dirty ? 'Save your changes first.' : null);
  $: record = c ? {
    filenameStem: `${c.reference}_${today()}`,
    audit: { appId: 'cases', entityType: 'case', entityId: c.id },
    subject: () => ({
      title: `${workflow?.name ?? 'Case'} ${c.reference}`,
      facts: [['Reference', c.reference], ['Opened', fmtDateTime(c.created_at)], ['Title', c.title],
        ...fields.map((f) => /** @type {[string, string]} */ ([f.label, fieldText(f, c.fields?.[f.key], links)]))],
      sections: [{ heading: 'Description', text: c.description }],
    }),
  } : null;

  let confirmDelete = false;
  async function doDelete() {
    const theCase = c;
    busy = 'delete'; error = '';
    try { await casesStore.remove(theCase); confirmDelete = false; dispatch('closed'); }
    catch (/** @type {any} */ err) { error = errMessage(err, 'It could not be deleted.'); confirmDelete = false; }
    finally { busy = ''; }
  }
  $: openedBy = c?.created_by ? nameById[c.created_by] || 'A user no longer listed' : '—';
</script>

{#if c}
  <aside class="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-3 text-sm" data-testid="case-panel">
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="font-mono text-white">{c.reference}</p>
        <p class="text-xs text-slate-400">Opened {fmtDateTime(c.created_at)} · {openedBy}</p>
      </div>
      <Button variant="tertiary" size="xs" on:click={() => dispatch('closed')}>Close</Button>
    </div>
    <ErrorDisplay message={error} onDismiss={() => (error = '')} />
    {#if done}<p class="text-sm text-green-400" role="status">{done}</p>{/if}

    <WorkflowItemControls {item} {workflow} {steps} {moves} reference={c.reference} {isAdmin} {canEdit} {me}
      {assignees} {nameById} {fields} values={c.fields ?? {}} {onMove} {onAssign} {extraRefusal} {record}>
      <div class="space-y-2 border-t border-slate-700 pt-3" data-testid="case-details">
        {#if canEdit}
          <label class="block text-xs text-slate-400">Title
            <input class="mt-1 w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200" bind:value={title} /></label>
          <label class="block text-xs text-slate-400">Description
            <textarea rows="3" class="mt-1 w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200" bind:value={description}></textarea></label>
          {#each fields as f (f.key)}<FieldInput field={f} bind:value={values[f.key]} {links} />{/each}
          <div class="flex gap-2">
            <Button size="small" variant="primary" disabled={!dirty || !title.trim() || !!busy} loading={busy === 'save'} on:click={saveDraft}>Save changes</Button>
            <Button size="small" variant="secondary" disabled={!dirty || !!busy} on:click={resetDraft}>Undo changes</Button>
          </div>
        {:else}
          <p class="text-white">{c.title}</p>
          {#if c.description}<p class="text-slate-300 whitespace-pre-line">{c.description}</p>{/if}
          <dl class="grid grid-cols-[10rem_1fr] gap-x-2 gap-y-1">
            {#each fields as f (f.key)}<dt class="text-slate-400">{f.label}</dt><dd class="text-slate-100">{fieldText(f, c.fields?.[f.key], links)}</dd>{/each}
          </dl>
        {/if}
      </div>
      <div class="border-t border-slate-700 pt-3">
        <AttachedDocuments entityType="case" entityId={c.id} {canEdit} canDelete={isAdmin}
          folderPath={entityFolderPath(DOC_FOLDERS.CASES, `${c.reference} ${c.title}`, c.id)} title="Documents" />
      </div>
    </WorkflowItemControls>

    {#if isAdmin}
      <div class="border-t border-slate-700 pt-3">
        <Button variant="danger" size="small" disabled={!!busy} on:click={() => (confirmDelete = true)}>Delete case</Button>
      </div>
    {/if}
  </aside>

  <ConfirmDialog show={confirmDelete} title="Delete {c.reference}?" danger={true} processing={busy === 'delete'}
    message="The case, its history and its documents are deleted. Nothing is kept. To finish a case, move it to a finished step instead."
    confirmText="Delete" on:confirm={doDelete} on:cancel={() => (confirmDelete = false)} />
{/if}
