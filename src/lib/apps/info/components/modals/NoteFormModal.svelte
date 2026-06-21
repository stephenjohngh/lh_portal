<!-- src/lib/apps/info/components/modals/NoteFormModal.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { permissions } from '$lib/stores/permissions';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import Checkbox     from '$lib/components/common/Checkbox.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  // Shared rich-text editor (lives in the management app; standalone component).
  import RichTextEditor from '$lib/apps/management/components/LazyRichTextEditor.svelte';
  import { parseTags, tagsToString } from '../../utils/infoHelpers.js';

  export let show       = false;
  export let note       = null;       // null = create, object = edit
  export let sections   = [];         // array of info_sections
  export let sectionId  = null;       // pre-selected section (from sidebar)

  const dispatch = createEventDispatcher();

  let title      = '';
  let body       = '';
  let tagInput   = '';
  let is_pinned  = false;
  let section_id = '';
  // Publishing
  let slug       = '';
  let summary    = '';
  let visibility = 'internal';
  let slugManuallyEdited = false;

  let saving       = false;
  let error        = '';
  let titleError   = '';
  let sectionError = '';
  let slugError    = '';

  $: isAdmin       = $permissions.isAdmin;
  $: sectionOptions = sections.map(s => ({ value: s.id, label: s.name }));

  $: if (show) {
    title      = note?.title      ?? '';
    body       = note?.body       ?? '';
    tagInput   = tagsToString(note?.tags);
    is_pinned  = note?.is_pinned  ?? false;
    section_id = note?.section_id ?? sectionId ?? (sections[0]?.id ?? '');
    slug       = note?.slug       ?? '';
    summary    = note?.summary    ?? '';
    visibility = note?.visibility ?? 'internal';
    slugManuallyEdited = !!note?.slug;
    error = ''; titleError = ''; sectionError = ''; slugError = '';
  }

  function slugify(text) {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function onTitleInput(e) {
    title = e.target.value;
    titleError = '';
    // Auto-fill slug from title until the user edits it manually.
    if (!slugManuallyEdited) slug = slugify(title);
  }

  function onSlugInput(e) {
    slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    slugManuallyEdited = true;
    slugError = '';
  }

  const VIS_OPTS = [
    { value: 'internal',   label: 'Internal',   desc: 'In-app only — not published' },
    { value: 'registered', label: 'Registered', desc: 'Logged-in users with Info access' },
    { value: 'public',     label: 'Public',     desc: 'Anyone, at /info/<slug>' },
  ];

  function validate() {
    titleError   = title.trim() ? '' : 'Title is required';
    sectionError = section_id   ? '' : 'Select a section';
    slugError    = '';
    if (isAdmin && visibility !== 'internal') {
      if (!slug.trim()) {
        slugError = 'A URL slug is required to publish';
      } else if (slug.length > 1 && !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
        slugError = 'Lowercase letters, numbers and hyphens only';
      }
    }
    return !titleError && !sectionError && !slugError;
  }

  function handleSubmit() {
    if (!validate()) return;
    saving = true; error = '';
    try {
      dispatch('save', {
        title:      title.trim(),
        body:       body || null,
        tags:       parseTags(tagInput),
        is_pinned,
        section_id,
        // Non-admins can't change these (controls hidden) — existing values
        // are preserved so an edit doesn't unpublish a note.
        slug:       slug.trim() || null,
        summary:    summary.trim() || null,
        visibility,
      });
    } catch (err) {
      error = err.message;
      saving = false;
    }
  }

  export function done()  { saving = false; }
  export function fail(e) { error = e; saving = false; }

  function handleClose() { show = false; dispatch('close'); }
</script>

<Modal
  bind:show
  title={note ? 'Edit Note' : 'New Note'}
  size="xlarge"
  on:close={handleClose}
>
  <div class="space-y-4">
    <ErrorDisplay message={error} onDismiss={() => error = ''} />

    <FormInput
      label="Title"
      value={title}
      on:input={onTitleInput}
      placeholder="Note title…"
      required={true}
      error={titleError}
      disabled={saving}
    />

    <FormSelect
      label="Section"
      bind:value={section_id}
      options={sectionOptions}
      placeholder="— select section —"
      error={sectionError}
      disabled={saving}
    />

    <!-- Body (rich text) -->
    <div>
      <p class="text-sm font-medium text-gray-200 mb-2">Body</p>
      <RichTextEditor
        value={body}
        placeholder="Note content…"
        on:change={(e) => { body = e.detail; }}
      />
    </div>

    <FormInput
      label="Tags"
      bind:value={tagInput}
      placeholder="fire, safety, legal  (comma-separated)"
      disabled={saving}
    />

    <label class="flex items-center gap-3 cursor-pointer">
      <Checkbox bind:checked={is_pinned} disabled={saving} />
      <span class="text-sm text-slate-300">Pin this note (keeps it at the top)</span>
    </label>

    <!-- Publishing (admin only — decision C) -->
    {#if isAdmin}
      <div class="pt-3 mt-1 border-t border-slate-700 space-y-3">
        <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Publishing</p>

        <div class="grid grid-cols-3 gap-2">
          {#each VIS_OPTS as opt}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <div
              class="p-3 rounded-lg border cursor-pointer transition-colors text-center
                     {visibility === opt.value
                       ? 'border-purple-500 bg-purple-900/20 text-purple-200 ring-1 ring-purple-500'
                       : 'border-slate-600 bg-slate-800/40 text-slate-400 hover:border-slate-500'}"
              on:click={() => {
                if (saving) return;
                visibility = opt.value;
                // When publishing an existing internal note, seed the slug from
                // the title so the field isn't empty (until manually edited).
                if (visibility !== 'internal' && !slug && !slugManuallyEdited) {
                  slug = slugify(title);
                }
              }}
            >
              <p class="text-sm font-semibold">{opt.label}</p>
              <p class="text-xs mt-0.5 leading-snug">{opt.desc}</p>
            </div>
          {/each}
        </div>

        {#if visibility !== 'internal'}
          <FormInput
            label="URL slug"
            value={slug}
            on:input={onSlugInput}
            placeholder="fire-safety-update-2026"
            error={slugError}
            disabled={saving}
          />
          {#if slug && !slugError}
            <p class="text-xs text-slate-500 -mt-2">
              Public URL: <span class="text-purple-300 font-mono">/info/{slug}</span>
            </p>
          {/if}

          <FormInput
            label="Summary"
            bind:value={summary}
            placeholder="Short blurb shown in the public list"
            disabled={saving}
          />

          <p class="text-xs text-amber-400/80 flex items-start gap-1.5">
            <span>⚠</span>
            <span>
              {visibility === 'public'
                ? 'This makes the note visible to anyone outside the portal.'
                : 'This publishes the note to logged-in users with Info access.'}
            </span>
          </p>
        {/if}
      </div>
    {/if}
  </div>

  <div slot="footer" class="flex gap-3">
    <Button variant="secondary" size="large" fullWidth={true}
            on:click={handleClose} disabled={saving}>Cancel</Button>
    <Button variant="primary"   size="large" fullWidth={true}
            loading={saving}    disabled={saving}
            on:click={handleSubmit}>
      {note ? 'Save Changes' : 'Create Note'}
    </Button>
  </div>
</Modal>
