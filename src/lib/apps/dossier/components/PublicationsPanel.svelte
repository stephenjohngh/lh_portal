<!-- src/lib/apps/dossier/components/PublicationsPanel.svelte -->
<!-- Every link ever issued for this pack, and its state.

     Revoke, never delete: the record that a link was issued to an outside party
     is the one thing worth keeping after the link stops working. (Delete exists
     at RLS, admin-only, for genuine mistakes.) -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { createEventDispatcher } from 'svelte';
  import Badge          from '#lib/components/common/Badge.svelte';
  import { permissions } from '#lib/stores/permissions.js';
  import ProtectedButton from '#lib/components/common/ProtectedButton.svelte';
  import { fmtDateTime } from '#lib/utils/dates.js';
  import { publicationUrl } from '../utils/publicationToken.js';
  import { describeAccess, EVENT_LABEL, EVENT_CONCERN } from '../utils/publicationAccess.js';
  import {
    publicationState, describePublication, STATE_LABEL, STATE_BADGE,
  } from '../utils/publicationState.js';

  export let publications = [];
  export let canEdit = true;
  /** id of the publication currently being revoked/regenerated. */
  export let busyId = null;
  /** { id, message } from the most recent file check. */
  export let verifyResult = null;
  export let verifyingId = null;
  /** publication id → figures from summariseAccess(). Missing = not loaded yet. */
  export let access = {};
  /** publication id → its recent events (newest first), once opened. */
  export let events = {};
  export let eventsLoadingId = null;

  const dispatch = createEventDispatcher();

  /** The link currently revealed, and whether it has just been copied. */
  let shownId = null;
  let copiedId = null;
  let copyError = '';
  let logOpenId = null;

  const origin = () => (typeof window !== 'undefined' ? window.location.origin : '');
  const linkOf = (p) => publicationUrl(origin(), p.token);

  function toggleLink(p) {
    shownId = shownId === p.id ? null : p.id;
    if (shownId) dispatch('linkShown', p);
  }

  async function copy(p) {
    copyError = '';
    try {
      await navigator.clipboard.writeText(linkOf(p));
      copiedId = p.id;
      dispatch('linkCopied', p);
      setTimeout(() => { if (copiedId === p.id) copiedId = null; }, 3000);
    } catch {
      copyError = 'Could not copy automatically — select the link and copy it.';
    }
  }

  function toggleLog(p) {
    logOpenId = logOpenId === p.id ? null : p.id;
    if (logOpenId) dispatch('loadEvents', p);
  }
</script>

