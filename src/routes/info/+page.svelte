<!-- src/routes/info/+page.svelte -->
<!-- Public article index — no auth required. -->
<!-- Lists all published portal_articles ordered by published_at desc. -->
<script>
  import { onMount }  from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { fmtDateLong } from '$lib/utils/dates';

  let articles = [];
  let loading  = true;
  let error    = '';

  onMount(async () => {
    try {
      const { data, error: err } = await supabase
        .from('portal_articles')
        .select('id, slug, title, summary, published_at')
        .eq('published', true)
        .order('published_at', { ascending: false });
      if (err) throw err;
      articles = data ?? [];
    } catch (e) {
      error = e.message ?? 'Failed to load articles';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Articles — Lonsdale House</title>
  <meta name="description" content="Articles and updates from Lonsdale House." />
</svelte:head>

<div class="public-shell">
  <header class="pub-header">
    <a href="/" class="pub-brand">Lonsdale House Portal</a>
  </header>

  <main class="pub-main">
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
  </main>

  <footer class="pub-footer">
    Lonsdale House Portal
  </footer>
</div>

<style>
  /* ── Public page shell — light themed, standalone ── */
  :global(body) {
    background: #f8fafc;
  }

  .public-shell {
    min-height: 100vh;
    background: #f8fafc;
    color: #1e293b;
    font-family: ui-sans-serif, system-ui, sans-serif;
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .pub-header {
    background: #0f172a;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #1e293b;
  }
  .pub-brand {
    color: #94a3b8;
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .pub-brand:hover { color: #e2e8f0; }

  /* Main content */
  .pub-main {
    flex: 1;
    max-width: 48rem;
    width: 100%;
    margin: 0 auto;
    padding: 3rem 1.5rem;
  }

  .pub-title {
    font-size: 2rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 2.5rem;
    line-height: 1.2;
  }

  .pub-loading, .pub-empty {
    color: #64748b;
    font-style: italic;
  }
  .pub-error {
    color: #dc2626;
  }

  /* Article list */
  .article-list {
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  .article-card {
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 2.5rem;
  }
  .article-card:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

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

  .article-link {
    color: #0f172a;
    text-decoration: none;
  }
  .article-link:hover {
    color: #3c9683;
  }

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
  .article-read-more:hover {
    text-decoration: underline;
  }

  /* Footer */
  .pub-footer {
    text-align: center;
    padding: 1.5rem;
    color: #94a3b8;
    font-size: 0.75rem;
    border-top: 1px solid #e2e8f0;
  }
</style>
