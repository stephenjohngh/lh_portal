<!-- src/lib/apps/guides/GuidesApp.svelte -->
<!-- Guides (migration 268): step-by-step how-to guides for a new caretaker or cleaner —
     moving the bins, changing a bulb, putting the alarm panel into test mode — which an
     inspection walk also shows at the right point.

     ⛔ READING NEEDS NO GRANT: any signed-in user reads a published guide (a staff-only
     one not a contractor), so an inspector holding only the Inspection grant still sees
     them in a walk. The `guides` grant only puts this app in someone's menu.
     Writing is admin-only (RLS), and the Manage tab is admin-only.

     Slice S0 (docs/requirements/build_plans/Guides_App_Build_Plan.md): the app and its
     Library list. Authoring (S1) and the step-by-step reader (S2) follow. -->
<script>
  import AppGate from '#lib/components/common/AppGate.svelte';
  import TabBar from '#lib/components/common/TabBar.svelte';
  import FormInput from '#lib/components/common/FormInput.svelte';
  import ToggleChip from '#lib/components/common/ToggleChip.svelte';
  import GuidebookPanel from './components/GuidebookPanel.svelte';
  import ManageGuides from './components/ManageGuides.svelte';
  import { guidesStore } from './stores/guidesStore.js';
  import { permissions } from '#lib/stores/permissions.js';
  import { matchesSearch } from '#lib/utils/textSearch.js';

  const TABS = [
    { key: 'library', label: 'Library' },
    { key: 'manage',  label: 'Manage', adminOnly: true },
  ];

  let tab = 'library';
  let search = '';
  /** @type {string} */
  let category = '';

  $: s = $guidesStore;
  // A reader sees published guides; an admin also sees drafts and retired ones (and says which).
  $: shown = s.guides
    .filter((g) => (!category || g.category_key === category))
    .filter((g) => matchesSearch([g.title, g.summary, (g.tags ?? []).join(' ')], search));
  $: usedCategories = s.categories.filter((c) => !c.retired && s.guides.some((g) => g.category_key === c.key));
  $: isAdmin = $permissions.isAdmin;
</script>

<AppGate appId="guides" name="Guides" load={() => guidesStore.load()}>
  <div class="p-4 space-y-4 max-w-4xl mx-auto">
    <div>
      <h1 class="text-2xl font-semibold text-white">Guides</h1>
      <p class="text-sm text-slate-400">Step-by-step help for the jobs around the building.</p>
    </div>

    <TabBar tabs={TABS} active={tab} on:select={(e) => (tab = e.detail)} />

    {#if s.error}
      <p class="text-red-400 text-sm" role="alert">{s.error}</p>
    {/if}

    {#if tab === 'library'}
      <GuidebookPanel />
      <div class="flex flex-wrap items-center gap-2">
        <div class="w-64"><FormInput compact label="" placeholder="Search guides…" bind:value={search} /></div>
        {#each usedCategories as c (c.key)}
          <ToggleChip active={category === c.key} on:click={() => (category = category === c.key ? '' : c.key)}>{c.name}</ToggleChip>
        {/each}
      </div>

      {#if shown.length === 0}
        <p class="text-slate-400 text-sm" data-testid="guides-empty">
          {s.guides.length === 0
            ? 'There are no guides yet.'
            : 'No guide matches that.'}
          {#if isAdmin && s.guides.length === 0} Guides are written on the Manage tab.{/if}
        </p>
      {:else}
        <ul class="space-y-2" data-testid="guides-list">
          {#each shown as g (g.id)}
            <li class="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <p class="text-white font-medium">{g.title}
                {#if g.status !== 'published'}<span class="ml-2 text-xs text-amber-300">{g.status}</span>{/if}
              </p>
              {#if g.summary}<p class="text-sm text-slate-400 mt-0.5">{g.summary}</p>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    {:else if tab === 'manage'}
      <ManageGuides />
    {/if}
  </div>
</AppGate>
