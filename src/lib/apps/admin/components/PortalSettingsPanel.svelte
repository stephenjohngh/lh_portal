<!-- src/lib/apps/admin/components/PortalSettingsPanel.svelte -->
<!-- Admin panel for configuring global portal settings.
     Currently: which apps appear in the top navigation bar. -->
<script>
  import { onMount }        from 'svelte';
  import { AVAILABLE_APPS } from '$lib/apps/apps.js';
  import { portalSettings } from '$lib/stores/portalSettings.js';
  import { supabase }       from '$lib/supabaseClient';
  import { getLogger }      from '$lib/utils/logger';
  import Checkbox     from '$lib/components/common/Checkbox.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import Icon         from '$lib/components/icons/Icon.svelte';

  const logger = getLogger('PortalSettingsPanel');

  // Working copy of selected IDs — initialised once the store is loaded
  let topbarIds = null;   // null = still loading
  let saving    = false;
  let saved     = false;
  let error     = '';

  // All apps that can appear in the top bar
  const ALL_APPS = AVAILABLE_APPS;

  // ── AI assistant section ─────────────────────────────────────────────
  // Admins choose which Claude model the /api/issues/suggest-action
  // route uses. The route reads portal_settings.ai_model on every call,
  // so changes take effect immediately — no redeploy required. Keep this
  // list ordered cheapest → most expensive; the API route mirrors the
  // same allowlist so unknown values fall back to the default (Haiku).
  const AI_MODELS = [
    {
      value: 'claude-haiku-4-5',
      label: 'Haiku 4.5',
      tagline: 'Fast and inexpensive',
      description: 'Default. Fits short property-management comments well. ~$0.0006 per suggestion after the prompt cache warms.'
    },
    {
      value: 'claude-sonnet-4-5',
      label: 'Sonnet 4.5',
      tagline: 'Balanced quality and cost',
      description: 'Better at nuance and ambiguous comments. Roughly 10× more expensive than Haiku per call.'
    },
    {
      value: 'claude-opus-4-5',
      label: 'Opus 4.5',
      tagline: 'Highest quality, most expensive',
      description: 'Strongest reasoning. Slowest and most expensive — usually overkill for one-line action suggestions.'
    }
  ];

  let aiModel    = null;     // null = still loading
  let aiSaving   = false;
  let aiSaved    = false;
  let aiError    = '';

  async function loadAiModel() {
    try {
      const { data, error: err } = await supabase
        .from('portal_settings')
        .select('value')
        .eq('key', 'ai_model')
        .maybeSingle();
      if (err) throw err;
      const v = data?.value;
      // Default to Haiku if no row exists or an unknown value is stored
      aiModel = AI_MODELS.find(m => m.value === v)?.value ?? 'claude-haiku-4-5';
    } catch (err) {
      logger('⚠️ Failed to load ai_model setting:', err.message);
      aiError = 'Failed to load: ' + err.message;
      aiModel = 'claude-haiku-4-5';
    }
  }

  async function saveAiModel() {
    aiSaving = true;
    aiError  = '';
    aiSaved  = false;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id ?? null;

      const { error: err } = await supabase
        .from('portal_settings')
        .upsert(
          { key: 'ai_model', value: aiModel, updated_by: userId },
          { onConflict: 'key' }
        );
      if (err) throw err;
      aiSaved = true;
      logger('✅ Saved ai_model:', aiModel);
    } catch (err) {
      aiError = 'Save failed: ' + err.message;
      logger('❌ Save failed:', err.message);
    } finally {
      aiSaving = false;
    }
  }

  // Initialise working copy from store whenever it transitions to loaded
  let prevLoaded = false;
  $: {
    const { loaded, ids } = $portalSettings;
    if (loaded && !prevLoaded) {
      prevLoaded = true;
      // null ids means "no config saved yet" → default = all apps selected
      topbarIds = ids !== null ? [...ids] : ALL_APPS.map(a => a.id);
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
    } catch (err) {
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

  <!-- ── Info box ─────────────────────────────────────────────────────── -->
  <div class="rounded-lg bg-slate-800/60 border border-slate-700/60 px-4 py-3 text-sm text-slate-400 flex gap-3">
    <Icon name="info" size={4} className="shrink-0 mt-0.5 text-slate-500" />
    <div>
      <p class="font-medium text-slate-300 mb-1">How this works</p>
      <ul class="space-y-1 list-disc list-inside">
        <li>Changes apply immediately to all users without a page refresh.</li>
        <li>Each user only sees apps they have permission for — this setting determines which of those appear in the top bar.</li>
        <li>Apps not shown in the top bar remain fully accessible from the <strong class="text-slate-300">Home</strong> page.</li>
      </ul>
    </div>
  </div>

  <!-- ── Section: AI assistant ───────────────────────────────────────── -->
  <div class="bg-slate-800 rounded-xl border border-slate-700 p-6">
    <div class="mb-5">
      <h3 class="text-base font-semibold text-slate-100">AI assistant</h3>
      <p class="text-sm text-slate-400 mt-1">
        Choose which Claude model is used for AI-suggested actions in the Issues app.
        Changes take effect on the next suggestion request — no redeploy needed.
      </p>
    </div>

    {#if aiModel === null}
      <p class="text-sm text-slate-500 italic animate-pulse">Loading…</p>

    {:else}
      <div class="space-y-2 mb-6">
        {#each AI_MODELS as m}
          <label class="flex items-start gap-3 px-4 py-3 rounded-lg bg-slate-700/40 border border-slate-700/60
                         hover:bg-slate-700/70 hover:border-slate-600 cursor-pointer transition-colors">
            <input
              type="radio"
              name="ai-model"
              bind:group={aiModel}
              value={m.value}
              class="mt-1 accent-purple-500 shrink-0"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2 flex-wrap">
                <p class="text-sm font-medium text-slate-200">{m.label}</p>
                <p class="text-xs text-slate-500">— {m.tagline}</p>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">{m.description}</p>
              <p class="text-[10px] text-slate-600 mt-1 font-mono">{m.value}</p>
            </div>
          </label>
        {/each}
      </div>

      <!-- Summary + actions -->
      <div class="flex items-center justify-between gap-4 flex-wrap pt-4 border-t border-slate-700">
        <p class="text-xs text-slate-500">
          Also requires <code class="text-slate-400 font-mono">PUBLIC_AI_SUGGESTIONS_ENABLED=true</code> and a valid <code class="text-slate-400 font-mono">ANTHROPIC_API_KEY</code> in the deploy environment.
        </p>
        <div class="flex items-center gap-3">
          {#if aiSaved}
            <p class="text-sm text-green-400">✓ Saved — applies on next suggestion</p>
          {/if}
          {#if aiError}
            <p class="text-sm text-red-400">⚠ {aiError}</p>
          {/if}
          <Button variant="primary" on:click={saveAiModel} disabled={aiSaving}>
            {aiSaving ? 'Saving…' : 'Save model'}
          </Button>
        </div>
      </div>
    {/if}
  </div>

</div>
