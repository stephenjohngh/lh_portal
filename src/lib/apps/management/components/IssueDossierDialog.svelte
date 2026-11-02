<!-- src/lib/apps/management/components/IssueDossierDialog.svelte -->
<!-- "Create dossier from this issue": copies EVERYTHING on the issue into a new, private
     Dossier pack (see utils/issueDossierPlan.js). Nothing is published and the app does
     not switch — the person is told what was made and finds it in Dossier. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal from '#lib/components/common/Modal.svelte';
  import Button from '#lib/components/common/Button.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import { permissions } from '#lib/stores/permissions';
  import { hasAppAccess } from '#lib/utils/appAccess.js';
  import { listDocuments } from '#lib/utils/documentApi.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { logAudit } from '#lib/utils/auditLogger.js';
  import { issueToPlan } from '../utils/issueDossierPlan.js';
  import { makePackFromPlan } from '../utils/makeDossier.js';

  export let show = false;
  /** The issue, with its activities and actions. */
  export let issue;

  const dispatch = createEventDispatcher();

  let documents = [];
  let loading = false;
  let busy = false;
  let error = '';
  /** @type {null | { title: string, counts: any, skipped: { name: string, reason: string }[] }} */
  let result = null;
  let openedFor = null;

  $: canMake = hasAppAccess($permissions, 'dossier');

  // Read the issue's documents when the dialog opens (primitive id guard).
  $: if (show && issue?.id && openedFor !== issue.id) {
    openedFor = issue.id;
    result = null; error = '';
    load(issue.id);
  }
  $: if (!show) openedFor = null;

  async function load(issueId) {
    loading = true;
    try { documents = await listDocuments({ entity_type: 'issue', entity_id: issueId }); }
    catch (err) { documents = []; error = `The issue's documents could not be read: ${errMessage(err)}`; }
    finally { loading = false; }
  }

  $: counts = {
    activities: (issue?.activities ?? []).length,
    actions: (issue?.actions ?? []).length,
    documents: documents.length,
  };

  async function create() {
    busy = true; error = '';
    const issueId = issue.id;
    try {
      const plan = issueToPlan({ issue, documents });
      const made = await makePackFromPlan(plan);
      result = { title: made.pack.title, counts: made.counts, skipped: made.skipped };
      logAudit('create', 'issue', issueId, issue.name, {
        appId: 'issues', eventCategory: 'issues', severity: 'info',
        afterData: { dossier_pack_created: made.pack.id },
      });
    } catch (err) {
      error = errMessage(err);
    } finally {
      busy = false;
    }
  }

  function close() { show = false; dispatch('close'); }
</script>

<Modal {show} title="Create dossier from this issue" size="medium" on:close={close}>
  {#if result}
    <div class="space-y-3" data-testid="dossier-made">
      <p class="text-slate-200">Made a new private pack, <strong>{result.title}</strong>.</p>
      <p class="text-sm text-slate-400">
        {result.counts.pages} pages · {result.counts.files} files · {result.counts.tables} tables ({result.counts.rows} entries).
        Open the Dossier app to find it, check every page, and edit it. Nothing has been published.
      </p>
      {#if result.skipped.length}
        <div class="rounded border border-amber-700/50 bg-amber-900/20 p-2 text-sm text-amber-200" data-testid="dossier-skipped">
          <p class="font-medium">These files could not be copied:</p>
          <ul class="list-disc pl-5">{#each result.skipped as s}<li>{s.name} — {s.reason}</li>{/each}</ul>
        </div>
      {/if}
      <div class="flex justify-end"><Button variant="primary" on:click={close}>Close</Button></div>
    </div>
  {:else}
    <div class="space-y-3">
      <p class="text-sm text-slate-300">
        This copies <strong>everything</strong> on the issue into a new pack in the Dossier app:
        the description, all {counts.activities} activity entries (of every type, internal notes and
        historic entries too), all {counts.actions} actions and all {counts.documents} documents.
      </p>
      <p class="text-sm text-amber-200" data-testid="dossier-caution">
        The pack is private to you and nothing is published. Before you publish any of it, check every
        page: the issue may contain personal details, internal discussion or advice that is not meant to leave the building.
      </p>
      {#if !canMake}
        <p class="text-sm text-slate-400">You do not have access to the Dossier app, so you cannot make a pack. Ask an administrator.</p>
      {/if}
      <ErrorDisplay message={error} />
      <div class="flex justify-end gap-2">
        <Button variant="secondary" on:click={close}>Cancel</Button>
        <Button variant="primary" disabled={!canMake || busy || loading} on:click={create}>
          {busy ? 'Making the pack…' : 'Create dossier'}
        </Button>
      </div>
    </div>
  {/if}
</Modal>
