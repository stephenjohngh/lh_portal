<!-- src/lib/apps/complaints/components/ComplaintList.svelte -->
<!-- The queue.

     P0 orders by when it arrived, oldest first in the Open view — the thing
     waiting longest is the thing to do, which is the same rule the Planner's
     agenda uses. P1 replaces that with the response deadline once the clocks
     exist; until then, a date somebody can reason about beats a computed one
     they cannot. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Badge from '#lib/components/common/Badge.svelte';
  import { fmtDate, daysBetween, today } from '#lib/utils/dates.js';
  import { statusMeta, isOpen } from '../utils/complaintLifecycle.js';
  import { categoryLabel } from '../utils/complaintOptions.js';
  import { deadlineBand, deadlineWords } from '#lib/workflow/workflowDeadlines.js';

  export let cases = [];
  /** The workflow's items (migration 252): each complaint's deadline and who has it. */
  export let items = [];
  /** @type {Record<string, string>} */
  export let nameById = {};
  export let emptyMessage = 'Nothing here.';

  const dispatch = createEventDispatcher();
  $: itemFor = (/** @type {string} */ id) => items.find((i) => i.subject_id === id) ?? null;
  const BAND_CLS = { overdue: 'text-red-400 font-semibold', due_soon: 'text-amber-300', ok: 'text-slate-400' };

  /** Calendar days since it arrived (London) — the only ageing P0 has. */
  function daysOld(iso) {
    if (!iso) return null;
    return Math.max(0, daysBetween(iso, today()) || 0);
  }
</script>

{#if cases.length === 0}
  <p class="text-sm text-slate-500 py-6 text-center">{emptyMessage}</p>
{:else}
  <div class="space-y-1.5">
    {#each cases as complaint (complaint.id)}
      {@const meta = statusMeta(complaint.status)}
      {@const age = daysOld(complaint.received_at)}
      <!-- A div, not a button: the row carries its own controls in later
           stages, and a button inside a button is a Svelte a11y error. -->
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        class="flex items-start gap-3 p-2.5 rounded border border-slate-700
               bg-slate-800/40 hover:bg-slate-800/70 transition-colors cursor-pointer"
        on:click={() => dispatch('open', complaint.id)}
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2 flex-wrap">
            <span class="text-[11px] font-mono text-slate-500">{complaint.reference}</span>
            <span class="text-sm text-white truncate">{complaint.subject}</span>
            {#if !complaint.in_scope}
              <span class="text-[10px] uppercase tracking-wide text-amber-400">out of scope</span>
            {/if}
          </div>

          <p class="text-xs text-slate-500 mt-0.5">
            {fmtDate(complaint.received_at)}
            {#if age !== null} · {age} day{age === 1 ? '' : 's'} old{/if}
            · {categoryLabel(complaint.category)}
            {#if complaint.dwelling_ref} · {complaint.dwelling_ref}{/if}
            {#if itemFor(complaint.id)?.assigned_to}
              · <span class="text-slate-400" data-testid="complaint-list-with">with {nameById[itemFor(complaint.id)?.assigned_to] ?? 'a user no longer listed'}</span>
            {/if}
          </p>
          {#if itemFor(complaint.id)?.due_on && isOpen(complaint.status)}
            {@const due = itemFor(complaint.id)?.due_on}
            <p class="text-[11px] mt-0.5 {BAND_CLS[deadlineBand(due) ?? 'ok']}" data-testid="complaint-list-due">
              {deadlineWords(due)}
            </p>
          {/if}
        </div>

        <Badge color={meta.badge}>{meta.label}</Badge>
      </div>
    {/each}
  </div>
{/if}
