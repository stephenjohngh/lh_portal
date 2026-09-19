<!-- src/lib/apps/admin/components/StatementProsePanel.svelte -->
<!--
  The prose of the obligations statement — everything except §6. R5 of
  docs/requirements/build_plans/Register_In_The_App_Build_Plan.md.

  ⭐ WHY THIS EXISTS. R4 made §6 generate from the register; these 548 lines are
  the rest of the document — what it is, the building, the catalogue rule, how
  to read a row, the two governing principles, the reasoned absences and the
  numbered actions. They lived in a markdown file in gitignored `docs/`, which
  is why producing the statement needed one particular laptop.

  ⛔ §6 IS SHOWN AS A SLOT, NOT AS AN EMPTY BOX. It appears in the running order
  with its position and is not editable, because it is rendered from the
  register every time the document is assembled. A blank textarea there would
  invite somebody to paste 2,348 lines into it, and the document would then
  carry the register twice — once fixed, once live.

  ⚠ THE TEXTAREA IS DELIBERATELY PLAIN MARKDOWN, not a rich editor. The portal
  has two Tiptap editors and neither is right here: this text is assembled
  byte-for-byte with generated markdown and checked against the document on
  disk, and a rich editor would silently renormalise quotes, dashes and list
  markers — in a document whose wording was settled over fourteen rounds of
  external review.
