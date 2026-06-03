<!-- src/lib/apps/articles/ArticlesApp.svelte -->
<!--
  Articles management — create and publish public-facing articles
  accessible at /info/<slug> without requiring authentication.

  Only admins can create/edit/delete. The app itself is only shown
  to admins (requiresPermission: true in apps.js + admin bypass).
-->
<script>
  import { onMount }     from 'svelte';
  import { permissions } from '$lib/stores/permissions';
  import { auth }        from '$lib/stores/auth';
  import { articlesStore } from './stores/articlesStore';
  import { fmtDate, fmtDateTime } from '$lib/utils/dates';
  import Button          from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog   from '$lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay    from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner  from '$lib/components/common/LoadingSpinner.svelte';
  import Icon            from '$lib/components/icons/Icon.svelte';
  import ArticleForm     from './components/ArticleForm.svelte';

  // -- State -----------------------------------------------------------
  let showForm        = false;
  let editingArticle  = null;    // null = create, object = edit
  let saving          = false;
  let mutationError   = '';

  // Delete confirm
  let pendingDelete   = null;
  let deleting        = false;

  onMount(async () => {
    if ($auth.user) await permissions.init($auth.user.id, 'articles');
    await articlesStore.fetchArticles();
  });

  // -- Handlers --------------------------------------------------------
  function openCreate() {
    editingArticle = null;
    showForm       = true;
  }

  function openEdit(article) {
    editingArticle = article;
    showForm       = true;
  }

  function closeForm() {
    showForm       = false;
    editingArticle = null;
    mutationError  = '';
  }

  async function handleSubmit({ detail }) {
    saving       = true;
    mutationError = '';
    const result = editingArticle
      ? await articlesStore.updateArticle(editingArticle.id, detail)
      : await articlesStore.createArticle(detail);
    saving = false;
    if (!result.success) { mutationError = result.error ?? 'Failed to save'; return; }
    closeForm();
  }

  function requestDelete(article) {
    pendingDelete = article;
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    deleting = true;
    const result = await articlesStore.deleteArticle(pendingDelete.id);
    deleting     = false;
    pendingDelete = null;
    if (!result.success) mutationError = result.error ?? 'Failed to delete';
  }

  // External URL for a published article
  function publicUrl(slug) {
    return `/info/${slug}`;
  }
</script>

<div class="app-container">

  <!-- ─── Toolbar ──────────────────────────────────────────────────── -->
  <div class="flex items-center justify-between gap-3 mb-6">
    <div>
      <h2 class="text-xl font-bold text-white">Articles</h2>
      <p class="text-sm text-slate-400 mt-0.5">
        Published articles are public at <span class="text-purple-300 font-mono">/info/&lt;slug&gt;</span>
      </p>
    </div>
    <ProtectedButton
      requireAdmin={true}
      variant="primary"
      size="medium"
      icon="plus"
      on:click={openCreate}
    >
      New article
    </ProtectedButton>
  </div>

  <ErrorDisplay message={mutationError} onDismiss={() => mutationError = ''} />
  <ErrorDisplay message={$articlesStore.error} onDismiss={() => articlesStore.clearError()} />

  <!-- ─── List ─────────────────────────────────────────────────────── -->
  {#if $articlesStore.loading}
    <LoadingSpinner />

  {:else if $articlesStore.articles.length === 0}
    <div class="text-center py-16 text-slate-500 italic">
      No articles yet.
      {#if $permissions.isAdmin}
        Click <strong class="text-slate-300">New article</strong> to create one.
      {/if}
    </div>

  {:else}
    <div class="section-spacing">
      {#each $articlesStore.articles as article (article.id)}
        <div class="rounded-lg border {article.published
          ? 'border-emerald-700/40 bg-emerald-900/10'
          : 'border-slate-600 bg-slate-700/40'} p-4">

          <div class="flex items-start justify-between gap-3">
            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <span class="font-semibold text-white text-base">{article.title}</span>
                {#if article.published}
                  <span class="badge-emerald">✓ Published</span>
                {:else}
                  <span class="badge badge-slate text-slate-400 border border-slate-600">Draft</span>
                {/if}
              </div>

              <p class="text-xs font-mono text-purple-300/70 mb-1">/info/{article.slug}</p>

              {#if article.summary}
                <p class="text-sm text-slate-300 mb-2 line-clamp-2">{article.summary}</p>
              {/if}

              <div class="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                <span>Created: {fmtDate(article.created_at, article.created_by_profile?.full_name)}</span>
                {#if article.published && article.published_at}
                  <span>·</span>
                  <span>Published: {fmtDate(article.published_at)}</span>
                {/if}
                {#if article.updated_at && article.updated_at !== article.created_at}
                  <span>·</span>
                  <span>Updated: {fmtDate(article.updated_at, article.updated_by_profile?.full_name)}</span>
                {/if}
              </div>
            </div>

            <!-- Actions -->
            <div class="btn-group shrink-0">
              {#if article.published}
                <a
                  href={publicUrl(article.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn btn-secondary btn-medium"
                  title="View public article"
                >
                  <Icon name="map" size={4} />
                  View
                </a>
              {/if}
              <ProtectedButton
                requireAdmin={true}
                variant="secondary"
                size="medium"
                icon="edit"
                iconPosition="only"
                on:click={() => openEdit(article)}
                title="Edit article"
              />
              <ProtectedButton
                requireAdmin={true}
                variant="danger"
                size="medium"
                icon="delete"
                iconPosition="only"
                on:click={() => requestDelete(article)}
                title="Delete article"
              />
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- ─── Create / edit form ────────────────────────────────────────── -->
<ArticleForm
  show={showForm}
  article={editingArticle}
  {saving}
  on:submit={handleSubmit}
  on:close={closeForm}
/>

<!-- ─── Delete confirm ───────────────────────────────────────────── -->
<ConfirmDialog
  show={!!pendingDelete}
  title="Delete article"
  message={pendingDelete
    ? `Delete "${pendingDelete.title}"? This will remove it from the public site immediately. This cannot be undone.`
    : 'Delete this article?'}
  confirmText="Delete"
  cancelText="Cancel"
  danger={true}
  processing={deleting}
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
