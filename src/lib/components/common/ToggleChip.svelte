<!-- src/lib/components/common/ToggleChip.svelte -->
<!-- A small chip that is on or off — a filter, a participant, a kind. The one
     place it is drawn (user, 2026-10-30: everything through common controls).
     Several may be on at once; for ONE of a set use SegmentedControl.
     `activeClass` lets a chip carry its own colour when on (activity types). -->
<script>
  import Button from './Button.svelte';

  export let active = false;
  /** 'xs' | 'small' */
  export let size = 'xs';
  /** Fully rounded (default) or a squarer chip. */
  export let pill = true;
  export let disabled = false;
  export let title = '';
  /** Replaces the default "on" colours. */
  export let activeClass = '';

  const sizes = { xs: 'text-xs px-2 py-0.5', small: 'text-xs px-2.5 py-1' };
  $: look = active
    ? (activeClass || 'bg-purple-600/30 border-purple-500/60 text-purple-200')
    : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300';
</script>

<Button
  variant="plain"
  type="button"
  {disabled}
  {title}
  aria-pressed={active}
  on:click
  className="{sizes[size] || sizes.xs} {pill ? 'rounded-full' : 'rounded'} border transition-colors {look}"
><slot /></Button>
