<!-- src/lib/apps/admin/components/PoliciesPanel.svelte -->
<!-- Admin → Other Config → Policies: the portal's policy numbers — sign-in
     lockout, rate limits, the public MOR form, Parking offers, Dossier
     versions, Golden Thread review and risk bands.

     They used to be numbers in the code; they are an admin's to set (user,
     2026-10-03). Declared once, with their defaults and bounds, in
     #lib/utils/policies.js; this screen only edits them. Only the values that
     DIFFER from the default are saved (portal_settings, key `policies`), so one
     set back to its default follows the default again — the Due windows pattern.
     ⚠ Bounds keep each control a control: a lockout cannot be set to 0. -->
<script>
  import { onMount } from 'svelte';
  import { portalSettings } from '#lib/stores/portalSettings.js';
  import { policyInfo, validatePolicies, cleanPolicies } from '#lib/utils/policies.js';
  import { logAudit } from '#lib/utils/auditLogger.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { getLogger } from '#lib/utils/logger.js';
  import Button from '#lib/components/common/Button.svelte';
  import ProtectedButton from '#lib/components/common/ProtectedButton.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';

  const logger = getLogger('PoliciesPanel');
  const POLICIES = policyInfo();
  const AREAS = [...new Set(POLICIES.map((p) => p.area))];

  /** @type {Record<string, any>|null} */
  let draft = null;
  let saving = false;
  let saved  = false;
  let error  = '';

  // Read afresh on opening; fill the form once, never on a later store update.
  let refreshed = false;
  onMount(async () => { await portalSettings.load(); refreshed = true; });
  $: if (draft === null && refreshed) resetDraft();

  function resetDraft() {
    draft = { ...$portalSettings.policiesInForce };
    saved = false;
    error = '';
  }

  const numeric = (/** @type {Record<string, any>} */ d) =>
    Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === '' || v == null ? v : Number(v)]));

  $: problems = draft ? validatePolicies(numeric(draft)) : {};
  $: storedNow = $portalSettings.policies ?? {};
  $: wouldStore = draft && Object.keys(problems).length === 0 ? cleanPolicies(numeric(draft)) : null;
  $: dirty = !!draft && (Object.keys(problems).length > 0 || JSON.stringify(sortKeys(wouldStore ?? {})) !== JSON.stringify(sortKeys(storedNow)));
  $: changedCount = Object.keys(storedNow).length;

  /** @param {Record<string, number>} o */
  function sortKeys(o) { return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))); }

  function useDefault(/** @type {string} */ key, /** @type {number} */ value) {
    draft = { ...draft, [key]: value };
    saved = false;
  }

  async function handleSave() {
    if (!draft || Object.keys(problems).length > 0) return;
    const before = { ...storedNow };
    saving = true; saved = false; error = '';
    try {
      const after = await portalSettings.savePolicies(numeric(draft));
      logAudit('update', 'portal_setting', 'policies', 'Policies', {
        appId: 'admin', eventCategory: 'system', severity: 'warning',
        beforeData: { policies: before }, afterData: { policies: after },
      });
      draft = { ...$portalSettings.policiesInForce };
      saved = true;
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'Could not save the policies');
      logger('❌ Save failed:', err);
    } finally {
      saving = false;
    }
  }
</script>

<div class="bg-slate-800 rounded-xl border border-slate-700 p-6">
  <div class="mb-5">
    <h3 class="text-base font-semibold text-slate-100">Policies</h3>
    <p class="text-sm text-slate-400 mt-1">
      The numbers the portal works to. Each has a default it ships with and a range it
      can be set within. A change applies to each screen the next time it is opened, and
      to sign-in, rate limits and the public forms within a minute.
    </p>
  </div>

  {#if draft === null}
    <p class="text-sm text-slate-500 italic animate-pulse">Loading…</p>
  {:else}
    {#each AREAS as area (area)}
      <h4 class="text-sm font-semibold text-slate-300 mt-5 mb-1">{area}</h4>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <tbody>
            {#each POLICIES.filter((p) => p.area === area) as p (p.key)}
              {@const bad = problems[p.key]}
              {@const offDefault = !bad && Number(draft[p.key]) !== p.default}
              <tr class="border-b border-slate-700/60 align-top" data-testid="policy-{p.key}">
                <td class="py-3 pr-3">
                  <p class="text-slate-200">{p.label}</p>
                  <p class="text-xs text-slate-500 mt-0.5">{p.governs}</p>
                </td>
                <td class="py-3 pr-3 w-44">
                  <div class="flex items-center gap-2">
                    <input
                      type="number" min={p.min} max={p.max} step="1"
                      aria-label={p.label}
                      bind:value={draft[p.key]}
                      on:input={() => { saved = false; }}
                      class="w-20 bg-slate-900 border rounded px-2 py-1 text-slate-100
                             {bad ? 'border-red-500' : offDefault ? 'border-amber-500/70' : 'border-slate-600'}"
                    />
                    <span class="text-xs text-slate-500">{p.unit}</span>
                  </div>
                  {#if bad}<p class="text-xs text-red-400 mt-1">{bad}</p>{/if}
                </td>
                <td class="py-3 pr-3 w-40 text-slate-400 whitespace-nowrap">
                  Default {p.default}
                  {#if offDefault}
                    <button type="button" class="ml-2 text-xs text-purple-400 hover:text-purple-300 underline"
                            on:click={() => useDefault(p.key, p.default)}>Use default</button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/each}

    {#if error}<ErrorDisplay message={error} className="mt-3" />{/if}

    <div class="flex items-center justify-between gap-4 flex-wrap pt-4 mt-4 border-t border-slate-700">
      <p class="text-sm text-slate-400">
        {#if changedCount === 0}
          Every policy is on its default.
        {:else}
          <span class="text-slate-200 font-medium">{changedCount}</span> of {POLICIES.length} changed from the default.
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
