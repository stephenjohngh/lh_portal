<!-- src/lib/apps/admin/components/PortalSettingsPanel.svelte -->
<!-- Admin panel for configuring global portal settings.
     Currently: which apps appear in the top navigation bar. -->
<script>
  import { onMount }        from 'svelte';
  import { AVAILABLE_APPS } from '#lib/apps/apps.js';
  import { portalSettings } from '#lib/stores/portalSettings.js';
  import { api }            from '#lib/utils/api.js';
  import { auth }           from '#lib/stores/auth.js';
  import { logAudit }       from '#lib/utils/auditLogger.js';
  import { getLogger }      from '#lib/utils/logger.js';
  import { getJson }        from '#lib/utils/request.js';
  import { fmtDate }        from '#lib/utils/dates.js';
  import { errMessage }     from '#lib/utils/errors.js';
  import Checkbox     from '#lib/components/common/Checkbox.svelte';
  import Button       from '#lib/components/common/Button.svelte';
  import ProtectedButton from '#lib/components/common/ProtectedButton.svelte';
  import Icon         from '#lib/components/icons/Icon.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';

  const logger = getLogger('PortalSettingsPanel');

  // Working copy of selected IDs — initialised once the store is loaded
  let topbarIds = null;   // null = still loading
  let saving    = false;
  let saved     = false;
  let error     = '';

  // All apps that can appear in the top bar
  const ALL_APPS = AVAILABLE_APPS;

  // ── App order section ────────────────────────────────────────────────
  // orderedApps is a working copy of AVAILABLE_APPS in admin-configured order.
  // Initialised once from the store; up/down arrows mutate it; Save persists it.
  const ORDER_KEY = 'app_order';

  let orderedApps   = null;   // null = still loading
  let orderSaving   = false;
  let orderSaved    = false;
  let orderError    = '';

  function moveUp(i) {
    if (i === 0 || !orderedApps) return;
    const arr = [...orderedApps];
    [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
    orderedApps = arr;
    orderSaved = false;
  }

  function moveDown(i) {
    if (!orderedApps || i === orderedApps.length - 1) return;
    const arr = [...orderedApps];
    [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
    orderedApps = arr;
    orderSaved = false;
  }

  async function handleSaveOrder() {
    if (!orderedApps) return;
    orderSaving = true;
    orderError  = '';
    orderSaved  = false;
    try {
      const ids = orderedApps.map(a => a.id);
      await portalSettings.saveOrder(ids);
      orderSaved = true;
      logAudit('update', 'portal_setting', ORDER_KEY, 'App display order', {
        appId:         'admin',
        eventCategory: 'system',
        severity:      'info',
        afterData:     { order: ids }
      });
    } catch (/** @type {any} */ err) {
      orderError = err.message;
      logger('❌ Save order failed:', err.message);
    } finally {
      orderSaving = false;
    }
  }

  // ── AI assistant section ─────────────────────────────────────────────
  // Admins choose which Claude model Management's AI suggestions use, from
  // the models Anthropic offers NOW (/api/admin/ai-models reads its Models
  // API). No model is named in the code: a new one appears here the day it is
  // offered, and a retired one is replaced within its family until an admin
  // chooses again — the reason is shown below. The routes read the choice on
  // every call, so a change takes effect at once.

  /** @type {Array<{ id: string, display_name: string, created_at: string }>} */
  let aiModels        = [];
  let aiModel         = null;     // the choice on screen; null = still loading
  let aiModelPrevious = null;     // last persisted value — used for audit delta
  let aiUsing         = null;     // the model actually in use
  let aiReason        = '';       // why it is not the one chosen
  let aiListError     = '';
  let aiLoading       = false;
  let aiSaving        = false;
  let aiSaved         = false;
  let aiError         = '';
  let aiKeyConfigured = /** @type {boolean|null} */ (null);
  let aiSwitching     = false;
  let aiSwitchError   = '';

  async function toggleAi() {
    const on = !$portalSettings.aiEnabled;
    aiSwitching = true; aiSwitchError = '';
    try {
      await portalSettings.saveAiEnabled(on);
      logAudit('update', 'portal_setting', 'ai_enabled', 'AI suggestions', {
        appId: 'admin', eventCategory: 'system', severity: 'info',
        beforeData: { enabled: !on }, afterData: { enabled: on },
      });
    } catch (/** @type {any} */ err) {
      aiSwitchError = errMessage(err, 'Could not change the switch');
    } finally {
      aiSwitching = false;
    }
  }

  async function loadAiModel(fresh = false) {
    aiLoading = true;
    aiListError = '';
    try {
      const r = await getJson(`/api/admin/ai-models${fresh ? '?fresh=1' : ''}`);
      aiModels        = r.models ?? [];
      aiModelPrevious = r.saved ?? null;
      aiModel         = r.saved ?? r.using ?? '';
      aiUsing         = r.using ?? null;
      aiReason        = r.substituted ? r.reason : '';
      aiListError     = r.error ?? '';
      aiKeyConfigured = r.keyConfigured ?? null;
    } catch (/** @type {any} */ err) {
      logger('⚠️ Failed to load the AI models:', err.message);
      aiListError = err.message;
      aiModel = aiModel ?? '';
    } finally {
      aiLoading = false;
    }
  }

  async function saveAiModel() {
    if (!aiModel) return;
    aiSaving = true;
    aiError  = '';
    aiSaved  = false;
    try {
      const userId = $auth.user?.id ?? null;

      await api.upsert(
        'portal_settings',
        { key: 'ai_model', value: aiModel, updated_by: userId },
        { onConflict: 'key' }
      );
      aiSaved  = true;
      aiUsing  = aiModel;
      aiReason = '';
      logger('✅ Saved ai_model:', aiModel);

      // Audit only when the value actually changed.
      if (aiModel !== aiModelPrevious) {
        logAudit('update', 'portal_setting', 'ai_model', 'AI assistant model', {
          appId:         'admin',
          eventCategory: 'system',
          severity:      'info',
          beforeData:    { model: aiModelPrevious },
          afterData:     { model: aiModel }
        });
        aiModelPrevious = aiModel;
      }
    } catch (/** @type {any} */ err) {
      aiError = 'Save failed: ' + err.message;
      logger('❌ Save failed:', err.message);
    } finally {
      aiSaving = false;
    }
  }

  // Initialise working copies from store whenever it transitions to loaded
  let prevLoaded = false;
  $: {
    const { loaded, ids, order } = $portalSettings;
    if (loaded && !prevLoaded) {
      prevLoaded = true;
      // null ids means "no config saved yet" → default = all apps selected
      topbarIds = ids !== null ? [...ids] : ALL_APPS.map(a => a.id);
      // null order means "no config saved yet" → default = AVAILABLE_APPS order
      if (order !== null && order.length > 0) {
        // Reconstruct sorted app definitions from the saved ID list; append
        // any newly-added apps (not yet in saved order) at the end
        const sorted = order
          .map(id => ALL_APPS.find(a => a.id === id))
          .filter(Boolean);
        const unseen = ALL_APPS.filter(a => !order.includes(a.id));
        orderedApps = [...sorted, ...unseen];
      } else {
        orderedApps = [...ALL_APPS];
      }
    }
  }

  onMount(async () => {
    // Re-fetch in case +page.svelte loaded it before the admin navigated here
    await Promise.all([
      portalSettings.load(),
      loadAiModel()
    ]);
  });

  function toggle(appId) {
    if (!topbarIds) return;
    if (topbarIds.includes(appId)) {
      topbarIds = topbarIds.filter(id => id !== appId);
    } else {
      // Preserve the canonical app order from AVAILABLE_APPS
      topbarIds = ALL_APPS.map(a => a.id).filter(id => [...topbarIds, appId].includes(id));
    }
    saved = false;
  }

  async function handleSave() {
    saving = true;
    error  = '';
    saved  = false;
    try {
      await portalSettings.save(topbarIds);
      saved = true;
      logger('✅ Topbar config saved');
    } catch (/** @type {any} */ err) {
      error = err.message;
      logger('❌ Save failed:', err.message);
    } finally {
      saving = false;
    }
  }

  $: selectedCount = topbarIds?.length ?? 0;
</script>

<div class="space-y-6">

  <!-- ── Section: top-bar apps ───────────────────────────────────────── -->
  <div class="bg-slate-800 rounded-xl border border-slate-700 p-6">
    <div class="mb-5">
      <h3 class="text-base font-semibold text-slate-100">Top-bar apps</h3>
      <p class="text-sm text-slate-400 mt-1">
        Choose which apps appear as buttons in the navigation bar at the top of the screen.
        All apps remain accessible from the home page regardless of this setting.
      </p>
    </div>

    {#if topbarIds === null}
      <p class="text-sm text-slate-500 italic animate-pulse">Loading…</p>

    {:else}
      <div class="space-y-1.5 mb-6">
        {#each ALL_APPS as app}
          <label class="flex items-center gap-4 px-4 py-3 rounded-lg bg-slate-700/40 border border-slate-700/60
                         hover:bg-slate-700/70 hover:border-slate-600 cursor-pointer transition-colors group">
            <Checkbox
              checked={topbarIds.includes(app.id)}
              on:change={() => toggle(app.id)}
            />
            <Icon name={app.icon} size={5} className="text-purple-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-slate-200 group-hover:text-white">
                {app.name}
                {#if app.alwaysVisible}
                  <span class="ml-1.5 text-xs text-slate-500 font-normal">always visible</span>
                {/if}
              </p>
              {#if app.description}
                <p class="text-xs text-slate-500 mt-0.5 truncate">{app.description}</p>
              {/if}
            </div>
          </label>
        {/each}
      </div>

      <!-- Summary + actions -->
      <div class="flex items-center justify-between gap-4 flex-wrap pt-4 border-t border-slate-700">
        <p class="text-sm text-slate-400">
          <span class="text-slate-200 font-medium">{selectedCount}</span> of {ALL_APPS.length} apps in top bar
        </p>
        <div class="flex items-center gap-3">
          {#if saved}
            <p class="text-sm text-green-400">✓ Saved — navbar updated</p>
          {/if}
          {#if error}
            <p class="text-sm text-red-400">⚠ {error}</p>
          {/if}
          <Button variant="primary" on:click={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    {/if}
  </div>

  <!-- ── Section: app display order ───────────────────────────────────── -->
  <div class="bg-slate-800 rounded-xl border border-slate-700 p-6">
    <div class="mb-5">
      <h3 class="text-base font-semibold text-slate-100">App display order</h3>
      <p class="text-sm text-slate-400 mt-1">
        Set the order in which apps appear on the home page grid and in the navigation bar.
        Use the arrows to reorder, then save.
      </p>
    </div>

    {#if orderedApps === null}
      <p class="text-sm text-slate-500 italic animate-pulse">Loading…</p>

    {:else}
      <div class="space-y-1.5 mb-6">
        {#each orderedApps as app, i}
          <div class="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-slate-700/40 border border-slate-700/60">
            <!-- Up / Down arrows -->
            <div class="flex flex-col gap-0.5 shrink-0">
              <button
                class="w-6 h-5 flex items-center justify-center rounded text-slate-400
                       hover:bg-slate-600 hover:text-white transition-colors disabled:opacity-25
                       disabled:cursor-not-allowed text-xs leading-none"
                disabled={i === 0}
                on:click={() => moveUp(i)}
                aria-label="Move {app.name} up"
              >▲</button>
              <button
                class="w-6 h-5 flex items-center justify-center rounded text-slate-400
                       hover:bg-slate-600 hover:text-white transition-colors disabled:opacity-25
                       disabled:cursor-not-allowed text-xs leading-none"
                disabled={i === orderedApps.length - 1}
                on:click={() => moveDown(i)}
                aria-label="Move {app.name} down"
              >▼</button>
            </div>

            <!-- Position number -->
            <span class="text-xs text-slate-600 w-4 text-right shrink-0 tabular-nums">{i + 1}</span>

            <!-- Icon + name -->
            <Icon name={app.icon} size={4} className="text-purple-400 shrink-0" />
            <p class="text-sm font-medium text-slate-200 flex-1 min-w-0 truncate">
              {app.name}
              {#if app.alwaysVisible}
                <span class="ml-1.5 text-xs text-slate-500 font-normal">always visible</span>
              {/if}
            </p>
          </div>
        {/each}
      </div>

      <!-- Save row -->
      <div class="flex items-center justify-between gap-4 flex-wrap pt-4 border-t border-slate-700">
        <p class="text-sm text-slate-400">
          Drag not yet available — use arrows to reorder.
        </p>
        <div class="flex items-center gap-3">
          {#if orderSaved}
            <p class="text-sm text-green-400">✓ Saved — order updated</p>
          {/if}
          {#if orderError}
            <p class="text-sm text-red-400">⚠ {orderError}</p>
          {/if}
          <Button variant="secondary" on:click={() => { orderedApps = [...ALL_APPS]; orderSaved = false; }}
            disabled={orderSaving}>Reset to default</Button>
          <Button variant="primary" on:click={handleSaveOrder} disabled={orderSaving}>
            {orderSaving ? 'Saving…' : 'Save order'}
          </Button>
        </div>
      </div>
    {/if}
  </div>

  <!-- ── Info box ─────────────────────────────────────────────────────── -->
  <div class="rounded-lg bg-slate-800/60 border border-slate-700/60 px-4 py-3 text-sm text-slate-400 flex gap-3">
    <Icon name="info" size={4} className="shrink-0 mt-0.5 text-slate-500" />
    <div>
      <p class="font-medium text-slate-300 mb-1">How this works</p>
      <ul class="space-y-1 list-disc list-inside">
        <li>Changes apply immediately to all users without a page refresh.</li>
        <li>Each user only sees apps they have permission for — top-bar and order settings apply within that set.</li>
        <li>Apps not shown in the top bar remain fully accessible from the <strong class="text-slate-300">Home</strong> page.</li>
        <li>App display order affects both the home page grid and the navigation bar.</li>
      </ul>
    </div>
  </div>

  <!-- ── Section: AI assistant ───────────────────────────────────────── -->
  <div class="bg-slate-800 rounded-xl border border-slate-700 p-6">
    <div class="mb-5">
      <h3 class="text-base font-semibold text-slate-100">AI assistant</h3>
      <p class="text-sm text-slate-400 mt-1">
        Choose which Claude model writes the AI suggestions in Management. The list is
        the models Anthropic offers today, newest first — a new model appears here as soon
        as it is offered. Changes take effect on the next suggestion.
        <a class="text-purple-300 hover:underline" href="https://platform.claude.com/docs/en/about-claude/pricing"
           target="_blank" rel="noopener noreferrer">Current prices</a>.
      </p>
    </div>

    <!-- The on/off switch: an admin setting since 2026-10-04 (it was the
         PUBLIC_AI_SUGGESTIONS_ENABLED environment flag, so switching it needed
         a redeploy). On unless switched off. -->
    <div class="flex items-start justify-between gap-4 mb-5 pb-5 border-b border-slate-700" data-testid="ai-switch">
      <div>
        <p class="text-sm text-slate-200">AI suggestions in Management</p>
        <p class="text-xs text-slate-500 mt-0.5">
          {$portalSettings.aiEnabled
            ? 'On — the ✨ buttons are shown and suggestions are written by the model below.'
            : 'Off — the ✨ buttons are hidden and nothing is sent to Anthropic.'}
        </p>
        {#if aiKeyConfigured === false}
          <p class="text-xs text-amber-300 mt-1" data-testid="ai-no-key">
            ⚠ This deployment has no Anthropic key (ANTHROPIC_API_KEY), so no suggestion can be written
            whatever this switch says. The key is set where the portal is deployed, not here.
          </p>
        {/if}
        {#if aiSwitchError}<p class="text-xs text-red-400 mt-1">⚠ {aiSwitchError}</p>{/if}
      </div>
      <ProtectedButton requireAdmin={true} variant={$portalSettings.aiEnabled ? 'secondary' : 'primary'}
                       on:click={toggleAi} disabled={aiSwitching}>
        {aiSwitching ? 'Saving…' : $portalSettings.aiEnabled ? 'Switch off' : 'Switch on'}
      </ProtectedButton>
    </div>

    {#if aiModel === null}
      <p class="text-sm text-slate-500 italic animate-pulse">Loading…</p>

    {:else}
      {#if aiListError}
        <p class="text-sm text-amber-300 mb-3" data-testid="ai-list-error">⚠ {aiListError}</p>
      {/if}
      {#if aiReason}
        <!-- The saved model has gone: say what is happening instead. -->
        <p class="text-sm text-amber-300 mb-3" data-testid="ai-substituted">
          ⚠ {aiReason} Choose a model below to make it your own choice.
        </p>
      {/if}

      <div class="flex items-center gap-3 flex-wrap mb-2">
        <label class="flex-1 min-w-[16rem]">
          <span class="text-xs text-slate-400">Model</span>
          <select bind:value={aiModel} disabled={aiLoading || aiModels.length === 0}
                  class="mt-1 w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100">
            {#if !aiModelPrevious}
              <option value="">— none chosen (the newest Haiku is used) —</option>
            {/if}
            {#if aiModelPrevious && !aiModels.some((m) => m.id === aiModelPrevious)}
              <option value={aiModelPrevious}>{aiModelPrevious} (no longer offered)</option>
            {/if}
            {#each aiModels as m (m.id)}
              <option value={m.id}>{m.display_name} — released {fmtDate(m.created_at)} ({m.id})</option>
            {/each}
          </select>
        </label>
        <Button variant="secondary" on:click={() => loadAiModel(true)} disabled={aiLoading}>
          {aiLoading ? 'Checking…' : 'Check for new models'}
        </Button>
      </div>
      {#if aiUsing}
        <p class="text-xs text-slate-500 mb-6">In use now: <span class="font-mono text-slate-300">{aiUsing}</span></p>
      {/if}

      <!-- Summary + actions -->
      <div class="flex items-center justify-between gap-4 flex-wrap pt-4 border-t border-slate-700">
        <p class="text-xs text-slate-500"></p>
        <div class="flex items-center gap-3">
          {#if aiSaved}
            <p class="text-sm text-green-400">✓ Saved — applies on next suggestion</p>
          {/if}
          {#if aiError}
            <p class="text-sm text-red-400">⚠ {aiError}</p>
          {/if}
          <Button variant="primary" on:click={saveAiModel} disabled={aiSaving || !aiModel || aiModel === aiModelPrevious}>
            {aiSaving ? 'Saving…' : 'Save model'}
          </Button>
        </div>
      </div>
    {/if}
  </div>

</div>
