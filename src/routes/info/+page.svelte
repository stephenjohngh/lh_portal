<!-- src/routes/info/+page.svelte -->
<!-- Public article index — no auth required. -->
<!-- RLS handles visibility: anon sees 'public', logged-in users see
     'public' + 'registered', admins see all. -->
<script>
  import { onMount }     from 'svelte';
  import { supabase }    from '$lib/supabaseClient';
  import { fmtDateLong } from '$lib/utils/dates';
  import lhLogo          from '$lib/assets/LH_services_logo.png';

  let articles = [];
  let loading  = true;
  let error    = '';

  onMount(async () => {
    try {
      // No explicit visibility filter — RLS returns only what the caller
      // is permitted to see based on their auth state.
      const { data, error: err } = await supabase
        .from('portal_articles')
        .select('id, slug, title, summary, published_at')
        .not('published_at', 'is', null)
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

  <!-- ── Header ── -->
  <header class="pub-header">
    <a href="/" class="pub-logo-link">
      <img src={lhLogo} alt="LH Services" class="pub-logo" />
    </a>
    <a href="/info" class="pub-all-articles">All Articles</a>
  </header>

  <!-- ── Content ── -->
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

</div>

<style>
  :global(body) { background: #f8fafc; }

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
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid #1e293b;
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .pub-logo-link { display: flex; align-items: center; }
  .pub-logo      { height: 40px; width: auto; display: block; }

  .pub-all-articles {
    color: #94a3b8;
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
    padding: 0.375rem 0.875rem;
    border: 1px solid #334155;
    border-radius: 0.375rem;
    transition: background 0.15s, color 0.15s;
  }
  .pub-all-articles:hover {
    background: #1e293b;
    color: #e2e8f0;
  }

  /* Main */
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
