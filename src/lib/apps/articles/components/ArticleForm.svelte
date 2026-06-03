<!-- src/lib/apps/articles/components/ArticleForm.svelte -->
<!-- Create / edit form for a portal_article. Dispatches 'submit' with the
     validated data object; parent owns the store call and error state. -->
<script>
  import { createEventDispatcher, tick } from 'svelte';
  import Modal       from '$lib/components/common/Modal.svelte';
  import Button      from '$lib/components/common/Button.svelte';
  import FormInput   from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  // LazyRichTextEditor is in the management app but is a standalone Svelte
  // component with no management-specific dependencies — safe to import here.
  import RichTextEditor from '$lib/apps/management/components/LazyRichTextEditor.svelte';

  export let show    = false;
  export let article = null;   // null = create mode, object = edit mode
  export let saving  = false;

  const dispatch = createEventDispatcher();

  // -- Form state -------------------------------------------------------
  let title     = '';
  let slug      = '';
  let summary   = '';
  let content   = '';
  let published = false;
  let slugManuallyEdited = false;

  let titleError = '';
  let slugError  = '';

  // Reset form whenever the modal opens
  $: if (show) {
    title     = article?.title     ?? '';
    slug      = article?.slug      ?? '';
    summary   = article?.summary   ?? '';
    content   = article?.content   ?? '';
    published = article?.published ?? false;
    slugManuallyEdited = !!article;   // in edit mode treat slug as manually set
    titleError = '';
    slugError  = '';
  }

  // -- Slug auto-generation --------------------------------------------
  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function onTitleInput(e) {
    title = e.target.value;
    titleError = '';
    if (!slugManuallyEdited) {
      slug = slugify(title);
    }
  }

  function onSlugInput(e) {
    slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    slugManuallyEdited = true;
    slugError = '';
  }

  // -- Validation -------------------------------------------------------
  function validate() {
    let valid = true;
    titleError = '';
    slugError  = '';
    if (!title.trim()) { titleError = 'Title is required.'; valid = false; }
    if (!slug.trim())  { slugError  = 'Slug is required.';  valid = false; }
    if (slug && !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length > 1) {
      slugError = 'Slug must be lowercase letters, numbers and hyphens.'; valid = false;
    }
    return valid;
  }

  function handleSubmit() {
    if (!validate()) return;
    dispatch('submit', { title: title.trim(), slug, summary: summary.trim(), content, published });
  }

  function handleClose() {
    dispatch('close');
  }
</script>

<Modal
  {show}
  title={article ? 'Edit Article' : 'New Article'}
  size="xlarge"
  on:close={handleClose}
>
  <div class="space-y-4">

    <!-- Title -->
    <div>
      <label for="article-title" class="block text-sm font-medium text-slate-300 mb-1">
        Title <span class="text-red-400">*</span>
      </label>
      <input
        id="article-title"
        type="text"
        value={title}
        on:input={onTitleInput}
        placeholder="e.g. Fire Safety Update — Summer 2025"
        class="w-full px-3 py-2 bg-slate-700 border {titleError ? 'border-red-500' : 'border-slate-600'}
               rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      {#if titleError}
        <p class="text-xs text-red-400 mt-1">{titleError}</p>
      {/if}
    </div>

    <!-- Slug + public URL preview -->
    <div>
      <label for="article-slug" class="block text-sm font-medium text-slate-300 mb-1">
        URL slug <span class="text-red-400">*</span>
      </label>
      <input
        id="article-slug"
        type="text"
        value={slug}
        on:input={onSlugInput}
        placeholder="fire-safety-update-summer-2025"
        class="w-full px-3 py-2 bg-slate-700 border {slugError ? 'border-red-500' : 'border-slate-600'}
               rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500
               font-mono text-sm"
      />
      {#if slugError}
        <p class="text-xs text-red-400 mt-1">{slugError}</p>
      {:else if slug}
        <p class="text-xs text-slate-500 mt-1">
          Public URL: <span class="text-purple-300">/info/{slug}</span>
        </p>
      {/if}
    </div>

    <!-- Summary (excerpt) -->
    <div>
      <label for="article-summary" class="block text-sm font-medium text-slate-300 mb-1">
        Summary <span class="text-slate-500 font-normal">(shown in the article index)</span>
      </label>
      <textarea
        id="article-summary"
        bind:value={summary}
        rows="2"
        placeholder="A brief description of what this article covers…"
        class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white
               placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500
               resize-y text-sm"
      ></textarea>
    </div>

    <!-- Content (rich text) -->
    <div>
      <p class="block text-sm font-medium text-slate-300 mb-1">Content</p>
      <RichTextEditor
        value={content}
        placeholder="Write your article here…"
        on:change={(e) => { content = e.detail; }}
      />
    </div>

    <!-- Published toggle -->
    <label class="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-slate-600
                  {published ? 'bg-emerald-900/20 border-emerald-700/50' : 'bg-slate-700/40'}
                  transition-colors">
      <input
        type="checkbox"
        bind:checked={published}
        class="w-4 h-4 rounded accent-purple-500"
      />
      <div>
        <span class="text-sm font-medium {published ? 'text-emerald-300' : 'text-slate-300'}">
          {published ? 'Published — visible at /info/{slug || "…"}' : 'Draft — not publicly visible'}
        </span>
        {#if !published}
          <p class="text-xs text-slate-500 mt-0.5">Toggle to make this article publicly accessible.</p>
        {/if}
      </div>
    </label>

  </div>

  <svelte:fragment slot="footer">
    <div class="flex justify-end gap-2">
      <Button variant="secondary" size="medium" on:click={handleClose} disabled={saving}>
        Cancel
      </Button>
      <Button
        variant="primary"
        size="medium"
        disabled={saving}
        on:click={handleSubmit}
      >
        {saving ? 'Saving…' : (article ? 'Save changes' : 'Create article')}
      </Button>
    </div>
  </svelte:fragment>
</Modal>
