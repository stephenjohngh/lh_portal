<!-- src/lib/apps/management/components/AddActivityForm.svelte -->
<!-- The "add a new activity" form, extracted from ActivityLogSection. Self-
     contained: owns the draft model, the AI-summary + email-paste UX, the
     document upload, and the issuesStore.addActivity call. Emits `added` on
     success and `cancel` on cancel (the parent just mounts/unmounts it). Has
     its OWN saving/mutationError — the parent's are shared with the edit/
     delete/move flows. See CLAUDE.md "Testing". -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { issuesStore }      from '../stores/issuesStore';
  import { uploadDocument }   from '$lib/utils/documentApi';
  import { postJson }         from '$lib/utils/request';
  import { parseEmailPaste }  from '$lib/utils/emailParser';
  import { ACTIVITY_TYPE, ACTIVITY_TYPES, ACTIVITY_TYPE_CONFIG } from '$lib/utils/constants';
  import Button          from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import DocAttachInput  from '$lib/components/common/DocAttachInput.svelte';
  import RichTextEditor  from '$lib/components/common/LazyRichTextEditor.svelte';

  const dispatch = createEventDispatcher();

  export let issueId;
  export let issueNumber = null;  // used for the document Drive subfolder name

  let newActivity = { body: '', activity_type: ACTIVITY_TYPE.NOTE, fields: {}, sequence: null };
  let saving        = false;
  let mutationError = '';

  // Document attachment
  let docFile    = null;
  let docInputRef;

  // AI summary
  let newSummaryGenerating = false;
  let newSummaryError      = '';

  $: newTypeConfig = ACTIVITY_TYPE_CONFIG[newActivity.activity_type] ?? ACTIVITY_TYPE_CONFIG[ACTIVITY_TYPE.COMMENT];

  function selectType(type) {
    // Reset fields on type change; preserve body + sequence so the user doesn't lose them.
    newActivity = { body: newActivity.body, activity_type: type, fields: {}, sequence: newActivity.sequence };
  }

  function setNewField(key, value) {
    newActivity = { ...newActivity, fields: { ...(newActivity.fields ?? {}), [key]: value } };
  }

  async function generateNewSummary() {
    if (!newActivity.body.trim()) return;
    newSummaryGenerating = true;
    newSummaryError      = '';
    try {
      const data = await postJson('/api/management/suggest-summary', {
        body:          newActivity.body,
        activity_type: newActivity.activity_type,
      });
      setNewField('summary', data.summary || '');
    } catch (e) {
      newSummaryError = e.message || 'Could not generate summary';
    } finally {
      newSummaryGenerating = false;
    }
  }

  // -- Email paste parsing -------------------------------------------------
  // Passed as onPaste to RichTextEditor; returns HTML for the editor to
  // display, or null to let Tiptap handle the paste normally.
  let parseNotice = '';
  let parseNoticeTimer;

  function handleBodyPasteForEditor(rawText) {
    if (newActivity.activity_type !== ACTIVITY_TYPE.EMAIL) return null;

    const parsed = parseEmailPaste(rawText);
    if (!parsed) return null; // not an email — let Tiptap handle it

    const fields = { ...(newActivity.fields || {}) };
    if (parsed.from)       fields.from       = parsed.from;
    if (parsed.to)         fields.to         = parsed.to;
    if (parsed.subject)    fields.subject    = parsed.subject;
    if (parsed.email_date) fields.email_date = parsed.email_date;
    newActivity = { ...newActivity, fields };

    clearTimeout(parseNoticeTimer);
    parseNotice = parsed.wasThread
      ? '✓ Thread detected — showing latest message only'
      : '✓ Email fields extracted from paste';
    parseNoticeTimer = setTimeout(() => { parseNotice = ''; }, 5000);

    const normBody = parsed.body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normBody
      .split(/\n\n+/)
      .map(para => {
        const trimmed = para.trim();
        if (!trimmed) return null;
        const inner = trimmed
          .split('\n')
          .map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
          .join('<br>');
        return `<p>${inner}</p>`;
      })
      .filter(Boolean)
      .join('') || '<p></p>';
  }

  async function addNewActivity() {
    const isDocType = newActivity.activity_type === ACTIVITY_TYPE.DOCUMENT;

    // For document type the file is required; body is optional. Otherwise body is required.
    if (isDocType ? !docFile : !newActivity.body.trim()) return;

    saving = true;
    mutationError = '';

    try {
      let fields = null;

      if (isDocType) {
        // Step 1: upload file via the shared document_library client
        const doc = await uploadDocument(docFile, {
          entity_type:  'issue',
          entity_id:    issueId,
          folder_path:  issueNumber ? `Issues/Issue ${issueNumber}` : 'Issues',
          display_name: docFile.name,
          doc_type:     'other',
        });

        fields = {
          doc_id:       doc.id,
          filename:     doc.filename,
          display_name: doc.display_name,
          file_size:    doc.file_size,
          mime_type:    doc.mime_type,
          web_view_url: doc.web_view_url,
          summary:      newActivity.fields?.summary || null,
        };
      } else {
        const hasFields = Object.values(newActivity.fields || {}).some(v => v && String(v).trim());
        fields = hasFields ? newActivity.fields : null;
      }

      const result = await issuesStore.addActivity(issueId, {
        body:          newActivity.body,
        activity_type: newActivity.activity_type,
        fields,
        sequence:      newActivity.sequence ?? null,
      });

      if (!result.success) {
        mutationError = result.error ?? `Failed to add ${newTypeConfig.label.toLowerCase()}`;
        return;
      }

      // Reset (keep type for batch-logging) and let the parent close the form.
      newActivity = { body: '', activity_type: newActivity.activity_type, fields: {}, sequence: null };
      docFile = null;
      docInputRef?.reset();
      dispatch('added');
    } catch (err) {
      mutationError = err.message ?? `Failed to add ${newTypeConfig.label.toLowerCase()}`;
    } finally {
      saving = false;
    }
  }

  function cancel() {
    newActivity = { body: '', activity_type: newActivity.activity_type, fields: {}, sequence: null };
    docFile = null;
    docInputRef?.reset();
    mutationError = '';
    dispatch('cancel');
  }
