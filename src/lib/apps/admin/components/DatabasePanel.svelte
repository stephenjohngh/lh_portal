<!-- src/lib/apps/admin/components/DatabasePanel.svelte -->
<!-- Admin-only panel to configure a runtime Supabase DB override.
     Credentials are saved to localStorage; switching triggers a full-page
     reload so all stores and the Supabase client re-initialise cleanly. -->
<script>
  import { DB_OVERRIDE_KEY, activeDbUrl, isDbOverride } from '$lib/supabaseClient';
  import Button from '$lib/components/common/Button.svelte';

  // ── Current state ─────────────────────────────────────────────────────
  let overrideActive = isDbOverride;
  let currentUrl     = activeDbUrl;

  // ── Form state ────────────────────────────────────────────────────────
  let newUrl  = '';
  let newKey  = '';
  let error   = '';
  let success = '';

  function validate() {
    error = '';
    if (!newUrl.trim())  { error = 'Supabase URL is required.'; return false; }
    if (!newKey.trim())  { error = 'Anon key is required.'; return false; }
    try {
      new URL(newUrl.trim());
    } catch {
      error = 'URL does not look valid — should start with https://';
      return false;
    }
    return true;
  }

  function handleSwitch() {
    if (!validate()) return;
    try {
      localStorage.setItem(DB_OVERRIDE_KEY, JSON.stringify({
        url: newUrl.trim(),
        key: newKey.trim(),
      }));
      success = 'Override saved. Reloading…';
      // Short delay so the user sees the message, then full-page reload
      setTimeout(() => { window.location.href = '/'; }, 800);
    } catch (err) {
      error = 'Could not write to localStorage: ' + err.message;
    }
  }

  function handleReset() {
    localStorage.removeItem(DB_OVERRIDE_KEY);
    success = 'Override removed. Reloading…';
    setTimeout(() => { window.location.href = '/'; }, 800);
  }
</script>

<!-- ── Header ──────────────────────────────────────────────────────────── -->
<div class="flex-between mb-4">
  <div>
    <h3 class="text-lg font-semibold text-white">Database Configuration</h3>
    <p class="text-muted-sm mt-0.5">
      Override the Supabase database at runtime — useful for switching between live and demo instances.
      Credentials are stored in <code class="text-xs bg-slate-700 px-1 rounded">localStorage</code>
      on this browser only and never sent to the server.
    </p>
  </div>
</div>

<!-- ── Current status card ────────────────────────────────────────────── -->
<div class="mb-6 p-4 rounded-xl border {overrideActive
  ? 'bg-amber-900/20 border-amber-600/50'
  : 'bg-slate-800/50 border-slate-700'}">

  <div class="flex items-start justify-between gap-4">
    <div class="min-w-0">
      <p class="text-xs font-semibold uppercase tracking-wide {overrideActive ? 'text-amber-400' : 'text-slate-400'}">
        {overrideActive ? '⚠ Override Active' : '✅ Standard (built-in) Config'}
      </p>
      <p class="mt-1 text-sm text-slate-300 font-mono break-all">{currentUrl}</p>
      {#if overrideActive}
        <p class="mt-2 text-xs text-amber-300">
          The app is connected to an override database, not the production config baked into this build.
        </p>
      {/if}
    </div>
    {#if overrideActive}
      <div class="shrink-0">
        <Button variant="danger" size="medium" on:click={handleReset}>
          Reset to Default
        </Button>
      </div>
    {/if}
  </div>
</div>

<!-- ── Switch form ────────────────────────────────────────────────────── -->
<div class="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
  <h4 class="text-sm font-semibold text-white mb-4">
    {overrideActive ? 'Switch to a Different Override' : 'Configure an Override'}
  </h4>

  <div class="space-y-4">
    <div class="flex flex-col gap-1">
      <label for="db-url" class="text-label">Supabase Project URL</label>
      <input
        id="db-url"
        type="url"
        bind:value={newUrl}
        placeholder="https://xxxxxxxxxxxxxxxxxxxx.supabase.co"
        class="input font-mono text-sm"
        on:input={() => { error = ''; success = ''; }}
      />
    </div>

    <div class="flex flex-col gap-1">
      <label for="db-key" class="text-label">Anon / Public Key</label>
      <textarea
        id="db-key"
        rows="3"
        bind:value={newKey}
        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
        class="textarea font-mono text-xs"
        on:input={() => { error = ''; success = ''; }}
      ></textarea>
      <p class="text-muted-sm">
        The anon/public key is safe to paste here — it is designed to be public.
        Security is enforced by Supabase Row-Level Security policies, not key secrecy.
      </p>
    </div>

    {#if error}
      <div class="alert-error text-sm">{error}</div>
    {/if}
    {#if success}
      <div class="p-3 rounded-lg bg-emerald-900/30 border border-emerald-600/50 text-sm text-emerald-300">
        {success}
      </div>
    {/if}

    <div class="flex justify-end">
      <Button
        variant="primary"
        size="large"
        on:click={handleSwitch}
        disabled={!!success}
      >
        Switch Database &amp; Reload
      </Button>
    </div>
  </div>
</div>

<!-- ── Info box ────────────────────────────────────────────────────────── -->
<div class="card-info mt-5">
  <p class="text-sm text-blue-300 font-semibold mb-1">How this works</p>
  <ul class="text-sm text-blue-200 space-y-1 list-disc list-inside">
    <li>Credentials are stored in <strong>this browser's localStorage only</strong> — no server involvement.</li>
    <li>On switch or reset, the page fully reloads so all stores and the Supabase client re-initialise cleanly.</li>
    <li>Other browsers / users are unaffected.</li>
    <li>To revert, click <strong>Reset to Default</strong> — the production config baked into the build is restored.</li>
    <li>The override database must allow connections from this origin (check Supabase CORS / allowed URLs).</li>
  </ul>
</div>
