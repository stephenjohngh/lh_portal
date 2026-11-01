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

  const dispatch = createEventDispatcher();
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
          <Button variant="tertiary" size="xs" disabled={verifyingId === publication.id} on:click={() => dispatch('verify', publication)}>{verifyingId === publication.id ? 'Checking files…' : 'Check files'}</Button>

          {#if $permissions.isAdmin}
            <!-- Admin only, matching the RLS policy. Revoke is the everyday
                 action and keeps the record that a link was issued; this
                 discards it, and takes the pinned copies of the files with it. -->
            <span class="ml-2"><Button admin size="xs" disabled={busyId === publication.id}
              on:click={() => dispatch('deletePublication', publication)}>Delete</Button></span>
          {/if}

          {#if verifyResult?.id === publication.id}
            <p class="text-[11px] text-slate-400">{verifyResult.message}</p>
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
</div>
