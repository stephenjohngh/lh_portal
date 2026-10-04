<!-- src/lib/apps/admin/components/DocumentCategoriesPanel.svelte -->
<!-- Admin → Other Config → Document categories: what a document IS to this
     building (an EICR, a fire risk assessment…), offered when one is uploaded.

     An admin setting since 2026-10-04 (#lib/utils/documentCategories.js). The
     shipped list is the start; a category can be renamed, added or RETIRED.
     ⛔ Never deleted: documents store the category's value, so a deleted one
     would leave them labelled with a code. A retired one is not offered any
     more and still names the documents that carry it. -->
<script>
  import { onMount } from 'svelte';
  import { portalSettings } from '#lib/stores/portalSettings.js';
  import {
    documentCategories, shippedDocumentCategories, validateDocumentCategories, categoryValueFor,
  } from '#lib/utils/documentCategories.js';
  import { logAudit } from '#lib/utils/auditLogger.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { getLogger } from '#lib/utils/logger.js';
  import Button from '#lib/components/common/Button.svelte';
  import ProtectedButton from '#lib/components/common/ProtectedButton.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';

  const logger = getLogger('DocumentCategoriesPanel');
  const SHIPPED_LABEL = Object.fromEntries(shippedDocumentCategories().map((c) => [c.value, c.label]));

  /** @type {{ value: string, label: string, shipped: boolean, retired: boolean }[]|null} */
  let rows = null;
  let newLabel = '';
  let saving = false;
  let saved  = false;
  let error  = '';

  let refreshed = false;
  onMount(async () => { await portalSettings.load(); refreshed = true; });
  $: if (rows === null && refreshed) resetDraft();

  function resetDraft() {
    rows = documentCategories({ includeRetired: true }).map((c) => ({ ...c }));
    newLabel = ''; saved = false; error = '';
  }

  /** The rows as the changes that are stored. */
  function toChanges(/** @type {NonNullable<typeof rows>} */ list) {
    return {
      labels:  Object.fromEntries(list.filter((r) => r.shipped).map((r) => [r.value, r.label])),
      added:   list.filter((r) => !r.shipped).map((r) => ({ value: r.value, label: r.label })),
      retired: list.filter((r) => r.retired).map((r) => r.value),
    };
  }

  $: changes  = rows ? toChanges(rows) : null;
  $: problems = changes ? validateDocumentCategories(changes) : [];
  $: dirty = !!rows && JSON.stringify(toChanges(rows))
    !== JSON.stringify(toChanges(($portalSettings, documentCategories({ includeRetired: true }))));

  function addCategory() {
    const label = newLabel.replace(/\s+/g, ' ').trim();
    if (!label || !rows) return;
    const value = categoryValueFor(label);
    if (!value) { error = `“${label}” needs at least one letter or number.`; return; }
    if (rows.some((r) => r.value === value)) { error = `There is already a category for “${label}”.`; return; }
    rows = [...rows, { value, label, shipped: false, retired: false }];
    newLabel = ''; error = ''; saved = false;
  }

  async function handleSave() {
    if (!changes || problems.length) return;
    saving = true; saved = false; error = '';
    try {
      const after = await portalSettings.saveDocumentCategories(changes);
      logAudit('update', 'portal_setting', 'document_categories', 'Document categories', {
        appId: 'admin', eventCategory: 'system', severity: 'info', afterData: after,
      });
      resetDraft();
      saved = true;
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'Could not save the categories');
      logger('❌ Save failed:', err);
    } finally {
      saving = false;
    }
  }
</script>

<div class="bg-slate-800 rounded-xl border border-slate-700 p-6">
  <div class="mb-5">
    <h3 class="text-base font-semibold text-slate-100">Document categories</h3>
    <p class="text-sm text-slate-400 mt-1">
      What a document is to this building, chosen when it is uploaded. Rename a category,
      add your own, or retire one this building has no use for.
    </p>
    <p class="text-xs text-slate-500 mt-1">
      A retired category is no longer offered, and documents already in it keep it.
      Categories are never deleted, because documents store them.
    </p>
  </div>

  {#if rows === null}
    <p class="text-sm text-slate-500 italic animate-pulse">Loading…</p>
  {:else}
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-slate-500 border-b border-slate-700">
          <th class="py-2 pr-3 font-normal">Name</th>
          <th class="py-2 pr-3 font-normal w-40"></th>
          <th class="py-2 font-normal w-24">Retired</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.value)}
          <tr class="border-b border-slate-700/60" data-testid="category-{r.value}">
            <td class="py-2 pr-3">
              <input type="text" aria-label="Name of {r.label}" maxlength="60"
                     bind:value={r.label} on:input={() => { saved = false; }}
                     class="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-100
                            {r.retired ? 'opacity-50' : ''}" />
            </td>
            <td class="py-2 pr-3 text-xs text-slate-500">
              {#if !r.shipped}
                Added here
              {:else if r.label.trim() !== SHIPPED_LABEL[r.value]}
                <button type="button" class="text-purple-400 hover:text-purple-300 underline"
                        on:click={() => { r.label = SHIPPED_LABEL[r.value]; rows = rows; }}>
                  Use “{SHIPPED_LABEL[r.value]}”
                </button>
              {/if}
            </td>
            <td class="py-2">
              <input type="checkbox" aria-label="Retire {r.label}" bind:checked={r.retired}
                     on:change={() => { saved = false; }} />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    <form class="flex items-center gap-2 mt-4" on:submit|preventDefault={addCategory}>
      <input type="text" aria-label="New category name" placeholder="New category name" maxlength="60"
             bind:value={newLabel}
             class="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100" />
      <Button variant="secondary" type="submit" disabled={!newLabel.trim()}>Add</Button>
    </form>

    {#each problems as p}<p class="text-xs text-red-400 mt-2">{p}</p>{/each}
    {#if error}<ErrorDisplay message={error} className="mt-3" />{/if}

    <div class="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-slate-700">
      {#if saved && !dirty}<p class="text-sm text-green-400">✓ Saved</p>{/if}
      {#if dirty}<Button variant="secondary" on:click={resetDraft} disabled={saving}>Discard changes</Button>{/if}
      <ProtectedButton requireAdmin={true} variant="primary" on:click={handleSave}
                       disabled={saving || !dirty || problems.length > 0}>
        {saving ? 'Saving…' : 'Save changes'}
      </ProtectedButton>
    </div>
  {/if}
</div>
