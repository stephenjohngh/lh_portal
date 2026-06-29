<!-- src/lib/apps/golden_thread/components/GtPeople.svelte -->
<!--
  Golden Thread author/reviewer registry (gt_persons). A minimal add + list UI so
  documents can record who authored / reviewed them. Editor-gated. (Competence
  gating is a later phase; this is just the name registry.)
-->
<script>
  import { gtStore } from '$lib/apps/golden_thread/stores/gtStore';
  import { PERSON_ROLES } from '$lib/apps/golden_thread/utils/gtConstants.js';
  import FormInput  from '$lib/components/common/FormInput.svelte';
  import FormSelect from '$lib/components/common/FormSelect.svelte';
  import Button     from '$lib/components/common/Button.svelte';
  import Badge      from '$lib/components/common/Badge.svelte';

  export let saving = false;

  $: persons = $gtStore.persons;

  let full_name = '';
  let organisation = '';
  let role = 'author';
  let formError = '';

  const roleOptions = PERSON_ROLES.map((r) => ({ value: r, label: r }));
  const ROLE_BADGE = { author: 'bg-blue-600', reviewer: 'bg-purple-600', both: 'bg-teal-600' };

  async function add() {
    formError = '';
    if (!full_name.trim()) return (formError = 'Name is required.');
    const r = await gtStore.addPerson({
      full_name: full_name.trim(),
      organisation: organisation.trim() || null,
      role
    });
    if (r.success) {
      full_name = ''; organisation = ''; role = 'author';
    } else {
      formError = r.error ?? 'Failed to add person.';
    }
  }
</script>

<div class="space-y-5 max-w-2xl">
  <form class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" on:submit|preventDefault={add}>
    <FormInput label="Full name" bind:value={full_name} required />
    <FormInput label="Organisation" bind:value={organisation} placeholder="optional" />
    <FormSelect label="Role" bind:value={role} options={roleOptions} />
    <div class="sm:col-span-3">
      <Button type="submit" variant="primary" loading={saving} disabled={saving}>Add person</Button>
      {#if formError}<span class="text-sm text-red-400 ml-3">{formError}</span>{/if}
    </div>
  </form>

  {#if persons.length === 0}
    <p class="text-sm text-slate-400">No people in the registry yet.</p>
  {:else}
    <ul class="divide-y divide-slate-700 rounded-lg border border-slate-700">
      {#each persons as p (p.id)}
        <li class="flex items-center justify-between px-3 py-2">
          <div>
            <p class="text-sm text-white">{p.full_name}</p>
            {#if p.organisation}<p class="text-xs text-slate-500">{p.organisation}</p>{/if}
          </div>
          <Badge color={ROLE_BADGE[p.role] ?? 'bg-slate-500'}>{p.role}</Badge>
        </li>
      {/each}
    </ul>
  {/if}
</div>
