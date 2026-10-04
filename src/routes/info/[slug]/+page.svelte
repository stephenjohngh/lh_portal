<!-- src/routes/info/[slug]/+page.svelte -->
<!-- Public single published-note view — no auth required. -->
<!-- RLS returns the note only if visibility = 'public', or visibility =
     'registered' AND the caller is authenticated with Info app access, or admin. -->
<script>
  import { onMount }      from 'svelte';
  import { page }         from '$app/stores';
  import { supabase }     from '$lib/supabaseClient';
  import { fmtDateLong }  from '$lib/utils/dates';
  import { sanitizeHtml } from '$lib/utils/sanitizeHtml';
  import { LOGO as lhLogo, LOGO_ALT } from '$lib/branding.js';

  let article  = null;
  let loading  = true;
  let notFound = false;
  let error    = '';

  $: slug = $page.params.slug;

  onMount(async () => {
    try {
      const { data, error: err } = await supabase
        .from('info_notes')
        .select('id, slug, title, summary, body, published_at')
        .eq('slug', slug)
        .single();
      if (err) {
        if (err.code === 'PGRST116') { notFound = true; }
        else throw err;
      } else {
        article = data;
      }
    } catch (/** @type {any} */ e) {
      error = e.message ?? 'Failed to load article';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>{article ? article.title : 'Article'}</title>
  {#if article?.summary}
    <meta name="description" content={article.summary} />
  {/if}
</svelte:head>

<div class="public-shell">

  <!-- ── Header ── -->
  <header class="pub-header">
    <a href="/" class="pub-logo-link">
      <img src={lhLogo} alt={LOGO_ALT} class="pub-logo" />
    </a>
    <a href="/info" class="pub-all-articles">All Articles</a>
  </header>

  <!-- ── Content ── -->
  <main class="pub-main">
    {#if loading}
      <p class="pub-loading">Loading…</p>

    {:else if notFound}
      <div class="pub-not-found">
        <h1>Article not found</h1>
        <p>This article doesn't exist or is not available.</p>
        <a href="/info" class="pub-back-link">← Back to articles</a>
      </div>

    {:else if error}
      <p class="pub-error">{error}</p>

    {:else if article}
      <div class="article-meta">{fmtDateLong(article.published_at)}</div>
      <h1 class="article-title">{article.title}</h1>
      {#if article.summary}
        <p class="article-standfirst">{article.summary}</p>
      {/if}
      <hr class="article-divider" />
      <!-- Sanitised again at render as defence-in-depth: this page is public
           and older rows predate write-side sanitisation in infoStore. -->
      <div class="article-body">
        {@html sanitizeHtml(article.body ?? '')}
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

  .pub-loading { color: #64748b; font-style: italic; }
  .pub-error   { color: #dc2626; }

  .pub-not-found h1  { font-size: 1.5rem; font-weight: 700; color: #0f172a; margin-bottom: 0.5rem; }
  .pub-not-found p   { color: #64748b; margin-bottom: 1.5rem; }
  .pub-back-link     { color: #3c9683; font-size: 0.875rem; font-weight: 600; text-decoration: none; }
  .pub-back-link:hover { text-decoration: underline; }

  /* Article header */
  .article-meta {
    font-size: 0.8125rem;
    color: #94a3b8;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.6rem;
  }

  .article-title {
    font-size: 2rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 1rem;
    line-height: 1.25;
  }

  .article-standfirst {
    font-size: 1.125rem;
    color: #475569;
    line-height: 1.6;
    margin: 0 0 1.25rem;
    font-style: italic;
  }

  .article-divider {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 1.5rem 0;
  }

  /* Prose styles for Tiptap HTML */
  .article-body :global(p)          { margin: 0 0 1rem; color: #334155; line-height: 1.7; font-size: 1rem; }
  /* Preserve intentional blank lines (empty Tiptap <p></p> would collapse). */
  .article-body :global(p:empty)::before { content: '\00a0'; }
  .article-body :global(h2)         { font-size: 1.375rem; font-weight: 700; color: #0f172a; margin: 1.75rem 0 0.6rem; }
  .article-body :global(h3)         { font-size: 1.125rem; font-weight: 600; color: #1e293b; margin: 1.5rem 0 0.5rem; }
  .article-body :global(ul)         { list-style: disc;    padding-left: 1.5rem; margin: 0 0 1rem; }
  .article-body :global(ol)         { list-style: decimal; padding-left: 1.5rem; margin: 0 0 1rem; }
  .article-body :global(li)         { color: #334155; line-height: 1.7; margin-bottom: 0.25rem; }
  .article-body :global(strong)     { font-weight: 700; color: #0f172a; }
  .article-body :global(em)         { font-style: italic; }
  .article-body :global(u)          { text-decoration: underline; text-underline-offset: 2px; }
  .article-body :global(blockquote) { border-left: 3px solid #cbd5e1; padding-left: 1rem; color: #64748b; margin: 1rem 0; font-style: italic; }
  .article-body :global(a)          { color: #3c9683; text-decoration: underline; }
  .article-body :global(hr)         { border: none; border-top: 1px solid #e2e8f0; margin: 1.5rem 0; }
  /* What pasted markdown can produce (2026-09-28): a third heading level, code
     and tables. Without these a published table read as loose words. */
  .article-body :global(h4)         { font-size: 1rem; font-weight: 600; color: #334155; margin: 1.25rem 0 0.4rem; }
  .article-body :global(s)          { text-decoration: line-through; }
  .article-body :global(code)       { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
  .article-body :global(:not(pre) > code) { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 0.2rem; padding: 0.05em 0.3em; }
  .article-body :global(pre)        { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.3rem; padding: 0.75rem 1rem; margin: 0 0 1rem; overflow-x: auto; font-size: 0.85rem; line-height: 1.5; color: #1e293b; }
  /* Scrolls rather than crushes — a phone is narrower than most tables. */
  .article-body :global(table)      { border-collapse: collapse; margin: 0 0 1rem; font-size: 0.95rem; display: block; overflow-x: auto; max-width: 100%; }
  .article-body :global(th),
  .article-body :global(td)         { border: 1px solid #e2e8f0; padding: 0.45rem 0.75rem; text-align: left; vertical-align: top; color: #334155; }
  .article-body :global(th)         { background: #f1f5f9; color: #0f172a; font-weight: 600; }
  .article-body :global(th > p),
  .article-body :global(td > p)     { margin: 0; font-size: inherit; line-height: 1.5; }
</style>
