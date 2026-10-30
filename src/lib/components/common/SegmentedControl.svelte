<!-- src/lib/components/common/SegmentedControl.svelte -->
<!-- A row of joined options of which one is chosen — the radio-button-style
     control (view / edit / spaces…, year / month / agenda, filters). The one
     place it is drawn. An option may be `admin`: only an administrator is offered
     it, so it is amber on brown like every other admin-only control. -->
<script>
  import { createEventDispatcher } from 'svelte';

  /**
   * @type {{ value: string, label: string, title?: string, admin?: boolean,
   *          disabled?: boolean, activeClass?: string, count?: number|string }[]}
   */
  export let options = [];
  export let value = '';
  /** 'xs' | 'small' | 'medium' */
  export let size = 'small';
  export let label = '';       // accessible name of the group
  export let fullWidth = false;

  const dispatch = createEventDispatcher();
  const sizes = { xs: 'px-2 py-0.5 text-xs', small: 'px-3 py-1 text-sm', medium: 'px-3 py-1.5 text-sm' };

  function choose(o) {
    if (o.disabled || o.value === value) return;
    value = o.value;
    dispatch('change', o.value);
  }
</script>

<div
  role="radiogroup"
  aria-label={label || undefined}
  class="inline-flex rounded-lg overflow-hidden border border-slate-600 shrink-0 {fullWidth ? 'w-full' : ''}"
>
  {#each options as o, i (o.value)}
    {@const active = value === o.value}
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={o.disabled}
      title={o.title}
      on:click={() => choose(o)}
      class="transition-colors disabled:opacity-40 disabled:cursor-not-allowed {fullWidth ? 'flex-1' : ''} {sizes[size] || sizes.small}
             {i > 0 ? 'border-l ' + (o.admin ? 'border-amber-700/50' : 'border-slate-600') : ''}
             {o.admin
               ? (active ? 'bg-amber-800/70 text-amber-50 font-medium ring-1 ring-inset ring-amber-500'
                         : 'bg-amber-900/25 text-amber-200 hover:bg-amber-900/45')
               : (active ? (o.activeClass || 'bg-purple-600') + ' text-white font-medium'
                         : 'bg-slate-800 text-slate-400 hover:bg-slate-700')}"
    >
      {o.label}{#if o.count !== undefined}<span class="ml-1 opacity-70 tabular-nums">{o.count}</span>{/if}
    </button>
  {/each}
</div>