</script>

<div class="bg-slate-700/50 rounded p-3 border {newTypeConfig.borderEdit} mb-3">

  <!-- Type picker pills -->
  <div class="flex flex-wrap gap-1 mb-3">
    {#each ACTIVITY_TYPES as t}
      <button
        type="button"
        class="text-xs px-2.5 py-1 rounded-full border transition-colors
               {newActivity.activity_type === t.value
                 ? t.color + ' border-current bg-slate-600/80 text-white font-semibold'
                 : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'}"
        on:click={() => selectType(t.value)}
      >
        {t.icon} {t.label}
      </button>
    {/each}
  </div>

  <!-- Structured fields (email / call / letter only) -->
  {#if newTypeConfig.fields.length > 0}
    <div class="grid grid-cols-2 gap-2 mb-3">
      {#each newTypeConfig.fields as field}
        <div class={field.span === 2 ? 'col-span-2' : ''}>
          <label
            for="new-field-{field.key}"
            class="block text-[10px] text-slate-400 mb-0.5"
          >{field.label}</label>
          {#if field.type === 'select'}
            <select
              id="new-field-{field.key}"
              value={newActivity.fields[field.key] || ''}
              on:change={(e) => setNewField(field.key, e.currentTarget.value)}
              class="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 {newTypeConfig.ringClass}"
            >
              {#each (field.options || []) as opt}<option value={opt}>{opt}</option>{/each}
            </select>
          {:else if field.key === 'summary' && (newActivity.activity_type === ACTIVITY_TYPE.NOTE || newActivity.activity_type === ACTIVITY_TYPE.COMMENT)}
            <!-- Summary field with AI-generate button + optional sequence -->
            <div class="flex gap-1">
              <input
                id="new-field-{field.key}"
                type="text"
                value={newActivity.fields[field.key] || ''}
                placeholder={field.placeholder || ''}
                on:input={(e) => setNewField(field.key, e.currentTarget.value)}
                class="flex-1 min-w-0 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 {newTypeConfig.ringClass}"
              />
              <button
                type="button"
                on:click={generateNewSummary}
                disabled={newSummaryGenerating || !newActivity.body.trim()}
                title="Generate one-line summary with AI"
                class="px-2 py-1 text-xs bg-slate-700 hover:bg-purple-800/60 text-slate-300 hover:text-purple-200 rounded border border-slate-600 hover:border-purple-600/50 shrink-0 transition-colors disabled:opacity-40"
              >{newSummaryGenerating ? '…' : '✨'}</button>
              <input
                type="number"
                value={newActivity.sequence ?? ''}
                min="1"
                placeholder="#"
                title="Optional sequence number"
                on:input={(e) => { const v = e.currentTarget.value; newActivity = { ...newActivity, sequence: v === '' ? null : (parseInt(v, 10) || null) }; }}
                class="w-[4.375rem] shrink-0 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
            {#if newSummaryError}
              <p class="text-[10px] text-red-400 mt-0.5">{newSummaryError}</p>
            {/if}
          {:else if field.key === 'summary'}
            <!-- Summary field (non-note/comment types) + optional sequence -->
            <div class="flex gap-1">
              <input
                id="new-field-{field.key}"
                type="text"
                value={newActivity.fields[field.key] || ''}
                placeholder={field.placeholder || ''}
                on:input={(e) => setNewField(field.key, e.currentTarget.value)}
                class="flex-1 min-w-0 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 {newTypeConfig.ringClass}"
              />
              <input
                type="number"
                value={newActivity.sequence ?? ''}
                min="1"
                placeholder="#"
                title="Optional sequence number"
                on:input={(e) => { const v = e.currentTarget.value; newActivity = { ...newActivity, sequence: v === '' ? null : (parseInt(v, 10) || null) }; }}
                class="w-[4.375rem] shrink-0 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
          {:else}
            <input
              id="new-field-{field.key}"
              type={field.type}
              value={newActivity.fields[field.key] || ''}
              placeholder={field.placeholder || ''}
              on:input={(e) => setNewField(field.key, e.currentTarget.value)}
              class="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 {newTypeConfig.ringClass}"
            />
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Body (rich text editor — all activity types) -->
  <RichTextEditor
    value={newActivity.body}
    placeholder={newTypeConfig.placeholder}
    ringClass={newTypeConfig.ringClass}
    onPaste={handleBodyPasteForEditor}
    markdown={true}
    on:change={(e) => { newActivity = { ...newActivity, body: e.detail }; }}
  />

  {#if parseNotice}
    <p class="text-xs text-cyan-400 mt-1 flex items-center gap-1.5">
      <span>{parseNotice}</span>
      <button type="button" class="text-cyan-600 hover:text-cyan-400 leading-none" on:click={() => parseNotice = ''}>✕</button>
    </p>
  {/if}

  <!-- Document file attachment -->
  {#if newActivity.activity_type === ACTIVITY_TYPE.DOCUMENT}
    <div class="mt-2">
      <p class="text-[10px] text-slate-400 mb-1">Attach file <span class="text-slate-600">(required)</span></p>
      <DocAttachInput bind:this={docInputRef} bind:file={docFile} />
    </div>
  {/if}

  {#if mutationError}
    <p class="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2 mt-2">{mutationError}</p>
  {/if}

  <div class="flex justify-end gap-2 mt-2">
    <Button variant="secondary" size="small" on:click={cancel}>
      Cancel
    </Button>
    <ProtectedButton
      action="modify"
      variant="blue"
      size="small"
      icon="plus"
      disabled={saving || (newActivity.activity_type === ACTIVITY_TYPE.DOCUMENT
        ? !docFile
        : !newActivity.body.trim())}
      on:click={addNewActivity}
    >
      {saving ? 'Saving…' : `Add ${newTypeConfig.label}`}
    </ProtectedButton>
  </div>
</div>
