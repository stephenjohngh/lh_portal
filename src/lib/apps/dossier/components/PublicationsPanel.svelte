<!-- src/lib/apps/dossier/components/PublicationsPanel.svelte -->
<!-- Every link ever issued for this pack, and its state.

     Revoke, never delete: the record that a link was issued to an outside party
     is the one thing worth keeping after the link stops working. (Delete exists
     at RLS, admin-only, for genuine mistakes.) -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Badge          from '$lib/components/common/Badge.svelte';
  import { permissions } from '$lib/stores/permissions';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import { fmtDateTime } from '$lib/utils/dates';
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
      No links have been issued for this pack.
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
          <button
            class="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
            disabled={verifyingId === publication.id}
            on:click={() => dispatch('verify', publication)}
          >{verifyingId === publication.id ? 'Checking files…' : 'Check files'}</button>

          {#if $permissions.isAdmin}
            <!-- Admin only, matching the RLS policy. Revoke is the everyday
                 action and keeps the record that a link was issued; this
                 discards it, and takes the pinned copies of the files with it. -->
            <button
              class="ml-2 text-[11px] text-slate-600 hover:text-red-400 transition-colors"
              disabled={busyId === publication.id}
              on:click={() => dispatch('deletePublication', publication)}
            >Delete</button>
          {/if}

          {#if verifyResult?.id === publication.id}
            <p class="text-[11px] text-slate-400">{verifyResult.message}</p>
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
</div>
