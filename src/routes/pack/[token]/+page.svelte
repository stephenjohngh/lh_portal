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
  import { buildTree } from '$lib/apps/dossier/utils/docTree.js';
  import { fmtDateLong } from '$lib/utils/dates';
  import lhLogo from '$lib/assets/LH_services_logo.png';

  import { tick } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { page as pageStore } from '$app/stores';
  import './pack-print.css';

  export let data;

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

  function openDoc(id) {
    selectedId = id; navOpen = false;
    scrollTo(0, 0);
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
  let printing = false;

  async function printPack() {
    printing = true;
    await tick();
    // Tidy up after the dialog closes so a large pack is not left rendered
    // twice for the rest of the visit. `once` because Chrome fires afterprint
    // per dialog; if a browser never fires it, the markup simply stays — it is
    // display:none on screen, so the only cost is DOM.
    window.addEventListener('afterprint', () => (printing = false), { once: true });
    window.print();
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
  <div class="min-h-screen bg-slate-900 text-slate-200">

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
          </p>
        </div>
        <button
          class="pack-print-button text-xs px-2 py-1 rounded border border-slate-700
                 text-slate-300 hover:text-white hover:border-slate-500
                 transition-colors shrink-0"
          title="Print the whole pack"
          on:click={printPack}
        >Print</button>
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
                </li>
              {/each}
            </ul>
          </div>

        </div>
      </nav>

      <!-- Content -->
      <main class="flex-1 min-w-0">
        {#if selectedDoc}
          <h1 class="text-xl font-semibold text-white mb-4">{selectedDoc.title}</h1>
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
         Every page and every table, in order, so what comes out of the printer
         is the whole briefing rather than the one section that was open. Hidden
         on screen by pack-print.css; built only once Print is clicked. -->
    {#if printing}
      <div class="pack-print">
        <div class="pack-print-cover">
          <h1>{content.pack.title}</h1>
          {#if content.pack.description}
            <p>{content.pack.description}</p>
          {/if}
          <p class="pack-print-meta">
            Prepared {fmtDateLong(content.generated_at)}
            {#if publication?.mode === 'latest'}
              · this pack is kept up to date, so a printed copy may go out of date
            {/if}
          </p>
        </div>

        {#each navDocs as node (node.id)}
          <section class="pack-print-section">
            <h2>{node.title}</h2>
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
          This pack was prepared for you and is private to whoever holds this
          link. Please do not forward it.
        </p>
      </div>
    </footer>
  </div>
{/if}
