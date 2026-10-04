<!-- src/lib/apps/admin/components/DueWindowsPanel.svelte -->
<!-- Admin → Other Config → Due windows: how many days before something is due
     each app starts to show it as due soon.

     The windows, their defaults and what each one governs are declared once,
     in #lib/utils/dueWindows.js; this screen only edits them. What is saved is
     the windows that DIFFER from the shipped default (portal_settings,
     due_soon_days), so a window put back to its default follows the default
     again — including a later release's. -->
<script>
  import { onMount } from 'svelte';
  import { portalSettings } from '#lib/stores/portalSettings.js';
  import { dueWindowInfo, isValidWindow, cleanDueWindows, DUE_WINDOW_LIMITS } from '#lib/utils/dueWindows.js';
  import { logAudit } from '#lib/utils/auditLogger.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { getLogger } from '#lib/utils/logger.js';
  import Button from '#lib/components/common/Button.svelte';
  import ProtectedButton from '#lib/components/common/ProtectedButton.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';

  const logger = getLogger('DueWindowsPanel');
  const WINDOWS = dueWindowInfo();

  /** The working copy, `{ key: days }`; null until the settings have loaded. */
  /** @type {Record<string, any>|null} */
  let draft = null;
  let saving = false;
  let saved  = false;
  let error  = '';

  // Read afresh on opening, so the form starts from what is saved now rather
  // than from what was read when the portal opened.
  let refreshed = false;
  onMount(async () => { await portalSettings.load(); refreshed = true; });

  // Fill the working copy once, when that read is back — never again on a
  // store update, or it would wipe what the admin is typing.
  $: if (draft === null && refreshed) resetDraft();

  function resetDraft() {
    draft = { ...$portalSettings.windows };
    saved = false;
    error = '';
  }

  /** Same key order and values, so "nothing changed" is a string compare. */
  const canonical = (/** @type {Record<string, number>} */ w) =>
    JSON.stringify(WINDOWS.map(({ key }) => [key, w[key] ?? null]).filter(([, v]) => v !== null));

  $: invalid = invalidKeys(draft);

  /** @param {Record<string, any>|null} d */
  function invalidKeys(d) {
    return d ? WINDOWS.filter(({ key }) => !isValidWindow(d[key])).map(w => w.key) : [];
  }
  $: storedNow = $portalSettings.dueWindows ?? {};
  $: wouldStore = draft && invalid.length === 0 ? cleanDueWindows(draft) : null;
  $: dirty = !!draft && (invalid.length > 0 || canonical(wouldStore ?? {}) !== canonical(storedNow));
  $: changedCount = Object.keys(storedNow).length;

  function useDefault(/** @type {string} */ key, /** @type {number} */ days) {
    draft = { ...draft, [key]: days };
    saved = false;
  }

  async function handleSave() {
    if (!draft || invalid.length > 0) return;
    const before = { ...storedNow };
    saving = true;
    saved = false;
    error = '';
    try {
      const after = await portalSettings.saveDueWindows(draft);
      if (canonical(after) !== canonical(before)) {
        logAudit('update', 'portal_setting', 'due_soon_days', 'Due windows', {
          appId:         'admin',
          eventCategory: 'system',
          severity:      'info',
          beforeData:    { windows: before },
          afterData:     { windows: after },
        });
      }
      draft = { ...$portalSettings.windows };
      saved = true;
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'Could not save the due windows');
      logger('❌ Save failed:', err);
    } finally {
      saving = false;
    }
  }
</script>

<div class="bg-slate-800 rounded-xl border border-slate-700 p-6">
  <div class="mb-5">
    <h3 class="text-base font-semibold text-slate-100">Due windows</h3>
    <p class="text-sm text-slate-400 mt-1">
      How many days before something is due it starts to show as <span class="text-amber-300">due soon</span>
      — or, on the Planner, starts to appear as coming up. Something is
      <span class="text-red-300">overdue</span> from the day after its date whatever is set here.
    </p>
    <p class="text-xs text-slate-500 mt-2">
      A saved change applies to each screen the next time it is opened. A window
      set back to its default follows the default from then on.
    </p>
  </div>

  {#if draft === null}
    <p class="text-sm text-slate-500 italic animate-pulse">Loading…</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-700">
            <th class="py-2 pr-3 font-medium">App</th>
            <th class="py-2 pr-3 font-medium">What</th>
            <th class="py-2 pr-3 font-medium w-28">Days</th>
            <th class="py-2 pr-3 font-medium w-40">Default</th>
          </tr>
        </thead>
        <tbody>
          {#each WINDOWS as w (w.key)}
            {@const bad = invalid.includes(w.key)}
            {@const offDefault = !bad && draft[w.key] !== w.defaultDays}
            <tr class="border-b border-slate-700/60 align-top" data-testid="due-window-{w.key}">
              <td class="py-3 pr-3 text-slate-400 whitespace-nowrap">{w.app}</td>
              <td class="py-3 pr-3">
                <p class="text-slate-200">{w.label}</p>
                <p class="text-xs text-slate-500 mt-0.5">{w.where}</p>
              </td>
              <td class="py-3 pr-3">
                <input
                  type="number"
                  min={DUE_WINDOW_LIMITS.min}
                  max={DUE_WINDOW_LIMITS.max}
                  step="1"
                  aria-label="{w.label} — days"
                  bind:value={draft[w.key]}
                  on:input={() => { saved = false; }}
                  class="w-20 bg-slate-900 border rounded px-2 py-1 text-slate-100
                         {bad ? 'border-red-500' : offDefault ? 'border-amber-500/70' : 'border-slate-600'}"
                />
                {#if bad}
                  <p class="text-xs text-red-400 mt-1">
                    A whole number from {DUE_WINDOW_LIMITS.min} to {DUE_WINDOW_LIMITS.max}
                  </p>
                {/if}
              </td>
              <td class="py-3 pr-3 text-slate-400">
                {w.defaultDays}
                {#if offDefault}
                  <button
                    type="button"
                    class="ml-2 text-xs text-purple-400 hover:text-purple-300 underline"
                    on:click={() => useDefault(w.key, w.defaultDays)}
                  >Use default</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if error}
      <ErrorDisplay message={error} className="mt-3" />
    {/if}

    <div class="flex items-center justify-between gap-4 flex-wrap pt-4 mt-2 border-t border-slate-700">
      <p class="text-sm text-slate-400">
        {#if changedCount === 0}
          Every window is on its default.
        {:else}
          <span class="text-slate-200 font-medium">{changedCount}</span>
          of {WINDOWS.length} window{WINDOWS.length === 1 ? '' : 's'} changed from the default.
        {/if}
      </p>
      <div class="flex items-center gap-3">
        {#if saved && !dirty}
          <p class="text-sm text-green-400">✓ Saved</p>
        {/if}
        {#if dirty}
          <Button variant="secondary" on:click={resetDraft} disabled={saving}>Discard changes</Button>
        {/if}
        <ProtectedButton
          requireAdmin={true}
          variant="primary"
          on:click={handleSave}
          disabled={saving || !dirty || invalid.length > 0}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </ProtectedButton>
      </div>
    </div>
  {/if}
</div>
