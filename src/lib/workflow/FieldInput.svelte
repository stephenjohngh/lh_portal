<!-- src/lib/apps/cases/components/FieldInput.svelte -->
<!-- One field of a Cases process (migration 253), as the control its type
     needs. `value` is bound; the parent saves. A link field offers the
     portal's components, spaces or users — ⛔ a person is a portal user,
     never a resident. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { DOC_FOLDERS } from '#lib/utils/documentUtils.js';
  import { errMessage } from '#lib/utils/errors.js';
  /** @type {{ key: string, label: string, type: string, options?: string[], help?: string|null, required_on_create?: boolean }} */
  export let field;
  /** @type {any} */
  export let value = '';
  /** What each link field offers (caseFields.linkOptions). */
  /** @type {any} */
  export let links = { component: [], space: [], person: [] };
  /** Show "needed to open" beside the label (the new-case form). */
  export let showNeeded = false;
  export let disabled = false;
  /** The item this field belongs to (a document field attaches to it); '' before the item exists. */
  export let itemId = '';
  /** @type {string} */ export let folderPath = DOC_FOLDERS.EVIDENCE;

  // A document field (migration 267): the evidence is a library document held
  // against the item; the field's value is that document's id.
  let docName = '';
  let docNote = '';
  let docBusy = false;
  let docFor = '';
  $: if (field.type === 'document' && itemId && value && `${itemId}:${value}` !== docFor) { docFor = `${itemId}:${value}`; readDoc(); }
  $: if (field.type === 'document' && !value) { docName = ''; docFor = ''; }
  async function readDoc() {
    const id = String(value);
    try {
      // Loaded when needed: documentApi brings the sign-in client with it.
      const { listDocuments } = await import('#lib/utils/documentApi.js');
      const docs = await listDocuments({ entity_type: 'workflow_item', entity_id: itemId });
      const d = docs.find((/** @type {any} */ x) => x.id === id);
      docName = d ? (d.display_name || d.filename) : 'A document that can no longer be found';
    } catch { docName = 'A document'; }
  }
  async function attach(/** @type {Event} */ e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const file = input.files?.[0];
    if (!file) return;
    docBusy = true; docNote = '';
    try {
      const { uploadDocument } = await import('#lib/utils/documentApi.js');
      const row = await uploadDocument(file, { entity_type: 'workflow_item', entity_id: itemId, display_name: file.name,
        folder_path: folderPath, category: 'evidence' });
      value = row.id;
      docNote = 'Attached — press Save fields to keep it.';
    } catch (err) { docNote = errMessage(err, 'The file could not be attached.'); }
    finally { docBusy = false; input.value = ''; }
  }
  async function openDoc() {
    try {
      const { getDocumentUrl } = await import('#lib/utils/documentApi.js');
      window.open(await getDocumentUrl(String(value)), '_blank', 'noopener');
    }
    catch (err) { docNote = errMessage(err, 'The document could not be opened.'); }
  }

  const id = `case-field-${Math.random().toString(36).slice(2, 9)}`;
  const cls = 'w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200';
  $: options = field.type === 'component' || field.type === 'space' || field.type === 'person' ? links?.[field.type] ?? [] : [];
</script>

<div class="space-y-1">
  <label for={id} class="block text-xs text-slate-400">
    {field.label}{#if showNeeded && field.required_on_create}<span class="text-amber-300"> · needed to open</span>{/if}
  </label>
  {#if field.type === 'document'}
    {#if !itemId}
      <p class="text-xs text-slate-500">Attach it once it is open.</p>
    {:else}
      <div class="flex items-center gap-2 flex-wrap">
        {#if value}
          <Button variant="tertiary" size="xs" on:click={openDoc}>{docName || 'Open the document'}</Button>
        {:else}<span class="text-xs text-slate-500">Nothing attached.</span>{/if}
        <label class="text-xs text-slate-300 cursor-pointer border border-slate-600 rounded px-2 py-1">
          {value ? 'Replace…' : 'Attach a file…'}
          <input type="file" class="sr-only" on:change={attach} disabled={disabled || docBusy} aria-label="{field.label}: attach a file" />
        </label>
        {#if docBusy}<span class="text-xs text-slate-400">Uploading…</span>{/if}
      </div>
      {#if docNote}<p class="text-xs text-amber-300">{docNote}</p>{/if}
    {/if}
  {:else if field.type === 'long_text'}
    <textarea {id} rows="3" class={cls} bind:value {disabled}></textarea>
  {:else if field.type === 'date'}
    <input {id} type="date" class={cls} bind:value {disabled} />
  {:else if field.type === 'number'}
    <input {id} type="number" class={cls} bind:value {disabled} />
  {:else if field.type === 'yes_no'}
    <select {id} class={cls} bind:value {disabled}>
      <option value="">—</option><option value="Yes">Yes</option><option value="No">No</option>
    </select>
  {:else if field.type === 'choice'}
    <select {id} class={cls} bind:value {disabled}>
      <option value="">—</option>
      {#each field.options ?? [] as o (o)}<option value={o}>{o}</option>{/each}
    </select>
  {:else if options.length || field.type === 'component' || field.type === 'space' || field.type === 'person'}
    <select {id} class={cls} bind:value {disabled}>
      <option value="">—</option>
      {#each options as o (o.id)}<option value={o.id}>{o.text}</option>{/each}
      {#if value && !options.some((/** @type {any} */ o) => o.id === value)}<option value={value}>No longer in the portal</option>{/if}
    </select>
  {:else}
    <input {id} type="text" class={cls} bind:value {disabled} />
  {/if}
  {#if field.help}<p class="text-[11px] text-slate-500">{field.help}</p>{/if}
</div>
