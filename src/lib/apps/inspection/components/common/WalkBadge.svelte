<!-- src/lib/apps/inspection/components/common/WalkBadge.svelte -->
<!-- Colour-coded badge for the walk app's dark mono theme. -->
<script>
  // color: 'orange'|'blue'|'red'|'green'|'amber'|'grey'|'default'
  export let color   = 'default';
  // size: 'sm'|'md'
  export let size    = 'sm';

  const bg = {
    orange:  'rgba(251,146,60,0.15)',
    blue:    'rgba(96,165,250,0.15)',
    red:     'rgba(234,88,12,0.15)',
    green:   'rgba(34,197,94,0.15)',
    amber:   'rgba(251,191,36,0.15)',
    grey:    'rgba(148,163,184,0.1)',
    default: '#1a1a2e',
  };
  const fg = {
    orange:  '#fb923c',
    blue:    '#60a5fa',
    red:     '#ea580c',
    green:   '#22c55e',
    amber:   '#fbbf24',
    grey:    '#64748b',
    default: '#ccc',
  };
  const border = {
    orange:  'rgba(251,146,60,0.4)',
    blue:    'rgba(96,165,250,0.4)',
    red:     'rgba(234,88,12,0.4)',
    green:   'rgba(34,197,94,0.4)',
    amber:   'rgba(251,191,36,0.4)',
    grey:    'rgba(148,163,184,0.3)',
    default: '#3e3e58',
  };

  $: style = [
    `background: ${bg[color] ?? bg.default}`,
    `color: ${fg[color] ?? fg.default}`,
    `border: 1px solid ${border[color] ?? border.default}`,
  ].join('; ');

  $: fontSize = size === 'md' ? '0.72rem' : '0.6rem';
  $: padding  = size === 'md' ? '0.2rem 0.5rem' : '0.1rem 0.4rem';
</script>

<span
  class="walk-badge"
  style="{style}; font-size: {fontSize}; padding: {padding}"
>
  <slot />
</span>

<style>
  .walk-badge {
    display: inline-flex; align-items: center;
    border-radius: 4px;
    font-family: 'DM Mono', 'Courier New', monospace;
    font-weight: 700;
    letter-spacing: 0.06em;
    white-space: nowrap;
    line-height: 1.4;
    flex-shrink: 0;
  }
</style>
