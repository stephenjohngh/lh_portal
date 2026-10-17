<!-- src/lib/components/common/OfflineQueueStatus.svelte -->
<!-- What an offline queue still holds, in one line, for the standard apps
     (2026-10-17): "2 sightings waiting — sent when there is a signal", and,
     for anything the server refused, "1 could not be sent" with Retry. Reads a
     runner's `syncState` (#lib/offline/syncRunner.js). Nothing shows when the
     queue is empty. The phone walk (Inspection) keeps its own badge, in its
     own theme. -->
<script>
  import Button from './Button.svelte';

  /** A runner's syncState value: { pending, syncing, error, online, items }. */
  export let state = { pending: 0, syncing: 0, error: 0, online: true };
  /** The thing queued, singular and plural: ['lookup', 'lookups']. */
  export let what = ['change', 'changes'];
  /** Put the refused ones back in the queue (the runner's retryErrors). */
  export let onRetry = /** @type {null | (() => void)} */ (null);
  /** Only some of the queue (e.g. one kind of op): counts given here win. */
  export let counts = /** @type {null | { waiting: number, error: number }} */ (null);

  $: waiting = counts ? counts.waiting : (state?.pending ?? 0) + (state?.syncing ?? 0);
  $: failed = counts ? counts.error : (state?.error ?? 0);
  const word = (/** @type {number} */ n) => (n === 1 ? what[0] : what[1]);
</script>

{#if waiting + failed > 0}
  <p class="text-xs text-amber-300 flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="offline-queue-status" role="status">
    {#if waiting > 0}
      <span>{waiting} {word(waiting)} {state?.online ? 'sending…' : 'waiting — sent when there is a signal'}</span>
    {/if}
    {#if failed > 0}
      <span>{failed} {word(failed)} could not be sent</span>
      {#if onRetry}<Button variant="tertiary" size="xs" on:click={() => onRetry?.()}>Retry</Button>{/if}
    {/if}
  </p>
{/if}
