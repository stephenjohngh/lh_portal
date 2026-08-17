<!-- src/lib/apps/dossier/components/PublishedPacksList.svelte -->
<!-- Every link ever issued, across every pack.

     The per-pack Links panel answers "what has THIS pack sent out?". Nobody
     could answer the question that matters more — "what is reachable from
     outside the portal right now, and by whom?" — without opening each pack in
     turn, which is the same as not being able to answer it.

     Scoped by RLS, not by a filter here: publications inherit their pack's
     owner test, so this shows the caller's own and an admin sees all. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import Icon  from '$lib/components/icons/Icon.svelte';
  import { fmtDateTime } from '$lib/utils/dates';
  import {
    publicationState, describePublication, STATE_LABEL, STATE_BADGE,
  } from '../utils/publicationState.js';

  export let publications = [];
  export let packs = [];
  export let loading = false;

  const dispatch = createEventDispatcher();

  $: packTitle = new Map(packs.map(p => [p.id, p.title]));
  $: rows = publications.map(p => ({ ...p, state: publicationState(p) }));
  $: liveCount = rows.filter(r => r.state === 'live').length;
</script>

<div class="flex flex-col h-full min-h-0">

  <div class="px-5 py-3 border-b border-slate-700 shrink-0">
    <div class="flex items-center gap-3">
      <button
        class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600
               text-slate-200 transition-colors shrink-0"
        on:click={() => dispatch('back')}
      >← Packs</button>
      <h2 class="text-sm font-semibold text-white">Published links</h2>
      <span class="text-xs text-slate-500">{rows.length}</span>
    </div>
    <p class="text-xs text-slate-500 mt-1">
      {#if rows.length === 0}
        No pack has ever been published.
      {:else}
        <span class={liveCount ? 'text-amber-300' : ''}>{liveCount} live</span>
        — a working way into a pack from outside the portal.
      {/if}
    </p>
  </div>

  <div class="flex-1 min-h-0 overflow-y-auto">
    {#if loading}
      <p class="px-5 py-8 text-sm text-slate-500">Loading…</p>
    {:else if rows.length === 0}
      <div class="px-5 py-10 text-center text-slate-500">
        <Icon name="book" size={8} className="mx-auto mb-2 opacity-40" />
        <p class="text-sm">Nothing has been published.</p>
        <p class="text-xs mt-1">
          Open a pack and use <span class="text-slate-400">Publish</span> to
          issue a link.
        </p>
      </div>
    {:else}
      <table class="w-full text-sm">
        <thead class="text-left text-xs text-slate-500 bg-slate-800/60 sticky top-0">
          <tr>
            <th class="px-4 py-2 font-medium">Pack</th>
            <th class="px-4 py-2 font-medium">Sent to</th>
            <th class="px-4 py-2 font-medium">State</th>
            <th class="px-4 py-2 font-medium">Content</th>
            <th class="px-4 py-2 font-medium">Issued</th>
            <th class="px-4 py-2 font-medium">Availability</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as pub (pub.id)}
            <tr class="border-t border-slate-700/50 hover:bg-slate-800/40 transition-colors">
              <td class="px-4 py-2">
                <button
                  class="text-left text-slate-200 hover:text-purple-300 transition-colors"
                  title="Open this pack"
                  on:click={() => dispatch('openPack', pub.pack_id)}
                >{packTitle.get(pub.pack_id) ?? 'A pack you can no longer see'}</button>
                <span class="block text-xs text-slate-500">
                  v{pub.version} · {pub.title}
                </span>
              </td>
              <td class="px-4 py-2 text-xs text-slate-400">
                {pub.recipient_label || '—'}
              </td>
              <td class="px-4 py-2">
                <Badge color={STATE_BADGE[pub.state]}>{STATE_LABEL[pub.state]}</Badge>
              </td>
              <td class="px-4 py-2 text-xs text-slate-400">
                {pub.mode === 'latest' ? 'Follows the latest' : 'Frozen'}
                {#if pub.passphrase_hash}
                  <span class="block text-slate-500">passphrase</span>
                {/if}
              </td>
              <td class="px-4 py-2 text-xs text-slate-400">
                {fmtDateTime(pub.created_at)}
              </td>
              <td class="px-4 py-2 text-xs text-slate-400">
                {describePublication(pub)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
