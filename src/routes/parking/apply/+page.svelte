<!-- src/routes/parking/apply/+page.svelte -->
<!-- The public application for a car park space (2026-10-17, migration 247).
     No login. It asks for what the portal keeps about a parking holder, plus
     the size of space wanted, and the privacy notice an admin set (Admin →
     Wording) must be agreed to; the text agreed to is kept with the
     application. On sending, the applicant gets a reference and a code for
     /parking/apply/status. The application then goes through the Parking
     application workflow (Parking → Applications). -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import PublicShell from '#lib/components/public/PublicShell.svelte';
  import { APPLICANT_KINDS, applicationSizes, applicationProblems } from '#lib/apps/parking/utils/applicationForm.js';

  export let data;

  const SIZES = applicationSizes();
  let f = { holder_type: '', display_name: '', company_name: '', email: '', phone: '',
            correspondence_address: '', wanted_size: '', notes: '', agreed: false, website: '' };
  let tried = false;
  let sending = false;
  let sendError = '';
  /** @type {Record<string, string>} */
  let serverFields = {};
  let sent = /** @type {null | { reference: string, code: string }} */ (null);

  $: problems = { ...applicationProblems(f), ...serverFields };
  $: show = (/** @type {string} */ k) => (tried ? problems[k] ?? '' : '');

  async function send() {
    tried = true; serverFields = {}; sendError = '';
    if (Object.keys(applicationProblems(f)).length) return;
    sending = true;
    try {
      const r = await fetch('/api/parking/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { serverFields = body.fields ?? {}; sendError = body.error ?? 'Your application could not be sent. Please try again.'; return; }
      sent = { reference: body.reference, code: body.code };
    } catch {
      sendError = 'Your application could not be sent. Please check your connection and try again.';
    } finally { sending = false; }
  }

  const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900';
</script>

<svelte:head>
  <title>Apply for a parking space</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PublicShell width="md">
    {#if sent}
      <div class="rounded-xl bg-white border border-slate-200 p-5 space-y-3 text-center" data-testid="apply-sent">
        <p class="text-3xl text-green-600">✓</p>
        <h1 class="text-xl font-semibold">We have your application</h1>
        <p class="text-sm text-slate-600">Your reference</p>
        <p class="font-mono text-2xl">{sent.reference}</p>
        <p class="text-sm text-slate-600">Your code</p>
        <p class="font-mono text-2xl tracking-widest">{sent.code}</p>
        <p class="text-sm text-slate-600">Keep <strong>both</strong>. You need them together to
          <a class="underline text-teal-700" href="/parking/apply/status">see where your application has got to</a>.</p>
      </div>
    {:else}
      <h1 class="text-2xl font-semibold">Apply for a parking space{data.buildingName ? ` at ${data.buildingName}` : ''}</h1>

      {#if !data.open}
        <p class="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900">
          {data.unavailable ? 'This page cannot be used just now. Please try again later.' : 'Applications are not open yet. Please try again later.'}</p>
      {:else}
        <p class="text-slate-600">Spaces are offered in the order applications are received. We will contact you about yours.</p>

        <form class="space-y-4" on:submit|preventDefault={send} novalidate>
          <fieldset>
            <legend class="font-medium">Which describes you?</legend>
            <div class="mt-2 space-y-2">
              {#each APPLICANT_KINDS as k}
                <label class="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 cursor-pointer">
                  <input type="radio" bind:group={f.holder_type} value={k.value} /> {k.label}
                </label>
              {/each}
            </div>
            {#if show('holder_type')}<p class="mt-1 text-sm text-red-600">{show('holder_type')}</p>{/if}
          </fieldset>

          <label class="block"><span class="font-medium">Your name</span>
            <input class={field} bind:value={f.display_name} autocomplete="name" />
            {#if show('display_name')}<span class="block mt-1 text-sm text-red-600">{show('display_name')}</span>{/if}</label>

          {#if f.holder_type === 'external_company'}
            <label class="block"><span class="font-medium">Company name</span>
              <input class={field} bind:value={f.company_name} autocomplete="organization" />
              {#if show('company_name')}<span class="block mt-1 text-sm text-red-600">{show('company_name')}</span>{/if}</label>
          {/if}

          <label class="block"><span class="font-medium">Email</span>
            <input class={field} type="email" bind:value={f.email} autocomplete="email" />
            {#if show('email')}<span class="block mt-1 text-sm text-red-600">{show('email')}</span>{/if}</label>

          <label class="block"><span class="font-medium">Phone</span> <span class="text-sm text-slate-500">(optional)</span>
            <input class={field} type="tel" bind:value={f.phone} autocomplete="tel" />
            {#if show('phone')}<span class="block mt-1 text-sm text-red-600">{show('phone')}</span>{/if}</label>

          <label class="block"><span class="font-medium">Address for letters</span> <span class="text-sm text-slate-500">(optional)</span>
            <textarea class={field} rows="3" bind:value={f.correspondence_address} autocomplete="street-address"></textarea>
            {#if show('correspondence_address')}<span class="block mt-1 text-sm text-red-600">{show('correspondence_address')}</span>{/if}</label>

          <label class="block"><span class="font-medium">Size of space you need</span>
            <select class={field} bind:value={f.wanted_size}>
              <option value="" disabled>Choose…</option>
              {#each SIZES as s}<option value={s.value}>{s.label}</option>{/each}
            </select>
            {#if show('wanted_size')}<span class="block mt-1 text-sm text-red-600">{show('wanted_size')}</span>{/if}</label>

          <label class="block"><span class="font-medium">Anything else we should know</span> <span class="text-sm text-slate-500">(optional)</span>
            <textarea class={field} rows="3" bind:value={f.notes}></textarea>
            {#if show('notes')}<span class="block mt-1 text-sm text-red-600">{show('notes')}</span>{/if}</label>

          <!-- Left empty by people; filled by bots. -->
          <div class="hidden" aria-hidden="true">
            <label>Website <input tabindex="-1" autocomplete="off" bind:value={f.website} /></label>
          </div>

          <div class="rounded-lg bg-white border border-slate-200 p-3 space-y-2">
            <p class="font-medium">Privacy notice</p>
            <p class="text-sm text-slate-700 whitespace-pre-line" data-testid="apply-privacy">{data.privacyNotice}</p>
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" class="mt-1" bind:checked={f.agreed} />
              <span>I have read this and agree to my details being used in this way.</span>
            </label>
            {#if show('agreed')}<p class="text-sm text-red-600">{show('agreed')}</p>{/if}
          </div>

          {#if sendError}<p class="rounded-lg bg-red-50 border border-red-200 p-3 text-red-800" role="alert">{sendError}</p>{/if}

          <Button variant="public" size="large" type="submit" fullWidth disabled={sending}>
            {sending ? 'Sending…' : 'Send application'}</Button>
          <p class="text-sm text-slate-600 text-center">Already applied? <a class="underline text-teal-700" href="/parking/apply/status">Check where it has got to</a>.</p>
        </form>
      {/if}
    {/if}
</PublicShell>
