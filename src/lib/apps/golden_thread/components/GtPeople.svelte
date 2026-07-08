<!-- src/lib/apps/golden_thread/components/GtPeople.svelte -->
<!--
  Golden Thread author/reviewer registry (gt_persons) + competence (Stage E).
  Records who may author/review and what they are competent for, so ingest can
  soft-warn on an under-competent reviewer. Editor-gated.
-->
<script>
  import { gtStore } from '$lib/apps/golden_thread/stores/gtStore';
  import { PERSON_ROLES } from '$lib/apps/golden_thread/utils/gtConstants.js';
  import { COMPETENCIES, COMPETENCE_LABELS, competenceExpired } from '$lib/apps/golden_thread/utils/gtCompetence.js';
  import FormInput  from '$lib/components/common/FormInput.svelte';
  import FormSelect from '$lib/components/common/FormSelect.svelte';
  import Button     from '$lib/components/common/Button.svelte';
  import Badge      from '$lib/components/common/Badge.svelte';
  import Modal      from '$lib/components/common/Modal.svelte';

  export let saving = false;

  $: persons = $gtStore.persons;

  let full_name = '';
  let organisation = '';
  let role = 'author';
  let newComp = new Set();
  let newExpiry = '';
  let formError = '';

  const roleOptions = PERSON_ROLES.map((r) => ({ value: r, label: r }));
  const ROLE_BADGE = { author: 'bg-blue-600', reviewer: 'bg-purple-600', both: 'bg-teal-600' };

  function toggle(set, v) { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); return n; }

  async function add() {
    formError = '';
    if (!full_name.trim()) return (formError = 'Name is required.');
    const r = await gtStore.addPerson({
      full_name: full_name.trim(),
      organisation: organisation.trim() || null,
      role,
      competencies: [...newComp],
      competence_expiry: newExpiry || null,
    });
    if (r.success) { full_name = ''; organisation = ''; role = 'author'; newComp = new Set(); newExpiry = ''; }
    else formError = r.error ?? 'Failed to add person.';
  }

  // -- Edit competencies ------------------------------------------------------
  /** @type {any|null} */
  let editing = null;
  let editComp = new Set();
  let editExpiry = '';
  function openEdit(p) { editing = p; editComp = new Set(p.competencies ?? []); editExpiry = p.competence_expiry ?? ''; }
  async function saveEdit() {
    const r = await gtStore.editPerson(editing.id, { competencies: [...editComp], competence_expiry: editExpiry || null });
    if (r.success) editing = null;
  }
</script>

<div class="space-y-5 max-w-3xl">
  <form class="space-y-3" on:submit|preventDefault={add}>
    <div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <FormInput label="Full name" bind:value={full_name} required />
      <FormInput label="Organisation" bind:value={organisation} placeholder="optional" />
      <FormSelect label="Role" bind:value={role} options={roleOptions} />
    </div>
    <div>
      <p class="text-xs text-slate-400 mb-1">Competencies</p>
      <div class="flex flex-wrap gap-1.5">
        {#each COMPETENCIES as c}
          <button type="button"
            class="text-xs px-2 py-0.5 rounded-full border {newComp.has(c) ? 'bg-purple-600/30 border-purple-500 text-purple-200' : 'border-slate-600 text-slate-400'}"
            on:click={() => newComp = toggle(newComp, c)}>{COMPETENCE_LABELS[c]}</button>
        {/each}
      </div>
    </div>
    <div class="grid gap-3 sm:grid-cols-[12rem_auto] sm:items-end">
      <FormInput label="Competence expiry (optional)" type="date" bind:value={newExpiry} />
      <Button type="submit" variant="primary" loading={saving} disabled={saving}>Add person</Button>
    </div>
    {#if formError}<span class="text-sm text-red-400">{formError}</span>{/if}
  </form>

  {#if persons.length === 0}
    <p class="text-sm text-slate-400">No people in the registry yet.</p>
  {:else}
    <ul class="divide-y divide-slate-700 rounded-lg border border-slate-700">
      {#each persons as p (p.id)}
        <li class="px-3 py-2 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm text-white">{p.full_name}</span>
              <Badge color={ROLE_BADGE[p.role] ?? 'bg-slate-500'}>{p.role}</Badge>
              {#if p.organisation}<span class="text-xs text-slate-500">{p.organisation}</span>{/if}
            </div>
            {#if p.competencies?.length}
              <div class="flex flex-wrap gap-1 mt-1">
                {#each p.competencies as c}<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{COMPETENCE_LABELS[c] ?? c}</span>{/each}
                {#if competenceExpired(p)}<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-300">competence lapsed</span>{/if}
              </div>
            {:else}
              <p class="text-[11px] text-slate-600 mt-0.5">No competencies recorded</p>
            {/if}
          </div>
          <Button variant="secondary" size="small" on:click={() => openEdit(p)}>Competence</Button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if editing}
  <Modal show={true} title={`Competence — ${editing.full_name}`} size="small" on:close={() => (editing = null)}>
    <div class="space-y-4">
      <div>
        <p class="text-xs text-slate-400 mb-1">Competencies</p>
        <div class="flex flex-wrap gap-1.5">
          {#each COMPETENCIES as c}
            <button type="button"
              class="text-xs px-2 py-0.5 rounded-full border {editComp.has(c) ? 'bg-purple-600/30 border-purple-500 text-purple-200' : 'border-slate-600 text-slate-400'}"
              on:click={() => editComp = toggle(editComp, c)}>{COMPETENCE_LABELS[c]}</button>
          {/each}
        </div>
      </div>
      <FormInput label="Competence expiry (optional)" type="date" bind:value={editExpiry} />
      <div class="flex justify-end gap-2">
        <Button variant="secondary" on:click={() => (editing = null)}>Cancel</Button>
        <Button variant="primary" loading={saving} disabled={saving} on:click={saveEdit}>Save</Button>
      </div>
    </div>
  </Modal>
{/if}
