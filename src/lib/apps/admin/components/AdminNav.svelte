<!-- src/lib/apps/admin/components/AdminNav.svelte
     The Admin sections, all in view, grouped by what they are for. Replaces a
     tab bar plus a ten-item "Other Config" dropdown that hid most of Admin.
     The list itself is `sections` in adminSections.js, so a new setting is one
     entry there. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { SECTION_GROUPS, sectionOf } from '../utils/adminSections.js';

  /** The screen showing; the section it belongs to is highlighted. */
  export let active = 'users';
  /** Only some sections show for a non-admin. @type {boolean} */
  export let isAdmin = false;
  /** Shown beside Users. */
  export let userCount = null;
  /** Shown as a narrow strip of icons. */
  export let collapsed = false;

  const dispatch = createEventDispatcher();
  $: activeSection = sectionOf(active)?.id;
  $: groups = SECTION_GROUPS.map((g) => ({
    ...g,
    sections: g.sections.filter((s) => isAdmin || !s.adminOnly),
  })).filter((g) => g.sections.length);
</script>

<nav aria-label="Admin sections" class="w-full {collapsed ? 'md:w-12' : 'md:w-52'} shrink-0 space-y-4">
  <button type="button"
          class="hidden md:flex w-full items-center gap-2 px-3 py-1 rounded text-xs text-slate-500 hover:text-white"
          aria-expanded={!collapsed} data-testid="admin-nav-toggle"
          title={collapsed ? 'Show the section names' : 'Hide the section names to give the screen more width'}
          on:click={() => dispatch('toggle')}>
    <span>{collapsed ? '»' : '«'}</span>{#if !collapsed}<span>Hide list</span>{/if}
  </button>
  {#each groups as g (g.key)}
    <div>
      {#if !collapsed}
        <p class="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.label}</p>
      {:else}
        <div class="hidden md:block mx-2 mb-1 border-t border-slate-700"></div>
      {/if}
      <ul class="space-y-0.5">
        {#each g.sections as s (s.id)}
          <li>
            <button
              type="button"
              class="w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm text-left transition-colors
                     {activeSection === s.id ? 'bg-purple-600/20 text-purple-300' : 'text-slate-300 hover:bg-slate-700/50'}"
              aria-current={activeSection === s.id ? 'page' : undefined}
              title={collapsed ? s.label : undefined}
              on:click={() => dispatch('select', s)}
            >
              <span class="shrink-0">{s.icon}</span>
              <span class="flex-1 truncate {collapsed ? 'md:hidden' : ''}">{s.label}</span>
              {#if s.id === 'users' && userCount != null && !collapsed}
                <span class="text-xs text-slate-500 tabular-nums">{userCount}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</nav>
