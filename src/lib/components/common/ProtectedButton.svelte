<!-- src/lib/components/common/ProtectedButton.svelte -->
<!-- Button that automatically hides for read-only users based on action type -->
<script>
  import { permissions } from '$lib/stores/permissions';
  import Button from './Button.svelte';

  // Button props (pass through to Button component)
  export let variant = 'primary';
  export let size = 'medium';
  export let icon = '';
  export let loading = false;
  export let disabled = false;
  export let fullWidth = false;
  export let className = '';

  // Protection props
  export let action = 'view'; // 'view' | 'modify'
  export let requireAdmin = false; // If true, only admins see this
  export let tooltip = ''; // Optional tooltip

  // Determine if button should show based on permissions
  $: canShow = determineVisibility($permissions, action, requireAdmin);
  $: tooltipText = getTooltipText($permissions, action, requireAdmin, tooltip);

  function determineVisibility(perms, actionType, adminRequired) {
    // Still loading permissions
    if (perms.loading) return false;

    // Admin can see everything
    if (perms.isAdmin) return true;

    // If admin required, hide from non-admins
    if (adminRequired) return false;

    // View actions are always visible
    if (actionType === 'view') return true;

    // Modify actions require modify permission
    if (actionType === 'modify') return perms.canModify;

    // Default to showing (fail open)
    return true;
  }

  function getTooltipText(perms, actionType, adminRequired, customTooltip) {
    // Use custom tooltip if provided
    if (customTooltip) return customTooltip;

    // If can show, no tooltip needed
    if (determineVisibility(perms, actionType, adminRequired)) return '';

    // Generate helpful tooltip
    if (adminRequired) return 'Admin access required';
    if (actionType === 'modify' && perms.isReadOnly) {
      return 'You have read-only access';
    }

    return '';
  }
</script>

{#if canShow}
  <span title={tooltipText} class="inline-block">
    <Button
      {variant}
      {size}
      {icon}
      {loading}
      {disabled}
      {fullWidth}
      className={className}
      on:click
    >
      <slot />
    </Button>
  </span>
{:else if $permissions.loading}
  <!-- Invisible placeholder while loading to prevent layout shift -->
  <span class="invisible inline-block">
    <Button {variant} {size} {icon} {fullWidth} className={className}>
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
