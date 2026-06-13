<!-- src/lib/components/common/ProtectedButton.svelte -->
<!-- Button that automatically hides for read-only users based on action type -->
<script>
  import { permissions } from '$lib/stores/permissions';
  import { determineVisibility, getTooltipText } from './protectedButtonVisibility.js';
  import Button from './Button.svelte';

  // Button props (pass through to Button component)
  export let variant = 'primary';
  export let size = 'medium';
  export let icon = '';
  export let iconPosition = 'left'; // NEW: support iconPosition
  export let loading = false;
  export let disabled = false;
  export let fullWidth = false;
  export let className = '';
  export let title = '';

  // Protection props
  export let action = 'view'; // 'view' | 'modify'
  export let requireAdmin = false; // If true, only admins see this
  export let tooltip = ''; // Optional tooltip

  // Visibility + tooltip logic lives in a pure module so it can be unit-tested
  // without rendering (see protectedButtonVisibility.js).
  $: canShow = determineVisibility($permissions, action, requireAdmin);
  $: tooltipText = getTooltipText($permissions, action, requireAdmin, tooltip);
</script>

{#if canShow}
  <span title={tooltipText} class="inline-block">
    <Button
      {variant}
      {size}
      {icon}
      {iconPosition}
      {loading}
      {disabled}
      {fullWidth}
      className={className}
      {title}
      on:click
    >
      <slot />
    </Button>
  </span>
{:else if $permissions.loading}
  <!-- Invisible placeholder while loading to prevent layout shift -->
  <span class="invisible inline-block">
    <Button {variant} {size} {icon} {iconPosition} {fullWidth} className={className}>
      <slot />
    </Button>
  </span>
{/if}

<style>
  /* Ensure proper inline-block behavior */
  :global(.inline-block) {
    display: inline-block;
  }
</style>
