<!-- src/lib/apps/info/components/NoteView.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { permissions }  from '$lib/stores/permissions';
  import Icon             from '$lib/components/icons/Icon.svelte';
  import Button           from '$lib/components/common/Button.svelte';
  import ProtectedButton  from '$lib/components/common/ProtectedButton.svelte';
  import LoadingSpinner   from '$lib/components/common/LoadingSpinner.svelte';
  import ConfirmDialog    from '$lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay     from '$lib/components/common/ErrorDisplay.svelte';
  import { fmtDate, fmtDateTime } from '$lib/utils/dates.js';
  import { sanitizeHtml } from '$lib/utils/sanitizeHtml.js';
  import { fmtBytes, mimeIcon, VISIBILITY_BADGES } from '../utils/infoHelpers.js';

  export let note    = null;  // full note with documents + creator
  export let loading = false;

  const dispatch = createEventDispatcher();

  // Delete note confirm
  let pendingDeleteNote  = false;
  let deletingNote       = false;

  // Delete document confirm
  let pendingDeleteDoc   = null;  // document object
  let deletingDoc        = false;

  $: docs = note?.documents ?? [];
  $: visBadge = VISIBILITY_BADGES[note?.visibility ?? 'internal'];
  $: isPublished = note && note.visibility !== 'internal';

  function requestDeleteNote()    { pendingDeleteNote = true; }
  function requestDeleteDoc(doc)  { pendingDeleteDoc  = doc;  }

  async function confirmDeleteNote() {
    deletingNote = true;
    dispatch('delete', note);
  }

  async function confirmDeleteDoc() {
    deletingDoc = true;
    dispatch('deleteDoc', pendingDeleteDoc);
  }

  export function docDeleted() {
    deletingDoc     = false;
    pendingDeleteDoc = null;
  }
</script>

