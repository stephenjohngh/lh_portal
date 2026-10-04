<!-- src/lib/components/common/TabBar.svelte
     An app's tab bar, written once (2026-10-02, PROJECT_STATUS §6aaa item 3).
     Six apps had drawn their own in four styles.

     tabs:   [{ key, label, icon?, count?, adminOnly? }]
     active: the selected tab's key
     on:select → the key clicked

     ⛔ An admin-only tab is not drawn for anyone else. That hides the button
     only: a shell that lets the active tab be set any other way must still
     check it (ComplianceApp does). Anything after the tabs — Admin's
     "Other Config" dropdown — goes in the slot. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { permissions } from '#lib/stores/permissions.js';
  import { visibleTabs } from '#lib/utils/appAccess.js';

  /** @type {Array<{ key: string, label: string, icon?: string, count?: number|null, adminOnly?: boolean }>} */
  export let tabs = [];
  /** @type {string} */
  export let active = '';
  /** Draw the bar's bottom rule. Off where the container already has one. */
  export let bordered = true;

  const dispatch = createEventDispatcher();

  $: shown = visibleTabs(tabs, $permissions.isAdmin);
</script>

<div class="flex flex-wrap items-end gap-x-1 {bordered ? 'border-b border-slate-600' : ''}" role="tablist">
  {#each shown as t (t.key)}
    <button
      type="button"
      role="tab"
      aria-selected={active === t.key}
      class="-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm transition-colors
             {active === t.key
               ? 'border-purple-500 font-semibold text-white'
               : 'border-transparent text-slate-400 hover:text-white'}"
      on:click={() => dispatch('select', t.key)}
    >
      {#if t.icon}<span aria-hidden="true">{t.icon}</span>{/if}
      <span>{t.label}</span>
      {#if t.count != null}<span class="text-xs text-slate-500">({t.count})</span>{/if}
    </button>
  {/each}
  <slot />
</div>
