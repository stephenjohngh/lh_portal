<!-- src/routes/parking/apply/status/+page.svelte -->
<!-- Where a public parking application has got to (2026-10-17): the reference
     and code given when it was sent, and the step's public name back — set in
     Admin → Workflows. Nothing about the applicant is shown. No login. -->
<script>
  import { LOGO as lhLogo, LOGO_ALT } from '#lib/branding.js';
  import { fmtDate } from '#lib/utils/dates.js';

  let reference = '';
  let code = '';
  let checking = false;
  let error = '';
  /** @type {null | { reference: string, stage: string, finished: boolean, received: string, updated: string }} */
  let status = null;

  async function check() {
    error = ''; status = null;
    if (!reference.trim() || !code.trim()) { error = 'Enter both your reference and your code.'; return; }
    checking = true;
    try {
      const r = await fetch('/api/parking/apply/status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, code }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { error = body.error ?? 'That could not be checked.'; return; }
      status = body;
    } catch {
      error = 'That could not be checked. Please check your connection and try again.';
    } finally { checking = false; }
  }

  const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 uppercase';
</script>

<svelte:head>
  <title>Your parking application</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-slate-50 text-slate-900">
  <header class="bg-slate-900 px-4 py-3"><img src={lhLogo} alt={LOGO_ALT} class="h-9 w-auto" /></header>
  <main class="max-w-md mx-auto px-4 py-6 space-y-4">
    <h1 class="text-2xl font-semibold">Your parking application</h1>
    <form class="space-y-3" on:submit|preventDefault={check}>
      <label class="block"><span class="font-medium">Reference</span>
        <input class={field} bind:value={reference} placeholder="PKR-2026-000012" autocomplete="off" /></label>
      <label class="block"><span class="font-medium">Code</span>
        <input class={field} bind:value={code} placeholder="R7P-QK2" autocomplete="off" /></label>
      {#if error}<p class="rounded-lg bg-red-50 border border-red-200 p-3 text-red-800" role="alert">{error}</p>{/if}
      <button type="submit" disabled={checking}
        class="w-full min-h-[48px] rounded-lg bg-teal-700 text-white font-semibold disabled:opacity-50">{checking ? 'Checking…' : 'Check'}</button>
    </form>

    {#if status}
      <div class="rounded-xl bg-white border border-slate-200 p-4 space-y-1" data-testid="apply-status">
        <p class="font-mono text-slate-600">{status.reference}</p>
        <p class="text-xl font-semibold">{status.stage}</p>
        <p class="text-sm text-slate-600">Received {fmtDate(status.received)}{status.updated !== status.received ? ` · last changed ${fmtDate(status.updated)}` : ''}</p>
      </div>
    {/if}
    <p class="text-sm text-slate-600"><a class="underline text-teal-700" href="/parking/apply">Apply for a parking space</a></p>
  </main>
</div>
