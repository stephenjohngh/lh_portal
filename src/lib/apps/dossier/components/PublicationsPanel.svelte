<!-- src/lib/apps/dossier/components/PublicationsPanel.svelte -->
<!-- Every link ever issued for this pack, and its state.

     Revoke, never delete: the record that a link was issued to an outside party
     is the one thing worth keeping after the link stops working. (Delete exists
     at RLS, admin-only, for genuine mistakes.) -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Badge          from '$lib/components/common/Badge.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import { fmtDateTime } from '$lib/utils/dates';
  import {
    publicationState, describePublication, STATE_LABEL, STATE_BADGE,
  } from '../utils/publicationState.js';

  export let publications = [];
  export let canEdit = true;
  /** id of the publication currently being revoked/regenerated. */
  export let busyId = null;

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
      </div>
    {/each}
  {/if}
</div>
