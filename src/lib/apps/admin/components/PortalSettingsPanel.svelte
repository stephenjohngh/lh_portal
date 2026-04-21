<!-- src/lib/apps/admin/components/PortalSettingsPanel.svelte -->
<!-- Admin panel for configuring global portal settings.
     Currently: which apps appear in the top navigation bar. -->
<script>
  import { onMount }        from 'svelte';
  import { AVAILABLE_APPS } from '$lib/apps/apps.js';
  import { portalSettings } from '$lib/stores/portalSettings.js';
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
    await portalSettings.load();
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

</div>
