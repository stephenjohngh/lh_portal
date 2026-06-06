<!-- src/lib/apps/mor/components/TimelineEntry.svelte -->
<script>
  import {
    ENTRY_TYPE_LABEL, ENTRY_TYPE_ICON_COLOUR, STATUS_LABEL,
    CONTACT_KIND_LABEL,
  } from '$lib/apps/mor/utils/morHelpers';
  import { fmtDateTime } from '$lib/utils/dates';

  export let entry;

  $: typeLabel  = ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type;
  $: iconColour = ENTRY_TYPE_ICON_COLOUR[entry.entry_type] ?? 'text-slate-400';
  $: isStatusChange = entry.entry_type === 'status_change';
  $: contactKindLabel = entry.entry_type === 'reporter_contact'
        ? (CONTACT_KIND_LABEL[entry.contact_kind] ?? entry.contact_kind)
        : null;
</script>

<div class="flex gap-3">
  <!-- Dot indicator -->
  <div class="flex flex-col items-center shrink-0">
    <div class="w-2 h-2 rounded-full mt-1.5 {iconColour.replace('text-', 'bg-')}"></div>
    <div class="w-px flex-1 bg-slate-700/60 mt-1"></div>
  </div>

  <!-- Content -->
  <div class="pb-4 min-w-0 flex-1">
    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
      <span class="text-xs font-semibold {iconColour}">{typeLabel}</span>
      {#if isStatusChange && entry.to_status}
        <span class="text-xs text-slate-400">→ {STATUS_LABEL[entry.to_status] ?? entry.to_status}</span>
      {/if}
      {#if contactKindLabel}
        <span class="text-[10px] uppercase tracking-wide bg-slate-700 text-slate-300 rounded px-1.5 py-0.5">
          {contactKindLabel}
        </span>
      {/if}
      <span class="text-xs text-slate-600 ml-auto shrink-0">{fmtDateTime(entry.created_at)}</span>
    </div>
    {#if entry.content}
      <p class="text-sm text-slate-300 leading-relaxed">{entry.content}</p>
    {/if}
    <p class="text-xs text-slate-600 mt-0.5">{entry.author_name}</p>
  </div>
</div>
