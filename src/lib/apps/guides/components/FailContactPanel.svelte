<!-- src/lib/apps/guides/components/FailContactPanel.svelte -->
<!-- Who to call when a check fails (admins). Shown in an inspection walk under the
     "if this fails" guide, and in full on a walk whose planned obligation says a failure
     needs an IMMEDIATE response. One contact for the building; it is an administrator's
     setting, not code. Never put a personal mobile number here that you would not want on
     every caretaker's phone: this is readable by every signed-in user. -->
<script>
  import { onMount } from 'svelte';
  import Button from '#lib/components/common/Button.svelte';
  import FormInput from '#lib/components/common/FormInput.svelte';
  import FormTextarea from '#lib/components/common/FormTextarea.svelte';
  import { guidesStore } from '../stores/guidesStore.js';
  import { errMessage } from '#lib/utils/errors.js';

  let open = false;
  let c = { name: '', phone: '', hours: '', notes: '' };
  let loaded = false;
  let busy = false;
  let error = '';
  let notice = '';

  onMount(async () => {
    try { c = { ...c, ...((await guidesStore.getFailContact()) ?? {}) }; }
    catch (e) { error = errMessage(e); }
    finally { loaded = true; }
  });

  async function save() {
    busy = true; error = ''; notice = '';
    try { c = { ...c, ...(await guidesStore.saveFailContact(c)) }; notice = 'Saved.'; }
    catch (e) { error = errMessage(e); }
    finally { busy = false; }
  }
</script>

<section class="rounded-lg border border-slate-700 bg-slate-800/40 p-3 space-y-2" data-testid="fail-contact">
  <Button variant="tertiary" size="xs" on:click={() => (open = !open)}>{open ? '▾' : '▸'} Who to call when a check fails</Button>
  {#if open}
    <p class="text-xs text-slate-400">
      Shown in an inspection walk under the “if this fails” guide, and in full on a walk marked for an immediate response.
      Every signed-in person can read it.
    </p>
    {#if !loaded}
      <p class="text-sm text-slate-400">Loading…</p>
    {:else}
      <div class="grid gap-2 sm:grid-cols-2">
        <FormInput label="Who" bind:value={c.name} placeholder="e.g. The office / duty manager" maxlength={80} />
        <FormInput label="Telephone" bind:value={c.phone} placeholder="e.g. 020 7946 0000" maxlength={40} />
      </div>
      <FormInput label="When (hours)" bind:value={c.hours} placeholder="e.g. 8am–6pm; out of hours 07700 900000" maxlength={120} />
      <FormTextarea label="What to say or do first" rows={2} bind:value={c.notes} maxlength={300}
        placeholder="e.g. Say which floor and which light. If there is fire or smoke, call 999 first." />
      <Button disabled={busy} on:click={save}>Save</Button>
    {/if}
    {#if error}<p class="text-red-400 text-sm" role="alert">{error}</p>{/if}
    {#if notice}<p class="text-emerald-400 text-sm" role="status">{notice}</p>{/if}
  {/if}
</section>