<div class="flex flex-col h-full overflow-y-auto">

  {#if loading || !note}
    <div class="flex-1 flex items-center justify-center">
      <LoadingSpinner size="medium" />
    </div>

  {:else}

    <!-- Header bar -->
    <div class="flex items-center gap-2 px-4 py-3 border-b border-slate-700
                bg-slate-800/30 shrink-0">
      <Button variant="ghost" size="small"
              on:click={() => dispatch('back')}>← Back</Button>

      <div class="flex-1"></div>

      <!-- View public (published notes only) -->
      {#if isPublished && note.slug}
        <a
          href="/info/{note.slug}"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1 px-2 py-1 text-xs rounded text-slate-400
                 hover:text-purple-300 transition-colors"
          title="View public page at /info/{note.slug}"
        >
          <Icon name="map" size={4} /> View
        </a>
      {/if}

      <!-- Publish (admin only — internal notes get an explicit publish action;
           published notes change visibility via Edit) -->
      {#if $permissions.isAdmin && !isPublished}
        <Button variant="primary" size="small" icon="upload"
                on:click={() => dispatch('edit', note)}
                title="Publish this note to /info">Publish</Button>
      {/if}

      <!-- Pin -->
      <button
        class="p-1.5 rounded transition-colors
               {note.is_pinned
                 ? 'text-amber-400 hover:text-amber-300'
                 : 'text-slate-500 hover:text-amber-400'}"
        title="{note.is_pinned ? 'Unpin' : 'Pin'} note"
        on:click={() => dispatch('togglePin', note)}
        disabled={!$permissions.canModify}
      >
        <Icon name="pin" size={4} />
      </button>

      <!-- Archive / Unarchive -->
      {#if $permissions.canModify}
        <button
          class="p-1.5 rounded text-slate-500 hover:text-slate-300 transition-colors"
          title="{note.status === 'archived' ? 'Unarchive' : 'Archive'} note"
          on:click={() => dispatch('archive', note)}
        >
          <Icon name="archive" size={4} />
        </button>
      {/if}

      <!-- Edit -->
      {#if $permissions.canModify}
        <Button variant="secondary" size="small" icon="edit"
                on:click={() => dispatch('edit', note)}>Edit</Button>
      {/if}

      <!-- Delete (admin only) -->
      <ProtectedButton requireAdmin={true} variant="danger" size="small" icon="delete"
                       on:click={requestDeleteNote}>Delete</ProtectedButton>
    </div>

    <!-- Note content -->
    <div class="px-6 py-5 space-y-4 flex-1">

      <!-- Title + archived badge -->
      <div class="flex items-start gap-3">
        {#if note.is_pinned}
          <span class="text-amber-400 mt-1" title="Pinned">★</span>
        {/if}
        <h1 class="text-xl font-bold text-white flex-1">{note.title}</h1>
        {#if visBadge}
          <span class="shrink-0 text-xs border rounded px-2 py-0.5 mt-1 {visBadge.className}"
                title="Visibility: {visBadge.label}">
            {visBadge.icon} {visBadge.label}
          </span>
        {/if}
        {#if note.status === 'archived'}
          <span class="shrink-0 text-xs text-slate-500 border border-slate-600
                       rounded px-2 py-0.5 mt-1">archived</span>
        {/if}
      </div>

      <!-- Meta: section · dates · creator -->
      <div class="flex flex-wrap items-center gap-3 text-xs text-slate-500 pb-1
                  border-b border-slate-700">
        {#if note.section}
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full"
                  style="background:{note.section.colour}"></span>
            <span class="text-slate-400">{note.section.name}</span>
          </span>
        {/if}
        <span>Created {fmtDate(note.created_at)}</span>
        {#if note.creator}
          <span>by {note.creator.full_name || note.creator.email}</span>
        {/if}
        {#if note.updated_at !== note.created_at}
          <span>· Updated {fmtDateTime(note.updated_at)}</span>
        {/if}
      </div>

      <!-- Tags -->
      {#if (note.tags ?? []).length > 0}
        <div class="flex flex-wrap gap-1.5">
          {#each note.tags as tag}
            <span class="flex items-center gap-1 text-xs bg-slate-700 text-slate-300
                         rounded-full px-2.5 py-0.5">
              <Icon name="tag" size={3} />
              {tag}
            </span>
          {/each}
        </div>
      {/if}

      <!-- Body (rich HTML — sanitised at render) -->
      {#if note.body}
        <div class="info-body text-sm text-slate-200 leading-relaxed
                    bg-slate-800/40 rounded-lg p-4 border border-slate-700">
          {@html sanitizeHtml(note.body)}
        </div>
      {:else}
        <p class="text-sm text-slate-600 italic">No body text.</p>
      {/if}

      <!-- Documents section -->
      <div>
        <div class="flex items-center gap-2 mb-3">
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider flex-1">
            Documents
            {#if docs.length > 0}
              <span class="ml-1 text-slate-500 font-normal normal-case tracking-normal">
                ({docs.length})
              </span>
            {/if}
          </p>
          {#if $permissions.canModify}
            <button
              class="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
              on:click={() => dispatch('uploadDoc')}
            >
              <Icon name="upload" size={3} />
              Upload
            </button>
          {/if}
        </div>

        {#if docs.length === 0}
          <p class="text-xs text-slate-600 italic py-2">No documents attached.</p>
        {:else}
          <div class="space-y-1.5">
            {#each docs as doc (doc.id)}
              <div class="flex items-center gap-3 rounded-lg border border-slate-700
                          bg-slate-800/40 px-3 py-2 group">
                <span class="text-lg shrink-0">{mimeIcon(doc.mime_type)}</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-slate-200 truncate">{doc.display_name || doc.filename}</p>
                  <p class="text-xs text-slate-500">
                    {#if doc.description}<span class="text-slate-400">{doc.description} · </span>{/if}
                    {#if doc.file_size}{fmtBytes(doc.file_size)} · {/if}
                    {fmtDate(doc.created_at)}
                  </p>
                </div>
                <!-- Download -->
                <a
                  href={doc.web_view_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="p-1.5 rounded text-slate-500 hover:text-purple-300 transition-colors shrink-0"
                  title="Open / download"
                >
                  <Icon name="download" size={4} />
                </a>
                <!-- Delete (admin only) -->
                {#if $permissions.isAdmin}
                  <button
                    class="p-1.5 rounded text-slate-600 hover:text-red-400 transition-colors
                           shrink-0 opacity-0 group-hover:opacity-100"
                    title="Delete document"
                    on:click={() => requestDeleteDoc(doc)}
                  >
                    <Icon name="delete" size={4} />
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

    </div>

  {/if}
</div>

<!-- Delete note confirm -->
<ConfirmDialog
  show={pendingDeleteNote}
  danger={true}
  processing={deletingNote}
  title="Delete Note"
  message="Permanently delete '{note?.title}'? All attached documents will also be deleted."
  confirmLabel="Delete Note"
  on:confirm={confirmDeleteNote}
  on:cancel={() => pendingDeleteNote = false}
/>

<!-- Delete document confirm -->
<ConfirmDialog
  show={!!pendingDeleteDoc}
  danger={true}
  processing={deletingDoc}
  title="Delete Document"
  message="Delete '{pendingDeleteDoc?.filename}'? This cannot be undone."
  confirmLabel="Delete Document"
  on:confirm={confirmDeleteDoc}
  on:cancel={() => pendingDeleteDoc = null}
/>

<style>
  /* Prose styling for the rich-text note body (Tiptap HTML). */
  .info-body :global(p)          { margin: 0 0 0.75rem; line-height: 1.7; }
  .info-body :global(p:last-child) { margin-bottom: 0; }
  /* Preserve intentional blank lines (Tiptap emits empty <p></p>, which would
     otherwise collapse to no height on render). */
  .info-body :global(p:empty)::before { content: '\00a0'; }
  .info-body :global(h2)         { font-size: 1.05rem; font-weight: 700; color: #fff; margin: 1.25rem 0 0.5rem; }
  .info-body :global(h3)         { font-size: 0.95rem; font-weight: 600; color: #e2e8f0; margin: 1rem 0 0.4rem; }
  .info-body :global(ul)         { list-style: disc;    padding-left: 1.4rem; margin: 0 0 0.75rem; }
  .info-body :global(ol)         { list-style: decimal; padding-left: 1.4rem; margin: 0 0 0.75rem; }
  .info-body :global(li)         { margin-bottom: 0.2rem; line-height: 1.6; }
  .info-body :global(strong)     { font-weight: 700; color: #fff; }
  .info-body :global(em)         { font-style: italic; }
  .info-body :global(u)          { text-decoration: underline; text-underline-offset: 2px; }
  .info-body :global(a)          { color: #93c5fd; text-decoration: underline; }
  .info-body :global(blockquote) { border-left: 3px solid #475569; padding-left: 0.85rem; color: #94a3b8; margin: 0.75rem 0; }
</style>
