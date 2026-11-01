<!-- src/lib/apps/dossier/components/PackList.svelte -->
<!-- The Pack list — the app's landing surface, in two parts: TEMPLATES (made by an
     administrator, readable by everyone with the Dossier grant) and the person's
     own DOSSIERS. Rows are clickable divs (not buttons) because they contain action
     buttons; nesting interactive elements is a Svelte a11y compile error. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { createEventDispatcher } from 'svelte';
  import ProtectedButton from '#lib/components/common/ProtectedButton.svelte';
  import LoadingSpinner  from '#lib/components/common/LoadingSpinner.svelte';
  import Icon            from '#lib/components/icons/Icon.svelte';
  import { permissions } from '#lib/stores/permissions.js';
  import { fmtDate }     from '#lib/utils/dates.js';

  export let packs   = [];
  export let loading = false;

  const dispatch = createEventDispatcher();

  let showArchived = false;

  $: isAdmin = $permissions.isAdmin;
  $: inView = (p) => (showArchived ? p.status === 'archived' : p.status !== 'archived');
  $: templates = packs.filter(p => p.is_template && inView(p));
  $: dossiers  = packs.filter(p => !p.is_template && inView(p));
  $: archivedCount = packs.filter(p => p.status === 'archived').length;
  $: titleOf = (id) => packs.find(p => p.id === id)?.title ?? 'a template';
  $: nothing = templates.length === 0 && dossiers.length === 0;
</script>

<div class="flex flex-col h-full">

  <!-- Toolbar -->
  <div class="flex items-center gap-3 px-5 py-3 border-b border-slate-700 shrink-0">
    <p class="text-sm font-semibold text-white">
      {showArchived ? 'Archived' : 'Packs'}
      {#if !loading}<span class="text-slate-500 font-normal">({templates.length + dossiers.length})</span>{/if}
    </p>

    <div class="flex-1"></div>

    {#if archivedCount > 0 || showArchived}
      <Button variant="tertiary" size="xs" on:click={() => showArchived = !showArchived}>{showArchived ? '← Back to active' : `Archived (${archivedCount})`}</Button>
    {/if}

    <!-- Not a filter on this list: it shows PUBLICATIONS, of which one pack can
         have several, and the question it answers spans every pack. -->
    <Button variant="tertiary" size="xs" title="Every link issued from every pack" on:click={() => dispatch('showPublished')}>Published links</Button>

    {#if isAdmin}
      <Button admin size="small" title="A template other people start their dossiers from" on:click={() => dispatch('newTemplate')}>+ New Template</Button>
    {/if}

    <ProtectedButton action="modify" variant="primary" size="small" on:click={() => dispatch('new')}>
      + New Pack
    </ProtectedButton>
  </div>

  <!-- Body -->
  <div class="flex-1 min-h-0 overflow-y-auto p-4">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <LoadingSpinner size="large" text="Loading packs…" />
      </div>

    {:else if nothing}
      <div class="text-center py-16 px-4">
        <p class="text-slate-400 text-sm">
          {showArchived ? 'Nothing archived.' : 'No packs yet.'}
        </p>
        {#if !showArchived}
          <p class="text-slate-500 text-xs mt-2 max-w-md mx-auto">
            A pack is a briefing you assemble for someone outside the portal —
            a narrative, a chronology and the evidence behind it.
          </p>
        {/if}
      </div>

    {:else}
      {#each [
        { key: 'templates', label: 'Templates', note: 'Starting points. A dossier made from one copies its pages and tables and can use its files.', rows: templates },
        { key: 'dossiers',  label: 'Dossiers',  note: '', rows: dossiers },
      ] as section (section.key)}
        {#if section.rows.length || (section.key === 'dossiers' && templates.length === 0)}
          <div class="mb-5" data-testid="section-{section.key}">
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">{section.label}
              <span class="text-slate-500 font-normal normal-case tracking-normal">({section.rows.length})</span></p>
            {#if section.note}<p class="text-xs text-slate-500 mb-2">{section.note}</p>{:else}<div class="mb-2"></div>{/if}

            <div class="space-y-2">
              {#each section.rows as pack (pack.id)}
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <div
                  class="group flex items-start gap-3 p-4 rounded-lg border border-slate-700
                         bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600
                         cursor-pointer transition-colors"
                  on:click={() => dispatch('open', pack)}
                >
                  <div class="text-slate-500 mt-0.5 shrink-0">
                    <Icon name="book" size={18} />
                  </div>

                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-white truncate">{pack.title}
                      {#if pack.is_template}<span class="ml-2 rounded bg-purple-900/50 border border-purple-700/60 px-1.5 py-0.5 text-[10px] font-normal text-purple-200 align-middle">Template</span>{/if}
                    </p>
                    {#if pack.description}
                      <p class="text-xs text-slate-400 mt-1 line-clamp-2">{pack.description}</p>
                    {/if}
                    <p class="text-xs text-slate-500 mt-1.5">
                      Updated {fmtDate(pack.updated_at ?? pack.created_at)}
                      {#if pack.template_id} · from {titleOf(pack.template_id)}{/if}
                    </p>
                  </div>

                  <div class="flex items-center gap-1 shrink-0 ">
                    {#if pack.is_template}
                      <ProtectedButton action="modify" variant="primary" size="small"
                              title="Start a new dossier from this template"
                              on:click={(e) => { e.stopPropagation(); dispatch('useTemplate', pack); }}>
                        Use
                      </ProtectedButton>
                    {/if}
                    {#if !pack.is_template || isAdmin}
                      <ProtectedButton action="modify" variant="secondary" size="small"
                              on:click={(e) => { e.stopPropagation(); dispatch('edit', pack); }}>
                        Edit
                      </ProtectedButton>
                    {/if}
                    {#if !pack.is_template}
                      <ProtectedButton action="modify" variant="secondary" size="small"
                              title="Make an independent copy of this dossier"
                              on:click={(e) => { e.stopPropagation(); dispatch('duplicate', pack); }}>
                        Duplicate
                      </ProtectedButton>
                    {/if}
                    {#if !pack.is_template || isAdmin}
                      <ProtectedButton action="modify" variant="secondary" size="small"
                              on:click={(e) => { e.stopPropagation(); dispatch('archive', pack); }}>
                        {pack.status === 'archived' ? 'Restore' : 'Archive'}
                      </ProtectedButton>
                    {/if}
                    <ProtectedButton requireAdmin={true} variant="danger" size="small"
                            title={pack.is_template ? 'Delete this template — only once no dossier is based on it' : 'Delete this pack and everything in it'}
                            on:click={(e) => { e.stopPropagation(); dispatch('delete', pack); }}>
                      Delete
                    </ProtectedButton>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    {/if}
  </div>
</div>
