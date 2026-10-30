<!-- src/routes/status/+page.svelte -->
<!-- Where something has got to (migration 261): any process an administrator
     has switched on in Admin → Workflows. The reference and code someone was
     given, and back the step's public name, the process and two dates.
     Nothing about the person. No login. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import PublicShell from '#lib/components/public/PublicShell.svelte';
  import { fmtDate } from '#lib/utils/dates.js';

  /** @type {{ intro: string }} */
  export let data;

  let reference = '';
  let code = '';
  let checking = false;
  let error = '';
  /** @type {null | { reference: string, process: string, stage: string, finished: boolean, received: string, updated: string }} */
  let status = null;

  async function check() {
    error = ''; status = null;
    if (!reference.trim() || !code.trim()) { error = 'Enter both your reference and your code.'; return; }
    checking = true;
    try {
      const r = await fetch('/api/status', {
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
  <title>Where has it got to?</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PublicShell width="sm">
    <h1 class="text-2xl font-semibold">Where has it got to?</h1>
    {#if data.intro}<p class="text-slate-700" data-testid="status-intro">{data.intro}</p>{/if}
    <form class="space-y-3" on:submit|preventDefault={check}>
      <label class="block"><span class="font-medium">Reference</span>
        <input class={field} bind:value={reference} placeholder="CMP-2026-000012" autocomplete="off" /></label>
      <label class="block"><span class="font-medium">Code</span>
        <input class={field} bind:value={code} placeholder="R7P-QK2" autocomplete="off" /></label>
      {#if error}<p class="rounded-lg bg-red-50 border border-red-200 p-3 text-red-800" role="alert">{error}</p>{/if}
      <Button variant="public" size="large" type="submit" fullWidth disabled={checking}>{checking ? 'Checking…' : 'Check'}</Button>
    </form>

    {#if status}
      <div class="rounded-xl bg-white border border-slate-200 p-4 space-y-1" data-testid="public-status">
        <p class="font-mono text-slate-600">{status.reference}</p>
        <p class="text-sm text-slate-600">{status.process}</p>
        <p class="text-xl font-semibold">{status.stage}</p>
        <p class="text-sm text-slate-600">Received {fmtDate(status.received)}{status.updated !== status.received ? ` · last changed ${fmtDate(status.updated)}` : ''}</p>
      </div>
    {/if}
</PublicShell>
