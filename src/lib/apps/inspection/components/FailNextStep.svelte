<!-- src/lib/apps/inspection/components/FailNextStep.svelte -->
<!-- What to do next when a check or a component has FAILED — the walk's skin on the Guides
     app (migration 273). Shown only while the result is FAIL or PROBLEM.
       · the "if this fails" guide(s) linked to this place (Guides → the guide → Where it is offered
         → "only when a check fails"), and
       · who to call (Guides → Manage → Who to call when a check fails).
     On an ordinary walk (nearly all of them) this is quiet help: the walker carries on and the
     results are picked up later. On a walk whose planned obligation says a failure needs an
     IMMEDIATE response, it is a loud banner with the number first.

     It never blocks saving: someone recording a serious failure with a bad signal must still be
     able to record it. A failed read says so; it never reads as "nothing to do". -->
<script>
  import { failHelpForWalk } from '#lib/apps/guides/public.js';
  import { normalisePhotoUrl } from '#lib/utils/driveUtils.js';

  /** Link targets for this place (obligation_id, component_type_id, component_id). @type {Record<string, string|null|undefined>} */
  export let context = {};
  /** The type attributes (checks) that failed — each adds its own "if this fails" guides. @type {string[]} */
  export let failedChecks = [];
  /** 'collect' (gather and carry on) or 'immediate' (a failure needs a response now). */
  export let response = 'collect';

  /** @type {import('#lib/apps/guides/public.js').WalkGuide[]} */
  let guides = [];
  /** @type {{ name: string, phone: string, hours: string, notes: string }|null} */
  let contact = null;
  let state = 'loading';
  let fromCache = false;
  let loadedFor = '';

  $: immediate = response === 'immediate';
  $: key = JSON.stringify([Object.entries(context).filter(([, v]) => v).sort(), [...failedChecks].sort()]);
  $: load(key);

  async function load(/** @type {string} */ forKey) {
    if (forKey === loadedFor) return;
    loadedFor = forKey;
    state = 'loading';
    try {
      const asks = [{ ...context }, ...failedChecks.map((a) => ({ ...context, type_attribute_id: a }))];
      const answers = await Promise.all(asks.map((c) => failHelpForWalk(c)));
      if (forKey !== loadedFor) return;
      /** @type {Map<string, any>} */ const byId = new Map();
      for (const a of answers) for (const g of a.guides) if (!byId.has(g.guideId)) byId.set(g.guideId, g);
      guides = [...byId.values()];
      contact = answers[0]?.contact ?? null;
      fromCache = answers.some((a) => a.fromCache);
      state = 'ready';
    } catch {
      if (forKey !== loadedFor) return;
      state = 'failed';
    }
  }

  const KIND = { step: '', caution: 'CAUTION', stop: 'STOP — CALL SOMEONE', good: 'WHAT GOOD LOOKS LIKE', bad: 'WHAT BAD LOOKS LIKE' };
  $: telHref = contact?.phone ? `tel:${contact.phone.replace(/[^\d+]/g, '')}` : '';
  // Quiet on an ordinary walk when nothing has been set up; never quiet on an immediate one.
  $: show = state !== 'ready' || immediate || guides.length > 0 || !!contact;
</script>

{#if show}
  <section class="fn" class:fn-now={immediate} role={immediate ? 'alert' : 'region'} aria-label="What to do next" data-testid="fail-next-step">
    <p class="fn-head">{immediate ? 'THIS NEEDS AN IMMEDIATE RESPONSE' : 'IF THIS FAILS'}</p>

    {#if state === 'loading'}
      <p class="fn-text">Loading what to do next…</p>
    {:else if state === 'failed'}
      <p class="fn-text" data-testid="fail-unavailable">What to do next is not available right now.{immediate ? ' Tell the office at once.' : ''}</p>
    {:else}
      {#if contact}
        <div class="fn-call" data-testid="fail-contact">
          {#if contact.name}<p class="fn-who">Call: {contact.name}</p>{/if}
          {#if telHref}<a class="fn-tel" href={telHref}>{contact.phone}</a>{/if}
          {#if contact.hours}<p class="fn-text">{contact.hours}</p>{/if}
          {#if contact.notes}<p class="fn-text">{contact.notes}</p>{/if}
        </div>
      {:else if immediate}
        <p class="fn-text" data-testid="fail-no-contact">No number to call has been set up. Tell the office straight away.</p>
      {/if}

      {#each guides as g (g.guideId)}
        <div class="fn-guide">
          <p class="fn-gtitle">{g.title}</p>
          <ol class="fn-steps">
            {#each g.steps as st (st.id)}
              <li class="fn-step fn-{st.kind}">
                {#if KIND[st.kind]}<p class="fn-kind">{KIND[st.kind]}</p>{/if}
                <p class="fn-stitle">{st.title}</p>
                {#if st.body}<p class="fn-text">{st.body}</p>{/if}
                {#each st.photos as p (p.id)}
                  <img class="fn-img" src={normalisePhotoUrl(p.url)} alt={st.title} loading="lazy" />
                {/each}
              </li>
            {/each}
          </ol>
        </div>
      {/each}
      {#if fromCache}<p class="fn-cache">No signal — showing the copy saved on this phone.</p>{/if}
    {/if}
  </section>
{/if}

<style>
  .fn { border: 2px solid #f59e0b; border-radius: 10px; background: #1c1608; padding: 0.75rem; margin: 0.75rem 0; font-family: 'DM Mono', 'Courier New', monospace; color: #f0f0f0; }
  .fn-now { border-color: #ef4444; background: #2a0d0d; }
  .fn-head { margin: 0 0 0.5rem; font-weight: 700; letter-spacing: 0.08em; color: #fbbf24; }
  .fn-now .fn-head { color: #fca5a5; font-size: 1.05rem; }
  .fn-call { margin-bottom: 0.6rem; }
  .fn-who { margin: 0; font-weight: 700; }
  .fn-tel { display: inline-flex; align-items: center; min-height: 44px; font-size: 1.4rem; font-weight: 700; color: #2dd4bf; }
  .fn-text { margin: 0.2rem 0 0; color: #d8d8e8; font-size: 0.9rem; white-space: pre-wrap; }
  .fn-gtitle { margin: 0.5rem 0 0.25rem; font-weight: 700; }
  .fn-steps { list-style: none; margin: 0; padding: 0; counter-reset: fn; display: grid; gap: 0.6rem; }
  .fn-step { counter-increment: fn; border-left: 4px solid #2dd4bf; padding-left: 0.6rem; }
  .fn-caution { border-color: #f59e0b; }
  .fn-stop, .fn-bad { border-color: #ef4444; }
  .fn-good { border-color: #22c55e; }
  .fn-kind { margin: 0; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; color: #c8c8d8; }
  .fn-stitle { margin: 0; font-weight: 700; }
  .fn-stitle::before { content: counter(fn) '. '; color: #fb923c; }
  .fn-img { display: block; width: 100%; max-width: 420px; margin-top: 0.5rem; border-radius: 8px; border: 1px solid #3e3e58; }
  .fn-cache { margin: 0.5rem 0 0; font-size: 0.75rem; color: #a0a0b8; }
</style>
