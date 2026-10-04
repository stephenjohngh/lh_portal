<!-- src/lib/apps/admin/components/WordingPanel.svelte -->
<!-- Admin → Other Config → Wording: the portal's own words that an operator
     will need to change — the MOR draft letters and the Dossier
     confidentiality notice.

     They used to be written in the code (user, 2026-10-03: "things that can
     change … should have an admin parameter"). Declared once, with their
     shipped defaults and the {tokens} each understands, in
     #lib/utils/wording.js; this screen only edits them. Only texts that DIFFER
     from the default are saved (portal_settings, key `wording`), so one set
     back to its default follows the default again — the Policies pattern.
     ⚠ A text with a {token} it does not understand is refused: a typo would
     otherwise print as itself on a letter sent to a resident. -->
<script>
  import { onMount } from 'svelte';
  import { portalSettings } from '#lib/stores/portalSettings.js';
  import { wordingInfo, validateWording, cleanWording } from '#lib/utils/wording.js';
  import { logAudit } from '#lib/utils/auditLogger.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { getLogger } from '#lib/utils/logger.js';
  import Button from '#lib/components/common/Button.svelte';
  import ProtectedButton from '#lib/components/common/ProtectedButton.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';

  const logger  = getLogger('WordingPanel');
  const ENTRIES = wordingInfo();
  const AREAS   = [...new Set(ENTRIES.map((e) => e.area))];

  /** @type {Record<string, string>|null} */
  let draft = null;
  let saving = false;
  let saved  = false;
  let error  = '';

  let refreshed = false;
  onMount(async () => { await portalSettings.load(); refreshed = true; });
  $: if (draft === null && refreshed) resetDraft();

  function resetDraft() {
    draft = { ...$portalSettings.wordingInForce };
    saved = false;
    error = '';
  }

  /** @param {Record<string, string>} o */
  const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

  $: problems   = draft ? validateWording(draft) : {};
  $: storedNow  = $portalSettings.wording ?? {};
  $: wouldStore = draft && Object.keys(problems).length === 0 ? cleanWording(draft) : null;
  $: dirty = !!draft && (Object.keys(problems).length > 0
    || JSON.stringify(sortKeys(wouldStore ?? {})) !== JSON.stringify(sortKeys(storedNow)));
  $: changedCount = Object.keys(storedNow).length;

  /** @param {string} text */
  const norm = (text) => String(text ?? '').replace(/\r\n?/g, '\n').trim();

  function useDefault(/** @type {string} */ key, /** @type {string} */ value) {
    draft = { ...draft, [key]: value };
    saved = false;
  }

  async function handleSave() {
    if (!draft || Object.keys(problems).length > 0) return;
    const before = { ...storedNow };
    saving = true; saved = false; error = '';
    try {
      const after = await portalSettings.saveWording(draft);
      logAudit('update', 'portal_setting', 'wording', 'Wording', {
        appId: 'admin', eventCategory: 'system', severity: 'info',
        beforeData: { changed: Object.keys(before) }, afterData: { changed: Object.keys(after) },
      });
      draft = { ...$portalSettings.wordingInForce };
      saved = true;
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'Could not save the wording');
      logger('❌ Save failed:', err);
    } finally {
      saving = false;
    }
  }
</script>

<div class="bg-slate-800 rounded-xl border border-slate-700 p-6">
  <div class="mb-5">
    <h3 class="text-base font-semibold text-slate-100">Wording</h3>
    <p class="text-sm text-slate-400 mt-1">
      Words the portal puts in front of other people. Each has the wording it ships with,
      and a change applies to the next letter or page produced.
    </p>
  </div>

  {#if draft === null}
    <p class="text-sm text-slate-500 italic animate-pulse">Loading…</p>
  {:else}
    {#each AREAS as area (area)}
      <h4 class="text-sm font-semibold text-slate-300 mt-6 mb-1">{area}</h4>
      {#if ENTRIES.some((e) => e.area === area && e.letter)}
        <div class="text-xs text-slate-400 bg-slate-900/50 border border-slate-700 rounded p-3 mb-3 space-y-1">
          <p>How a letter is written: <code class="text-slate-300"># Title</code> on the first line ·
            <code class="text-slate-300">## Heading</code> · <code class="text-slate-300">**a line in bold**</code> ·
            a blank line between paragraphs.</p>
          <p>The date, the recipient, the case reference and the signature are added for you.
            A paragraph whose <code class="text-slate-300">{'{token}'}</code> has no value on a case is left out,
            and so is a heading left with nothing under it. Text in [square brackets] is for
            the person sending the letter to fill in.</p>
        </div>
      {/if}

      {#each ENTRIES.filter((e) => e.area === area) as e (e.key)}
        {@const bad = problems[e.key]}
        {@const offDefault = !bad && norm(draft[e.key]) !== e.default}
        <div class="border-b border-slate-700/60 py-4" data-testid="wording-{e.key}">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-slate-200 text-sm">{e.label}</p>
              <p class="text-xs text-slate-500 mt-0.5">{e.governs}</p>
              <p class="text-xs text-slate-500 mt-1">
                {#if e.tokens.length}
                  Can use: {#each e.tokens as t}<code class="text-slate-300 mr-2">{`{${t}}`}</code>{/each}
                {:else}
                  Takes no {'{tokens}'}.
                {/if}
              </p>
            </div>
            {#if offDefault}
              <button type="button" class="shrink-0 text-xs text-purple-400 hover:text-purple-300 underline"
                      on:click={() => useDefault(e.key, e.default)}>Use default</button>
            {/if}
          </div>
          <textarea
            aria-label={e.label}
            rows={e.letter ? 16 : 3}
            bind:value={draft[e.key]}
            on:input={() => { saved = false; }}
            class="mt-2 w-full bg-slate-900 border rounded px-3 py-2 text-sm text-slate-100 font-mono
                   {bad ? 'border-red-500' : offDefault ? 'border-amber-500/70' : 'border-slate-600'}"
          ></textarea>
          {#if bad}<p class="text-xs text-red-400 mt-1">{bad}</p>{/if}
        </div>
      {/each}
    {/each}

    {#if error}<ErrorDisplay message={error} className="mt-3" />{/if}

    <div class="flex items-center justify-between gap-4 flex-wrap pt-4 mt-4 border-t border-slate-700">
      <p class="text-sm text-slate-400">
        {#if changedCount === 0}
          Every text is the shipped wording.
        {:else}
          <span class="text-slate-200 font-medium">{changedCount}</span> of {ENTRIES.length} changed from the shipped wording.
        {/if}
      </p>
      <div class="flex items-center gap-3">
        {#if saved && !dirty}<p class="text-sm text-green-400">✓ Saved</p>{/if}
        {#if dirty}<Button variant="secondary" on:click={resetDraft} disabled={saving}>Discard changes</Button>{/if}
        <ProtectedButton requireAdmin={true} variant="primary" on:click={handleSave}
                         disabled={saving || !dirty || Object.keys(problems).length > 0}>
          {saving ? 'Saving…' : 'Save changes'}
        </ProtectedButton>
      </div>
    </div>
  {/if}
</div>