<div class="space-y-2">
  {#if publications.length === 0}
    <p class="text-xs text-slate-500">
      No links have been published for this pack.
    </p>
  {:else}
    {#each publications as publication (publication.id)}
      {@const state = publicationState(publication)}
      <div class="p-2 rounded border border-slate-700/70 bg-slate-800/40 space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-500 shrink-0">v{publication.version}</span>
          <span class="text-xs text-slate-200 truncate flex-1">{publication.title}</span>
          <Badge color={STATE_BADGE[state]}>{STATE_LABEL[state]}</Badge>
        </div>

        <div class="text-[11px] text-slate-500 space-y-0.5">
          {#if publication.recipient_label}
            <p class="truncate">For {publication.recipient_label}</p>
          {/if}
          <p>
            <!-- The head of the token, so the author can match a link they hold
                 against the row here. The rest is not stored. -->
            <span class="font-mono">{publication.token_prefix}…</span>
            · {describePublication(publication)}
            {#if publication.mode === 'latest'}· follows the latest version{/if}
            {#if publication.manifest?.files?.some(f => f.pinned_file_id)}
              <!-- The recipient is served copies taken at publication, so
                   editing a source document cannot change what they see. -->
              · files pinned
            {/if}
          </p>
          <p>Issued {fmtDateTime(publication.created_at)}</p>
          <p data-testid="pub-expiry">
            {#if publication.expires_at}
              Expires {fmtDateTime(publication.expires_at)}
            {:else}
              No expiry date
            {/if}
          </p>
          <p>{publication.passphrase_hash ? 'Needs a passphrase' : 'No passphrase'}
            · {publication.mode === 'latest' ? 'Always shows the latest version' : 'A fixed copy, taken when published'}</p>
          {#if publication.revoked_at}<p class="text-red-400/80">Revoked {fmtDateTime(publication.revoked_at)}</p>{/if}
          {#if publication.manifest?.files?.length}<p>{publication.manifest.files.length} file{publication.manifest.files.length === 1 ? '' : 's'} included</p>{/if}
        </div>

        <!-- Who has used this link. Written by the public reader; the address is
             the caller's, as the host reported it. -->
        <p class="text-[11px] text-slate-400" data-testid="pub-access">
          {access[publication.id] ? describeAccess(access[publication.id], fmtDateTime) : 'Access not loaded'}
          {#if access[publication.id]?.files}· {access[publication.id].files} file{access[publication.id].files === 1 ? '' : 's'} taken{/if}
          {#if access[publication.id]?.failedUnlocks}<span class="text-amber-300/90">· {access[publication.id].failedUnlocks} wrong passphrase{access[publication.id].failedUnlocks === 1 ? '' : 's'}</span>{/if}
          {#if access[publication.id]?.refused}<span class="text-amber-300/90">· {access[publication.id].refused} attempt{access[publication.id].refused === 1 ? '' : 's'} after it stopped working</span>{/if}
        </p>

        {#if canEdit && state !== 'revoked'}
          {#if publication.token}
            <div class="flex gap-1.5 items-center pt-0.5">
              <Button variant="tertiary" size="xs" on:click={() => toggleLink(publication)}>
                {shownId === publication.id ? 'Hide link' : 'Show link'}
              </Button>
              <Button variant="tertiary" size="xs" on:click={() => copy(publication)}>
                {copiedId === publication.id ? 'Copied' : 'Copy link'}
              </Button>
            </div>
            {#if shownId === publication.id}
              <input readonly value={linkOf(publication)} aria-label="Publication link"
                     class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 font-mono"
                     on:focus={(e) => e.currentTarget.select()} />
            {/if}
            {#if copyError}<p class="text-[11px] text-amber-300/90">{copyError}</p>{/if}
          {:else}
            <p class="text-[11px] text-slate-500" data-testid="pub-link-not-kept">
              This link was issued before links were kept, so it cannot be shown.
              <span class="text-slate-400">Regenerate link</span> gives a new one that can.
            </p>
          {/if}
        {/if}

        {#if canEdit && state !== 'revoked'}
          <div class="flex gap-1.5 pt-0.5">
            <ProtectedButton requireAdmin={false} variant="secondary" size="small"
                             disabled={busyId === publication.id}
                             title="Issue a new link and stop the current one working"
                             on:click={() => dispatch('regenerate', publication)}>
              Regenerate link
            </ProtectedButton>
            <ProtectedButton requireAdmin={false} variant="danger" size="small"
                             disabled={busyId === publication.id}
                             title="Stop this link working, permanently"
                             on:click={() => dispatch('revoke', publication)}>
              Revoke
            </ProtectedButton>
          </div>
        {/if}

        {#if canEdit}
          <Button variant="tertiary" size="xs" on:click={() => toggleLog(publication)}>
            {logOpenId === publication.id ? 'Hide access log' : 'Access log'}
          </Button>
          <Button variant="tertiary" size="xs" disabled={verifyingId === publication.id} on:click={() => dispatch('verify', publication)}>{verifyingId === publication.id ? 'Checking files…' : 'Check files'}</Button>

          {#if $permissions.isAdmin}
            <!-- Admin only, matching the RLS policy. Revoke is the everyday
                 action and keeps the record that a link was issued; this
                 discards it, and takes the pinned copies of the files with it. -->
            <span class="ml-2"><Button admin size="xs" disabled={busyId === publication.id}
              on:click={() => dispatch('deletePublication', publication)}>Delete</Button></span>
          {/if}

          {#if logOpenId === publication.id}
            <div class="mt-1 max-h-48 overflow-y-auto rounded border border-slate-700/70 bg-slate-900/50" data-testid="pub-log">
              {#if eventsLoadingId === publication.id}
                <p class="text-[11px] text-slate-500 p-2">Loading…</p>
              {:else if !(events[publication.id]?.length)}
                <p class="text-[11px] text-slate-500 p-2">Nothing has been recorded for this link yet.</p>
              {:else}
                <ul class="divide-y divide-slate-800">
                  {#each events[publication.id] as ev (ev.id)}
                    <li class="px-2 py-1 text-[11px] {EVENT_CONCERN.has(ev.event) ? 'text-amber-300/90' : 'text-slate-400'}">
                      <span class="text-slate-500">{fmtDateTime(ev.created_at)}</span>
                      · {EVENT_LABEL[ev.event] ?? ev.event}{#if ev.filename}: {ev.filename}{/if}
                      · <span class="font-mono">{ev.ip ?? 'unknown address'}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}

          {#if verifyResult?.id === publication.id}
            <p class="text-[11px] text-slate-400">{verifyResult.message}</p>
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
</div>
