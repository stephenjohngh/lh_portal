<!-- src/lib/apps/complaints/components/ComplaintTimeline.svelte -->
<!-- The append-only record of what happened.

     There is no edit and no delete, here or in the database — migration 187
     gives this table an INSERT policy and nothing else. That absence is what
     makes it evidence rather than notes, and it is why a correction is a new
     entry saying so rather than a change to an old one. -->
<script>
  import { fmtDateTime } from '$lib/utils/dates';
  import { statusMeta } from '../utils/complaintLifecycle.js';

  export let entries = [];

  /** A word and a colour per kind, so a long timeline can be skimmed. */
  const KIND = {
    status_change:  { label: 'Status',        colour: 'text-slate-400' },
    note:           { label: 'Note',          colour: 'text-slate-400' },
    acknowledgement:{ label: 'Acknowledged',  colour: 'text-sky-300' },
    investigation:  { label: 'Investigation', colour: 'text-amber-300' },
    response:       { label: 'Response',      colour: 'text-violet-300' },
    escalation:     { label: 'Escalation',    colour: 'text-red-300' },
    sla_pause:      { label: 'Clock paused',  colour: 'text-slate-400' },
    sla_resume:     { label: 'Clock resumed', colour: 'text-slate-400' },
    reopened:       { label: 'Reopened',      colour: 'text-amber-300' },
    closure:        { label: 'Closed',        colour: 'text-green-300' },
    scope_decision: { label: 'Scope',         colour: 'text-amber-300' },
    assignment:     { label: 'Assigned',      colour: 'text-slate-400' },
  };

  const kind = (t) => KIND[t] ?? { label: t, colour: 'text-slate-400' };
</script>

{#if entries.length === 0}
  <p class="text-xs text-slate-500">Nothing recorded yet.</p>
{:else}
  <ol class="space-y-2">
    {#each entries as entry (entry.id)}
      {@const k = kind(entry.entry_type)}
      <li class="border-l-2 border-slate-700 pl-3 py-1">
        <div class="flex items-baseline gap-2 flex-wrap">
          <span class="text-[11px] uppercase tracking-wide font-semibold {k.colour}">
            {k.label}
          </span>

          {#if entry.from_status && entry.to_status && entry.from_status !== entry.to_status}
            <span class="text-[11px] text-slate-500">
              {statusMeta(entry.from_status).label} → {statusMeta(entry.to_status).label}
            </span>
          {:else if entry.to_status && !entry.from_status}
            <span class="text-[11px] text-slate-500">{statusMeta(entry.to_status).label}</span>
          {/if}

          <span class="flex-1"></span>
          <span class="text-[11px] text-slate-500">
            {fmtDateTime(entry.created_at)}{#if entry.author_name} · {entry.author_name}{/if}
          </span>
        </div>

        {#if entry.content}
          <p class="text-xs text-slate-300 mt-0.5 whitespace-pre-wrap">{entry.content}</p>
        {/if}
      </li>
    {/each}
  </ol>
{/if}
