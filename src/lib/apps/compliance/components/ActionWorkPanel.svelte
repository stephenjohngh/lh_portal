<!-- src/lib/apps/compliance/components/ActionWorkPanel.svelte -->
<!-- One outstanding action, worked (W3, migrations 255–256): who owns it, who
     the technical authority is, when it is due — and its workflow, through the
     shared item controls: where it stands, who it is with, the moves, the
     history and the printable record.

     ⛔ Owner and technical authority are WORDS, not portal users: they name a
     role or a party (the duty holder, a fire engineer, the managing agent),
     often outside the portal. Who it is WITH is the portal user working it.
     ⭐ Saving the three does not mark the action as edited here, so a release's
     correction to its wording still reaches it. -->
<script>
  import FormInput from '#lib/components/common/FormInput.svelte';
  import Button from '#lib/components/common/Button.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import WorkflowItemControls from '#lib/workflow/WorkflowItemControls.svelte';
  import { fmtDateOnly, today } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { ACTION_CATEGORY_LABEL } from '#lib/utils/registerKinds.js';
  import { citableRef } from '../utils/registerItemView.js';

  /** The action (a register entry). @type {any} */ export let action;
  /** Its register row's id. @type {string|null} */ export let rowId = null;
  /** The actions' workflow (complianceActionsStore's state). @type {any} */ export let wf;
  export let isAdmin = false;
  /** @type {string|null} */ export let me = null;
  /** @type {Record<string, string>} */ export let nameById = {};
  /** @type {(action: any, itemId: string, to: string, note: string) => Promise<any>} */ export let onMove;
  /** @type {(itemId: string, userId: string|null) => Promise<any>} */ export let onAssign;
  /** @type {(action: any, details: any) => Promise<any>} */ export let onSaveDetails;

  $: ref = citableRef(action) ?? action.name;
  $: item = rowId ? (wf?.items ?? []).find((/** @type {any} */ i) => i.subject_id === rowId) ?? null : null;

  // The draft is keyed on the action's key — a primitive — so a parent re-read
  // never wipes what is being typed.
  let draftFor = null;
  let owner = ''; let authority = ''; let due = '';
  $: if (action?.key !== draftFor) {
    draftFor = action?.key ?? null;
    owner = action?.owner ?? ''; authority = action?.technicalAuthority ?? ''; due = action?.dueDate ?? '';
  }
  $: changed = (owner.trim() !== (action?.owner ?? '')) || (authority.trim() !== (action?.technicalAuthority ?? ''))
    || (due !== (action?.dueDate ?? ''));

  // A reactive declaration, so the controls see a NEW function when `changed`
  // flips — an inline arrow in the markup is not re-passed (as ComplaintDetail).
  $: extraRefusal = () => (changed ? 'Save the owner and due date first.' : null);

  let saving = false;
  let error = '';
  let done = '';

  async function save() {
    const a = action;
    saving = true; error = ''; done = '';
    try {
      const r = await onSaveDetails(a, { owner: owner.trim(), technicalAuthority: authority.trim(), dueDate: due || null });
      done = r?.changed ? 'Saved.' : 'Nothing had changed.';
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'Could not save.');
    } finally { saving = false; }
  }

  $: audit = { appId: 'compliance', entityType: 'compliance_action', entityId: action.key };
  $: record = {
    filenameStem: `${(citableRef(action) ?? action.key)}_${today()}`,
    subject: () => ({
      title: `Compliance action ${ref}`,
      facts: [['Reference', citableRef(action) ?? '—'], ['Who must act', ACTION_CATEGORY_LABEL[action.category] ?? action.category ?? ''],
        ['Owner', action.owner || 'NOT ASSIGNED'], ['Technical authority', action.technicalAuthority || 'NOT ASSIGNED'],
        ['Due', action.dueDate ? fmtDateOnly(action.dueDate) : 'NOT ASSIGNED']],
      sections: [{ heading: 'What must be decided or done', text: action.name },
        { heading: 'Description', text: action.description }, { heading: 'If it is not', text: action.consequence },
        { heading: 'Unblocks', text: action.unblocks }],
    }),
  };
</script>

<div class="space-y-3 mt-3" data-testid="action-work">
  {#if isAdmin}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
      <FormInput label="Owner" bind:value={owner} placeholder="Who answers for it — a role or a party" />
      <FormInput label="Technical authority" bind:value={authority} placeholder="Who can settle it technically" />
      <FormInput label="Due" type="date" bind:value={due} />
    </div>
    <div class="flex items-center gap-2">
      <Button variant="secondary" size="small" disabled={!changed || saving} on:click={save}>
        {saving ? 'Saving…' : 'Save owner and due date'}
      </Button>
      {#if done}<span class="text-xs text-slate-400">{done}</span>{/if}
    </div>
    {#if error}<ErrorDisplay message={error} onDismiss={() => (error = '')} />{/if}
  {/if}

  {#if !wf?.workflow}
    <p class="text-xs text-slate-500">This action is not in its workflow yet — an administrator opening the actions sets it up.</p>
  {:else if !item}
    <p class="text-xs text-amber-300">This action is not in its workflow. Reload the page; if it stays like this, report it.</p>
  {:else}
    <WorkflowItemControls {item} workflow={wf.workflow} steps={wf.steps} moves={wf.moves} fields={wf.fields}
      reference={ref} {isAdmin} canEdit={isAdmin} {me} assignees={wf.assignees} {nameById}
      onMove={(m, note) => onMove(action, item.id, m.to_key, note)}
      onAssign={(uid) => onAssign(item.id, uid)}
      {extraRefusal}
      {audit} {record}
      finishedText="Closed. Reopen it if it turns out not to be settled." />
  {/if}
</div>
