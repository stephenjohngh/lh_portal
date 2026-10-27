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

  const dispatch = createEventDispatcher();
  $: activeSection = sectionOf(active)?.id;
  $: groups = SECTION_GROUPS.map((g) => ({
    ...g,
    sections: g.sections.filter((s) => isAdmin || !s.adminOnly),
  })).filter((g) => g.sections.length);
</script>

<nav aria-label="Admin sections" class="w-full md:w-52 shrink-0 space-y-4">
  {#each groups as g (g.key)}
    <div>
      <p class="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.label}</p>
      <ul class="space-y-0.5">
        {#each g.sections as s (s.id)}
          <li>
            <button
              type="button"
              class="w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm text-left transition-colors
                     {activeSection === s.id ? 'bg-purple-600/20 text-purple-300' : 'text-slate-300 hover:bg-slate-700/50'}"
              aria-current={activeSection === s.id ? 'page' : undefined}
              on:click={() => dispatch('select', s)}
            >
              <span class="shrink-0">{s.icon}</span>
              <span class="flex-1 truncate">{s.label}</span>
              {#if s.id === 'users' && userCount != null}
                <span class="text-xs text-slate-500 tabular-nums">{userCount}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</nav>
