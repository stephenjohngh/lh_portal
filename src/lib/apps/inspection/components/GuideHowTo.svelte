<!-- src/lib/apps/inspection/components/GuideHowTo.svelte -->
<!-- The walk's skin on the Guides app: a collapsed "ⓘ How to" bar that opens the guides
     that apply to what the walker is looking at — the whole walk (its planned obligation),
     or this component (its type, in this walk). Phone theme: scoped styles, no Tailwind.

     ⛔ A guide says HOW. The walk records that the check was done; showing a guide is not
     evidence of anything, and the bar says so only by being a help, never a result.
     ⚠ Silent when no guide applies. A FAILED read says so ("guides not available"),
     never reads as "there are none". Slice S3a: no offline cache yet (S3).

     Reads through guides/public.js only. Reports what was shown, as { guideId: version },
     so the walk can record it when it closes. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { guidesForWalk } from '#lib/apps/guides/public.js';
  import { normalisePhotoUrl } from '#lib/utils/driveUtils.js';

  /** Link targets known on this screen (obligation_id, component_type_id, component_id …). */
  /** @type {Record<string, string|null|undefined>} */
  export let context = {};
  /** Show only guides with a link that names this target (a check-level bar: 'type_attribute_id'). @type {string|null} */
  export let requireTarget = null;

  const dispatch = createEventDispatcher();

  /** @type {import('#lib/apps/guides/public.js').WalkGuide[]} */
  let guides = [];
  let failed = false;
  let fromCache = false;
  let open = false;
  /** @type {string|null} */ let openGuide = null;
  let loadedFor = '';
  let mounted = false;

  // Key on a PRIMITIVE so an object prop re-evaluated by the parent does not re-fetch.
  $: key = JSON.stringify(Object.entries(context).filter(([, v]) => v).sort());
  $: if (mounted && key !== loadedFor) load(key);

  async function load(/** @type {string} */ forKey) {
    loadedFor = forKey;
    failed = false;
    try {
      const ctx = { ...context };
      const found = await guidesForWalk(ctx, { requireTarget });
      if (forKey !== loadedFor) return;               // the screen moved on
      guides = found.guides;
      fromCache = found.fromCache;
      openGuide = found.guides.length === 1 ? found.guides[0].guideId : null;
    } catch {
      if (forKey !== loadedFor) return;
      guides = [];
      failed = true;                                  // shown below — never silence
    }
  }

  onMount(() => { mounted = true; });

  function toggle() {
    open = !open;
    // Showing the guides is what is recorded: report on first opening only.
    if (open && guides.length) dispatch('shown', Object.fromEntries(guides.map((g) => [g.guideId, g.version])));
  }

  const KIND = { step: '', caution: 'CAUTION', stop: 'STOP — CALL SOMEONE', good: 'WHAT GOOD LOOKS LIKE', bad: 'WHAT BAD LOOKS LIKE' };
</script>

{#if failed}
  <p class="gh-failed" role="status" data-testid="guides-unavailable">Guides are not available right now.</p>
{:else if guides.length}
  <div class="gh" data-testid="guide-howto">
    <button type="button" class="gh-bar" aria-expanded={open} on:click={toggle}>
      <span class="gh-i" aria-hidden="true">ⓘ</span> HOW TO
      <span class="gh-count">{guides.length === 1 ? guides[0].title : `${guides.length} guides`}</span>
      <span aria-hidden="true">{open ? '▾' : '▸'}</span>
    </button>

    {#if open}
      <div class="gh-body">
        {#if fromCache}<p class="gh-need" data-testid="from-cache">No signal — showing the copy saved on this phone.</p>{/if}
        {#each guides as g (g.guideId)}
          <section class="gh-guide">
            <button type="button" class="gh-title" aria-expanded={openGuide === g.guideId}
              on:click={() => (openGuide = openGuide === g.guideId ? null : g.guideId)}>
              {g.title}{#if g.minutes} · about {g.minutes} min{/if}
            </button>
            {#if openGuide === g.guideId}
              {#if g.youNeed}<p class="gh-need">You will need: {g.youNeed}</p>{/if}
              <ol class="gh-steps">
                {#each g.steps as st (st.id)}
                  <li class="gh-step gh-{st.kind}">
                    {#if KIND[st.kind]}<p class="gh-kind">{KIND[st.kind]}</p>{/if}
                    <p class="gh-stitle">{st.title}</p>
                    {#if st.body}<p class="gh-text">{st.body}</p>{/if}
                    {#each st.photos as p (p.id)}
                      <img class="gh-img" src={normalisePhotoUrl(p.url)} alt={st.title} loading="lazy" />
                    {/each}
                  </li>
                {/each}
              </ol>
            {/if}
          </section>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .gh { border: 1px solid #3e3e58; border-radius: 10px; background: #14141f; margin: 0.5rem 0; font-family: 'DM Mono', 'Courier New', monospace; color: #f0f0f0; }
  .gh-bar { display: flex; align-items: center; gap: 0.5rem; width: 100%; min-height: 44px; padding: 0 0.75rem;
    background: none; border: 0; color: #fb923c; font: inherit; font-weight: 700; letter-spacing: 0.08em; cursor: pointer; text-align: left; }
  .gh-i { font-size: 1.1rem; }
  .gh-count { flex: 1; color: #c8c8d8; font-weight: 400; letter-spacing: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gh-body { padding: 0 0.75rem 0.75rem; }
  .gh-guide + .gh-guide { border-top: 1px solid #2a2a3e; margin-top: 0.5rem; padding-top: 0.5rem; }
  .gh-title { min-height: 44px; width: 100%; text-align: left; background: none; border: 0; color: #f0f0f0; font: inherit; font-weight: 700; cursor: pointer; }
  .gh-need { color: #a0a0b8; font-size: 0.8rem; margin: 0 0 0.5rem; }
  .gh-steps { list-style: none; margin: 0; padding: 0; counter-reset: gh; display: grid; gap: 0.75rem; }
  .gh-step { counter-increment: gh; border-left: 4px solid #2dd4bf; padding-left: 0.6rem; }
  .gh-caution { border-color: #f59e0b; }
  .gh-stop, .gh-bad { border-color: #ef4444; }
  .gh-good { border-color: #22c55e; }
  .gh-kind { margin: 0; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; color: #c8c8d8; }
  .gh-stitle { margin: 0; font-weight: 700; }
  .gh-stitle::before { content: counter(gh) '. '; color: #fb923c; }
  .gh-text { margin: 0.25rem 0 0; color: #d8d8e8; font-size: 0.9rem; white-space: pre-wrap; }
  .gh-img { display: block; width: 100%; max-width: 420px; margin-top: 0.5rem; border-radius: 8px; border: 1px solid #3e3e58; }
  .gh-failed { margin: 0.5rem 0; font-size: 0.8rem; color: #a0a0b8; }
</style>
