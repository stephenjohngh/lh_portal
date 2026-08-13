<!-- src/lib/apps/dossier/components/PublishModal.svelte -->
<!-- Issuing a link — with the inclusion review that must come before it.

     There is no redaction in v1 (merge doc decision #4): the control against
     sending something that should not leave the building is the author's own
     diligence. The one thing the app owes them, then, is a complete and
     plainly-worded list of what this link will expose, BEFORE it is issued —
     not a summary, not a count, the actual pages, tables and files.

     Two steps: review → the link, shown once. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import { fmtSize }  from '../utils/assetPreview.js';
  import { EXPIRY_CHOICES } from '../utils/publicationState.js';
  import { publicationUrl } from '../utils/publicationToken.js';

  export let show = false;
  /** { pages, tables, files, missing, summary } from describeInclusion(). */
  export let review = null;
  export let packTitle = '';
  export let preparing = false;

  const dispatch = createEventDispatcher();

  let title      = '';
  let recipient  = '';
  let mode       = 'snapshot';
  let expiryDays = 30;
  let passphrase = '';
  let publishing = false;
  let error      = '';

  /** Set once the link exists. The ONLY time the token is ever visible. */
  let issued = null;      // { token, publication }
  let copied = false;

  $: if (show && !title && packTitle) title = packTitle;

  // The parent reports back through these, like every other modal here.
  export function done(result) { issued = result; publishing = false; }
  export function fail(message) { error = message; publishing = false; }

  function reset() {
    title = ''; recipient = ''; mode = 'snapshot'; expiryDays = 30; passphrase = '';
    publishing = false; error = ''; issued = null; copied = false;
  }

  function close() { reset(); show = false; dispatch('close'); }

  function publish() {
    publishing = true; error = '';
    dispatch('publish', {
      title: title.trim(), recipientLabel: recipient.trim(), mode,
      expiryDays: expiryDays === '' ? null : Number(expiryDays),
      passphrase: passphrase.trim(),
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
      setTimeout(() => (copied = false), 3000);
    } catch {
      error = 'Could not copy automatically — select the link and copy it.';
    }
  }

  $: link = issued
    ? publicationUrl(typeof window !== 'undefined' ? window.location.origin : '', issued.token)
    : '';
</script>

<Modal bind:show title={issued ? 'The link' : 'Publish this pack'} size="xlarge"
       on:close={close}>
  {#if error}
    <div class="mb-3"><ErrorDisplay message={error} onDismiss={() => error = ''} /></div>
  {/if}

  {#if issued}
    <!-- ── Step 2: the link, shown once ────────────────────────────────── -->
    <div class="space-y-4">
      <div class="p-3 rounded border border-amber-500/40 bg-amber-500/10">
        <p class="text-sm text-amber-200 font-medium">Copy this link now.</p>
        <p class="text-xs text-amber-200/80 mt-1">
          It is not stored and cannot be shown again. If you lose it, use
          <span class="font-medium">Regenerate link</span> — which issues a new
          one and stops the old one working.
        </p>
      </div>

      <div class="flex gap-2">
        <input
          readonly
          value={link}
          aria-label="Publication link"
          class="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2
                 text-sm text-slate-200 font-mono"
          on:focus={(e) => e.currentTarget.select()}
        />
        <Button variant="primary" on:click={copyLink}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      <p class="text-xs text-slate-500">
        The portal does not send email. Send this link yourself, in a message
        the recipient already expects from you.
        {#if issued.publication?.passphrase_hash}
          <span class="text-slate-400">Send the passphrase separately</span> —
          in the same message it protects nothing.
        {/if}
      </p>
    </div>

  {:else}
    <!-- ── Step 1: what this link will expose ──────────────────────────── -->
    <div class="space-y-4">
      {#if preparing}
        <p class="text-sm text-slate-400 py-8 text-center">
          Working out what this link will contain…
        </p>
      {:else if review}
        <div>
          <p class="text-sm text-slate-300 font-medium">
            This link will give the recipient everything below — and nothing
            else in the portal.
          </p>
          <p class="text-xs text-slate-500 mt-1">{review.summary}</p>
        </div>

        {#if review.missing.length}
          <div class="p-3 rounded border border-amber-500/40 bg-amber-500/10">
            <p class="text-xs text-amber-200">
              {review.missing.length} reference{review.missing.length === 1 ? '' : 's'}
              in this pack point at a file that is no longer on the shelf. The
              recipient will see a gap where it should be.
            </p>
          </div>
        {/if}

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="border border-slate-700 rounded overflow-hidden">
            <p class="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-1.5">
              Pages ({review.pages.length})
            </p>
            <ul class="max-h-40 overflow-y-auto p-2 space-y-0.5">
              {#each review.pages as p (p.id)}
                <li class="text-xs text-slate-300 truncate">{p.title}</li>
              {:else}
                <li class="text-xs text-slate-600">None</li>
              {/each}
            </ul>
          </div>

          <div class="border border-slate-700 rounded overflow-hidden">
            <p class="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-1.5">
              Tables ({review.tables.length})
            </p>
            <ul class="max-h-40 overflow-y-auto p-2 space-y-0.5">
              {#each review.tables as t (t.id)}
                <li class="text-xs text-slate-300 truncate">
                  {t.title} <span class="text-slate-500">· {t.records} entries</span>
                </li>
              {:else}
                <li class="text-xs text-slate-600">None</li>
              {/each}
            </ul>
          </div>

          <div class="border border-slate-700 rounded overflow-hidden">
            <p class="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-1.5">
              Files ({review.files.length})
            </p>
            <ul class="max-h-40 overflow-y-auto p-2 space-y-0.5">
              {#each review.files as f (f.document_id)}
                <li class="text-xs text-slate-300 truncate">
                  {f.filename}
                  <span class="text-slate-500">{fmtSize(f.size)}</span>
                </li>
              {:else}
                <li class="text-xs text-slate-600">None</li>
              {/each}
            </ul>
          </div>
        </div>

        <p class="text-xs text-slate-500">
          Only files a page or a table actually refers to are included. Anything
          else on the shelf stays out of reach of this link.
        </p>

        <div class="border-t border-slate-700 pt-4 space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormInput label="Title the recipient sees" bind:value={title} />
            <FormInput label="Who is this for? (your own note)" bind:value={recipient}
                       placeholder="e.g. Smith &amp; Co, solicitors" />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormSelect label="Expires" bind:value={expiryDays}>
              {#each EXPIRY_CHOICES as choice (choice.label)}
                <option value={choice.days ?? ''}>{choice.label}</option>
              {/each}
            </FormSelect>

            <FormSelect label="Content" bind:value={mode}>
              <option value="snapshot">Frozen as it is now</option>
              <option value="latest">Always the latest version</option>
            </FormSelect>
          </div>

          <FormInput
            label="Passphrase (optional)"
            type="password"
            bind:value={passphrase}
            placeholder="Leave blank for link-only access"
          />
          <p class="text-xs text-slate-500 -mt-1">
            A second factor for anything sensitive. Send it to the recipient
            <span class="text-slate-400">separately</span> — by phone, or in a
            different message — or it protects nothing. Like the link, it is
            stored hashed and cannot be shown again.
          </p>

          {#if mode === 'latest'}
            <p class="text-xs text-amber-300/90">
              The recipient will see your edits as you make them, including ones
              you have not finished. Frozen is the safer choice for anything
              going to a solicitor or a regulator.
            </p>
          {/if}
        </div>
      {/if}
    </div>

  {/if}

  <div slot="footer" class="flex justify-end gap-2">
    {#if issued}
      <Button variant="secondary" on:click={close}>Done</Button>
    {:else}
      <Button variant="secondary" disabled={publishing} on:click={close}>Cancel</Button>
      <Button variant="primary" disabled={!review || publishing || preparing}
              on:click={publish}>
        {publishing ? 'Preparing files…' : 'Publish and get the link'}
      </Button>
    {/if}
  </div>
</Modal>