-->
<script>
  import { onMount } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import { statementProse } from '$lib/stores/statementProseStore.js';
  import { fmtDateTime } from '$lib/utils/dates.js';

  let panelError = '';
  let importing = false;
  let importReport = null;

  /** The section open for editing, and the text in the box. */
  let editingKey = null;
  let draft = '';
  let saving = false;
  let confirmDiscard = false;

  onMount(() => { statementProse.load(); });

  $: sections = $statementProse.sections;
  $: usingSeed = $statementProse.source !== 'database';
  $: provenanceOf = key => $statementProse.provenance?.[key] ?? {};

  /**
   * A section's own first heading.
   * ⚠ Derived, never stored — a stored title is a second copy of a fact that
   * already exists in the markdown, and it goes stale the moment somebody edits
   * the heading.
   */
  function titleOf(s) {
    if (s.generated) return '6. The register';
    const m = s.markdown.match(/^#{1,3} (.+)$/m);
    return m ? m[1].trim() : s.key;
  }

  function summaryOf(s) {
    if (s.generated) return 'Generated from the register every time the statement is produced';
    const body = s.markdown.replace(/^#{1,6} .*$/gm, '').replace(/[*`>|]/g, '').trim();
    return body.split('\n').filter(l => l.trim())[0]?.slice(0, 140) ?? '';
  }

  $: dirty = editingKey !== null
    && draft !== (sections.find(s => s.key === editingKey)?.markdown ?? '');

  function open(section) {
    if (section.generated) return;
    editingKey = section.key;
    draft = section.markdown;
    panelError = '';
  }

  function requestClose() {
    if (dirty) { confirmDiscard = true; return; }
    editingKey = null; draft = '';
  }

  function discard() {
    confirmDiscard = false;
    editingKey = null; draft = '';
  }

  async function save() {
    saving = true; panelError = '';
    try {
      await statementProse.edit(editingKey, draft);
      editingKey = null; draft = '';
    } catch (/** @type {any} */ err) {
      panelError = err.message ?? 'Could not save the section.';
    } finally { saving = false; }
  }

  async function runImport() {
    importing = true; panelError = ''; importReport = null;
    try {
      importReport = await statementProse.importSeed();
    } catch (/** @type {any} */ err) {
      panelError = err.message;
    } finally { importing = false; }
  }
</script>

<div class="prose-panel">
  <div class="head">
    <div>
      <h3>The statement’s explanatory sections</h3>
      <p class="sub">
        Everything in the obligations statement except §6, which is generated
        from the register. Edited rarely and deliberately.
      </p>
    </div>
  </div>

  {#if panelError}<ErrorDisplay message={panelError} />{/if}

  {#if usingSeed}
    <!-- ⛔ The same argument as the register: falling back is right, doing so
         silently is not. The shipped text describes a higher-risk building in
         general; this building's own text is what a reviewer needs. -->
    <div class="seed-warn">
      <strong>⛔ Reading the standard text that ships with the system.</strong>
      These sections have not been imported into this building’s records yet, so
      they cannot be edited — and a statement generated now carries a banner
      saying it must not be sent.
      <div class="seed-actions">
        <Button variant="primary" size="small" disabled={importing} on:click={runImport}>
          {importing ? 'Importing…' : `Import ${sections.length} sections`}
        </Button>
      </div>
      {#if importReport}
        <p class="report">
          {importReport.added.length} added · {importReport.present} now held.
        </p>
      {/if}
    </div>
  {/if}

  <ul class="sections">
    {#each sections as s (s.key)}
      <li class="section" class:generated={s.generated} class:open={editingKey === s.key}>
        <div class="row">
          <span class="pos">{s.position}</span>
          <div class="who">
            <span class="title">{titleOf(s)}</span>
            <span class="sum">{summaryOf(s)}</span>
          </div>
          <div class="meta">
            {#if s.generated}
              <span class="badge gen">Generated</span>
            {:else}
              <span class="lines">{s.markdown.split('\n').length} lines</span>
              {#if provenanceOf(s.key).origin === 'local'}
                <span class="badge local">Added here</span>
              {:else if provenanceOf(s.key).seedModifiedAt}
                <span class="badge edited"
                  title="Edited {fmtDateTime(provenanceOf(s.key).seedModifiedAt)}">Edited</span>
              {/if}
              <Button variant="secondary" size="small"
                disabled={usingSeed || (editingKey !== null && editingKey !== s.key)}
                on:click={() => open(s)}>
                {editingKey === s.key ? 'Editing' : 'Edit'}
              </Button>
            {/if}
          </div>
        </div>

        {#if editingKey === s.key}
          <div class="editor">
            <FormTextarea
              label="Markdown — the heading is part of the section"
              bind:value={draft}
              rows={22}
            />
            <p class="hint">
              ⚠ Plain markdown, and the heading line belongs in the box. What you
              type is what the document says — nothing renumbers or restyles it.
            </p>
            <div class="editor-actions">
              <Button variant="primary" size="small" disabled={saving || !dirty} on:click={save}>
                {saving ? 'Saving…' : 'Save section'}
              </Button>
              <Button variant="secondary" size="small" disabled={saving} on:click={requestClose}>
                Cancel
              </Button>
            </div>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</div>

<ConfirmDialog
  show={confirmDiscard}
  title="Discard your changes?"
  message="This section has unsaved edits. Closing the editor loses them."
  confirmLabel="Discard"
  danger={true}
  on:confirm={discard}
  on:cancel={() => { confirmDiscard = false; }}
/>

<style>
  .prose-panel { display: flex; flex-direction: column; gap: 0.75rem; }
  .head h3 { margin: 0; font-size: 0.95rem; font-weight: 600; color: rgb(226 232 240); }
  .sub { margin: 0.2rem 0 0; font-size: 0.78rem; color: rgb(148 163 184); }

  .seed-warn {
    border: 1px solid rgb(120 53 15); background: rgb(69 26 3);
    border-radius: 0.5rem; padding: 0.7rem 0.8rem;
    font-size: 0.78rem; color: rgb(253 230 138);
  }
  .seed-actions { margin-top: 0.5rem; }
  .report { margin: 0.4rem 0 0; font-size: 0.75rem; color: rgb(190 242 100); }

  .sections { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .section {
    border: 1px solid rgb(51 65 85); border-radius: 0.5rem;
    background: rgb(30 41 59);
  }
  .section.generated { background: rgb(23 32 46); border-style: dashed; }
  .section.open { border-color: rgb(60 150 131); }

  .row { display: flex; align-items: center; gap: 0.7rem; padding: 0.55rem 0.7rem; }
  .pos {
    font-size: 0.7rem; color: rgb(100 116 139); min-width: 1.6rem;
    font-variant-numeric: tabular-nums;
  }
  .who { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .title { font-size: 0.85rem; color: rgb(226 232 240); font-weight: 600; }
  .sum {
    font-size: 0.74rem; color: rgb(148 163 184);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .meta { display: flex; align-items: center; gap: 0.45rem; flex-shrink: 0; }
  .lines { font-size: 0.7rem; color: rgb(100 116 139); }

  .badge { font-size: 0.66rem; padding: 0.1rem 0.4rem; border-radius: 0.25rem; }
  .badge.gen    { background: rgb(30 41 59); color: rgb(148 163 184); border: 1px dashed rgb(71 85 105); }
  .badge.local  { background: rgb(76 29 149); color: rgb(221 214 254); }
  .badge.edited { background: rgb(69 26 3); color: rgb(253 230 138); }

  .editor { padding: 0 0.7rem 0.7rem; }
  .hint { margin: 0.35rem 0 0; font-size: 0.72rem; color: rgb(148 163 184); }
  .editor-actions { display: flex; gap: 0.5rem; margin-top: 0.55rem; }
</style>
