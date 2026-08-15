<!-- src/routes/pack/[token]/+page.svelte -->
<!-- The published pack, as its recipient sees it. No auth, no portal chrome.

     Renders through the SAME BlockContent the author writes in (merge doc D10),
     so what they reviewed before issuing the link is what arrives here. This
     page adds navigation and nothing else — every rule about how a callout, a
     table or an asset looks lives in that one component.

     Everything on this page comes from the `load` in +page.server.js, which is
     the only path from a token to content. There is no client-side query here,
     no Supabase client, and no store import. -->
<script>
  import BlockContent from '$lib/apps/dossier/components/BlockContent.svelte';
  import PackSearch   from '$lib/apps/dossier/components/PackSearch.svelte';
  import { pageShowingFile } from '$lib/apps/dossier/utils/packSearch.js';
  import { revealBlock } from '$lib/apps/dossier/utils/revealBlock.js';
  import { buildTree } from '$lib/apps/dossier/utils/docTree.js';
  import { fmtDateLong } from '$lib/utils/dates';
  import lhLogo from '$lib/assets/LH_services_logo.png';

  import { tick, onMount } from 'svelte';
  import {
    pageOutline, outlineDepths, wordCount, describeReadingTime, packReadingTime,
    docIdFromHash, hashForDoc, WORDS_PER_MINUTE,
  } from '$lib/apps/dossier/utils/pageNav.js';
  import { invalidateAll } from '$app/navigation';
  import { page as pageStore } from '$app/stores';
  import './pack-print.css';

  export let data;

  /**
   * Shown to the recipient on screen AND on the printed cover. Defined once:
   * two copies of a confidentiality notice is how they come to disagree, and
   * the printed sheet is the copy most likely to be left on a desk or handed
   * on, so it is the one that can least afford to be missing it.
   */
  const CONFIDENTIALITY_NOTICE =
    'This document package contains proprietary and confidential information '
    + 'intended strictly for the designated recipient. Please do not copy, '
    + 'forward, or distribute these materials without prior written consent.';

  // ── Passphrase gate ───────────────────────────────────────────────────────
  let passphrase = '';
  let unlocking  = false;
  let unlockError = '';

  async function unlock() {
    unlocking = true; unlockError = '';
    try {
      const res = await fetch(`/api/pack/${$pageStore.params.token}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase }),
      });
      if (!res.ok) {
        unlockError = (await res.json().catch(() => ({})))?.error
          ?? 'That passphrase was not recognised.';
        return;
      }
      // The grant is an HttpOnly cookie, so the server has to be asked again.
      passphrase = '';
      await invalidateAll();
    } catch {
      unlockError = 'Could not check that just now. Please try again.';
    } finally {
      unlocking = false;
    }
  }

  $: content     = data.content ?? null;
  /** Narrowed once here; the template is inside {:else} but TS cannot see that. */
  $: publication = data.publication ?? null;
  $: docs     = content?.docs ?? [];
  $: datasets = content?.datasets ?? [];
  $: records  = content?.records ?? [];
  $: files    = content?.files ?? [];
  $: tree     = buildTree(docs);

  /**
   * null = the generated contents page; a doc id = that page.
   *
   * Only offered when the author asked for it. Most packs open on a page that
   * already introduces them, and a second "Overview" above it is a duplicate
   * the recipient has to look past.
   */
  $: showContents = publication?.show_contents === true;
  let selectedId = null;
  let navOpen = false;

  $: selectedDoc = docs.find(d => d.id === selectedId) ?? null;
  $: outline     = outlineDepths(pageOutline(selectedDoc?.blocks));
  $: pageWords   = wordCount(selectedDoc?.blocks);
  $: pageReading = describeReadingTime(pageWords);
  $: packReading = packReadingTime(docs);

  // ── Deep links ────────────────────────────────────────────────────────────
  // `/pack/<token>#chronology`. Both specs asked for links to a LOCATION rather
  // than to a document, and it is the last of their settled items to be built.
  //
  // The URL drives the selection, never the other way round: openDoc() only
  // sets the hash, and the listener below decides what is open. That is what
  // makes Back and Forward work — a `hashchange` fires for both — without any
  // history bookkeeping of our own.
  /**
   * A block to scroll to once the page it lives on is open.
   *
   * `hashchange` fires asynchronously, so a search hit that both changes the
   * page AND wants a block would otherwise race: the reveal scrolled to the
   * block and applyHash then yanked the reader back to the top. Handing the
   * intent to applyHash makes the order explicit instead.
   */
  let pendingReveal = null;

  function applyHash() {
    const id = docIdFromHash(
      typeof location === 'undefined' ? '' : location.hash, docs);
    // A fragment naming a page that is not in this pack (a stale link, or one
    // for a different pack) opens the pack rather than an error.
    selectedId = id;
    navOpen = false;

    if (pendingReveal) {
      const uid = pendingReveal;
      pendingReveal = null;
      reveal(uid);
    } else {
      scrollTo(0, 0);
    }
  }

  onMount(() => {
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  });

  function openDoc(id) {
    const doc = docs.find(d => d.id === id) ?? null;
    const hash = hashForDoc(doc);
    // Assigning an unchanged hash fires no event, so drive the state directly.
    if (hash === (location.hash || '')) { applyHash(); return; }
    if (hash) location.hash = hash;
    else location.hash = '';
  }

  /** After the page has rendered — the block does not exist until then. */
  function reveal(uid) {
    if (uid) tick().then(() => revealBlock(uid));
  }

  /**
   * Follow a search hit. A page hit opens that page; a table hit opens the
   * first page that shows the table, because a recipient has no way to reach a
   * table on its own — that was decided when tables stopped being top-level
   * items in a published pack.
   */
  function goToResult(result) {
    if (result.kind === 'page') {
      // Landing on the page is half the answer; the reader still has to find
      // the phrase on it. Set BEFORE opening, so applyHash performs the reveal
      // rather than scrolling to the top out from under it.
      pendingReveal = result.blockUid ?? null;
      openDoc(result.docId);
      return;
    }

    if (result.kind === 'file') {
      const docId = pageShowingFile(result.documentId, docs, records);
      if (docId) openDoc(docId);
      return;
    }

    const showing = docs.find(d =>
      JSON.stringify(d.blocks ?? {}).includes(result.datasetId));
    if (showing) openDoc(showing.id);
  }

  /** Indent depth for the flat nav list — the tree is usually two levels. */
  function flatten(nodes, depth = 0, out = []) {
    for (const node of nodes) {
      out.push({ ...node, depth });
      if (node.children?.length) flatten(node.children, depth + 1, out);
    }
    return out;
  }
  $: navDocs = flatten(tree);
  // With no contents page, open on the first page rather than on nothing.
  $: if (!showContents && selectedId === null && navDocs.length) {
    selectedId = navDocs[0].id;
  }

  // ── Printing ──────────────────────────────────────────────────────────────
  // What a recipient needs on paper is the WHOLE pack in order, not whichever
  // page happened to be open — a printed briefing with one section in it is
  // worse than useless. So the print rendering is built on demand: rendering
  // every page all the time would cost a large pack real work on every visit,
  // for something most readers never do.
  let printing  = false;
  let preparing = false;
  let printHost;

  /**
   * Wait for the print rendering's images to load before opening the dialog.
   *
   * ⚠ The bug this fixes, and it is not obvious: the print markup is built on
   * demand, so a page the reader has never opened has its <img> created for the
   * first time here. `tick()` returns as soon as the DOM exists — the image
   * requests have only just been issued — and the browser snapshots the page
   * for print immediately, blank. Printing a second time worked because the
   * file was then in the cache, which is exactly the shape of the report:
   * "a second print after clicking on the page shows it".
   *
   * Errors resolve like loads: a file that has gone should print as the gap it
   * is, not hold the dialog. The timeout is the same argument for a slow one —
   * a briefing that will not print is worse than one printed without an image.
   */
  function imagesReady(root, timeoutMs = 15000) {
    const pending = [...(root?.querySelectorAll('img') ?? [])].filter(img => !img.complete);
    if (!pending.length) return Promise.resolve();

    return Promise.race([
      Promise.all(pending.map(img => new Promise((resolve) => {
        img.addEventListener('load',  resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      }))),
      new Promise(resolve => setTimeout(resolve, timeoutMs)),
    ]);
  }

  // Note on what is deliberately NOT here: a "download the whole pack" control.
  // The offline zip archive is an AUTHORING feature — an author keeps a copy of
  // their own pack — and there is no endpoint behind a publication token that
  // would serve one. A recipient reads the pack, prints it, and downloads the
  // individual files a page refers to. Handing over everything in one request
  // is a different act from reading, and it is not one this link permits.

  async function printPack() {
    if (preparing) return;
    preparing = true;
    printing  = true;
    try {
      await tick();
      await imagesReady(printHost);
      // Tidy up after the dialog closes so a large pack is not left rendered
      // twice for the rest of the visit. `once` because Chrome fires afterprint
      // per dialog; if a browser never fires it, the markup simply stays — it is
      // display:none on screen, so the only cost is DOM.
      window.addEventListener('afterprint', () => (printing = false), { once: true });
      window.print();
    } finally {
      preparing = false;
    }
  }
</script>

<svelte:head>
  <title>{data.publication?.title ?? 'Pack'}</title>
  <!-- Belt to the X-Robots-Tag header set in load(): a link handed to one
       person must not end up in a search index. -->
  <meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

{#if data.locked}
  <!-- Deliberately says nothing about the pack: no title, no dates, no sender.
       Someone holding the link but not the passphrase learns only that they
       need to ask for one. -->
  <div class="min-h-screen bg-slate-900 flex items-center justify-center p-6">
    <form class="max-w-sm w-full space-y-4" on:submit|preventDefault={unlock}>
      <img src={lhLogo} alt="Lonsdale House" class="h-10 mx-auto opacity-80" />
      <p class="text-sm text-slate-300 text-center">
        This pack is protected by a passphrase. Enter the one you were given.
      </p>

      <label class="block">
        <span class="sr-only">Passphrase</span>
        <input
          type="password"
          bind:value={passphrase}
          autocomplete="off"
          disabled={unlocking}
          class="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2
                 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
        />
      </label>

      {#if unlockError}
        <p class="text-xs text-amber-300 text-center">{unlockError}</p>
      {/if}

      <button
        type="submit"
        disabled={!passphrase || unlocking}
        class="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50
               text-white text-sm rounded px-3 py-2 transition-colors"
      >{unlocking ? 'Checking…' : 'Open the pack'}</button>

      <p class="text-[11px] text-slate-600 text-center">
        The passphrase is not in this link. It should have reached you
        separately.
      </p>
    </form>
  </div>
{:else if data.refused}
  <div class="min-h-screen bg-slate-900 flex items-center justify-center p-6">
    <div class="max-w-md text-center space-y-4">
      <img src={lhLogo} alt="Lonsdale House" class="h-10 mx-auto opacity-70" />
      <p class="text-slate-300">{data.message}</p>
    </div>
  </div>
{:else}
  <!-- `pack-root` exists for print. This div's dark background and light text
       sit between <body> and everything printed, so the print stylesheet's
       inversion of body was reaching nothing — see pack-print.css. -->
  <div class="pack-root min-h-screen bg-slate-900 text-slate-200">

    <!-- Header -->
    <header class="pack-header border-b border-slate-700 bg-slate-900/95 sticky top-0 z-10">
      <div class="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
        <img src={lhLogo} alt="Lonsdale House" class="h-7 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-white truncate">
            {publication?.title}
          </p>
          <p class="text-[11px] text-slate-500">
            {#if publication?.mode === 'snapshot'}
              Prepared {fmtDateLong(content.generated_at)}
            {:else}
              Kept up to date · shown as at {fmtDateLong(content.generated_at)}
            {/if}
            {#if publication?.expires_at}
              · available until {fmtDateLong(publication?.expires_at)}
            {/if}
            <!-- What the recipient is holding. Spec 1's success criterion is a
                 reader understanding the matter in 15-20 minutes; they cannot
                 judge that without being told the size of the thing. -->
            {#if packReading}· {packReading}{/if}
          </p>
        </div>
        <button
          class="pack-print-button text-xs px-2 py-1 rounded border border-slate-700
                 text-slate-300 hover:text-white hover:border-slate-500
                 transition-colors shrink-0"
          title="Print the whole pack"
          disabled={preparing}
          on:click={printPack}
        >{preparing ? 'Preparing…' : 'Print'}</button>
        <button
          class="md:hidden text-xs px-2 py-1 rounded border border-slate-700
                 text-slate-300"
          aria-expanded={navOpen}
          on:click={() => navOpen = !navOpen}
        >Contents</button>
      </div>
    </header>

    <div class="pack-screen max-w-6xl mx-auto px-4 py-6 flex gap-8">

      <!-- Contents -->
      <nav
        class="pack-nav w-56 shrink-0 {navOpen ? 'block' : 'hidden'} md:block
               fixed md:static inset-x-4 top-16 z-10 md:z-auto
               bg-slate-800 md:bg-transparent rounded md:rounded-none p-3 md:p-0
               border border-slate-700 md:border-0"
        aria-label="Contents"
      >
        <div class="md:sticky md:top-20 space-y-4">
          <div class="pack-search">
            <PackSearch
              content={{ docs, datasets, records, files }}
              on:go={(e) => goToResult(e.detail)}
            />
          </div>

          <div>
            <p class="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Contents
            </p>
            <ul class="space-y-0.5">
              {#if showContents}
                <li>
                  <button
                    class="w-full text-left text-sm px-2 py-1 rounded transition-colors
                           {selectedId === null
                             ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}"
                    on:click={() => openDoc(null)}
                  >Contents</button>
                </li>
              {/if}
              {#each navDocs as node (node.id)}
                <li>
                  <button
                    class="w-full text-left text-sm px-2 py-1 rounded transition-colors truncate
                           {selectedId === node.id
                             ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}"
                    style="padding-left: {0.5 + node.depth * 0.75}rem"
                    on:click={() => openDoc(node.id)}
                  >{node.title}</button>

                  <!-- The open page's own headings, in place. Nested under the
                       page rather than in a panel of its own so the reader has
                       one list to look at, not two competing ones. -->
                  {#if selectedId === node.id && outline.length > 1}
                    <ul class="mt-0.5 mb-1 space-y-0.5 border-l border-slate-700 ml-3">
                      {#each outline as head, i (head.uid ?? i)}
                        <li>
                          <button
                            class="w-full text-left text-xs py-0.5 text-slate-500
                                   hover:text-slate-200 transition-colors truncate"
                            style="padding-left: {0.5 + head.depth * 0.6}rem"
                            on:click={() => reveal(head.uid)}
                          >{head.text}</button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>

        </div>
      </nav>

      <!-- Content -->
      <main class="flex-1 min-w-0">
        {#if selectedDoc}
          <!-- No page heading here. The contents list on the left highlights
               the open page, so a title above the content repeated it — and an
               author whose page opens with its own heading got two. The print
               rendering below DOES head each section, because paper has no
               contents panel to say where you are. -->

          <!-- Only for a page long enough that the answer is useful. "Under a
               minute" on a three-line page is chrome, and this reader has just
               had a repeated title taken out of it for the same reason. -->
          {#if pageWords >= WORDS_PER_MINUTE}
            <p class="text-[11px] text-slate-600 mb-3">{pageReading}</p>
          {/if}

          <BlockContent
            blocks={selectedDoc.blocks}
            mode="read"
            {docs} {files} {datasets} {records}
            assetBase={data.assetBase}
            on:openDoc={(e) => openDoc(e.detail)}
          />
        {:else}
          <!-- The front page: what this is, and what is in it. -->
          <h1 class="text-2xl font-semibold text-white mb-2">{content.pack.title}</h1>
          {#if content.pack.description}
            <p class="text-slate-400 mb-6">{content.pack.description}</p>
          {/if}

          <p class="text-sm text-slate-400 mb-3">This pack contains:</p>
          <ul class="space-y-1 mb-8">
            {#each navDocs as node (node.id)}
              <li style="padding-left: {node.depth * 0.75}rem">
                <button class="text-sm text-purple-400 hover:underline text-left"
                        on:click={() => openDoc(node.id)}>{node.title}</button>
              </li>
            {/each}
          </ul>
        {/if}
      </main>
    </div>

    <!-- ── The printed pack ──────────────────────────────────────────────
         Every page in order, so what comes out of the printer is the whole
         briefing rather than the one section that was open. Tables appear where
         they are embedded, exactly as on screen — a table reaches a recipient
         by being part of a page, not as an item of its own. Hidden on screen by
         pack-print.css; built only once Print is clicked. -->
    {#if printing}
      <div class="pack-print" bind:this={printHost}>
        <!-- A title page of its own. The description is deliberately absent:
             it is an author's note about the pack, not something the recipient
             was written for. -->
        <div class="pack-print-cover">
          <h1>{content.pack.title}</h1>
          <p class="pack-print-meta">
            Prepared {fmtDateLong(content.generated_at)}
            {#if publication?.mode === 'latest'}
              · this pack is kept up to date, so a printed copy may go out of date
            {/if}
          </p>
          <!-- On the cover, not at the end: the sheet a reader sees first is
               also the one most likely to be photocopied on its own. -->
          <p class="pack-print-notice">{CONFIDENTIALITY_NOTICE}</p>
        </div>

        {#each navDocs as node (node.id)}
          <!-- No heading: the same duplication the screen had. Each page's own
               content opens with the author's heading, and every section starts
               a fresh sheet, so the boundary is already plain. -->
          <section class="pack-print-section">
            <BlockContent
              blocks={node.blocks}
              mode="read"
              {docs} {files} {datasets} {records}
              assetBase={data.assetBase}
            />
          </section>
        {/each}
      </div>
    {/if}

    <footer class="pack-footer border-t border-slate-800 mt-8">
      <div class="max-w-6xl mx-auto px-4 py-4">
        <p class="text-[11px] text-slate-600">
          {CONFIDENTIALITY_NOTICE}
        </p>
      </div>
    </footer>
  </div>
{/if}

