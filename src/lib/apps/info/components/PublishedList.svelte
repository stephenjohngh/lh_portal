<!-- src/lib/apps/info/components/PublishedList.svelte -->
<!-- Everything the Info app has put outside the portal, in one place.

     The information was all there before — a badge on a note, a filter in the
     list — but it was spread across sections, so answering "what is public?"
     meant visiting each section in turn with the filter set. Nobody does that,
     which is the same as not being able to answer it.

     Sections are deliberately ignored here. Publication is the one property of
     a note that reaches beyond the portal, and it cuts across the way notes are
     filed. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import { fmtDate } from '$lib/utils/dates';
  import { profiles, profilesStore } from '$lib/stores/profiles';
  import { publishedNotes, VISIBILITY_BADGES } from '../utils/infoHelpers.js';

  export let notes = [];
  export let loading = false;

  const dispatch = createEventDispatcher();

  // Notes carry `created_by` as a uuid; the names live elsewhere. Asked for
  // here rather than by the app, because this is the only view that needs them
  // — and load() is cached and de-duplicates concurrent callers, so asking on
  // every visit costs one request in a session.
  onMount(() => { profilesStore.load(); });

  $: published = publishedNotes(notes);
  $: byId = new Map(($profiles.list ?? []).map(p => [p.id, p.full_name]));

  /** A uuid is not an author. Fall back to nothing rather than to a uuid. */
  const authorName = (id) => byId.get(id) ?? '—';

  $: publicCount     = published.filter(n => n.visibility === 'public').length;
  $: registeredCount = published.filter(n => n.visibility === 'registered').length;
</script>

<div class="flex flex-col h-full min-h-0">

  <div class="px-5 py-3 border-b border-slate-700 shrink-0">
    <div class="flex items-center gap-3">
      <h2 class="text-sm font-semibold text-white">Published notes</h2>
      <span class="text-xs text-slate-500">{published.length}</span>
    </div>
    <p class="text-xs text-slate-500 mt-1">
      {#if published.length === 0}
        Nothing in Info is visible outside the portal.
      {:else}
        {publicCount} readable by anyone on the internet · {registeredCount}
        readable by signed-in users with the Info permission.
      {/if}
    </p>
  </div>

  <div class="flex-1 min-h-0 overflow-y-auto">
    {#if loading}
      <p class="px-5 py-8 text-sm text-slate-500">Loading…</p>
    {:else if published.length === 0}
      <div class="px-5 py-10 text-center text-slate-500">
        <Icon name="book" size={8} className="mx-auto mb-2 opacity-40" />
        <p class="text-sm">No notes are published.</p>
        <p class="text-xs mt-1">
          A note becomes visible outside the portal when an admin sets its
          visibility to Registered or Public.
        </p>
      </div>
    {:else}
      <table class="w-full text-sm">
        <thead class="text-left text-xs text-slate-500 bg-slate-800/60 sticky top-0">
          <tr>
            <th class="px-4 py-2 font-medium">Note</th>
            <th class="px-4 py-2 font-medium">Who can read it</th>
            <th class="px-4 py-2 font-medium">Address</th>
            <th class="px-4 py-2 font-medium">Published</th>
            <th class="px-4 py-2 font-medium">Last changed</th>
            <th class="px-4 py-2 font-medium">Author</th>
          </tr>
        </thead>
        <tbody>
          {#each published as note (note.id)}
            {@const badge = VISIBILITY_BADGES[note.visibility]}
            <tr class="border-t border-slate-700/50 hover:bg-slate-800/40 transition-colors">
              <td class="px-4 py-2">
                <button
                  class="text-left text-slate-200 hover:text-purple-300 transition-colors"
                  on:click={() => dispatch('select', note)}
                >{note.title}</button>
                {#if note.status === 'archived'}
                  <!-- Archiving hides a note from the working list; it does NOT
                       unpublish it. An archived public note is still a live
                       page, and that is worth saying out loud. -->
                  <span class="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300"
                        title="Archived in the portal, but still published">archived</span>
                {/if}
                {#if note.section?.name}
                  <span class="block text-xs text-slate-500">{note.section.name}</span>
                {/if}
              </td>
              <td class="px-4 py-2">
                {#if badge}
                  <span class="text-xs px-1.5 py-0.5 rounded {badge.className}">
                    {badge.icon} {badge.label ?? note.visibility}
                  </span>
                {/if}
              </td>
              <td class="px-4 py-2">
                {#if note.visibility === 'public' && note.slug}
                  <a href="/info/{note.slug}" target="_blank" rel="noopener noreferrer"
                     class="text-xs text-purple-400 hover:underline font-mono"
                  >/info/{note.slug}</a>
                {:else if note.slug}
                  <span class="text-xs text-slate-500 font-mono">/info/{note.slug}</span>
                {:else}
                  <span class="text-xs text-slate-600">—</span>
                {/if}
              </td>
              <td class="px-4 py-2 text-xs text-slate-400">
                {note.published_at ? fmtDate(note.published_at) : '—'}
              </td>
              <td class="px-4 py-2 text-xs text-slate-400">
                {note.updated_at ? fmtDate(note.updated_at) : '—'}
              </td>
              <td class="px-4 py-2 text-xs text-slate-400 truncate">
                {authorName(note.created_by)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
