<!-- src/lib/apps/guides/components/GuideHelp.svelte -->
<!-- The guides that apply to a place, in the STANDARD theme — for a screen in another app
     that wants to say "how to" (a planned obligation: what a walker would see; later a
     space and a Planner event). It reads through guides/public.js only and writes nothing.
     Silent when none apply; a failed read says so. -->
<script>
  import { guidesFor } from '../public.js';
  import { normalisePhotoUrl } from '#lib/utils/driveUtils.js';
  import { KIND_LABEL } from '../utils/guideModel.js';

  /** Link targets known on this screen (obligation_id, space_id …). @type {Record<string, string|null|undefined>} */
  export let context = {};
  export let heading = 'How-to guides';
  /** Say so when there are none (a preview wants to; a quiet "help" line does not). */
  export let showWhenEmpty = false;

  /** @type {import('../public.js').WalkGuide[]} */
  let guides = [];
  let state = 'loading';
  /** @type {string|null} */ let open = null;
  let loadedFor = '';

  $: key = JSON.stringify(Object.entries(context).filter(([, v]) => v).sort());
  $: if (key !== loadedFor) load(key);

  async function load(/** @type {string} */ forKey) {
    loadedFor = forKey;
    state = 'loading';
    try {
      const found = await guidesFor({ ...context });
      if (forKey !== loadedFor) return;
      guides = found; state = 'ready';
    } catch {
      if (forKey !== loadedFor) return;
      guides = []; state = 'failed';
    }
  }
</script>

{#if state === 'failed'}
  <p class="text-xs text-slate-400" role="status" data-testid="guidehelp-failed">Guides are not available right now.</p>
{:else if state === 'ready' && (guides.length || showWhenEmpty)}
  <div class="rounded-lg border border-slate-700 bg-slate-800/40 p-3 space-y-2" data-testid="guidehelp">
    <p class="text-sm font-semibold text-white">{heading}</p>
    {#if guides.length === 0}
      <p class="text-sm text-slate-400" data-testid="guidehelp-none">No guide is offered here yet.</p>
    {/if}
    {#each guides as g (g.guideId)}
      <div>
        <button type="button" class="text-left text-sm text-teal-300 underline"
          aria-expanded={open === g.guideId} on:click={() => (open = open === g.guideId ? null : g.guideId)}>
          {g.title}{g.minutes ? ` · about ${g.minutes} min` : ''}
        </button>
        {#if open === g.guideId}
          <ol class="mt-2 space-y-2 list-decimal pl-5 text-sm text-slate-200">
            {#each g.steps as st (st.id)}
              <li>
                {#if st.kind !== 'step'}<span class="text-xs font-bold text-amber-300">{KIND_LABEL[st.kind]?.toUpperCase()} </span>{/if}
                <strong>{st.title}</strong>
                {#if st.body}<span class="block text-slate-300 whitespace-pre-wrap">{st.body}</span>{/if}
                {#each st.photos as p (p.id)}
                  <img src={normalisePhotoUrl(p.url)} alt={st.title} class="mt-1 max-h-40 rounded border border-slate-600" loading="lazy" />
                {/each}
              </li>
            {/each}
          </ol>
        {/if}
      </div>
    {/each}
  </div>
{/if}
