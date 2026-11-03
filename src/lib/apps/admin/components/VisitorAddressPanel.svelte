<!-- src/lib/apps/admin/components/VisitorAddressPanel.svelte -->
<!-- Admin → Limits and timing → Visitor address: the address this deployment
     thinks YOU have, where it came from, and the headers behind it.
     The sign-in lockout, the rate limits and the Dossier access log all key on
     it (#lib/server/clientAddress.js), so after moving host (Netlify ↔
     Northflank) this is the one screen to check: if it is not your own
     address, every visitor may look the same. Read only. -->
<script>
  import { onMount } from 'svelte';
  import Button from '#lib/components/common/Button.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';
  import { getJson } from '#lib/utils/request.js';
  import { errMessage } from '#lib/utils/errors.js';

  /** @type {any} */
  let seen = null;
  let ready = false;
  let error = '';

  const SOURCE = {
    netlify:    'Netlify’s own record of the visitor',
    platform:   'the server, told which header to trust (ADDRESS_HEADER)',
    forwarded:  'the last entry of X-Forwarded-For (added by the host’s proxy)',
    'real-ip':  'the X-Real-IP header',
    connection: 'the connection itself — a private address: on a host, its own proxy; on a dev server, this computer',
    unknown:    'nowhere — no address could be found',
  };
  const TONE = { ok: 'border-green-700 bg-green-900/30 text-green-200',
                 check: 'border-amber-600 bg-amber-900/30 text-amber-200',
                 problem: 'border-red-700 bg-red-900/30 text-red-200' };

  async function read() {
    error = '';
    try { seen = await getJson('/api/admin/client-address', 'Could not read the address.'); }
    catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read the address.'); }
    finally { ready = true; }
  }
  onMount(read);
</script>

<div class="max-w-3xl space-y-4">
  <div>
    <h2 class="text-lg font-semibold text-slate-100">Visitor address</h2>
    <p class="text-sm text-slate-400 mt-1">
      The sign-in lockout, the rate limits on the public pages and the Dossier access log tell visitors
      apart by their internet address. This shows the address this deployment sees for <em>you</em>.
      Check it after moving the portal to another host.
    </p>
  </div>

  {#if !ready}
    <LoadingSpinner text="Reading the address…" />
  {:else if error}
    <ErrorDisplay {error} />
  {:else if seen}
    <div class="rounded border px-4 py-3 {TONE[seen.verdict.level]}" data-testid="address-verdict">
      <p class="text-2xl font-mono">{seen.address}</p>
      <p class="text-sm mt-1">From {SOURCE[seen.source] ?? seen.source}.</p>
      <p class="text-sm mt-2">{seen.verdict.message}</p>
    </div>

    <p class="text-sm text-slate-300">
      Is that your own address? Compare it with what a site such as <em>whatismyip</em> shows from this
      same device and network. If it is not, every visitor may look like one person.
    </p>

    <details class="text-sm text-slate-300">
      <summary class="cursor-pointer text-slate-200">What the server received</summary>
      <table class="mt-2 text-xs font-mono">
        <tbody>
          <tr><td class="pr-4 py-0.5 text-slate-400">connection</td><td>{seen.connection ?? '—'}</td></tr>
          {#each Object.entries(seen.headers) as [name, value]}
            <tr><td class="pr-4 py-0.5 text-slate-400">{name}</td><td>{value ?? '—'}</td></tr>
          {/each}
          <tr><td class="pr-4 py-0.5 text-slate-400">ADDRESS_HEADER</td><td>{seen.hostSettings.ADDRESS_HEADER ?? 'not set'}</td></tr>
          <tr><td class="pr-4 py-0.5 text-slate-400">XFF_DEPTH</td><td>{seen.hostSettings.XFF_DEPTH ?? 'not set'}</td></tr>
        </tbody>
      </table>
    </details>

    <div class="text-sm text-slate-400 space-y-1">
      <p class="text-slate-300 font-medium">If it is wrong on Northflank</p>
      <p>Set two environment variables on the Northflank service and redeploy:
        <code>ADDRESS_HEADER=X-Forwarded-For</code> and <code>XFF_DEPTH=1</code>
        (one proxy in front; use 2 if another, such as Cloudflare, sits in front of Northflank).
        Then open this screen again: it should read your own address, from the server.</p>
      <p>On Netlify nothing needs setting.</p>
    </div>

    <Button variant="secondary" size="sm" on:click={read}>Check again</Button>
  {/if}
</div>
