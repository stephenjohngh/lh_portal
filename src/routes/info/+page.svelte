<!-- src/routes/info/+page.svelte -->
<!-- Public article index — no auth required. -->
<!-- RLS handles visibility: anon sees 'public', logged-in users see
     'public' + 'registered', admins see all. -->
<script>
  import PublicShell from '#lib/components/public/PublicShell.svelte';
  import { onMount }     from 'svelte';
  import { supabase }    from '#lib/supabaseClient.js';
  import { fmtDateLong } from '#lib/utils/dates.js';
  import { readAllPages } from '#lib/utils/readAllPages.js';

  let articles = [];
  let loading  = true;
  let error    = '';

  onMount(async () => {
    try {
      // No explicit visibility filter — RLS returns only what the caller
      // is permitted to see based on their auth state.
      articles = await readAllPages(() => supabase
        .from('info_notes')
        .select('id, slug, title, summary, published_at')
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .order('id'));
    } catch (/** @type {any} */ e) {
      error = e.message ?? 'Failed to load articles';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Articles</title>
</svelte:head>

<PublicShell width="xl" logoHref="/">
  <a slot="nav" href="/info" class="text-sm font-medium text-slate-400 hover:text-slate-100 border border-slate-600 rounded-md px-3 py-1.5">All Articles</a>
    <h1 class="pub-title">Articles</h1>

    {#if loading}
      <p class="pub-loading">Loading…</p>

    {:else if error}
      <p class="pub-error">{error}</p>

    {:else if articles.length === 0}
      <p class="pub-empty">No articles have been published yet.</p>

    {:else}
      <div class="article-list">
        {#each articles as article (article.id)}
          <article class="article-card">
            <div class="article-meta">{fmtDateLong(article.published_at)}</div>
            <h2 class="article-heading">
              <a href="/info/{article.slug}" class="article-link">{article.title}</a>
            </h2>
            {#if article.summary}
              <p class="article-summary">{article.summary}</p>
            {/if}
            <a href="/info/{article.slug}" class="article-read-more">Read article →</a>
          </article>
        {/each}
      </div>
    {/if}
  </PublicShell>

<style>


  /* Header */



  /* Main */

  .pub-title {
    font-size: 2rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 2.5rem;
    line-height: 1.2;
  }

  .pub-loading { color: #64748b; font-style: italic; }
  .pub-empty   { color: #64748b; font-style: italic; }
  .pub-error   { color: #dc2626; }

  /* Article list */
  .article-list { display: flex; flex-direction: column; gap: 2.5rem; }

  .article-card {
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 2.5rem;
  }
  .article-card:last-child { border-bottom: none; padding-bottom: 0; }

  .article-meta {
    font-size: 0.8125rem;
    color: #94a3b8;
    margin-bottom: 0.4rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .article-heading {
    font-size: 1.375rem;
    font-weight: 700;
    margin: 0 0 0.6rem;
    line-height: 1.3;
  }

  .article-link { color: #0f172a; text-decoration: none; }
  .article-link:hover { color: #3c9683; }

  .article-summary {
    color: #475569;
    line-height: 1.6;
    margin: 0 0 0.75rem;
    font-size: 0.9375rem;
  }

  .article-read-more {
    color: #3c9683;
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
  }
  .article-read-more:hover { text-decoration: underline; }
</style>
